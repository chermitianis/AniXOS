// ============================================================================
// مراقبة حالة الاتصال الحقيقية بخادم Supabase.
//
// - navigator.onLine وحده غير موثوق (يظل true عند الاتصال بالراوتر بدون
//   إنترنت). كما أن Service Worker قد يخزّن استجابات API ويعطي انطباعاً
//   خاطئاً بالاتصال.
//
// - الحل: fetch مباشر مع:
//     * cache: "no-store"           → تجاهل HTTP cache
//     * param _t=Date.now()          → URL فريد كل مرة → SW لا يستطيع الرد من cache
//     * AbortController + timeout 3s → حد أقصى 3 ثوان
//
// - فحص دوري كل 5 ثوان + فحص فوري عند:
//     * تغيير حالة الشبكة (online/offline)
//     * العودة للتبويب (visibilitychange)
//     * استعادة التركيز (focus)
//     * فشل أي fetch آخر في التطبيق (hook global)
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type ConnectivityListener = (isOnline: boolean) => void;

class ConnectivityMonitor {
  private isOnline: boolean = navigator.onLine;
  private listeners = new Set<ConnectivityListener>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isChecking = false;

  constructor() {
    window.addEventListener("online", () => void this.checkAndNotify());
    window.addEventListener("offline", () => this.setStatus(false));

    // فحص فوري عند العودة للتبويب أو استعادة التركيز
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void this.checkAndNotify();
      }
    });
    window.addEventListener("focus", () => void this.checkAndNotify());

    this.startHeartbeat();
    void this.checkAndNotify();
  }

  private startHeartbeat() {
    // كل 5 ثوان (بدل 20) لتقليل زمن الكشف
    this.heartbeatInterval = setInterval(() => void this.checkAndNotify(), 5_000);
  }

  /** إيقاف الفحص الدوري (مفيد عند تفكيك التطبيق أو في بيئة الاختبار) */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async checkAndNotify() {
    if (this.isChecking) return;
    this.isChecking = true;

    // فحص سريع: navigator.onLine = false → offline قطعي
    if (!navigator.onLine) {
      this.isChecking = false;
      this.setStatus(false);
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      this.isChecking = false;
      this.setStatus(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3_000);

      // URL normal + headers anti-cache → PostgREST accepte, SW ne peut pas servir du cache
      const url = `${SUPABASE_URL}/rest/v1/companies?select=id&limit=1`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.setStatus(res.ok);
    } catch {
      this.setStatus(false);
    } finally {
      this.isChecking = false;
    }
  }

  private setStatus(status: boolean) {
    if (status !== this.isOnline) {
      this.isOnline = status;
      this.listeners.forEach((listener) => listener(status));
    }
  }

  getStatus(): boolean {
    return this.isOnline;
  }

  subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** فحص فوري يدوي، مفيد عند النقر على مؤشر الحالة في الواجهة */
  async forceCheck(): Promise<boolean> {
    await this.checkAndNotify();
    return this.isOnline;
  }
}

export const connectivityMonitor = new ConnectivityMonitor();

// ----------------------------------------------------------------------------
// Hook global sur fetch : détecte immédiatement les échecs réseau
// (Supabase JS, Edge Functions, etc.) et déclenche un forceCheck.
// ----------------------------------------------------------------------------
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  try {
    const res = await originalFetch(...args);
    // Une réponse 5xx signale souvent un backend inaccessible
    if (res.status >= 500) {
      void connectivityMonitor.forceCheck();
    }
    return res;
  } catch (err) {
    // Échec réseau immédiat (DNS, CORS, timeout, offline…)
    void connectivityMonitor.forceCheck();
    throw err;
  }
};