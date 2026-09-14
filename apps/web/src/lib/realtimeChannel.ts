import { supabase } from "./supabaseClient";

/**
 * ينشئ قناة Realtime بأمان: يبحث أولاً عن أي قناة سابقة بنفس الاسم (topic)
 * ويزيلها قبل إنشاء قناة جديدة.
 *
 * لماذا هذا ضروري: React StrictMode (مفعّل في main.tsx) يُشغّل كل useEffect
 * مرتين عند التركيب في وضع التطوير (mount → cleanup → mount مجدداً). إن لم
 * تكتمل إزالة القناة الأولى (مثلاً إن كانت العملية غير متزامنة أو حدث خلل
 * توقيت) قبل محاولة إنشاء الثانية بنفس الاسم، يرمي supabase-js الخطأ:
 * "cannot add `postgres_changes` callbacks for realtime:<topic> after
 * `subscribe()`". هذا المساعد يضمن عدم وجود أي قناة قديمة بنفس الاسم مطلقاً
 * قبل إنشاء الجديدة، بغض النظر عن حالة الإزالة السابقة.
 */
export function createSafeChannel(topic: string) {
  const stale = supabase.getChannels().filter((c) => c.topic === topic || c.topic === `realtime:${topic}`);
  for (const channel of stale) {
    void supabase.removeChannel(channel);
  }
  return supabase.channel(topic);
}
