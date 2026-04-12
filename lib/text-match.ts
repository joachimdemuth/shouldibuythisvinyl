/**
 * Shared normalization and fuzzy scoring for Discogs search rows and Spotify albums.
 */

const NOISE_PREFIXES = /^(the|a|an)\s+/i;

export function normalizeMatchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingArticle(s: string): string {
  return s.replace(NOISE_PREFIXES, "").trim();
}

function tokenSet(str: string): Set<string> {
  const n = normalizeMatchText(str);
  return new Set(
    n.split(" ").filter((w) => w.length > 2 || /^\d+$/.test(w)),
  );
}

/** Jaccard similarity on word tokens (0–1). */
export function tokenJaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Discogs search `title` is usually "Artist - Album". */
export function splitDiscogsListTitle(compound: string | undefined): {
  artist: string;
  title: string;
} {
  if (!compound) return { artist: "", title: "" };
  const parts = compound.split(" - ");
  if (parts.length < 2) {
    return { artist: "", title: compound.trim() };
  }
  return {
    artist: parts[0]?.trim() ?? "",
    title: parts.slice(1).join(" - ").trim(),
  };
}

export interface MatchHints {
  artist?: string;
  title?: string;
  year?: number;
}

export function scoreDiscogsSearchRow(
  hints: MatchHints,
  listTitle: string | undefined,
  resultYear?: number,
): number {
  const { artist: cArtist, title: cTitle } = splitDiscogsListTitle(listTitle);
  const va = (hints.artist ?? "").trim();
  const vt = (hints.title ?? "").trim();

  const artistScore =
    va && cArtist
      ? Math.max(
          tokenJaccard(va, cArtist),
          tokenJaccard(stripLeadingArticle(va), stripLeadingArticle(cArtist)),
        )
      : 0;
  const titleScore =
    vt && cTitle
      ? Math.max(
          tokenJaccard(vt, cTitle),
          tokenJaccard(stripLeadingArticle(vt), stripLeadingArticle(cTitle)),
        )
      : 0;
  const fullLine = `${cArtist} ${cTitle}`.trim();
  const combinedHint = `${va} ${vt}`.trim();
  const combinedScore =
    combinedHint && fullLine ? tokenJaccard(combinedHint, listTitle ?? fullLine) : 0;

  let score: number;
  if (va && vt) {
    score = artistScore * 0.38 + titleScore * 0.42 + combinedScore * 0.2;
  } else if (va) {
    score = artistScore * 0.55 + combinedScore * 0.45;
  } else if (vt) {
    score = titleScore * 0.55 + combinedScore * 0.45;
  } else {
    score = combinedScore;
  }

  if (
    typeof hints.year === "number" &&
    typeof resultYear === "number" &&
    Math.abs(hints.year - resultYear) <= 1
  ) {
    score = Math.min(1, score + 0.07);
  }

  return score;
}

export function pickBestDiscogsSearchRow<
  T extends { title?: string; year?: number },
>(results: T[], hints: MatchHints | undefined): T {
  if (results.length <= 1) return results[0];
  if (!hints || (!hints.artist?.trim() && !hints.title?.trim())) {
    return results[0];
  }

  let best = results[0];
  let bestScore = scoreDiscogsSearchRow(
    hints,
    best.title,
    best.year,
  );

  for (let i = 1; i < results.length; i++) {
    const row = results[i];
    const s = scoreDiscogsSearchRow(hints, row.title, row.year);
    if (s > bestScore) {
      bestScore = s;
      best = row;
    }
  }

  return best;
}

export function scoreSpotifyAlbumMatch(
  targetArtist: string,
  targetAlbum: string,
  spotifyArtistName: string | undefined,
  spotifyAlbumName: string | undefined,
): number {
  const a = targetArtist.trim();
  const t = targetAlbum.trim();
  if (!a && !t) return 0;

  const sa = spotifyArtistName ?? "";
  const st = spotifyAlbumName ?? "";

  const artistPart = a ? tokenJaccard(a, sa) : 0;
  const albumPart = t ? tokenJaccard(t, st) : 0;
  const combined =
    a && t ? tokenJaccard(`${a} ${t}`, `${sa} ${st}`) : 0;

  if (a && t) {
    return artistPart * 0.38 + albumPart * 0.45 + combined * 0.17;
  }
  if (a) return artistPart * 0.55 + combined * 0.45;
  return albumPart * 0.55 + combined * 0.45;
}

export function spotifyReleaseYearBonus(
  targetYear: number | undefined,
  releaseDate: string | undefined,
): number {
  if (targetYear === undefined || !releaseDate) return 0;
  const y = Number.parseInt(releaseDate.slice(0, 4), 10);
  if (!Number.isFinite(y)) return 0;
  return Math.abs(targetYear - y) <= 1 ? 0.06 : 0;
}
