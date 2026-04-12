"use client";

import { useCallback, useEffect, useState } from "react";
import { CaptureStage } from "@/components/vinyl-analyzer/capture-stage";
import { ChooseReleaseStage } from "@/components/vinyl-analyzer/choose-release-stage";
import {
  OverviewStage,
  type AlbumOverviewPayload,
} from "@/components/vinyl-analyzer/overview-stage";
import { useBarcodeCamera } from "@/components/vinyl-analyzer/use-barcode-camera";
import type { AnalyzeResponse } from "@/components/vinyl-analyzer/types";
import type { IdentifyReleaseChoice } from "@/lib/artwork-candidates";
import type { AnalyzeResult, IdentifyResult, SupportedCurrency } from "@/lib/types";

export default function Home() {
  const [stage, setStage] = useState<"capture" | "chooseRelease" | "overview">("capture");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [condition, setCondition] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [identified, setIdentified] = useState<IdentifyResult | null>(null);
  const [buyResult, setBuyResult] = useState<AnalyzeResult | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string>(
    "For your reference only—not financial advice.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isResolvingRelease, setIsResolvingRelease] = useState(false);
  const [manualDiscogsId, setManualDiscogsId] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [spineFile, setSpineFile] = useState<File | null>(null);
  /** Last front-cover file so users can re-run identify after typing spine/manual—no re-upload. */
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [releaseChoices, setReleaseChoices] = useState<IdentifyReleaseChoice[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<AlbumOverviewPayload | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const identifyAlbum = useCallback(async (nextFile: File, barcodeOverride?: string) => {
    setCoverFile(nextFile);
    setError(null);
    setBuyError(null);
    setBuyResult(null);
    setIsIdentifying(true);
    setIdentified(null);
    try {
      const identifyData = new FormData();
      identifyData.append("image", nextFile);
      if (barcodeOverride) identifyData.append("barcode", barcodeOverride);
      if (llmApiKey.trim() !== "") identifyData.append("llmApiKey", llmApiKey.trim());
      if (manualArtist.trim() !== "") identifyData.append("manualArtist", manualArtist.trim());
      if (manualTitle.trim() !== "") identifyData.append("manualTitle", manualTitle.trim());
      if (spineFile) identifyData.append("imageSpine", spineFile);

      const response = await fetch("/api/identify", {
        method: "POST",
        body: identifyData,
      });
      const data = (await response.json()) as
        | IdentifyResult
        | { error: string }
        | {
            chooseRelease: true;
            options: IdentifyReleaseChoice[];
          };

      if (!response.ok) {
        const message =
          "error" in data && typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "We couldn’t match this photo to a release. Try a clearer shot or add artist and title.";
        setError(message);
        setStage("capture");
        return;
      }

      if ("chooseRelease" in data && data.chooseRelease && "options" in data) {
        setReleaseChoices(data.options);
        setStage("chooseRelease");
        return;
      }

      setIdentified(data as IdentifyResult);
      setStage("overview");
    } catch {
      setError("Something went wrong while looking up the record. Try again.");
      setStage("capture");
    } finally {
      setIsIdentifying(false);
    }
  }, [llmApiKey, manualArtist, manualTitle, spineFile]);

  const handleSearchAgain = useCallback(() => {
    if (!coverFile) return;
    void identifyAlbum(coverFile);
  }, [coverFile, identifyAlbum]);

  const handleLoadManualRelease = useCallback(async () => {
    setError(null);
    setBuyError(null);
    setBuyResult(null);
    setIsResolvingRelease(true);
    try {
      const formData = new FormData();
      formData.append("discogsReleaseId", manualDiscogsId.trim());
      const response = await fetch("/api/resolve-release", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as IdentifyResult | { error: string };
      if (!response.ok || "error" in data) {
        const message =
          "error" in data
            ? data.error
            : "That release couldn’t be opened.";
        setError(message);
        return;
      }

      setIdentified(data);
      setManualDiscogsId("");
    } catch {
      setError("We couldn’t load that release. Check the number and try again.");
    } finally {
      setIsResolvingRelease(false);
    }
  }, [manualDiscogsId]);

  const handleChooseRelease = useCallback(
    async (option: IdentifyReleaseChoice) => {
      setError(null);
      setBuyError(null);
      setBuyResult(null);
      setIsResolvingRelease(true);
      try {
        const formData = new FormData();
        formData.append("discogsReleaseId", String(option.releaseId));
        if (llmApiKey.trim() !== "") formData.append("llmApiKey", llmApiKey.trim());
        const response = await fetch("/api/resolve-release", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as IdentifyResult | { error: string };
        if (!response.ok || "error" in payload) {
          const message =
            "error" in payload
              ? payload.error
              : "That release couldn’t be opened.";
          setError(message);
          return;
        }

        setIdentified(payload);
        setReleaseChoices(null);
        setStage("overview");
      } catch {
        setError("We couldn’t load that release. Try again.");
      } finally {
        setIsResolvingRelease(false);
      }
    },
    [llmApiKey],
  );

  const handlePhotoCaptured = useCallback(
    (file: File, barcode?: string) => {
      void identifyAlbum(file, barcode);
    },
    [identifyAlbum],
  );

  const camera = useBarcodeCamera({ onPhotoCaptured: handlePhotoCaptured });

  useEffect(() => {
    if (stage !== "overview" || !identified?.discogs?.release) return;

    const ac = new AbortController();
    setOverviewLoading(true);
    setOverviewError(null);
    setOverviewData(null);

    void (async () => {
      try {
        const formData = new FormData();
        formData.append("identified", JSON.stringify(identified));
        if (llmApiKey.trim() !== "") formData.append("llmApiKey", llmApiKey.trim());

        const response = await fetch("/api/album-overview", {
          method: "POST",
          body: formData,
          signal: ac.signal,
        });
        const data = (await response.json()) as AlbumOverviewPayload & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Extra details couldn’t be loaded.");
        }
        setOverviewData({
          albumReview: data.albumReview,
          artistNote: data.artistNote,
          overviewLlmError: data.overviewLlmError,
          otherReleases: data.otherReleases ?? [],
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setOverviewError(err instanceof Error ? err.message : "Extra details couldn’t be loaded.");
      } finally {
        if (!ac.signal.aborted) setOverviewLoading(false);
      }
    })();

    return () => ac.abort();
  }, [stage, identified, llmApiKey]);

  const handleSpineFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.files?.[0];
      setSpineFile(next ?? null);
    },
    [],
  );

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

  async function handleBuySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuyError(null);
    setBuyResult(null);

    if (!identified) {
      setBuyError("Find and open a release first.");
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
          "error" in data ? data.error : "We couldn’t finish that check.";
        setBuyError(message);
        return;
      }

      setBuyResult(data);
      if (data.disclaimer) setDisclaimer(data.disclaimer);
    } catch {
      setBuyError("Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function resetFlow() {
    camera.resetCameraState();
    setStage("capture");
    setBuyResult(null);
    setBuyError(null);
    setError(null);
    setPrice("");
    setCondition("");
    setIdentified(null);
    setLlmApiKey("");
    setCurrency("USD");
    setManualDiscogsId("");
    setManualArtist("");
    setManualTitle("");
    setSpineFile(null);
    setCoverFile(null);
    setReleaseChoices(null);
    setOverviewData(null);
    setOverviewError(null);
    setOverviewLoading(false);
  }

  const recommendationColor =
    buyResult?.evaluation.recommendation === "buy"
      ? "text-green-700 bg-green-100"
      : buyResult?.evaluation.recommendation === "skip"
        ? "text-red-700 bg-red-100"
        : "text-amber-700 bg-amber-100";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Should I Buy This Vinyl?</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-700">
            Photograph the <strong>barcode</strong> if you can—it’s the fastest way to find the
            release. No barcode? Use a clear shot of the <strong>front</strong> of the sleeve or
            jacket.
          </p>
          <p className="mt-2 text-xs text-zinc-500">{disclaimer}</p>
        </header>

        {stage === "chooseRelease" && releaseChoices ? (
          <ChooseReleaseStage
            options={releaseChoices}
            isLoading={isResolvingRelease}
            onChoose={(opt) => void handleChooseRelease(opt)}
            onBack={() => {
              setStage("capture");
              setReleaseChoices(null);
            }}
          />
        ) : null}

        {stage === "capture" ? (
          <CaptureStage
            error={error}
            isIdentifying={isIdentifying}
            hasStoredCover={coverFile !== null}
            storedCoverName={coverFile?.name ?? null}
            onSearchAgain={handleSearchAgain}
            manualArtist={manualArtist}
            setManualArtist={setManualArtist}
            manualTitle={manualTitle}
            setManualTitle={setManualTitle}
            spineFile={spineFile}
            onSpineFileChange={handleSpineFileChange}
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

        {stage === "overview" ? (
          <OverviewStage
            error={error}
            identified={identified}
            detectedBarcode={camera.detectedBarcode}
            overview={overviewData}
            overviewLoading={overviewLoading}
            overviewError={overviewError}
            manualDiscogsId={manualDiscogsId}
            setManualDiscogsId={setManualDiscogsId}
            isResolvingRelease={isResolvingRelease}
            isIdentifying={isIdentifying}
            onLoadManualRelease={() => void handleLoadManualRelease()}
            onResetFlow={resetFlow}
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
            condition={condition}
            setCondition={setCondition}
            llmApiKey={llmApiKey}
            setLlmApiKey={setLlmApiKey}
            buyResult={buyResult}
            buyLoading={isLoading}
            buyError={buyError}
            recommendationColor={recommendationColor}
            onBuySubmit={handleBuySubmit}
            onClearBuyResult={() => {
              setBuyResult(null);
              setBuyError(null);
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
