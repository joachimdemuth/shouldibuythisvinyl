"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CONDITIONS,
  SUPPORTED_CURRENCIES,
  conditionLabels,
  currencyLabels,
} from "@/components/vinyl-analyzer/constants";
import { formatMoney } from "@/components/vinyl-analyzer/utils";
import type { AnalyzeResult, ArtistReleaseSummary, IdentifyResult, SupportedCurrency } from "@/lib/types";

export type AlbumOverviewPayload = {
  albumReview: string | null;
  artistNote: string | null;
  overviewLlmError?: string;
  otherReleases: ArtistReleaseSummary[];
};

function discogsHrefForSummary(r: ArtistReleaseSummary): string {
  return r.type === "master"
    ? `https://www.discogs.com/master/${r.id}`
    : `https://www.discogs.com/release/${r.id}`;
}

interface OverviewStageProps {
  error: string | null;
  identified: IdentifyResult | null;
  detectedBarcode: string | null;
  overview: AlbumOverviewPayload | null;
  overviewLoading: boolean;
  overviewError: string | null;
  manualDiscogsId: string;
  setManualDiscogsId: (value: string) => void;
  isResolvingRelease: boolean;
  isIdentifying: boolean;
  onLoadManualRelease: () => void;
  onResetFlow: () => void;
  price: string;
  setPrice: (value: string) => void;
  currency: SupportedCurrency;
  setCurrency: (value: SupportedCurrency) => void;
  condition: string;
  setCondition: (value: string) => void;
  llmApiKey: string;
  setLlmApiKey: (value: string) => void;
  buyResult: AnalyzeResult | null;
  buyLoading: boolean;
  buyError: string | null;
  recommendationColor: string;
  onBuySubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClearBuyResult: () => void;
}

function mergedAboutText(overview: AlbumOverviewPayload | null, overviewLoading: boolean): {
  body: ReactNode;
} {
  if (overviewLoading) {
    return { body: <p className="text-sm text-zinc-600">Writing a short summary…</p> };
  }
  const album = overview?.albumReview?.trim();
  const artist = overview?.artistNote?.trim();
  const err = overview?.overviewLlmError;

  if (!album && !artist) {
    return {
      body: (
        <p className="text-sm text-zinc-600">{err ?? "No write-up yet."}</p>
      ),
    };
  }

  return {
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-zinc-800">
        {album ? <p>{album}</p> : null}
        {artist ? <p>{artist}</p> : null}
      </div>
    ),
  };
}

