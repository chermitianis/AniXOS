// ============================================================================
// paddleConfig.ts — إدارة إعدادات Paddle
//
// يقرأ متغيرات البيئة (VITE_PADDLE_*) ويتحقق من جاهزيتها.
// إن لم تُضبط، يُظهر الواجهة "Paddle غير مُهيَّأ" بدل الخطأ.
// ============================================================================

export interface PaddleConfig {
    vendorId: string;
    environment: "sandbox" | "production";
    isConfigured: boolean;
  }
  
  /**
   * يقرأ متغيرات البيئة من Vite.
   * - VITE_PADDLE_VENDOR_ID: معرف الحساب في Paddle.
   * - VITE_PADDLE_ENV: 'sandbox' | 'production'.
   *
   * إن كانت فارغة → isConfigured = false.
   */
  export function getPaddleConfig(): PaddleConfig {
    const vendorId = (import.meta.env.VITE_PADDLE_VENDOR_ID as string | undefined)?.trim() ?? "";
    const environment = ((import.meta.env.VITE_PADDLE_ENV as string | undefined)?.trim() ??
      "sandbox") as "sandbox" | "production";
  
    return {
      vendorId,
      environment,
      isConfigured: vendorId.length > 0,
    };
  }
  
  /**
   * يُرجع رابط Paddle Sandbox أو Production حسب الإعداد.
   * مفيد للتحقق من صحة الاتصال.
   */
  export function getPaddleApiBase(config: PaddleConfig): string {
    return config.environment === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  }