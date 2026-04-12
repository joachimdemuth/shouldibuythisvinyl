import { fetchDiscogsContext } from "@/lib/discogs";
import { mediaDebug } from "@/lib/media-debug";
import type { VisionExtractionContext } from "@/lib/identify-merge";
import type { VisionHints } from "@/lib/types";
import { scoreDiscogsSearchRow } from "@/lib/text-match";
import {
  type ArtworkCandidate,
  inferReleaseCandidatesFromIconicArtwork,
} from "@/lib/vision";

const MIN_LLM_CONFIDENCE = 0.2;
/** If top two Discogs-ranked options are within this gap, ask the user to pick. */
const COMBINED_SCORE_GAP_TO_AUTO = 0.14;

export interface IdentifyReleaseChoice {
  releaseId: number;
  artist: string;
  title: string;
  year?: number;
  coverImageUrl?: string;
  llmConfidence: number;
  combinedScore: number;
  briefReason?: string;
}

export type ArtworkResolveResult =
  | { status: "skip" }
  | { status: "merged"; vision: VisionHints }
  | { status: "choose"; options: IdentifyReleaseChoice[]; baseVision: VisionHints };

type Ranked = {
  candidate: ArtworkCandidate;
  discogsScore: number;
  combined: number;
  releaseId: number;
  discogsArtist: string;
  discogsTitle: string;
  year?: number;
  coverImageUrl?: string;
};

function mergeVisionFromBest(
  base: VisionHints,
  best: ArtworkCandidate,
): VisionHints {
  return {
    ...base,
    artist: base.artist ?? best.artist,
    title: base.title ?? best.title,
    confidence: Math.max(base.confidence, best.confidence * 0.92),
    notes: [
      base.notes,
      `[Artwork recognition ~${Math.round(best.confidence * 100)}%] ${best.briefReason ?? "Inferred from cover imagery."}`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Runs multi-candidate LLM artwork recognition, verifies each against Discogs, ranks by
 * LLM confidence + Discogs text match, then either merges a single best guess or asks the user.
 */
export async function resolveArtworkInference(args: {
  vision: VisionHints;
  coverBuffer: Uint8Array;
  coverMime: string;
  ctx: VisionExtractionContext;
  discogsKey: string;
  discogsSecret: string;
}): Promise<ArtworkResolveResult> {
  const candidates = await inferReleaseCandidatesFromIconicArtwork({
    imageBytes: args.coverBuffer,
    mimeType: args.coverMime,
    llmApiKey: args.ctx.effectiveLlmApiKey,
    llmBaseUrl: args.ctx.llmBaseUrl,
    llmModel: args.ctx.llmModel,
    llmVisionModel: args.ctx.llmVisionModel,
  });

  const filtered = candidates.filter(
    (c) => c.confidence >= MIN_LLM_CONFIDENCE && c.artist && c.title,
  );
  mediaDebug("artwork", "candidates after LLM min-confidence filter", {
    minLlmConfidence: MIN_LLM_CONFIDENCE,
    rawFromLlm: candidates.length,
    kept: filtered.length,
    droppedAsLowConfidence: candidates.length - filtered.length,
  });
  if (filtered.length === 0) {
    mediaDebug("artwork", "skip: no candidates passed filter", {});
    return { status: "skip" };
  }

  const ranked: Ranked[] = [];
  for (const cand of filtered) {
    const discogs = await fetchDiscogsContext({
      artist: cand.artist,
      title: cand.title,
      discogsKey: args.discogsKey,
      discogsSecret: args.discogsSecret,
      matchHints: {
        artist: cand.artist,
        title: cand.title,
        year: cand.year,
      },
    });
    if (!discogs.release) {
      mediaDebug("artwork", "Discogs miss for LLM candidate", {
        guessedArtist: cand.artist,
        guessedTitle: cand.title,
        llmConfidence: cand.confidence,
      });
      continue;
    }

    const listLine = `${discogs.release.artist} - ${discogs.release.title}`;
    const discogsScore = scoreDiscogsSearchRow(
      { artist: cand.artist, title: cand.title, year: cand.year },
      listLine,
      discogs.release.year,
    );
    const combined = cand.confidence * 0.42 + discogsScore * 0.58;
    ranked.push({
      candidate: cand,
      discogsScore,
      combined,
      releaseId: discogs.release.id,
      discogsArtist: discogs.release.artist,
      discogsTitle: discogs.release.title,
      year: discogs.release.year,
      coverImageUrl: discogs.release.coverImageUrl,
    });
    mediaDebug("artwork", "ranked: LLM guess matched Discogs release", {
      releaseId: discogs.release.id,
      llmGuess: `${cand.artist} — ${cand.title}`,
      discogsHit: `${discogs.release.artist} — ${discogs.release.title}`,
      llmConfidence: cand.confidence,
      discogsTextScore: Math.round(discogsScore * 1000) / 1000,
      combinedScore: Math.round(combined * 1000) / 1000,
    });
  }

  ranked.sort((a, b) => b.combined - a.combined);

  const seen = new Set<number>();
  const unique: Ranked[] = [];
  for (const r of ranked) {
    if (seen.has(r.releaseId)) continue;
    seen.add(r.releaseId);
    unique.push(r);
  }

  if (unique.length === 0) {
    mediaDebug("artwork", "skip: no Discogs hits for any filtered candidate", {});
    return { status: "skip" };
  }

  const best = unique[0];

  if (unique.length === 1) {
    mediaDebug("artwork", "decision: single Discogs-ranked option → merge vision", {
      releaseId: best.releaseId,
      combinedScore: best.combined,
    });
    return { status: "merged", vision: mergeVisionFromBest(args.vision, best.candidate) };
  }

  const gap = unique[0].combined - unique[1].combined;
  if (gap >= COMBINED_SCORE_GAP_TO_AUTO) {
    mediaDebug("artwork", "decision: clear winner by score gap → merge vision", {
      gap: Math.round(gap * 1000) / 1000,
      gapThreshold: COMBINED_SCORE_GAP_TO_AUTO,
      winnerReleaseId: best.releaseId,
    });
    return { status: "merged", vision: mergeVisionFromBest(args.vision, best.candidate) };
  }

  mediaDebug("artwork", "decision: ambiguous → user must choose", {
    optionsCount: unique.length,
    topScores: unique.slice(0, 4).map((r) => ({
      releaseId: r.releaseId,
      combined: Math.round(r.combined * 1000) / 1000,
      title: `${r.discogsArtist} — ${r.discogsTitle}`,
    })),
  });

  const options: IdentifyReleaseChoice[] = unique.slice(0, 8).map((r) => ({
    releaseId: r.releaseId,
    artist: r.discogsArtist,
    title: r.discogsTitle,
    year: r.year,
    coverImageUrl: r.coverImageUrl,
    llmConfidence: r.candidate.confidence,
    combinedScore: r.combined,
    briefReason: r.candidate.briefReason,
  }));

  return {
    status: "choose",
    options,
    baseVision: args.vision,
  };
}
