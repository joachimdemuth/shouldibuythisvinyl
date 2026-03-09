export const CONDITIONS = [
  "sealed",
  "mint",
  "near_mint",
  "very_good_plus",
  "very_good",
  "good",
  "fair",
  "poor",
] as const;

export type RecordCondition = (typeof CONDITIONS)[number];

export type Recommendation = "buy" | "consider" | "skip";
export type SupportedCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "SEK"
  | "NOK"
  | "DKK"
  | "CAD"
  | "AUD"
  | "JPY";

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "SEK",
  "NOK",
  "DKK",
  "CAD",
  "AUD",
  "JPY",
];

export interface VisionHints {
  artist?: string;
  title?: string;
  catalogNumber?: string;
  barcode?: string;
  confidence: number;
  notes?: string;
}

export interface DiscogsRelease {
  id: number;
  artist: string;
  title: string;
  year?: number;
  country?: string;
  genres?: string[];
  styles?: string[];
  formats?: string[];
  trackCount?: number;
  label?: string;
  coverImageUrl?: string;
  communityRating?: number;
  communityWant?: number;
  communityHave?: number;
}

export interface MarketStats {
  low?: number;
  median?: number;
  high?: number;
  currency?: string;
  originalCurrency?: string;
  exchangeRate?: number;
}

export interface DiscogsContext {
  release?: DiscogsRelease;
  market?: MarketStats;
  matchMethod?: "barcode" | "text";
  searchNotes?: string;
}

export interface EvaluationOutput {
  recommendation: Recommendation;
  fairPriceRange: {
    min?: number;
    max?: number;
    currency?: string;
  };
  confidence: number;
  keyReasons: string[];
  risks: string[];
}

export interface AnalyzeResult {
  input: {
    askingPrice?: number;
    currency?: SupportedCurrency;
    condition?: RecordCondition;
    barcode?: string;
  };
  vision: VisionHints;
  discogs: DiscogsContext;
  spotify?: {
    type: "track" | "album";
    name: string;
    artist: string;
    openUrl: string;
    embedUrl: string;
  };
  evaluation: EvaluationOutput;
}
