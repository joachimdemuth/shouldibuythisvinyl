import type { ArtistReleaseSummary, DiscogsContext } from "@/lib/types";
import { type MatchHints, pickBestDiscogsSearchRow } from "@/lib/text-match";

const DISCOGS_USER_AGENT = "ShouldIBuyVinylMVP/0.1 +https://example.local";

interface DiscogsSearchResult {
  id: number;
  title?: string;
  year?: number;
  label?: string[];
  cover_image?: string;
  resource_url?: string;
}

interface DiscogsSearchResponse {
  results?: DiscogsSearchResult[];
}

interface DiscogsReleaseResponse {
  id?: number;
  title?: string;
  artists?: Array<{ id?: number; name?: string; role?: string }>;
  artists_sort?: string;
  year?: number;
  country?: string;
  genres?: string[];
  styles?: string[];
  formats?: Array<{ name?: string }>;
  tracklist?: Array<{ title?: string }>;
  images?: Array<{ uri?: string }>;
  labels?: Array<{ name?: string }>;
  community?: {
    rating?: {
      average?: number;
    };
    want?: number;
    have?: number;
  };
}

interface DiscogsArtistReleasesResponse {
  releases?: Array<{
    id: number;
    title: string;
    year?: number;
    type?: string;
    role?: string;
    thumb?: string;
  }>;
}

function primaryArtistIdFromRelease(
  releaseData: DiscogsReleaseResponse | null | undefined,
): number | undefined {
  const first = releaseData?.artists?.[0];
  return typeof first?.id === "number" ? first.id : undefined;
}

interface DiscogsMarketResponse {
  lowest_price?: { value?: number; currency?: string };
  median_price?: { value?: number; currency?: string };
  highest_price?: { value?: number; currency?: string };
}

function parseArtistAndTitle(compoundTitle?: string): {
  artist: string;
  title: string;
} {
  if (!compoundTitle) return { artist: "Unknown artist", title: "Unknown title" };
  const [artistPart, ...rest] = compoundTitle.split(" - ");
  if (rest.length === 0) {
    return { artist: "Unknown artist", title: compoundTitle };
  }

  return {
    artist: artistPart.trim() || "Unknown artist",
    title: rest.join(" - ").trim() || "Unknown title",
  };
}

