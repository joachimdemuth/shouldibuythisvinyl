import type { AnalyzeResult } from "@/lib/types";

export type AnalyzeResponse =
  | (AnalyzeResult & { disclaimer?: string })
  | { error: string };

export type BarcodeDetectorResult = { rawValue?: string };
export type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};
export type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;
