"use client";

import { useCallback, useState } from "react";
import { CaptureStage } from "@/components/vinyl-analyzer/capture-stage";
import { DetailsStage } from "@/components/vinyl-analyzer/details-stage";
import { ResultStage } from "@/components/vinyl-analyzer/result-stage";
import { useBarcodeCamera } from "@/components/vinyl-analyzer/use-barcode-camera";
import type { AnalyzeResponse } from "@/components/vinyl-analyzer/types";
import type { AnalyzeResult, IdentifyResult, SupportedCurrency } from "@/lib/types";

export default function Home() {
  const [stage, setStage] = useState<"capture" | "details" | "result">("capture");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [condition, setCondition] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [identified, setIdentified] = useState<IdentifyResult | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [disclaimer, setDisclaimer] = useState<string>(
    "Informational only. Not financial advice.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifyAlbum = useCallback(async (nextFile: File, barcodeOverride?: string) => {
    setError(null);
    setIsIdentifying(true);
    setIdentified(null);
    try {
      const identifyData = new FormData();
      identifyData.append("image", nextFile);
      if (barcodeOverride) identifyData.append("barcode", barcodeOverride);
      if (llmApiKey.trim() !== "") identifyData.append("llmApiKey", llmApiKey.trim());

      const response = await fetch("/api/identify", {
        method: "POST",
        body: identifyData,
      });
      const data = (await response.json()) as IdentifyResult | { error: string };
      if (!response.ok || "error" in data) {
        const message =
          "error" in data
            ? data.error
            : "Album could not be identified from the photo.";
        setError(message);
        setStage("capture");
        return;
      }

      setIdentified(data);
      setStage("details");
    } catch {
      setError("Could not identify album from photo. Please try again.");
      setStage("capture");
    } finally {
      setIsIdentifying(false);
    }
  }, [llmApiKey]);

  const handlePhotoCaptured = useCallback(
    (file: File, barcode?: string) => {
      void identifyAlbum(file, barcode);
    },
    [identifyAlbum],
  );

  const camera = useBarcodeCamera({ onPhotoCaptured: handlePhotoCaptured });

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      camera.resetCameraState();
      const nextFile = event.target.files?.[0];
      if (!nextFile) return;
      void identifyAlbum(nextFile);
    },
    [camera, identifyAlbum],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!identified) {
      setError("Album needs to be identified before running analysis.");
      return;
    }

    const formData = new FormData();
    if (price.trim() !== "") formData.append("price", price.trim());
    if (condition.trim() !== "") formData.append("condition", condition);
    formData.append("currency", currency);
    if (llmApiKey.trim() !== "") formData.append("llmApiKey", llmApiKey.trim());
    if (camera.detectedBarcode) formData.append("barcode", camera.detectedBarcode);
    formData.append("identified", JSON.stringify(identified));

    setIsLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as AnalyzeResponse;
      if (!response.ok || "error" in data) {
        const message =
          "error" in data ? data.error : "Failed to analyze this listing.";
        setError(message);
        return;
      }

      setResult(data);
      if (data.disclaimer) setDisclaimer(data.disclaimer);
      setStage("result");
    } catch {
      setError("Network error while analyzing. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetFlow() {
    camera.resetCameraState();
    setStage("capture");
    setResult(null);
    setError(null);
    setPrice("");
    setCondition("");
    setIdentified(null);
    setLlmApiKey("");
    setCurrency("USD");
  }

  const recommendationColor =
    result?.evaluation.recommendation === "buy"
      ? "text-green-700 bg-green-100"
      : result?.evaluation.recommendation === "skip"
        ? "text-red-700 bg-red-100"
        : "text-amber-700 bg-amber-100";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Should I Buy This Vinyl?</h1>
          <p className="mt-1 text-sm text-zinc-600">{disclaimer}</p>
        </header>

        {stage === "capture" ? (
          <CaptureStage
            isIdentifying={isIdentifying}
            llmApiKey={llmApiKey}
            setLlmApiKey={setLlmApiKey}
            onFileChange={handleFileChange}
            isCameraActive={camera.isCameraActive}
            isCameraReady={camera.isCameraReady}
            onStartCamera={camera.startCamera}
            onStopCamera={camera.stopCamera}
            onCapturePhoto={() => camera.capturePhotoFromCamera()}
            cameraError={camera.cameraError}
            isBarcodeSupported={camera.isBarcodeSupported}
            detectedBarcode={camera.detectedBarcode}
            onCameraReady={() => camera.setIsCameraReady(true)}
            videoRef={camera.videoRef}
            canvasRef={camera.canvasRef}
          />
        ) : null}

        {stage === "details" ? (
          <DetailsStage
            identified={identified}
            detectedBarcode={camera.detectedBarcode}
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
            condition={condition}
            setCondition={setCondition}
            llmApiKey={llmApiKey}
            setLlmApiKey={setLlmApiKey}
            isLoading={isLoading}
            isIdentifying={isIdentifying}
            onResetFlow={resetFlow}
            onSubmit={handleSubmit}
          />
        ) : null}

        {stage === "result" && result ? (
          <ResultStage
            result={result}
            recommendationColor={recommendationColor}
            onResetFlow={resetFlow}
          />
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
