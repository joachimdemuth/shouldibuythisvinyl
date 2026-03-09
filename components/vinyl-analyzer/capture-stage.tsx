"use client";

import type { ChangeEvent } from "react";

interface CaptureStageProps {
  isIdentifying: boolean;
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
    isIdentifying,
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
      <h2 className="text-xl font-semibold">Take a photo of the vinyl</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Start with the cover or barcode. You can upload or use the live camera.
      </p>
      <input
        id="image"
        name="image"
        type="file"
        accept="image/*"
        onChange={onFileChange}
        disabled={isIdentifying}
        className="mt-4 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm"
      />
      <div className="mt-3">
        <label className="block text-sm font-medium" htmlFor="captureLlmApiKey">
          OpenAI API key (optional)
        </label>
        <input
          id="captureLlmApiKey"
          name="captureLlmApiKey"
          type="password"
          autoComplete="off"
          value={llmApiKey}
          onChange={(event) => setLlmApiKey(event.target.value)}
          placeholder="sk-..."
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!isCameraActive ? (
          <button
            type="button"
            onClick={onStartCamera}
            disabled={isIdentifying}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Open camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCapturePhoto}
              disabled={!isCameraReady}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCameraReady ? "Take photo" : "Starting camera..."}
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
        <p className="mt-2 text-xs text-zinc-600">Identifying album from photo...</p>
      ) : null}
      {isCameraActive && isBarcodeSupported ? (
        <p className="mt-2 text-xs text-zinc-600">
          {detectedBarcode
            ? `Barcode detected: ${detectedBarcode} (auto-capturing)`
            : "Scanning for barcode..."}
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
            className="w-full aspect-square object-cover"
          />
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}
