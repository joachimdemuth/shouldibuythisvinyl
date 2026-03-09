"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CONDITIONS,
  SUPPORTED_CURRENCIES,
  type AnalyzeResult,
  type SupportedCurrency,
} from "@/lib/types";

type AnalyzeResponse =
  | (AnalyzeResult & { disclaimer?: string })
  | { error: string };

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const candidate = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  console.log("candidate", candidate);
  return candidate ?? null;
}

function normalizeBarcode(value: string | undefined): string | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 14) return null;
  return digitsOnly;
}

function createBarcodeDetector(): BarcodeDetectorInstance | null {
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

function formatMoney(value: number | undefined, currency: string | undefined): string {
  if (typeof value !== "number") return "-";
  const code = currency ?? "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value);
}

const conditionLabels: Record<(typeof CONDITIONS)[number], string> = {
  sealed: "Sealed",
  mint: "Mint (M)",
  near_mint: "Near Mint (NM/NM-)",
  very_good_plus: "Very Good Plus (VG+)",
  very_good: "Very Good (VG)",
  good: "Good (G)",
  fair: "Fair (F)",
  poor: "Poor (P)",
};

const currencyLabels: Record<SupportedCurrency, string> = {
  USD: "USD - US Dollar",
  EUR: "EUR - Euro",
  GBP: "GBP - British Pound",
  SEK: "SEK - Swedish Krona",
  NOK: "NOK - Norwegian Krone",
  DKK: "DKK - Danish Krone",
  CAD: "CAD - Canadian Dollar",
  AUD: "AUD - Australian Dollar",
  JPY: "JPY - Japanese Yen",
};

export default function Home() {
  const [stage, setStage] = useState<"capture" | "details" | "result">("capture");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [condition, setCondition] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [disclaimer, setDisclaimer] = useState<string>(
    "Informational only. Not financial advice.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [isBarcodeSupported, setIsBarcodeSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const barcodeFrameRef = useRef<number | null>(null);
  const barcodeScanInFlightRef = useRef(false);
  const autoCaptureTriggeredRef = useRef(false);
  const capturePhotoFromCameraRef = useRef<(barcodeFromScan?: string) => void>(
    () => {},
  );

  useEffect(() => {
    setIsBarcodeSupported(Boolean(createBarcodeDetector()));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (barcodeFrameRef.current !== null) {
        cancelAnimationFrame(barcodeFrameRef.current);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    async function attachStream() {
      if (!isCameraActive || !videoRef.current || !streamRef.current) return;
      try {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      } catch {
        setCameraError(
          "Camera started but preview could not play. Try reopening the camera.",
        );
      }
    }

    attachStream();
  }, [isCameraActive]);

  useEffect(() => {
    if (!isCameraActive || !isCameraReady || !videoRef.current) return;
    if (!barcodeDetectorRef.current) {
      barcodeDetectorRef.current = createBarcodeDetector();
    }
    if (!barcodeDetectorRef.current) {
      return;
    }

    let cancelled = false;
    const loop = async () => {
      if (cancelled || !videoRef.current || !barcodeDetectorRef.current) return;

      if (!barcodeScanInFlightRef.current) {
        barcodeScanInFlightRef.current = true;
        console.log("barcodeScanInFlightRef.current", barcodeScanInFlightRef.current);
        try {
          const results = await barcodeDetectorRef.current.detect(videoRef.current);
          console.log("results", results);
          const normalized = normalizeBarcode(results[0]?.rawValue);
          console.log("normalized", normalized);
          if (normalized) {
            setDetectedBarcode(normalized);
            if (!autoCaptureTriggeredRef.current) {
              capturePhotoFromCameraRef.current(normalized);
            }
          }
        } catch {
          // Ignore transient detector errors while frames change.
        } finally {
          barcodeScanInFlightRef.current = false;
        }
      }

      barcodeFrameRef.current = requestAnimationFrame(loop);
    };

    barcodeFrameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      barcodeScanInFlightRef.current = false;
      if (barcodeFrameRef.current !== null) {
        cancelAnimationFrame(barcodeFrameRef.current);
        barcodeFrameRef.current = null;
      }
    };
  }, [isCameraActive, isCameraReady]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
    setIsCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (barcodeFrameRef.current !== null) {
      cancelAnimationFrame(barcodeFrameRef.current);
      barcodeFrameRef.current = null;
    }
    barcodeDetectorRef.current = null;
    autoCaptureTriggeredRef.current = false;
  }, []);

  const capturePhotoFromCamera = useCallback(
    (barcodeFromScan?: string) => {
      if (barcodeFromScan) {
        console.log("barcodeFromScan", barcodeFromScan);
        autoCaptureTriggeredRef.current = true;
      }
      if (!videoRef.current || !canvasRef.current) {
        setCameraError("Camera is not ready yet.");
        autoCaptureTriggeredRef.current = false;
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!isCameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
        setCameraError("Camera stream is still starting. Try again in a moment.");
        autoCaptureTriggeredRef.current = false;
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        setCameraError("Could not capture frame from camera.");
        autoCaptureTriggeredRef.current = false;
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setCameraError("Failed to capture image.");
            autoCaptureTriggeredRef.current = false;
            return;
          }

          const captured = new File([blob], `camera-capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          if (barcodeFromScan) setDetectedBarcode(barcodeFromScan);
          setFile(captured);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(URL.createObjectURL(captured));
          setCameraError(null);
          stopCamera();
          setStage("details");
        },
        "image/jpeg",
        0.92,
      );
    },
    [isCameraReady, previewUrl, stopCamera],
  );

  useEffect(() => {
    capturePhotoFromCameraRef.current = capturePhotoFromCamera;
  }, [capturePhotoFromCamera]);
  capturePhotoFromCameraRef.current = capturePhotoFromCamera;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setCameraError(null);
    setDetectedBarcode(null);
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    setFile(nextFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setStage("details");
  }

  async function startCamera() {
    setCameraError(null);
    setIsCameraReady(false);
    setDetectedBarcode(null);
    autoCaptureTriggeredRef.current = false;
    barcodeDetectorRef.current = createBarcodeDetector();
    setIsBarcodeSupported(Boolean(barcodeDetectorRef.current));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch {
      setCameraError(
        "Could not access camera. Please allow permission or upload a file instead.",
      );
      setIsCameraActive(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please upload a vinyl cover image.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    if (price.trim() !== "") formData.append("price", price.trim());
    if (condition.trim() !== "") formData.append("condition", condition);
    formData.append("currency", currency);
    if (llmApiKey.trim() !== "") formData.append("llmApiKey", llmApiKey.trim());
    if (detectedBarcode) formData.append("barcode", detectedBarcode);

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
    stopCamera();
    setStage("capture");
    setResult(null);
    setError(null);
    setCameraError(null);
    setDetectedBarcode(null);
    setPrice("");
    setCondition("");
    setLlmApiKey("");
    setCurrency("USD");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  const recommendationColor =
    result?.evaluation.recommendation === "buy"
      ? "text-green-700 bg-green-100"
      : result?.evaluation.recommendation === "skip"
        ? "text-red-700 bg-red-100"
        : "text-amber-700 bg-amber-100";

  const spotifyQuery =
    result?.discogs.release
      ? `${result.discogs.release.artist} ${result.discogs.release.title}`
      : "";
  const spotifySearchUrl = spotifyQuery
    ? `https://open.spotify.com/search/${encodeURIComponent(spotifyQuery)}`
    : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Should I Buy This Vinyl?</h1>
          <p className="mt-1 text-sm text-zinc-600">{disclaimer}</p>
        </header>

        {stage === "capture" ? (
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
              onChange={handleFileChange}
              className="mt-4 block w-full rounded-lg border border-zinc-300 bg-white p-2 text-sm"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {!isCameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Open camera
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => capturePhotoFromCamera()}
                    disabled={!isCameraReady}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCameraReady ? "Take photo" : "Starting camera..."}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Close camera
                  </button>
                </>
              )}
            </div>

            {cameraError ? (
              <p className="mt-2 text-xs text-red-700">{cameraError}</p>
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
                  onLoadedMetadata={() => setIsCameraReady(true)}
                  className=" w-full aspect-square object-cover"
                />
              </div>
            ) : null}
            <canvas ref={canvasRef} className="hidden" />
          </section>
        ) : null}

        {stage === "details" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Add listing details</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Optional metadata improves recommendation quality.
            </p>

            <div className="mt-4 grid gap-6 h-fit lg:grid-cols-[400px_1fr]">
              <div>
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Captured vinyl"
                    width={400}
                    height={400}
                    unoptimized
                    className="aspect-square h-64 w-full rounded-lg border border-zinc-200 object-cover"
                  />
                ) : null}
                {detectedBarcode ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    Detected barcode: {detectedBarcode}
                  </p>
                ) : null}
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
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
                      onChange={(event) =>
                        setCurrency(event.target.value as SupportedCurrency)
                      }
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
                    onClick={resetFlow}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Retake photo
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? "Analyzing..." : "Should I buy this?"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : null}

        {stage === "result" && result ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Result</h2>
                <button
                  type="button"
                  onClick={resetFlow}
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
                    <p>
                      Format: {result.discogs.release?.formats?.join(", ") ?? "-"}
                    </p>
                    <p>
                      Genres: {result.discogs.release?.genres?.join(", ") ?? "-"}
                    </p>
                    <p>
                      Styles: {result.discogs.release?.styles?.join(", ") ?? "-"}
                    </p>
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
                      {formatMoney(
                        result.discogs.market?.median,
                        result.discogs.market?.currency,
                      )}
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
                    <p>
                      Spotify embed unavailable. Add `SPOTIFY_CLIENT_ID` and
                      `SPOTIFY_CLIENT_SECRET` to enable auto pre-listen.
                    </p>
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
