import { mediaDebug } from "@/lib/media-debug";
import {
  scoreSpotifyAlbumMatch,
  spotifyReleaseYearBonus,
  tokenJaccard,
} from "@/lib/text-match";

interface SpotifyTokenResponse {
  access_token?: string;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyAlbum {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  release_date?: string;
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: { name?: string };
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrack[];
  };
  albums?: {
    items?: SpotifyAlbum[];
  };
}

export interface SpotifyPreview {
  type: "track" | "album";
  name: string;
  artist: string;
  openUrl: string;
  embedUrl: string;
}

/** Spotify GET /v1/search allows limit 0–10 per item type (not 50). */
const SEARCH_LIMIT = "10";
/** Below this, treat as no confident album match and try broader search. */
const MIN_ALBUM_SCORE = 0.14;
const MIN_TRACK_SCORE = 0.12;

function getSpotifyCredentials():
  | { clientId: string; clientSecret: string }
  | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function getAccessToken(credentials: {
  clientId: string;
  clientSecret: string;
}): Promise<string | null> {
  const basicAuth = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as SpotifyTokenResponse;
  return data.access_token ?? null;
}

function sanitizeSpotifyQueryPart(s: string): string {
  return s.replace(/["*]/g, " ").replace(/\s+/g, " ").trim();
}

function toAlbumPreview(item: SpotifyAlbum | undefined): SpotifyPreview | null {
  const id = item?.id;
  if (!id) return null;
  const name = item?.name ?? "Unknown";
  const artist = item?.artists?.[0]?.name ?? "Unknown artist";
  const openUrl =
    item?.external_urls?.spotify ?? `https://open.spotify.com/album/${id}`;

  return {
    type: "album",
    name,
    artist,
    openUrl,
    embedUrl: `https://open.spotify.com/embed/album/${id}`,
  };
}

function toTrackPreview(item: SpotifyTrack | undefined): SpotifyPreview | null {
  const id = item?.id;
  if (!id) return null;
  const name = item?.name ?? "Unknown";
  const artist = item?.artists?.[0]?.name ?? "Unknown artist";
  const openUrl =
    item?.external_urls?.spotify ?? `https://open.spotify.com/track/${id}`;

  return {
    type: "track",
    name,
    artist,
    openUrl,
    embedUrl: `https://open.spotify.com/embed/track/${id}`,
  };
}

function pickBestAlbum(
  items: SpotifyAlbum[],
  targetArtist: string,
  targetAlbum: string,
  year?: number,
): { item: SpotifyAlbum; score: number } | null {
  if (items.length === 0) return null;
  let best = items[0];
  let bestScore = -1;
  for (const item of items) {
    const aName = item.artists?.[0]?.name;
    let s = scoreSpotifyAlbumMatch(targetArtist, targetAlbum, aName, item.name);
    s += spotifyReleaseYearBonus(year, item.release_date);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return { item: best, score: bestScore };
}

function pickBestTrack(
  items: SpotifyTrack[],
  targetArtist: string,
  targetAlbum: string,
): { item: SpotifyTrack; score: number } | null {
  if (items.length === 0) return null;
  let best = items[0];
  let bestScore = -1;
  for (const item of items) {
    const aName = item.artists?.[0]?.name;
    const albumName = item.album?.name ?? item.name ?? "";
    const artistPart = tokenJaccard(targetArtist, aName ?? "");
    const albumPart = tokenJaccard(targetAlbum, albumName);
    const s = artistPart * 0.45 + albumPart * 0.55;
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return { item: best, score: bestScore };
}

async function spotifySearch(
  token: string,
  q: string,
  type: "album" | "track",
  stepLabel: string,
): Promise<SpotifySearchResponse | null> {
  const params = new URLSearchParams({
    q,
    type,
    limit: SEARCH_LIMIT,
  });
  const url = `https://api.spotify.com/v1/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    mediaDebug("spotify", `${stepLabel}: HTTP error`, {
      q,
      type,
      httpStatus: response.status,
      bodyPreview: errBody.slice(0, 300),
    });
    return null;
  }
  const data = (await response.json()) as SpotifySearchResponse;
  const count =
    type === "album"
      ? (data.albums?.items?.length ?? 0)
      : (data.tracks?.items?.length ?? 0);
  mediaDebug("spotify", `${stepLabel}: OK`, {
    q,
    type,
    resultCount: count,
  });
  return data;
}

export async function fetchSpotifyPreview(args: {
  artist?: string;
  title?: string;
  /** Discogs release year helps pick the right remaster vs original. */
  year?: number;
}): Promise<SpotifyPreview | null> {
  const artist = (args.artist ?? "").trim();
  const title = (args.title ?? "").trim();
  const year = args.year;

  mediaDebug("spotify", "fetchSpotifyPreview: input", {
    artist: artist || "(empty)",
    title: title || "(empty)",
    year: year ?? "(none)",
  });

  const credentials = getSpotifyCredentials();
  if (!credentials) {
    mediaDebug("spotify", "abort: no Spotify credentials", {
      hint: "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET",
    });
    return null;
  }

  if (!artist && !title) {
    mediaDebug("spotify", "abort: missing artist and title", {});
    return null;
  }

  const token = await getAccessToken(credentials);
  if (!token) {
    mediaDebug("spotify", "abort: token request failed (check client id/secret)", {});
    return null;
  }

  const a = sanitizeSpotifyQueryPart(artist);
  const t = sanitizeSpotifyQueryPart(title);
  const looseQuery = a && t ? `${a} ${t}` : a || t;

  mediaDebug("spotify", "sanitized query parts", {
    artistPart: a || "(empty)",
    albumPart: t || "(empty)",
    looseQuery,
  });

  // 1) Field query when we have both artist + album (album-first: full LP, not a random track).
  let albums: SpotifyAlbum[] = [];
  if (a && t) {
    const fieldQuery = `artist:${a} album:${t}`;
    const fieldRes = await spotifySearch(
      token,
      fieldQuery,
      "album",
      "album field query",
    );
    albums = fieldRes?.albums?.items ?? [];
  } else {
    mediaDebug("spotify", "skip field query: need both artist and album parts", {
      hasArtistPart: Boolean(a),
      hasAlbumPart: Boolean(t),
    });
  }

  let picked = pickBestAlbum(albums, artist, title, year);
  if (picked) {
    mediaDebug("spotify", "best album after field query (if any)", {
      score: Math.round(picked.score * 1000) / 1000,
      minRequired: MIN_ALBUM_SCORE,
      passes: picked.score >= MIN_ALBUM_SCORE,
      topAlbumName: picked.item.name,
      topAlbumArtist: picked.item.artists?.[0]?.name,
    });
  } else {
    mediaDebug("spotify", "no album candidates from field query", {
      fieldAlbumCount: albums.length,
    });
  }

  if (!picked || picked.score < MIN_ALBUM_SCORE) {
    const looseRes = await spotifySearch(
      token,
      looseQuery,
      "album",
      "album loose query",
    );
    const looseAlbums = looseRes?.albums?.items ?? [];
    const alt = pickBestAlbum(looseAlbums, artist, title, year);
    if (alt) {
      mediaDebug("spotify", "best album after loose query", {
        score: Math.round(alt.score * 1000) / 1000,
        topAlbumName: alt.item.name,
        topAlbumArtist: alt.item.artists?.[0]?.name,
      });
    }
    if (alt && (!picked || alt.score > picked.score)) {
      picked = alt;
    }
    if (albums.length === 0) {
      albums = looseAlbums;
    }
  }

  if (picked && picked.score >= MIN_ALBUM_SCORE) {
    const preview = toAlbumPreview(picked.item);
    mediaDebug("spotify", "result: album embed (score passed threshold)", {
      embedType: "album",
      spotifyAlbum: preview?.name,
      spotifyArtist: preview?.artist,
    });
    return preview;
  }

  mediaDebug("spotify", "album path: no match above threshold", {
    reason:
      picked && picked.score < MIN_ALBUM_SCORE
        ? `best album score ${picked.score.toFixed(3)} < MIN_ALBUM_SCORE ${MIN_ALBUM_SCORE}`
        : "no scored album",
  });

  // 2) Singles / sparse metadata: best track match (never prefer track over a confident album).
  const trackRes = await spotifySearch(
    token,
    looseQuery,
    "track",
    "track loose query",
  );
  const tracks = trackRes?.tracks?.items ?? [];
  const trackPick = pickBestTrack(tracks, artist, title);
  if (trackPick) {
    mediaDebug("spotify", "best track match", {
      score: Math.round(trackPick.score * 1000) / 1000,
      minRequired: MIN_TRACK_SCORE,
      passes: trackPick.score >= MIN_TRACK_SCORE,
      trackName: trackPick.item.name,
      trackAlbum: trackPick.item.album?.name,
    });
  }
  if (trackPick && trackPick.score >= MIN_TRACK_SCORE) {
    const preview = toTrackPreview(trackPick.item);
    mediaDebug("spotify", "result: track embed (score passed threshold)", {
      embedType: "track",
    });
    return preview;
  }

  // 3) Spotify returned exactly one album — ranking is usually right.
  if (albums.length === 1 && albums[0]?.id) {
    const preview = toAlbumPreview(albums[0]);
    mediaDebug("spotify", "result: single album in result set (leniency)", {
      embedType: "album",
      album: albums[0].name,
    });
    return preview;
  }

  mediaDebug("spotify", "result: no embed", {
    reasons: [
      !picked ? "No album results scored" : "",
      picked && picked.score < MIN_ALBUM_SCORE
        ? `Album best score ${picked.score.toFixed(3)} < ${MIN_ALBUM_SCORE}`
        : "",
      !trackPick || trackPick.score < MIN_TRACK_SCORE
        ? `Track best score ${trackPick ? trackPick.score.toFixed(3) : "n/a"} < ${MIN_TRACK_SCORE}`
        : "",
      albums.length !== 1 ? `Album result count ${albums.length} (single-album fallback needs exactly 1)` : "",
    ]
      .filter(Boolean)
      .join("; "),
    albumResultCount: albums.length,
    trackResultCount: tracks.length,
  });
  return null;
}
