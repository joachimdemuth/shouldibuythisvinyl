"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBarcodeDetector, normalizeBarcode } from "@/components/vinyl-analyzer/utils";
import type { BarcodeDetectorInstance } from "@/components/vinyl-analyzer/types";

interface UseBarcodeCameraArgs {
  onPhotoCaptured: (file: File, barcode?: string) => void;
}

export function useBarcodeCamera(args: UseBarcodeCameraArgs) {
  const { onPhotoCaptured } = args;

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
  const onPhotoCapturedRef = useRef(onPhotoCaptured);

  useEffect(() => {
    onPhotoCapturedRef.current = onPhotoCaptured;
  }, [onPhotoCaptured]);

  useEffect(() => {
    setIsBarcodeSupported(Boolean(createBarcodeDetector()));
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (barcodeFrameRef.current !== null) {
        cancelAnimationFrame(barcodeFrameRef.current);
      }
    };
  }, []);

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
    void attachStream();
  }, [isCameraActive]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
    setIsCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    if (barcodeFrameRef.current !== null) {
      cancelAnimationFrame(barcodeFrameRef.current);
      barcodeFrameRef.current = null;
    }
    barcodeDetectorRef.current = null;
    autoCaptureTriggeredRef.current = false;
  }, []);

  const capturePhotoFromCamera = useCallback(
    (barcodeFromScan?: string) => {
      if (barcodeFromScan) autoCaptureTriggeredRef.current = true;
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
          setCameraError(null);
          stopCamera();
          onPhotoCapturedRef.current(captured, barcodeFromScan);
        },
        "image/jpeg",
        0.92,
      );
    },
    [isCameraReady, stopCamera],
  );

  useEffect(() => {
    if (!isCameraActive || !isCameraReady || !videoRef.current) return;
    if (!barcodeDetectorRef.current) {
      barcodeDetectorRef.current = createBarcodeDetector();
    }
    if (!barcodeDetectorRef.current) return;

    let cancelled = false;
    const loop = async () => {
      if (cancelled || !videoRef.current || !barcodeDetectorRef.current) return;
      if (!barcodeScanInFlightRef.current) {
        barcodeScanInFlightRef.current = true;
        try {
          const results = await barcodeDetectorRef.current.detect(videoRef.current);
          const normalized = normalizeBarcode(results[0]?.rawValue);
          if (normalized) {
            setDetectedBarcode(normalized);
            if (!autoCaptureTriggeredRef.current) capturePhotoFromCamera(normalized);
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
  }, [capturePhotoFromCamera, isCameraActive, isCameraReady]);

  const startCamera = useCallback(async () => {
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
  }, []);

  const resetCameraState = useCallback(() => {
    stopCamera();
    setDetectedBarcode(null);
    setCameraError(null);
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isCameraActive,
    isCameraReady,
    isBarcodeSupported,
    detectedBarcode,
    cameraError,
    setIsCameraReady,
    startCamera,
    stopCamera,
    capturePhotoFromCamera,
    resetCameraState,
  };
}
