"use client";

import Image from "next/image";
import type { IdentifyReleaseChoice } from "@/lib/artwork-candidates";

interface ChooseReleaseStageProps {
  options: IdentifyReleaseChoice[];
  isLoading: boolean;
  onChoose: (option: IdentifyReleaseChoice) => void;
  onBack: () => void;
}

export function ChooseReleaseStage(props: ChooseReleaseStageProps) {
  const { options, isLoading, onChoose, onBack } = props;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Which one is it?</h2>
      <p className="mt-2 text-sm text-zinc-600">
        A few releases could match your photo. Pick the one that matches the copy in front of you.
        The list is ordered from best fit to weaker fit.
      </p>

      <ul className="mt-4 space-y-3">
        {options.map((opt) => (
          <li key={opt.releaseId}>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onChoose(opt)}
              className="flex w-full gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-left transition hover:border-zinc-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                {opt.coverImageUrl ? (
                  <Image
                    src={opt.coverImageUrl}
                    alt=""
                    width={80}
                    height={80}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                    No art
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">
                  {opt.artist} — {opt.title}
                </p>
                {opt.year ? (
                  <p className="mt-0.5 text-xs text-zinc-600">{opt.year}</p>
                ) : null}
                {opt.briefReason ? (
                  <p className="mt-1 text-xs text-zinc-500">{opt.briefReason}</p>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onBack}
        disabled={isLoading}
        className="mt-4 text-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
      >
        Back to photo
      </button>
    </section>
  );
}
