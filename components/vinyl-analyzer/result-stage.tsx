"use client";

import Image from "next/image";
import { formatMoney } from "@/components/vinyl-analyzer/utils";
import type { AnalyzeResult } from "@/lib/types";

interface ResultStageProps {
  result: AnalyzeResult;
  recommendationColor: string;
  onResetFlow: () => void;
}

export function ResultStage(props: ResultStageProps) {
  const { result, recommendationColor, onResetFlow } = props;

  const spotifyQuery = result.discogs.release
    ? `${result.discogs.release.artist} ${result.discogs.release.title}`
    : "";
  const spotifySearchUrl = spotifyQuery
    ? `https://open.spotify.com/search/${encodeURIComponent(spotifyQuery)}`
    : null;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Result</h2>
          <button
            type="button"
            onClick={onResetFlow}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Analyze another
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div>
            {result.discogs.release?.coverImageUrl ? (
              <Image
                src={result.discogs.release.coverImageUrl}
                alt="Album cover"
                width={220}
                height={220}
                unoptimized
                className="h-56 w-full rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex h-56 w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs text-zinc-500">
                No album cover available
              </div>
            )}
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-lg font-semibold">
              {result.discogs.release?.artist ?? "Unknown artist"} -{" "}
              {result.discogs.release?.title ?? "Unknown release"}
            </p>
            <div className="grid grid-cols-2 gap-2 text-zinc-700">
              <p>Year: {result.discogs.release?.year ?? "-"}</p>
              <p>Label: {result.discogs.release?.label ?? "-"}</p>
              <p>Country: {result.discogs.release?.country ?? "-"}</p>
              <p>Tracks: {result.discogs.release?.trackCount ?? "-"}</p>
              <p>Format: {result.discogs.release?.formats?.join(", ") ?? "-"}</p>
              <p>Genres: {result.discogs.release?.genres?.join(", ") ?? "-"}</p>
              <p>Styles: {result.discogs.release?.styles?.join(", ") ?? "-"}</p>
              <p>
                Match method:{" "}
                {result.discogs.matchMethod === "barcode"
                  ? "Barcode"
                  : result.discogs.matchMethod === "text"
                    ? "Text metadata"
                    : "-"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-700">
              <p>
                Market low:{" "}
                {formatMoney(result.discogs.market?.low, result.discogs.market?.currency)}
              </p>
              <p>
                Market median:{" "}
                {formatMoney(result.discogs.market?.median, result.discogs.market?.currency)}
              </p>
              <p>
                Market high:{" "}
                {formatMoney(result.discogs.market?.high, result.discogs.market?.currency)}
              </p>
              <p>
                Your asking price:{" "}
                {formatMoney(result.input.askingPrice, result.input.currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">AI Evaluation</h3>
          <div
            className={`mt-3 inline-flex rounded-md px-3 py-1 text-sm font-semibold ${recommendationColor}`}
          >
            Recommendation: {result.evaluation.recommendation.toUpperCase()}
          </div>
          <p className="mt-3 text-sm text-zinc-700">
            Confidence: {(result.evaluation.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            Fair range:{" "}
            {formatMoney(
              result.evaluation.fairPriceRange.min,
              result.evaluation.fairPriceRange.currency,
            )}{" "}
            -{" "}
            {formatMoney(
              result.evaluation.fairPriceRange.max,
              result.evaluation.fairPriceRange.currency,
            )}
          </p>
          <div className="mt-4">
            <p className="font-medium">Why</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {result.evaluation.keyReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
            <p className="font-medium">Risks</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {result.evaluation.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Listen to the record</h3>
          {result.spotify?.embedUrl ? (
            <iframe
              title="Spotify pre-listen"
              src={result.spotify.embedUrl}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className="mt-3 h-[352px] w-full rounded-lg border border-zinc-200"
            />
          ) : (
            <div className="mt-3 space-y-2 text-sm text-zinc-600">
              <p>Album could not be found on Spotify.</p>
              {spotifySearchUrl ? (
                <a
                  href={spotifySearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Open in Spotify
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
