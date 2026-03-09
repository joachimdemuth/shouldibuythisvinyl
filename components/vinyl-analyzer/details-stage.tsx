"use client";

import Image from "next/image";
import { CONDITIONS, SUPPORTED_CURRENCIES, conditionLabels, currencyLabels } from "@/components/vinyl-analyzer/constants";
import type { IdentifyResult, SupportedCurrency } from "@/lib/types";

interface DetailsStageProps {
  identified: IdentifyResult | null;
  detectedBarcode: string | null;
  price: string;
  setPrice: (value: string) => void;
  currency: SupportedCurrency;
  setCurrency: (value: SupportedCurrency) => void;
  condition: string;
  setCondition: (value: string) => void;
  llmApiKey: string;
  setLlmApiKey: (value: string) => void;
  isLoading: boolean;
  isIdentifying: boolean;
  onResetFlow: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function DetailsStage(props: DetailsStageProps) {
  const {
    identified,
    detectedBarcode,
    price,
    setPrice,
    currency,
    setCurrency,
    condition,
    setCondition,
    llmApiKey,
    setLlmApiKey,
    isLoading,
    isIdentifying,
    onResetFlow,
    onSubmit,
  } = props;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Album found</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Review the identified release first, then add optional listing details.
      </p>

      {identified?.discogs.release ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">
          <div>
            {identified.discogs.release.coverImageUrl ? (
              <Image
                src={identified.discogs.release.coverImageUrl}
                alt="Identified album cover"
                width={260}
                height={260}
                unoptimized
                className="aspect-square h-64 w-full rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex aspect-square h-64 w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs text-zinc-500">
                No album cover available
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-lg font-semibold">
              {identified.discogs.release.artist} - {identified.discogs.release.title}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
              <p>Year: {identified.discogs.release.year ?? "-"}</p>
              <p>Label: {identified.discogs.release.label ?? "-"}</p>
              <p>Country: {identified.discogs.release.country ?? "-"}</p>
              <p>Format: {identified.discogs.release.formats?.join(", ") ?? "-"}</p>
              <p>Genre: {identified.discogs.release.genres?.join(", ") ?? "-"}</p>
              <p>Style: {identified.discogs.release.styles?.join(", ") ?? "-"}</p>
              <p>Tracks: {identified.discogs.release.trackCount ?? "-"}</p>
              <p>
                Match:{" "}
                {identified.discogs.matchMethod === "barcode"
                  ? "Barcode"
                  : identified.discogs.matchMethod === "text"
                    ? "Metadata"
                    : "-"}
              </p>
            </div>
            {detectedBarcode ? (
              <p className="mt-3 text-xs text-zinc-600">Detected barcode: {detectedBarcode}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <form className="mt-6 space-y-4 rounded-xl border border-zinc-200 p-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium" htmlFor="price">
              Asking price (optional)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 24.99"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="currency">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabels[code]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="condition">
            Condition (optional)
          </label>
          <select
            id="condition"
            name="condition"
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select condition</option>
            {CONDITIONS.map((value) => (
              <option key={value} value={value}>
                {conditionLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="llmApiKey">
            Your OpenAI API key (optional)
          </label>
          <input
            id="llmApiKey"
            name="llmApiKey"
            type="password"
            autoComplete="off"
            value={llmApiKey}
            onChange={(event) => setLlmApiKey(event.target.value)}
            placeholder="sk-..."
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-600">
            Used only for this request. Not stored by the app.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onResetFlow}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Retake photo
          </button>
          <button
            type="submit"
            disabled={isLoading || isIdentifying || !identified}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Analyzing..." : "Should I buy this?"}
          </button>
        </div>
      </form>
    </section>
  );
}
