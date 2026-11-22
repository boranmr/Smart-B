import React, { useRef, useState } from 'react';
import { Camera, Check, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { buildProductProfileAI } from '../lib/syncClient';
import type { BottleCapRule, Product, ProductRecognitionProfile } from '../types/inventory';

type AngleType = 'front' | 'back' | 'side' | 'packaging' | 'cap';

export const ProductTrainingModal: React.FC<{
  product: Product;
  onClose: () => void;
}> = ({ product, onClose }) => {
  const { dispatchMutation, isOnline } = useInventory();
  const [photos, setPhotos] = useState(product.recognitionProfile?.trainingPhotos || []);
  const [bottleCapRule, setBottleCapRule] = useState<BottleCapRule>(
    product.recognitionProfile?.bottleCapRule || 'capped_only'
  );
  const [activeAngle, setActiveAngle] = useState<AngleType>('front');
  const [cameraActive, setCameraActive] = useState(false);
  const [training, setTraining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profileMeta, setProfileMeta] = useState({
    visualSignatureSummary: product.recognitionProfile?.visualSignatureSummary || '',
    distinctiveFeatures: product.recognitionProfile?.distinctiveFeatures || [],
    labelKeywords: product.recognitionProfile?.labelKeywords || [product.brand, product.name].filter(Boolean),
    dominantColors: product.recognitionProfile?.dominantColors || [],
    packagingType: product.recognitionProfile?.packagingType || '',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setErrorMsg('Camera permission unavailable. You can upload product photographs directly below.');
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const maxW = 720;
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    canvas.width = Math.round((video.videoWidth || 640) * scale);
    canvas.height = Math.round((video.videoHeight || 480) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setPhotos((prev) => [
      ...prev.filter((p) => p.angle !== activeAngle),
      { id: crypto.randomUUID(), angle: activeAngle, dataUrl, capturedAt: new Date().toISOString() },
    ]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      // Resize to keep sync payload compact
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 720;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setPhotos((prev) => [
          ...prev.filter((p) => p.angle !== activeAngle),
          { id: crypto.randomUUID(), angle: activeAngle, dataUrl: compressed, capturedAt: new Date().toISOString() },
        ]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleExtractFeatures = async () => {
    if (photos.length === 0) {
      setErrorMsg('Capture or upload at least one photograph first.');
      return;
    }
    if (!isOnline) {
      setErrorMsg('AI feature extraction requires an internet connection. Photos are saved locally and can be trained once online.');
      return;
    }
    setTraining(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const result = await buildProductProfileAI({
        productName: product.name,
        brand: product.brand,
        size: product.size,
        images: photos.map((p) => ({ angle: p.angle, dataUrl: p.dataUrl })),
      });
      setProfileMeta(result);
      setStatusMsg('Visual recognition signature extracted. Review and save profile below.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to analyze training photos.');
    } finally {
      setTraining(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setErrorMsg(null);
    const readiness: ProductRecognitionProfile['status'] =
      photos.length >= 3 && profileMeta.visualSignatureSummary
        ? 'verified'
        : photos.length >= 1
        ? 'basic'
        : 'untrained';

    const updatedProfile: ProductRecognitionProfile = {
      status: readiness,
      trainingPhotos: photos,
      visualSignatureSummary: profileMeta.visualSignatureSummary,
      distinctiveFeatures: profileMeta.distinctiveFeatures,
      labelKeywords: profileMeta.labelKeywords,
      dominantColors: profileMeta.dominantColors,
      packagingType: profileMeta.packagingType,
      bottleCapRule,
      lastTrainedAt: new Date().toISOString(),
    };

    const res = await dispatchMutation('UPDATE_RECOGNITION_PROFILE', {
      productId: product.id,
      recognitionProfile: updatedProfile,
    });
    setSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Failed to save recognition profile.');
      return;
    }
    stopCamera();
    onClose();
  };

  const angles: { key: AngleType; label: string }[] = [
    { key: 'front', label: 'Front Label' },
    { key: 'back', label: 'Back Label' },
    { key: 'side', label: 'Side Profile' },
    { key: 'packaging', label: 'Outer Packaging' },
    { key: 'cap', label: 'Cap / Seal Top' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              AI Recognition Training · {product.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {product.brand} · {product.size} · Capture front, back, sides, and cap for reliable SKU isolation
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 text-xs text-slate-600 dark:text-slate-300">
            <strong>Recognition Validation Notice:</strong> Newly registered products require multi-angle training photos (minimum 3 angles recommended) and verification before achieving high-confidence brand isolation against visually similar products.
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              {statusMsg}
            </div>
          )}

          {/* Angle selector */}
          <div className="flex flex-wrap gap-1.5">
            {angles.map((a) => {
              const hasPhoto = photos.some((p) => p.angle === a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setActiveAngle(a.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    activeAngle === a.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : hasPhoto
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {hasPhoto ? '✓ ' : ''}
                  {a.label}
                </button>
              );
            })}
          </div>

          {/* Camera / Upload area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
              {cameraActive ? (
                <div className="space-y-3">
                  <video ref={videoRef} playsInline muted className="w-full h-48 object-cover rounded-lg bg-black" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={captureFromCamera}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Capture {activeAngle}
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Capture or upload photo for <strong className="text-slate-800 dark:text-slate-200">{activeAngle}</strong>
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 px-3.5 py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Open Camera
                    </button>
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Photo
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Captured training thumbnails */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Captured Angles ({photos.length}/5)
                </span>
                <button
                  type="button"
                  onClick={handleExtractFeatures}
                  disabled={training || photos.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                >
                  {training ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {training ? 'Training...' : 'Build AI Profile'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                    <img src={p.dataUrl} alt={p.angle} className="w-full h-20 object-cover" />
                    <div className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-900/80 text-white capitalize">
                      {p.angle}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                      className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-xs text-slate-400">
                    No training photos captured yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recognition rules & extracted profile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Product Bottle-Cap / Seal Counting Rule
              </label>
              <select
                value={bottleCapRule}
                onChange={(e) => setBottleCapRule(e.target.value as BottleCapRule)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              >
                <option value="capped_only">Count capped bottles only</option>
                <option value="sealed_only">Count sealed bottles only</option>
                <option value="count_open_separately">Count open bottles separately</option>
                <option value="count_all">Count all physically present</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Packaging Type
              </label>
              <input
                type="text"
                value={profileMeta.packagingType}
                onChange={(e) => setProfileMeta((m) => ({ ...m, packagingType: e.target.value }))}
                placeholder="e.g. 500ml Green PET Bottle with Red Cap"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Visual Recognition Signature &amp; Label OCR Keywords
            </label>
            <textarea
              rows={2}
              value={profileMeta.visualSignatureSummary}
              onChange={(e) => setProfileMeta((m) => ({ ...m, visualSignatureSummary: e.target.value }))}
              placeholder="Visual signature summary (populated automatically by Build AI Profile or entered manually)..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={profileMeta.labelKeywords.join(', ')}
              onChange={(e) =>
                setProfileMeta((m) => ({
                  ...m,
                  labelKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                }))
              }
              placeholder="Keywords: Brand, Size, Bottle mark"
              className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving Profile...' : 'Save Recognition Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};
