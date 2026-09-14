// ============================================================================
// مراقبة حالة الاتصال بالإنترنت.
// navigator.onLine وحده غير موثوق بالكامل (قد يكون true رغم عدم وجود اتصال
// فعلي بالخادم، مثلاً عند الاتصال بشبكة محلية بلا إنترنت خارجي)، لذلك نضيف
// فحصاً دورياً خفيفاً (Heartbeat) عبر استعلام بسيط لـ Supabase.
// ============================================================================

import { supabase } from "./supabaseClient";

type ConnectivityListener = (isOnline: boolean) => void;

class ConnectivityMonitor {
  private isOnline: boolean = navigator.onLine;
  private listeners = new Set<ConnectivityListener>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    window.addEventListener("online", () => this.checkAndNotify());
    window.addEventListener("offline", () => this.setStatus(false));
    this.startHeartbeat();
  }

  private startHeartbeat() {
    // كل 20 ثانية نتحقق فعلياً من الوصول للخادم، وليس فقط من حالة الشبكة المحلية
    this.heartbeatInterval = setInterval(() => this.checkAndNotify(), 20_000);
  }

  /** إيقاف الفحص الدوري (مفيد عند تفكيك التطبيق أو في بيئة الاختبار) */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async checkAndNotify() {
    if (!navigator.onLine) {
      this.setStatus(false);
      return;
    }
    try {
      // استعلام خفيف جداً (لا يقرأ بيانات فعلية) فقط للتأكد من نجاح الاتصال
      const { error } = await supabase.from("companies").select("id").limit(1);
      this.setStatus(!error);
    } catch {
      this.setStatus(false);
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
    return () => this.listeners.delete(listener);
  }

  /** فحص فوري يدوي، مفيد عند محاولة المزامنة يدوياً من الواجهة */
  async forceCheck(): Promise<boolean> {
    await this.checkAndNotify();
    return this.isOnline;
  }
}

export const connectivityMonitor = new ConnectivityMonitor();
