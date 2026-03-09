import type { BarcodeDetectorCtor, BarcodeDetectorInstance } from "@/components/vinyl-analyzer/types";

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const candidate = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return candidate ?? null;
}

export function normalizeBarcode(value: string | undefined): string | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 14) return null;
  return digitsOnly;
}

export function createBarcodeDetector(): BarcodeDetectorInstance | null {
  const ctor = getBarcodeDetectorCtor();
  if (!ctor) return null;
  try {
    return new ctor({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
    });
  } catch {
    try {
      return new ctor();
    } catch {
      return null;
    }
  }
}

export function formatMoney(value: number | undefined, currency: string | undefined): string {
  if (typeof value !== "number") return "-";
  const code = currency ?? "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value);
}