export async function fetchDiscogsContext(args: {
  artist?: string;
  title?: string;
  catalogNumber?: string;
  barcode?: string;
  discogsKey: string;
  discogsSecret: string;
  /** When Discogs returns multiple rows, pick the closest to sleeve text / year. */
  matchHints?: MatchHints;
}): Promise<DiscogsContext> {
  const {
    artist,
    title,
    catalogNumber,
    barcode,
    discogsKey,
    discogsSecret,
    matchHints,
  } = args;
  const query = [artist, title, catalogNumber].filter(Boolean).join(" ").trim();
  const cleanedBarcode = barcode?.trim();
  if (!query && !cleanedBarcode) {
    return { searchNotes: "No extracted metadata to search Discogs." };
  }

  let candidate: DiscogsSearchResult | undefined;
  let matchMethod: "barcode" | "text" | undefined;
  let searchNotes: string | undefined;

  if (cleanedBarcode) {
    const barcodeParams = new URLSearchParams({
      barcode: cleanedBarcode,
      type: "release",
      per_page: "20",
      key: discogsKey,
      secret: discogsSecret,
    });
    const barcodeSearchResponse = await fetch(
      `https://api.discogs.com/database/search?${barcodeParams.toString()}`,
      { headers: { "User-Agent": DISCOGS_USER_AGENT } },
    );

    if (barcodeSearchResponse.ok) {
      const barcodeData =
        (await barcodeSearchResponse.json()) as DiscogsSearchResponse;
      const barcodeRows = barcodeData.results ?? [];
      if (barcodeRows.length > 0) {
        if (
          barcodeRows.length > 1 &&
          matchHints &&
          (matchHints.artist?.trim() || matchHints.title?.trim())
        ) {
          candidate = pickBestDiscogsSearchRow(barcodeRows, matchHints);
          if (candidate !== barcodeRows[0]) {
            searchNotes =
              "Several barcode matches; chose the row closest to sleeve text.";
          }
        } else {
          candidate = barcodeRows[0];
        }
        matchMethod = "barcode";
      } else {
        searchNotes = `Barcode ${cleanedBarcode} had no direct Discogs match.`;
      }
    } else {
      searchNotes = `Barcode search failed (${barcodeSearchResponse.status}); falling back to text search.`;
    }
  }

  if (!candidate && query) {
    const textParams = new URLSearchParams({
      q: query,
      type: "release",
      per_page: "20",
      key: discogsKey,
      secret: discogsSecret,
    });
    const searchResponse = await fetch(
      `https://api.discogs.com/database/search?${textParams.toString()}`,
      { headers: { "User-Agent": DISCOGS_USER_AGENT } },
    );
    if (!searchResponse.ok) {
      return {
        searchNotes: `Discogs text search failed (${searchResponse.status}).`,
      };
    }

    const searchData = (await searchResponse.json()) as DiscogsSearchResponse;
    const textRows = searchData.results ?? [];
    if (textRows.length > 0) {
      if (
        textRows.length > 1 &&
        matchHints &&
        (matchHints.artist?.trim() || matchHints.title?.trim())
      ) {
        candidate = pickBestDiscogsSearchRow(textRows, matchHints);
        if (candidate !== textRows[0]) {
          searchNotes = searchNotes
            ? `${searchNotes} Chose closest text match among results.`
            : "Chose closest text match among Discogs search results.";
        }
      } else {
        candidate = textRows[0];
      }
      matchMethod = "text";
    }
  }

  if (!candidate) {
    return {
      searchNotes:
        searchNotes ??
        "No Discogs release matched this cover via barcode or text hints.",
    };
  }

  const releaseUrl = candidate.resource_url ?? `https://api.discogs.com/releases/${candidate.id}`;
  const releaseResponse = await fetch(releaseUrl, {
    headers: { "User-Agent": DISCOGS_USER_AGENT },
  });

  let releaseData: DiscogsReleaseResponse | null = null;
  if (releaseResponse.ok) {
    releaseData = (await releaseResponse.json()) as DiscogsReleaseResponse;
  }

  const { artist: parsedArtist, title: parsedTitle } = parseArtistAndTitle(
    candidate.title,
  );

  const releaseId = releaseData?.id ?? candidate.id;
  const marketResponse = await fetch(
    `https://api.discogs.com/marketplace/stats/${releaseId}`,
    { headers: { "User-Agent": DISCOGS_USER_AGENT } },
  );
  const marketData = marketResponse.ok
    ? ((await marketResponse.json()) as DiscogsMarketResponse)
    : null;

  const currency =
    marketData?.median_price?.currency ??
    marketData?.lowest_price?.currency ??
    marketData?.highest_price?.currency;

  return {
    release: {
      id: releaseId,
      primaryArtistId: primaryArtistIdFromRelease(releaseData),
      artist: releaseData?.artists_sort ?? parsedArtist,
      title: releaseData?.title ?? parsedTitle,
      year: releaseData?.year ?? candidate.year,
      country: releaseData?.country,
      genres: releaseData?.genres,
      styles: releaseData?.styles,
      formats: releaseData?.formats?.map((format) => format.name ?? "").filter(Boolean),
      trackCount: releaseData?.tracklist?.length,
      label: releaseData?.labels?.[0]?.name ?? candidate.label?.[0],
      coverImageUrl: releaseData?.images?.[0]?.uri ?? candidate.cover_image,
      communityRating: releaseData?.community?.rating?.average,
      communityWant: releaseData?.community?.want,
      communityHave: releaseData?.community?.have,
    },
    market: {
      low: marketData?.lowest_price?.value,
      median: marketData?.median_price?.value,
      high: marketData?.highest_price?.value,
      currency,
    },
    matchMethod,
    searchNotes,
  };
}

