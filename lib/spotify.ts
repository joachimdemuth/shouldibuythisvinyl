interface SpotifyTokenResponse {
  access_token?: string;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyTrackOrAlbum {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrackOrAlbum[];
  };
  albums?: {
    items?: SpotifyTrackOrAlbum[];
  };
}

export interface SpotifyPreview {
  type: "track" | "album";
  name: string;
  artist: string;
  openUrl: string;
  embedUrl: string;
}

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

function toPreview(
  item: SpotifyTrackOrAlbum | undefined,
  type: "track" | "album",
): SpotifyPreview | null {
  const id = item?.id;
  if (!id) return null;
  const name = item?.name ?? "Unknown";
  const artist = item?.artists?.[0]?.name ?? "Unknown artist";
  const openUrl = item?.external_urls?.spotify ?? `https://open.spotify.com/${type}/${id}`;

  return {
    type,
    name,
    artist,
    openUrl,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
  };
}

export async function fetchSpotifyPreview(args: {
  artist?: string;
  title?: string;
}): Promise<SpotifyPreview | null> {
  const credentials = getSpotifyCredentials();
  if (!credentials) return null;

  const query = [args.artist, args.title].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const token = await getAccessToken(credentials);
  if (!token) return null;

  const params = new URLSearchParams({
    q: query,
    type: "track,album",
    limit: "1",
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as SpotifySearchResponse;
  return (
    toPreview(data.tracks?.items?.[0], "track") ??
    toPreview(data.albums?.items?.[0], "album")
  );
}
