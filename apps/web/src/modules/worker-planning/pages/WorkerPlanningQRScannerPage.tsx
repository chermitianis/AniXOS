import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import jsQR from "jsqr";
import { AlertCircle, Loader2, QrCode, X } from "lucide-react";
import { usePlanningSession } from "../context/PlanningSessionContext";

interface Props {
  onCancel?: () => void;
}

/** Scanner QR 100% côté client (caméra + jsQR décodé sur canvas) — aucune
 * librairie externe chargée à l'exécution, aucune donnée image envoyée où
 * que ce soit. Seul le texte décodé (le token) part vers l'Edge Function. */
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

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const handleDecoded = useCallback(
    async (raw: string) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      stopCamera();
      setResultError(null);

      const result = await loginWithToken(raw);
      if (!result.ok) {
        setResultError(
          result.error === "subscription_required"
            ? t("workerPlanning.subscriptionRequired")
            : result.error === "network_error"
              ? t("workerPlanning.networkError")
              : t("workerPlanning.invalidQr")
        );
        scanLockRef.current = false;
        void startCamera();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loginWithToken, stopCamera, t]
  );

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
          void handleDecoded(code.data);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, t]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-bold">
          <QrCode size={20} />
          {t("workerPlanning.scanTitle")}
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg p-2 hover:bg-white/10" aria-label={t("common.close")}>
            <X size={20} />
          </button>
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-4 border-white/70" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
        </div>
      </div>

      <div className="space-y-2 px-4 pb-8 pt-3 text-center">
        {isVerifying && (
          <p className="flex items-center justify-center gap-2 text-sm text-indigo-300">
            <Loader2 size={16} className="animate-spin" /> {t("workerPlanning.verifying")}
          </p>
        )}
        {cameraError && (
          <p className="flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertCircle size={16} /> {cameraError}
          </p>
        )}
        {resultError && !isVerifying && (
          <p className="flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertCircle size={16} /> {resultError}
          </p>
        )}
        {!cameraError && !resultError && !isVerifying && (
          <p className="text-sm text-slate-300">{t("workerPlanning.scanHint")}</p>
        )}
      </div>
    </div>
  );
}