export async function fetchDiscogsContextByReleaseId(
  releaseId: number,
): Promise<DiscogsContext> {
  if (!Number.isFinite(releaseId) || releaseId <= 0) {
    return { searchNotes: "Release ID must be a positive number." };
  }

  const releaseResponse = await fetch(
    `https://api.discogs.com/releases/${releaseId}`,
    { headers: { "User-Agent": DISCOGS_USER_AGENT } },
  );

  if (!releaseResponse.ok) {
    return {
      searchNotes: `Discogs returned ${releaseResponse.status} for release ${releaseId}.`,
    };
  }

  const releaseData = (await releaseResponse.json()) as DiscogsReleaseResponse;
  const marketResponse = await fetch(
    `https://api.discogs.com/marketplace/stats/${releaseId}`,
    { headers: { "User-Agent": DISCOGS_USER_AGENT } },
  );
  const marketData = marketResponse.ok
    ? ((await marketResponse.json()) as DiscogsMarketResponse)
    : null;

  const currency =
    marketData?.median_price?.currency ??
    marketData?.lowest_price?.currency ??
    marketData?.highest_price?.currency;

  return {
    release: {
      id: releaseData?.id ?? releaseId,
      primaryArtistId: primaryArtistIdFromRelease(releaseData),
      artist: releaseData?.artists_sort ?? "Unknown artist",
      title: releaseData?.title ?? "Unknown title",
      year: releaseData?.year,
      country: releaseData?.country,
      genres: releaseData?.genres,
      styles: releaseData?.styles,
      formats: releaseData?.formats?.map((format) => format.name ?? "").filter(Boolean),
      trackCount: releaseData?.tracklist?.length,
      label: releaseData?.labels?.[0]?.name,
      coverImageUrl: releaseData?.images?.[0]?.uri,
      communityRating: releaseData?.community?.rating?.average,
      communityWant: releaseData?.community?.want,
      communityHave: releaseData?.community?.have,
    },
    market: {
      low: marketData?.lowest_price?.value,
      median: marketData?.median_price?.value,
      high: marketData?.highest_price?.value,
      currency,
    },
    matchMethod: "manual",
    searchNotes: "Loaded by Discogs release ID.",
  };
}

export async function fetchPrimaryArtistIdForRelease(args: {
  releaseId: number;
  discogsKey: string;
  discogsSecret: string;
}): Promise<number | undefined> {
  const params = new URLSearchParams({
    key: args.discogsKey,
    secret: args.discogsSecret,
  });
  const response = await fetch(
    `https://api.discogs.com/releases/${args.releaseId}?${params.toString()}`,
    { headers: { "User-Agent": DISCOGS_USER_AGENT } },
  );
  if (!response.ok) return undefined;
  const data = (await response.json()) as DiscogsReleaseResponse;
  return primaryArtistIdFromRelease(data);
}

export async function fetchArtistOtherReleases(args: {
  artistId: number;
  excludeReleaseId: number;
  discogsKey: string;
  discogsSecret: string;
  limit?: number;
}): Promise<ArtistReleaseSummary[]> {
  const limit = args.limit ?? 10;
  const params = new URLSearchParams({
    page: "1",
    per_page: "75",
    sort: "year",
    sort_order: "desc",
    key: args.discogsKey,
    secret: args.discogsSecret,
  });
  const response = await fetch(
    `https://api.discogs.com/artists/${args.artistId}/releases?${params.toString()}`,
    { headers: { "User-Agent": DISCOGS_USER_AGENT } },
  );
  if (!response.ok) return [];

  const data = (await response.json()) as DiscogsArtistReleasesResponse;
  const rows = data.releases ?? [];
  const mains = rows.filter(
    (r) =>
      r.role === "Main" &&
      r.id !== args.excludeReleaseId &&
      (r.type === "release" || r.type === "master"),
  );

  const seen = new Set<string>();
  const out: ArtistReleaseSummary[] = [];
  for (const r of mains) {
    const dedupeKey = `${r.title}:${r.year ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      id: r.id,
      title: r.title,
      year: r.year,
      thumb: r.thumb,
      type: r.type,
    });
    if (out.length >= limit) break;
  }

  return out;
}
