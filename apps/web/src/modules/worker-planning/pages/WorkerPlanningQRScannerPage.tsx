import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
const jsQR = (await import("jsqr")).default;
import { AlertCircle, Loader2, QrCode, X, Delete, ArrowLeft } from "lucide-react";
import { usePlanningSession } from "../context/PlanningSessionContext";

interface Props {
  onCancel?: () => void;
}

/** Scanner QR (caméra + jsQR) suivi d'un écran de saisie PIN à 4 chiffres.
 *  Le PIN est propre à l'opérateur et complète le token du QR (2FA léger).
 *  3 tentatives max, puis verrouillage local de 30 secondes. */
export function WorkerPlanningQRScannerPage({ onCancel }: Props) {
  const { t } = useTranslation();
  const { loginWithToken, isVerifying } = usePlanningSession();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanLockRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const handleDecoded = useCallback((raw: string) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    stopCamera();
    setResultError(null);
    setScannedToken(raw);
    setPin("");
  }, [stopCamera]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          handleDecoded(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [handleDecoded]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError(t("workerPlanning.cameraError"));
    }
  }, [tick, t]);

  useEffect(() => {
    if (!scannedToken) {
      void startCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedToken]);

  // Déverrouillage automatique après expiration
  useEffect(() => {
    if (!lockedUntil) return;
    const delay = lockedUntil - Date.now();
    if (delay <= 0) {
      setLockedUntil(null);
      setAttempts(0);
      return;
    }
    const timer = setTimeout(() => {
      setLockedUntil(null);
      setAttempts(0);
    }, delay);
    return () => clearTimeout(timer);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  async function submitPin() {
    if (!scannedToken || pin.length !== 4 || isLocked || isVerifying) return;
    setResultError(null);

    const result = await loginWithToken(scannedToken, pin);

    if (!result.ok) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPin("");

      if (nextAttempts >= 3) {
        setLockedUntil(Date.now() + 30_000);
        setResultError(t("workerPlanning.pinTooManyAttempts"));
        return;
      }

      setResultError(
        result.error === "pin_not_set"
          ? t("workerPlanning.pinNotSet")
          : result.error === "subscription_required"
            ? t("workerPlanning.subscriptionRequired")
            : result.error === "network_error"
              ? t("workerPlanning.networkError")
              : t("workerPlanning.pinInvalid")
      );
    }
    // Si OK, le PlanningSessionContext remplace le rendu (session non nulle).
  }

  function handleDigit(d: string) {
    if (isLocked || isVerifying) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      // soumettre automatiquement après le 4ème chiffre
      setTimeout(() => void submitPin(), 80);
    }
  }

  function handleBackspace() {
    if (isLocked || isVerifying) return;
    setPin((p) => p.slice(0, -1));
  }

  function backToScanner() {
    setScannedToken(null);
    setPin("");
    setResultError(null);
    scanLockRef.current = false;
  }

  // ============================================================
  // Rendu : Phase 2 — Saisie du PIN
  // ============================================================
  if (scannedToken) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={backToScanner}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            <ArrowLeft size={18} />
            {t("workerPlanning.backToScan")}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label={t("common.close")}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8">
          <div className="text-center">
            <div className="mb-2 flex justify-center">
              <div className="rounded-2xl bg-indigo-600/20 p-4">
                <QrCode size={32} className="text-indigo-400" />
              </div>
            </div>
            <h1 className="mb-1 text-xl font-bold">{t("workerPlanning.pinTitle")}</h1>
            <p className="text-sm text-slate-400">{t("workerPlanning.pinSubtitle")}</p>
          </div>

          {/* Affichage des 4 points */}
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-14 w-12 rounded-xl border-2 transition-all ${
                  pin.length > i
                    ? "border-indigo-500 bg-indigo-500/20"
                    : "border-slate-700 bg-slate-900"
                } flex items-center justify-center text-2xl font-black`}
              >
                {pin.length > i ? "●" : ""}
              </div>
            ))}
          </div>

          {/* Erreur */}
          {resultError && (
            <div className="flex max-w-xs items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle size={16} className="shrink-0" />
              {resultError}
            </div>
          )}

          {/* Verrouillage */}
          {isLocked && (
            <div className="text-sm font-semibold text-amber-400">
              {t("workerPlanning.pinLocked", { seconds: 30 })}
            </div>
          )}

          {/* Chargement */}
          {isVerifying && (
            <div className="flex items-center gap-2 text-sm text-indigo-300">
              <Loader2 size={16} className="animate-spin" />
              {t("workerPlanning.verifying")}
            </div>
          )}

          {/* Pavé numérique */}
          <div className="grid w-full max-w-xs grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                disabled={isLocked || isVerifying}
                className="h-16 rounded-2xl bg-slate-800 text-2xl font-black text-white transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin("")}
              disabled={isLocked || isVerifying || pin.length === 0}
              className="col-span-1 h-16 rounded-2xl bg-slate-800 text-sm font-bold text-slate-300 transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              {t("workerPlanning.pinClear")}
            </button>
            <button
              type="button"
              onClick={() => handleDigit("0")}
              disabled={isLocked || isVerifying}
              className="h-16 rounded-2xl bg-slate-800 text-2xl font-black text-white transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={isLocked || isVerifying || pin.length === 0}
              className="flex h-16 items-center justify-center rounded-2xl bg-slate-800 text-white transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              <Delete size={22} />
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            {t("workerPlanning.pinHint")}
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Rendu : Phase 1 — Scan QR
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-bold">
          <QrCode size={20} />
          {t("workerPlanning.scanTitle")}
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label={t("common.close")}
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="h-56 w-56 rounded-2xl border-4 border-white/70"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
          />
        </div>
      </div>

      <div className="space-y-2 px-4 pb-8 pt-3 text-center">
        {cameraError && (
          <p className="flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertCircle size={16} /> {cameraError}
          </p>
        )}
        {!cameraError && (
          <p className="text-sm text-slate-300">{t("workerPlanning.scanHint")}</p>
        )}
      </div>
    </div>
  );
}