export function OverviewStage(props: OverviewStageProps) {
  const {
    error,
    identified,
    detectedBarcode,
    overview,
    overviewLoading,
    overviewError,
    manualDiscogsId,
    setManualDiscogsId,
    isResolvingRelease,
    isIdentifying,
    onLoadManualRelease,
    onResetFlow,
    price,
    setPrice,
    currency,
    setCurrency,
    condition,
    setCondition,
    llmApiKey,
    setLlmApiKey,
    buyResult,
    buyLoading,
    buyError,
    recommendationColor,
    onBuySubmit,
    onClearBuyResult,
  } = props;

  const [buyOpen, setBuyOpen] = useState(false);
  const buyPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (buyResult) {
      setBuyOpen(true);
      requestAnimationFrame(() => {
        buyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [buyResult]);

  const release = identified?.discogs.release;
  const market = identified?.discogs.market;
  const discogsReleaseUrl = release?.id
    ? `https://www.discogs.com/release/${release.id}`
    : null;

  const discogsSearchHref =
    release?.artist && release?.title
      ? `https://www.discogs.com/search/?q=${encodeURIComponent(
          `${release.artist} ${release.title}`,
        )}&type=release`
      : null;

  const spotifySearchUrl =
    release?.artist && release?.title
      ? `https://open.spotify.com/search/${encodeURIComponent(`${release.artist} ${release.title}`)}`
      : null;

  const about = mergedAboutText(overview, overviewLoading);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">We found a match</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Read the basics, check prices and a preview, then decide if you want to buy this copy.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetFlow}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          New photo
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {release ? (
        <div className="mt-6 space-y-8">
          {/* Top: cover | title + about | metadata */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,260px)] lg:items-start">
            <div className="mx-auto w-full max-w-[200px] lg:mx-0">
              {release.coverImageUrl ? (
                <Image
                  src={release.coverImageUrl}
                  alt="Album cover"
                  width={200}
                  height={200}
                  unoptimized
                  className="aspect-square w-full rounded-lg border border-zinc-200 object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs text-zinc-500">
                  No artwork
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <p className="text-lg font-semibold leading-snug text-zinc-900">
                  {release.artist} — {release.title}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  In short
                </p>
                <div className="mt-2">{about.body}</div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 lg:sticky lg:top-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Details
              </p>
              <dl className="mt-3 space-y-2 text-sm text-zinc-800">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Year</dt>
                  <dd className="text-right font-medium">{release.year ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Label</dt>
                  <dd className="max-w-[65%] text-right font-medium">{release.label ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Country</dt>
                  <dd className="text-right font-medium">{release.country ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Format</dt>
                  <dd className="max-w-[65%] text-right font-medium">
                    {release.formats?.join(", ") ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Genre</dt>
                  <dd className="max-w-[65%] text-right font-medium">
                    {release.genres?.join(", ") ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Style</dt>
                  <dd className="max-w-[65%] text-right font-medium">
                    {release.styles?.join(", ") ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Tracks</dt>
                  <dd className="text-right font-medium">{release.trackCount ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Found via</dt>
                  <dd className="text-right font-medium">
                    {identified?.discogs.matchMethod === "barcode"
                      ? "Barcode"
                      : identified?.discogs.matchMethod === "text"
                        ? "What’s on the sleeve"
                        : identified?.discogs.matchMethod === "manual"
                          ? "ID you entered"
                          : "—"}
                  </dd>
                </div>
              </dl>
              {detectedBarcode ? (
                <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                  Scanned: {detectedBarcode}
                </p>
              ) : null}
            </div>
          </div>

          {overviewError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {overviewError}
            </p>
          ) : null}

          {/* Main actions: Discogs + buy */}
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-6">
            {discogsReleaseUrl ? (
              <>
                <a
                  href={discogsReleaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                  title="Opens Discogs—you can save this release to your collection there"
                >
                  Save to collection
                </a>
                <a
                  href={discogsReleaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                  title="Opens Discogs—you can add this release to your wishlist there"
                >
                  Add to wishlist
                </a>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setBuyOpen(true);
                requestAnimationFrame(() =>
                  buyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
                );
              }}
              disabled={!identified?.discogs.release}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Should I buy?
            </button>
          </div>

          {/* Buy panel */}
          <div ref={buyPanelRef} className="rounded-xl border border-zinc-300 bg-zinc-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900">Is this a fair deal?</p>
                <p className="text-xs text-zinc-600">
                  Enter what the seller is asking and the condition. You’ll get a short recommendation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBuyOpen((o) => !o)}
                className="shrink-0 rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
              >
                {buyOpen ? "Hide" : "Expand"}
              </button>
            </div>

            {buyOpen ? (
              <form className="mt-4 space-y-3" onSubmit={onBuySubmit}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-zinc-700" htmlFor="buy-price">
                      Price
                    </label>
                    <input
                      id="buy-price"
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder="e.g. 24.99"
                      className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label
                      className="block text-xs font-medium text-zinc-700"
                      htmlFor="buy-currency"
                    >
                      Currency
                    </label>
                    <select
                      id="buy-currency"
                      name="currency"
                      value={currency}
                      onChange={(event) =>
                        setCurrency(event.target.value as SupportedCurrency)
                      }
                      className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {SUPPORTED_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {currencyLabels[code]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                    <label
                      className="block text-xs font-medium text-zinc-700"
                      htmlFor="buy-condition"
                    >
                      Condition
                    </label>
                    <select
                      id="buy-condition"
                      name="condition"
                      value={condition}
                      onChange={(event) => setCondition(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Optional</option>
                      {CONDITIONS.map((value) => (
                        <option key={value} value={value}>
                          {conditionLabels[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700" htmlFor="buy-llm">
                    API key (optional)
                  </label>
                  <input
                    id="buy-llm"
                    name="llmApiKey"
                    type="password"
                    autoComplete="off"
                    value={llmApiKey}
                    onChange={(event) => setLlmApiKey(event.target.value)}
                    placeholder="Leave blank if your app already has one"
                    className="mt-1 block w-full max-w-md rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                {buyError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    {buyError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={buyLoading || !identified}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyLoading ? "Working…" : "Get recommendation"}
                  </button>
                  {buyResult ? (
                    <button
                      type="button"
                      onClick={onClearBuyResult}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {buyResult ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div
                    className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${recommendationColor}`}
                  >
                    {buyResult.evaluation.recommendation.toUpperCase()}
                  </div>
                  <p className="text-xs text-zinc-600">
                    How sure we are: {(buyResult.evaluation.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <p className="mt-2 text-xs text-zinc-700">
                  Typical range:{" "}
                  {formatMoney(
                    buyResult.evaluation.fairPriceRange.min,
                    buyResult.evaluation.fairPriceRange.currency,
                  )}{" "}
                  –{" "}
                  {formatMoney(
                    buyResult.evaluation.fairPriceRange.max,
                    buyResult.evaluation.fairPriceRange.currency,
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-700">
                  Your price:{" "}
                  {formatMoney(buyResult.input.askingPrice, buyResult.input.currency)} · Usual going
                  rate:{" "}
                  {formatMoney(buyResult.discogs.market?.median, buyResult.discogs.market?.currency)}
                </p>
                <div className="mt-3">
                  <p className="text-xs font-medium text-zinc-800">Main points</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-700">
                    {buyResult.evaluation.keyReasons.slice(0, 4).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                {buyResult.evaluation.risks.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-zinc-800">Watch out for</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-600">
                      {buyResult.evaluation.risks.slice(0, 3).map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Bottom: Discover + Prelisten */}
          <div className="space-y-8 border-t border-zinc-100 pt-8">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Prices &amp; buzz</h3>
              <p className="mt-1 text-sm text-zinc-600">
                What sellers often ask, how collectors rate it, and other albums by this artist.
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Going rates</p>
                  <p className="mt-2 text-sm text-zinc-700">
                    Low: {formatMoney(market?.low, market?.currency)}
                  </p>
                  <p className="text-sm text-zinc-700">
                    Median: {formatMoney(market?.median, market?.currency)}
                  </p>
                  <p className="text-sm text-zinc-700">
                    High: {formatMoney(market?.high, market?.currency)}
                  </p>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Collectors</p>
                  <p className="mt-2 text-sm text-zinc-700">
                    Average rating:{" "}
                    {typeof release.communityRating === "number"
                      ? `${release.communityRating.toFixed(1)} / 5`
                      : "—"}
                  </p>
                  <p className="text-sm text-zinc-700">
                    Want it: {release.communityWant ?? "—"} · Have it: {release.communityHave ?? "—"}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold text-zinc-900">More from this artist</p>
                {overviewLoading ? (
                  <p className="mt-2 text-xs text-zinc-600">Loading…</p>
                ) : overview?.otherReleases && overview.otherReleases.length > 0 ? (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {overview.otherReleases.map((item) => (
                      <li key={`${item.type ?? "r"}-${item.id}`}>
                        <a
                          href={discogsHrefForSummary(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2 text-left shadow-sm hover:bg-zinc-50"
                        >
                          {item.thumb ? (
                            <Image
                              src={item.thumb}
                              alt=""
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded bg-zinc-200" />
                          )}
                          <span className="min-w-0">
                            <span className="block text-xs font-medium leading-snug text-zinc-900">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-zinc-600">{item.year ?? "—"}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-zinc-600">No other titles to show.</p>
                )}
              </div>

              <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/90 p-4">
                <p className="text-sm font-medium text-zinc-900">Not the right album?</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Open the listing on Discogs, copy the number from the address bar (after{" "}
                  <span className="font-mono text-zinc-800">/release/</span>), and paste it here.
                </p>
                {discogsSearchHref ? (
                  <a
                    href={discogsSearchHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-950"
                  >
                    Look it up on Discogs
                  </a>
                ) : null}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <label className="block text-xs font-medium text-zinc-700" htmlFor="manualDiscogsId">
                      Discogs number
                    </label>
                    <input
                      id="manualDiscogsId"
                      name="manualDiscogsId"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={manualDiscogsId}
                      onChange={(event) => setManualDiscogsId(event.target.value)}
                      placeholder="e.g. 249504"
                      className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onLoadManualRelease}
                    disabled={
                      isResolvingRelease || isIdentifying || manualDiscogsId.trim() === ""
                    }
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResolvingRelease ? "Loading…" : "Load this album"}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-zinc-900">Listen first</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Preview on Spotify when we can find this title.
              </p>
              <div className="mt-4 max-w-xl rounded-xl border border-zinc-200 p-3">
                {identified?.spotify?.embedUrl ? (
                  <iframe
                    title="Spotify preview"
                    src={identified.spotify.embedUrl}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="h-[200px] w-full rounded-lg border border-zinc-200 sm:h-[220px]"
                  />
                ) : (
                  <div className="space-y-2 text-sm text-zinc-600">
                    <p>We couldn’t find a ready-made preview for this one.</p>
                    {spotifySearchUrl ? (
                      <a
                        href={spotifySearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        Search in Spotify
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
