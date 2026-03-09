import { DiscogsContext } from "@/lib/types";

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
}): Promise<DiscogsContext> {
  const { artist, title, catalogNumber, barcode, discogsKey, discogsSecret } = args;
  const query = [artist, title, catalogNumber].filter(Boolean).join(" ").trim();
  const cleanedBarcode = barcode?.trim();
  if (!query && !cleanedBarcode) {
    return { searchNotes: "No extracted metadata to search Discogs." };
  }

  const userAgent = "ShouldIBuyVinylMVP/0.1 +https://example.local";
  let candidate: DiscogsSearchResult | undefined;
  let matchMethod: "barcode" | "text" | undefined;
  let searchNotes: string | undefined;

  if (cleanedBarcode) {
    const barcodeParams = new URLSearchParams({
      barcode: cleanedBarcode,
      type: "release",
      per_page: "5",
      key: discogsKey,
      secret: discogsSecret,
    });
    const barcodeSearchResponse = await fetch(
      `https://api.discogs.com/database/search?${barcodeParams.toString()}`,
      { headers: { "User-Agent": userAgent } },
    );

    if (barcodeSearchResponse.ok) {
      const barcodeData =
        (await barcodeSearchResponse.json()) as DiscogsSearchResponse;
      candidate = barcodeData.results?.[0];
      if (candidate) {
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
      per_page: "5",
      key: discogsKey,
      secret: discogsSecret,
    });
    const searchResponse = await fetch(
      `https://api.discogs.com/database/search?${textParams.toString()}`,
      { headers: { "User-Agent": userAgent } },
    );
    if (!searchResponse.ok) {
      return {
        searchNotes: `Discogs text search failed (${searchResponse.status}).`,
      };
    }

    const searchData = (await searchResponse.json()) as DiscogsSearchResponse;
    candidate = searchData.results?.[0];
    if (candidate) {
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
    headers: { "User-Agent": userAgent },
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
    { headers: { "User-Agent": userAgent } },
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
