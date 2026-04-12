"use client";

import type { ChangeEvent } from "react";

interface CaptureStageProps {
  error: string | null;
  isIdentifying: boolean;
  hasStoredCover: boolean;
  storedCoverName: string | null;
  onSearchAgain: () => void;
  manualArtist: string;
  setManualArtist: (value: string) => void;
  manualTitle: string;
  setManualTitle: (value: string) => void;
  spineFile: File | null;
  onSpineFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  llmApiKey: string;
  setLlmApiKey: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isCameraActive: boolean;
  isCameraReady: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onCapturePhoto: () => void;
  cameraError: string | null;
  isBarcodeSupported: boolean;
  detectedBarcode: string | null;
  onCameraReady: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function CaptureStage(props: CaptureStageProps) {
  const {
    error,
    isIdentifying,
    hasStoredCover,
    storedCoverName,
    onSearchAgain,
    manualArtist,
    setManualArtist,
    manualTitle,
    setManualTitle,
    spineFile,
    onSpineFileChange,
    llmApiKey,
    setLlmApiKey,
    onFileChange,
    isCameraActive,
    isCameraReady,
    onStartCamera,
    onStopCamera,
    onCapturePhoto,
    cameraError,
    isBarcodeSupported,
    detectedBarcode,
    onCameraReady,
    videoRef,
    canvasRef,
  } = props;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Add a photo</h2>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-600">
        <strong>Best:</strong> fill the frame with the barcode (on the sleeve or a sticker).{" "}
        <strong>Otherwise:</strong> the full front of the record or outer sleeve—well lit and in
        focus. Add text or another angle below if needed, then <strong>Search again</strong>; your
        first photo is kept.
      </p>

      <p className="mt-5 text-sm font-medium text-zinc-800">Photo</p>
      <input
        id="image"
        name="image"
        type="file"
        accept="image/*"
        onChange={onFileChange}
        disabled={isIdentifying}
        className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm"
      />

      {hasStoredCover ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950">
          <p>
            Saved{storedCoverName ? `: ${storedCoverName}` : ""}. Add details below if you like,
            then search again—you don’t need a new photo unless you want one.
          </p>
          <button
            type="button"
            onClick={onSearchAgain}
            disabled={isIdentifying}
            className="mt-2 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isIdentifying ? "Searching…" : "Search again"}
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!isCameraActive ? (
          <button
            type="button"
            onClick={onStartCamera}
            disabled={isIdentifying}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Use camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCapturePhoto}
              disabled={!isCameraReady}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCameraReady ? "Take photo" : "Camera starting…"}
            </button>
            <button
              type="button"
              onClick={onStopCamera}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Close camera
            </button>
          </>
        )}
      </div>

      {cameraError ? <p className="mt-2 text-xs text-red-700">{cameraError}</p> : null}
      {isIdentifying ? (
        <p className="mt-2 text-xs text-zinc-600">Looking up this record…</p>
      ) : null}
      {isCameraActive && isBarcodeSupported ? (
        <p className="mt-2 text-xs text-zinc-600">
          {detectedBarcode
            ? `Got it: ${detectedBarcode}. Saving…`
            : "Point at the barcode—it works best close and steady."}
        </p>
      ) : null}

      {isCameraActive ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={onCameraReady}
            className="aspect-square w-full object-cover"
          />
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-sm font-medium text-zinc-900">No match yet?</p>
        <p className="mt-1 text-xs text-zinc-600">
          Type the artist and album, or add a spine or back photo. Plain sleeves without a barcode or
          text are hard to place—use every clue you have.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-700" htmlFor="manualArtist">
              Artist (optional)
            </label>
            <input
              id="manualArtist"
              name="manualArtist"
              type="text"
              autoComplete="off"
              value={manualArtist}
              onChange={(event) => setManualArtist(event.target.value)}
              disabled={isIdentifying}
              placeholder="e.g. Joni Mitchell"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700" htmlFor="manualTitle">
              Album (optional)
            </label>
            <input
              id="manualTitle"
              name="manualTitle"
              type="text"
              autoComplete="off"
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              disabled={isIdentifying}
              placeholder="e.g. Blue"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-zinc-700" htmlFor="imageSpine">
            Spine or back (optional)
          </label>
          <input
            id="imageSpine"
            name="imageSpine"
            type="file"
            accept="image/*"
            onChange={onSpineFileChange}
            disabled={isIdentifying}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-xs"
          />
          {spineFile ? (
            <p className="mt-1 text-xs text-zinc-600">Using: {spineFile.name}</p>
          ) : null}
        </div>

        {hasStoredCover ? (
          <button
            type="button"
            onClick={onSearchAgain}
            disabled={isIdentifying}
            className="mt-4 w-full rounded-lg border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isIdentifying ? "Searching…" : "Search again"}
          </button>
        ) : null}
      </div>

      <div className="mt-5">
        <label className="block text-sm font-medium" htmlFor="captureLlmApiKey">
          API key (optional)
        </label>
        <input
          id="captureLlmApiKey"
          name="captureLlmApiKey"
          type="password"
          autoComplete="off"
          value={llmApiKey}
          onChange={(event) => setLlmApiKey(event.target.value)}
          placeholder="Optional"
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-600">
          Used to read text from your photos. It isn’t stored by this page.
        </p>
      </div>
    </section>
  );
}
