import type { VisionHints } from "@/lib/types";
import { extractReleaseHintsFromImage } from "@/lib/vision";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function parseManualArtistTitle(formData: FormData): {
  manualArtist?: string;
  manualTitle?: string;
} {
  const rawA = formData.get("manualArtist");
  const rawT = formData.get("manualTitle");
  const manualArtist =
    typeof rawA === "string" && rawA.trim() !== "" ? rawA.trim() : undefined;
  const manualTitle =
    typeof rawT === "string" && rawT.trim() !== "" ? rawT.trim() : undefined;
  return { manualArtist, manualTitle };
}

/**
 * Combine front cover OCR, optional spine/back OCR, and user-entered artist/title.
 * Priority for text: manual > spine > front (spine usually has legible text when the front is artwork-only).
 */
export function mergeReleaseHints(args: {
  front: VisionHints;
  spine?: VisionHints;
  manualArtist?: string;
  manualTitle?: string;
}): VisionHints {
  const { front, spine, manualArtist, manualTitle } = args;

  const artist = manualArtist ?? spine?.artist ?? front.artist;
  const title = manualTitle ?? spine?.title ?? front.title;
  const catalogNumber = front.catalogNumber ?? spine?.catalogNumber;
  const barcode = front.barcode ?? spine?.barcode;
  const year = front.year ?? spine?.year;

  const baseConf = Math.max(
    front.confidence,
    spine?.confidence ?? 0,
    manualArtist && manualTitle ? 0.88 : manualArtist || manualTitle ? 0.72 : 0,
  );

  const noteParts: string[] = [];
  if (spine) {
    noteParts.push(
      spine.notes
        ? `[Spine/back image] ${spine.notes}`
        : "[Spine/back image] merged with front.",
    );
  }
  if (manualArtist || manualTitle) {
    noteParts.push("Artist/title supplemented from manual entry.");
  }
  if (front.notes) noteParts.push(front.notes);

  const notes =
    noteParts.length > 0
      ? noteParts.join(" ")
      : !artist && !title
        ? "No artist or album title could be read; use spine/back photo or enter details manually."
        : undefined;

  return {
    artist,
    title,
    catalogNumber,
    barcode,
    year,
    confidence: Math.min(1, baseConf),
    notes,
  };
}

/** Discogs needs a barcode or some text (artist/title/catalog) to search. */
export function canSearchDiscogs(
  vision: VisionHints,
  requestBarcode?: string,
): boolean {
  const bc = requestBarcode ?? vision.barcode;
  if (bc && bc.replace(/\D/g, "").length >= 8) return true;
  const q = [vision.artist, vision.title, vision.catalogNumber]
    .filter(Boolean)
    .join(" ")
    .trim();
  return q.length > 0;
}

export interface VisionExtractionContext {
  effectiveLlmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmVisionModel?: string;
}

/**
 * Runs front-cover vision, optional spine/back vision, and merges with manual fields.
 * Throws `Error` with a user-safe message on invalid uploads.
 */
export async function buildMergedVisionFromForm(
  formData: FormData,
  ctx: VisionExtractionContext,
): Promise<{
  vision: VisionHints;
  coverBuffer: Uint8Array;
  coverMime: string;
}> {
  const image = formData.get("image");
  if (!(image instanceof File)) {
    throw new Error("Image is required.");
  }
  if (!image.type.startsWith("image/")) {
    throw new Error("Uploaded file must be an image.");
  }
  if (image.size > MAX_FILE_BYTES) {
    throw new Error("Image is too large. Max size is 8MB.");
  }

  const frontBuffer = new Uint8Array(await image.arrayBuffer());
  const front = await extractReleaseHintsFromImage({
    imageBytes: frontBuffer,
    mimeType: image.type,
    llmApiKey: ctx.effectiveLlmApiKey,
    llmBaseUrl: ctx.llmBaseUrl,
    llmModel: ctx.llmModel,
    llmVisionModel: ctx.llmVisionModel,
    surface: "cover",
  });

  let spine: VisionHints | undefined;
  const spineFile = formData.get("imageSpine");
  if (spineFile instanceof File && spineFile.size > 0) {
    if (!spineFile.type.startsWith("image/")) {
      throw new Error("Spine/back upload must be an image.");
    }
    if (spineFile.size > MAX_FILE_BYTES) {
      throw new Error("Spine/back image is too large. Max size is 8MB.");
    }
    const spineBuffer = new Uint8Array(await spineFile.arrayBuffer());
    spine = await extractReleaseHintsFromImage({
      imageBytes: spineBuffer,
      mimeType: spineFile.type,
      llmApiKey: ctx.effectiveLlmApiKey,
      llmBaseUrl: ctx.llmBaseUrl,
      llmModel: ctx.llmModel,
      llmVisionModel: ctx.llmVisionModel,
      surface: "spine_or_back",
    });
  }

  const { manualArtist, manualTitle } = parseManualArtistTitle(formData);
  const vision = mergeReleaseHints({ front, spine, manualArtist, manualTitle });
  return { vision, coverBuffer: frontBuffer, coverMime: image.type };
}
