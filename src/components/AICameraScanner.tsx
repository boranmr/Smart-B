import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  AlertCircle,
  Barcode,
  Camera,
  Check,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Undo2,
  Upload,
  VideoOff,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { analyzeProductFrameAI } from '../lib/syncClient';
import type { AICountResponse, AIDetectionBox, BottleCapRule, StockTakingItem, StockTakingSession } from '../types/inventory';

interface TrackedDetection {
  trackId: string;
  bbox: [number, number, number, number];
  lastSeenAt: number;
  counted: boolean;
  capStatus: string;
}

function computeIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
  const y1 = Math.max(a[0], b[0]);
  const x1 = Math.max(a[1], b[1]);
  const y2 = Math.min(a[2], b[2]);
  const x2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, y2 - y1) * Math.max(0, x2 - x1);
  if (inter <= 0) return 0;
  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
  return inter / (areaA + areaB - inter);
}

export const AICameraScanner: React.FC<{
  initialProductId?: string | null;
  activeSessionId?: string | null;
  onCountCompleted?: (productId: string, confirmedQty: number, openQty: number, uncertainQty: number) => void;
}> = ({ initialProductId, activeSessionId, onCountCompleted }) => {
  const { workspace, user, isOnline, getProductStock, dispatchMutation } = useInventory();

  const [selectedLocationId, setSelectedLocationId] = useState(workspace?.locations[0]?.id || '');
  const [selectedProductId, setSelectedProductId] = useState(initialProductId || workspace?.products[0]?.id || '');
  const [scanMode, setScanMode] = useState<'ai_vision' | 'barcode_qr'>('ai_vision');
  const [bottleCapRule, setBottleCapRule] = useState<BottleCapRule>(
    workspace?.business?.preferences?.defaultBottleCapRule || 'capped_only'
  );

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [scanningFrame, setScanningFrame] = useState(false);
  const [autoTrack, setAutoTrack] = useState(false);

  // Session counts & history stack for Undo
  const [aiCount, setAiCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [uncertainCount, setUncertainCount] = useState(0);
  const [manualDelta, setManualDelta] = useState(0);
  const [historyStack, setHistoryStack] = useState<{ ai: number; open: number; manual: number }[]>([]);
  const [lastAiResult, setLastAiResult] = useState<AICountResponse | null>(null);
  const [lastScanStatus, setLastScanStatus] = useState<string>('Ready — Select product and scan');
  const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);

  // Confirm DONE modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [finalEditedQty, setFinalEditedQty] = useState(0);
  const [savingFinal, setSavingFinal] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackedRef = useRef<TrackedDetection[]>([]);
  const lastBarcodeRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);

  const selectedProduct = useMemo(
    () => workspace?.products.find((p) => p.id === selectedProductId) || null,
    [workspace?.products, selectedProductId]
  );

  useEffect(() => {
    if (initialProductId) setSelectedProductId(initialProductId);
  }, [initialProductId]);

  useEffect(() => {
    if (selectedProduct?.recognitionProfile?.bottleCapRule) {
      setBottleCapRule(selectedProduct.recognitionProfile.bottleCapRule);
    }
  }, [selectedProduct]);

  const stopCamera = useCallback(() => {
    setAutoTrack(false);
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const pushHistory = useCallback(() => {
    setHistoryStack((prev) => [...prev.slice(-20), { ai: aiCount, open: openCount, manual: manualDelta }]);
  }, [aiCount, openCount, manualDelta]);

  const resetSession = useCallback(() => {
    setAiCount(0);
    setOpenCount(0);
    setUncertainCount(0);
    setManualDelta(0);
    setHistoryStack([]);
    setLastAiResult(null);
    setCapturedPreview(null);
    trackedRef.current = [];
    setLastScanStatus('Session reset — ready to count');
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCapturedPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch {
      setCameraError('Live camera access denied or unavailable on this device. Use "Upload Shelf Photo" or manual adjustment below.');
    }
  };

  // Offline Barcode & QR continuous scanner
  useEffect(() => {
    if (!cameraActive || scanMode !== 'barcode_qr' || !videoRef.current || !selectedProduct) {
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
      return;
    }

    const reader = new BrowserMultiFormatReader();
    let active = true;
    reader
      .decodeFromVideoElement(videoRef.current, (result) => {
        if (!active || !result) return;
        const code = result.getText().trim();
        const now = Date.now();
        if (lastBarcodeRef.current.code === code && now - lastBarcodeRef.current.ts < 2500) {
          return; // Duplicate scan prevention
        }
        lastBarcodeRef.current = { code, ts: now };

        const targets = [selectedProduct.barcode, selectedProduct.qrCode, selectedProduct.sku]
          .filter(Boolean)
          .map((s) => s.toLowerCase());

        if (targets.includes(code.toLowerCase())) {
          pushHistory();
          setAiCount((c) => c + 1);
          setBarcodeFeedback(`Matched ${selectedProduct.name} (${code}) -> +1 counted`);
          setLastScanStatus(`Barcode matched: ${code}`);
        } else {
          setBarcodeFeedback(`Ignored code "${code}" — does not match ${selectedProduct.name}`);
        }
      })
      .then((controls) => {
        if (active) zxingControlsRef.current = controls;
        else controls.stop();
      })
      .catch(() => {});

    return () => {
      active = false;
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
    };
  }, [cameraActive, scanMode, selectedProduct, pushHistory]);

  const processFrameWithAI = useCallback(
    async (dataUrl: string, isMultiFrameTrack: boolean) => {
      if (!selectedProduct) return;
      if (!isOnline) {
        setCameraError('Offline mode: AI Vision requires internet. Switch to "Barcode / QR (Offline)" or use +/- manual controls.');
        return;
      }

      setScanningFrame(true);
      setCameraError(null);
      setLastScanStatus(`Analyzing frame for ${selectedProduct.name} only...`);

      try {
        const res = await analyzeProductFrameAI({
          imageDataUrl: dataUrl,
          productId: selectedProduct.id,
          bottleCapRule,
        });

        setLastAiResult(res);
        setUncertainCount(res.uncertainCount || 0);

        // Frame-to-frame duplicate tracking via IoU
        const now = Date.now();
        // Prune objects absent for > 12 seconds
        trackedRef.current = trackedRef.current.filter((t) => now - t.lastSeenAt < 12000);

        let newlyCountedEligible = 0;
        let newlyCountedOpen = 0;

        for (const det of res.detections || []) {
          const bbox = Array.isArray(det.bbox) && det.bbox.length === 4 ? det.bbox : ([0, 0, 0, 0] as [number, number, number, number]);
          if (isMultiFrameTrack) {
            const match = trackedRef.current.find((t) => computeIoU(t.bbox, bbox) >= 0.38);
            if (match) {
              match.bbox = bbox;
              match.lastSeenAt = now;
              continue; // Already tracked in frame; prevent duplicate counting!
            }
          }

          trackedRef.current.push({
            trackId: det.id || crypto.randomUUID(),
            bbox,
            lastSeenAt: now,
            counted: det.eligibleForCount,
            capStatus: det.capStatus,
          });

          if (det.eligibleForCount) {
            newlyCountedEligible += 1;
          } else if (det.capStatus === 'open' || det.capStatus === 'uncapped') {
            newlyCountedOpen += 1;
          }
        }

        pushHistory();
        if (isMultiFrameTrack) {
          setAiCount((c) => c + newlyCountedEligible);
          setOpenCount((c) => c + newlyCountedOpen);
        } else {
          // Single-frame snap sets/adds cleanly based on newly verified frame
          setAiCount((c) => c + res.matchedCount);
          setOpenCount((c) => c + res.openCount);
        }

        const ignoredInfo =
          res.ignoredBrands?.length > 0 ? ` · Ignored: ${res.ignoredBrands.join(', ')}` : '';
        setLastScanStatus(
          `Detected ${res.matchedCount} eligible ${selectedProduct.name} (${Math.round((res.overallConfidence || 0) * 100)}% conf)${ignoredInfo}`
        );
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'AI recognition failed. Use manual +/- fallback.');
        setLastScanStatus('AI unavailable — use manual correction or barcode mode');
      } finally {
        setScanningFrame(false);
      }
    },
    [selectedProduct, isOnline, bottleCapRule, pushHistory]
  );

  const captureAndScanCurrentFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    const maxW = 960;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (!autoTrack) {
      setCapturedPreview(dataUrl);
    }
    await processFrameWithAI(dataUrl, autoTrack);
  }, [autoTrack, processFrameWithAI]);

  // Continuous auto-track loop (every 3.5s while enabled)
  useEffect(() => {
    if (!autoTrack || !cameraActive || scanMode !== 'ai_vision') return;
    const timer = setInterval(() => {
      if (!scanningFrame) {
        captureAndScanCurrentFrame();
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [autoTrack, cameraActive, scanMode, scanningFrame, captureAndScanCurrentFrame]);

  const handleUploadShelfPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1024;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        setCapturedPreview(dataUrl);
        trackedRef.current = [];
        processFrameWithAI(dataUrl, false);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));
    setAiCount(last.ai);
    setOpenCount(last.open);
    setManualDelta(last.manual);
  };

  const totalCount = Math.max(0, aiCount + manualDelta);

  const handlePressDone = () => {
    stopCamera();
    setFinalEditedQty(totalCount);
    setShowConfirmModal(true);
  };

  const handleConfirmFinalCount = async () => {
    if (!selectedProduct || !selectedLocationId) return;
    setSavingFinal(true);

    if (onCountCompleted) {
      onCountCompleted(selectedProduct.id, finalEditedQty, openCount, uncertainCount);
      setSavingFinal(false);
      setShowConfirmModal(false);
      setSavedNotice(`Saved ${finalEditedQty} ${selectedProduct.unit} for ${selectedProduct.name}.`);
      resetSession();
      return;
    }

    // Create or update a StockTakingSession directly when launched standalone
    const now = new Date().toISOString();
    const currentBal = getProductStock(selectedProduct.id, selectedLocationId);
    const existingSession = activeSessionId
      ? workspace?.stockTakingSessions.find((s) => s.id === activeSessionId)
      : null;

    const item: StockTakingItem = {
      id: crypto.randomUUID(),
      productId: selectedProduct.id,
      locationId: selectedLocationId,
      method: scanMode === 'ai_vision' ? 'ai_camera' : 'barcode',
      previousStock: currentBal,
      receivedSinceLast: 0,
      issuedSinceLast: 0,
      damagedSinceLast: 0,
      expectedStock: currentBal,
      physicalCount: finalEditedQty,
      openBottlesCount: openCount,
      uncertainCount,
      variance: finalEditedQty - currentBal,
      confidenceAvg: lastAiResult?.overallConfidence,
      countedBy: user?.name || 'Staff',
      countedAt: now,
    };

    const sessionPayload: StockTakingSession = existingSession
      ? {
          ...existingSession,
          items: [...existingSession.items.filter((i) => i.productId !== selectedProduct.id), item],
        }
      : {
          id: crypto.randomUUID(),
          mutationId: crypto.randomUUID(),
          title: `AI Camera Count · ${new Date().toLocaleDateString()}`,
          locationId: selectedLocationId,
          categoryFilter: 'All',
          status: 'finalized',
          items: [item],
          startedBy: user?.name || 'Staff',
          finalizedBy: user?.name || 'Staff',
          createdAt: now,
          finalizedAt: now,
        };

    await dispatchMutation('SAVE_STOCK_TAKING_SESSION', { session: sessionPayload });
    setSavingFinal(false);
    setShowConfirmModal(false);
    setSavedNotice(`Saved verified count (${finalEditedQty} ${selectedProduct.unit}) for ${selectedProduct.name}. Select the next product below.`);
    resetSession();
  };

  if (!workspace) return null;

  const currentLocationStock = selectedProduct ? getProductStock(selectedProduct.id, selectedLocationId) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
            AI Product-Specific Camera Counter
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Select a target product first. The scanner counts only that exact product and ignores rival brands.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setScanMode('ai_vision')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              scanMode === 'ai_vision'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            AI Vision + Cap Check
          </button>
          <button
            type="button"
            onClick={() => setScanMode('barcode_qr')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              scanMode === 'barcode_qr'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Barcode / QR (Offline)
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>{savedNotice}</span>
          <button type="button" onClick={() => setSavedNotice(null)} className="font-medium underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Select Location & Exact Target Product */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            1. Storage Location
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => {
              setSelectedLocationId(e.target.value);
              resetSession();
            }}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            {workspace.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName} · {l.locationName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            2. Exact Product to Count
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              resetSession();
            }}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            {workspace.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.brand}) · {p.size || p.unit}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            3. Bottle-Cap / Seal Rule
          </label>
          <select
            value={bottleCapRule}
            onChange={(e) => setBottleCapRule(e.target.value as BottleCapRule)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
          >
            <option value="capped_only">Count capped bottles only (ignore uncapped)</option>
            <option value="sealed_only">Count sealed bottles only</option>
            <option value="count_open_separately">Count open bottles separately</option>
            <option value="count_all">Count all physically present</option>
          </select>
        </div>
      </div>

      {!selectedProduct ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
          Please register at least one product in the Products section before scanning.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Camera Viewport & Bounding Box Overlay */}
          <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
              <div className="flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-blue-400" />
                <span>{lastScanStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                {scanMode === 'ai_vision' && cameraActive && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoTrack}
                      onChange={(e) => setAutoTrack(e.target.checked)}
                      className="rounded border-slate-600 text-blue-600"
                    />
                    Auto-Track (No Dupes)
                  </label>
                )}
              </div>
            </div>

            {/* Live Video or Captured Frame + Bounding Box Overlay */}
            <div className="relative min-h-[340px] sm:min-h-[400px] bg-black flex items-center justify-center">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full max-h-[440px] object-contain"
                />
              ) : capturedPreview ? (
                <img
                  src={capturedPreview}
                  alt="Scanned shelf frame"
                  className="w-full h-full max-h-[440px] object-contain"
                />
              ) : (
                <div className="p-8 text-center space-y-4">
                  <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                  <div className="text-sm text-slate-300">
                    Point camera at <strong className="text-white">{selectedProduct.name}</strong> ({selectedProduct.brand})
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Other brands and unrelated bottles in the same frame will be automatically ignored.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-medium text-white cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Start Live Camera
                    </button>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-200 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      Upload Shelf Photo
                      <input type="file" accept="image/*" onChange={handleUploadShelfPhoto} className="hidden" />
                    </label>
                  </div>
                </div>
              )}

              {/* Bounding box overlay for AI detections */}
              {lastAiResult && lastAiResult.detections?.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {lastAiResult.detections.map((det: AIDetectionBox, idx: number) => {
                    if (!Array.isArray(det.bbox) || det.bbox.length !== 4) return null;
                    const [ymin, xmin, ymax, xmax] = det.bbox;
                    const top = `${(ymin / 1000) * 100}%`;
                    const left = `${(xmin / 1000) * 100}%`;
                    const height = `${Math.max(2, ((ymax - ymin) / 1000) * 100)}%`;
                    const width = `${Math.max(2, ((xmax - xmin) / 1000) * 100)}%`;
                    const isEligible = det.eligibleForCount;
                    const isUncertain = det.capStatus === 'uncertain';
                    return (
                      <div
                        key={det.id || idx}
                        style={{ top, left, width, height }}
                        className={`absolute rounded ${
                          isEligible
                            ? 'border-2 border-emerald-400 bg-emerald-400/10'
                            : isUncertain
                            ? 'border-2 border-dashed border-amber-400 bg-amber-400/10'
                            : 'border-2 border-slate-400 bg-slate-500/10'
                        }`}
                      >
                        <span
                          className={`absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-mono rounded whitespace-nowrap ${
                            isEligible
                              ? 'bg-emerald-600 text-white'
                              : isUncertain
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          #{idx + 1} {det.capStatus} ({Math.round((det.confidence || 0) * 100)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Camera Action Bar */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {cameraActive ? (
                  <>
                    {scanMode === 'ai_vision' && (
                      <button
                        type="button"
                        onClick={captureAndScanCurrentFrame}
                        disabled={scanningFrame}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white cursor-pointer"
                      >
                        {scanningFrame ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                        {scanningFrame ? 'Recognizing...' : 'Scan & Count Frame'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                    >
                      <VideoOff className="w-3.5 h-3.5" />
                      Stop Camera
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Open Camera
                  </button>
                )}

                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Test / Upload Photo
                  <input type="file" accept="image/*" onChange={handleUploadShelfPhoto} className="hidden" />
                </label>
              </div>

              {scanMode === 'barcode_qr' && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                  <Barcode className="w-4 h-4" />
                  Offline Barcode/QR Active
                </span>
              )}
            </div>
          </div>

          {/* Right: Counting Interface & Controls */}
          <div className="lg:col-span-5 space-y-4">
            {/* Selected Product Identity Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
              {selectedProduct.imageDataUrl ? (
                <img
                  src={selectedProduct.imageDataUrl}
                  alt={selectedProduct.name}
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Package className="w-7 h-7" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  Target Product Locked
                </div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white truncate">
                  {selectedProduct.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedProduct.brand} · {selectedProduct.size || selectedProduct.unit} · Recorded Balance:{' '}
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {currentLocationStock}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                  Profile: {selectedProduct.recognitionProfile?.status || 'untrained'} ({selectedProduct.recognitionProfile?.trainingPhotos?.length || 0} photos)
                </p>
              </div>
            </div>

            {cameraError && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            {barcodeFeedback && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-800 dark:text-blue-200">
                {barcodeFeedback}
              </div>
            )}

            {/* Main Counter Display */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Verified Count</span>
                  <div className="font-mono text-5xl font-semibold text-slate-900 dark:text-white tabular-nums mt-1">
                    {totalCount}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400 space-y-1 font-mono tabular-nums">
                  <div>AI Detected: {aiCount}</div>
                  <div>Manual Adj: {manualDelta >= 0 ? `+${manualDelta}` : manualDelta}</div>
                  {bottleCapRule === 'count_open_separately' && (
                    <div className="text-amber-600 dark:text-amber-400">Open Bottles: {openCount}</div>
                  )}
                </div>
              </div>

              {lastAiResult && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Detection Confidence</span>
                    <span className="font-mono font-semibold">{Math.round((lastAiResult.overallConfidence || 0) * 100)}%</span>
                  </div>
                  {lastAiResult.ignoredBrands?.length > 0 && (
                    <div className="text-slate-500 dark:text-slate-400">
                      Ignored rival items ({lastAiResult.ignoredCount}): {lastAiResult.ignoredBrands.join(', ')}
                    </div>
                  )}
                  {lastAiResult.needsManualVerification && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-200">
                      {lastAiResult.uncertainCount} item(s) had unclear cap or label visibility. Please verify manually using + / -.
                    </div>
                  )}
                </div>
              )}

              {/* Manual + / - Adjustments */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    pushHistory();
                    setManualDelta((d) => (totalCount > 0 ? d - 1 : d));
                  }}
                  className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-semibold text-slate-900 dark:text-white cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                  1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushHistory();
                    setManualDelta((d) => d + 1);
                  }}
                  className="h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-2 text-sm font-semibold text-slate-900 dark:text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  1
                </button>
              </div>

              {/* UNDO, RESET, DONE */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyStack.length === 0}
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  UNDO
                </button>
                <button
                  type="button"
                  onClick={resetSession}
                  className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  RESET
                </button>
                <button
                  type="button"
                  onClick={handlePressDone}
                  className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-1.5 text-xs font-semibold text-white cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  DONE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm & Save Count Modal */}
      {showConfirmModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Confirm Stock Count · {selectedProduct.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review or manually adjust the final verified count before saving to the stock-taking ledger.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Expected Balance</div>
                <div className="font-mono text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                  {currentLocationStock} {selectedProduct.unit}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Variance Preview</div>
                <div
                  className={`font-mono text-lg font-semibold mt-0.5 ${
                    finalEditedQty - currentLocationStock === 0
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {finalEditedQty - currentLocationStock >= 0
                    ? `+${finalEditedQty - currentLocationStock}`
                    : finalEditedQty - currentLocationStock}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Final Confirmed Physical Quantity ({selectedProduct.unit})
              </label>
              <input
                type="number"
                min={0}
                value={finalEditedQty}
                onChange={(e) => setFinalEditedQty(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-lg font-mono font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Back to Scan
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalCount}
                disabled={savingFinal}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white cursor-pointer"
              >
                {savingFinal ? 'Saving...' : 'Save & Select Next Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
