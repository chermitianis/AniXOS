// ============================================================================
// محرك المزامنة: يُفرغ طابور العمليات المحلية إلى Supabase عند عودة الاتصال.
//
// ملاحظات مهمة:
// 1) upsert(id) يجعل الإرسال Idempotent لمعظم الجداول.
// 2) بعض الجداول فيها قيود UNIQUE على أعمدة غير id (مثل idx_shift_piece_work_one_open
//    على (shift_id, piece_task_id) WHERE ended_at IS NULL). في هذه الحالة يجب
//    "حل" التعارض محلياً بدل إسقاط العنصر أو إعادة المحاولة بلا نهاية:
//      - لـ shift_piece_work: نُغلق أي سجل قديم مفتوح ثم نُدرج الجديد.
//      - لـ piece_handoffs: لا يوجد قيد UNIQUE غير id، فالمشكلة غالباً سجل
//        موجود بنفس id (نادر) — upsert يحلها.
// 3) أي خطأ 23505/409 غير قابل للحل بسهولة يُعلَّم كـ "blocked" بعد MAX_ATTEMPTS
//    محاولات، ويبقى في الطابور مع last_error واضح للمراجعة اليدوية، بدل
//    إسقاطه صامتاً أو محاولته 181 مرة.
// ============================================================================

import { supabase } from "./supabaseClient";
import { localDb, type SyncQueueItem } from "./localDb";
import { connectivityMonitor } from "./connectivity";

const MAX_ATTEMPTS_BEFORE_BLOCK = 5;
let isSyncing = false;

interface SyncAttemptResult {
  success: boolean;
  /** true إذا كان الفشل بسبب انتهاك قيد تفرّد (23505/409) */
  isUniqueConflict: boolean;
  /** true إذا كان الفشل مؤقتاً (شبكة/5xx) ويستحق إعادة محاولة */
  isRetryable: boolean;
  errorMessage?: string;
}

/**
 * معالجة خاصة لجدول shift_piece_work قبل upsert:
 * إذا كان السجل الجديد "مفتوحاً" (ended_at == null)، نُغلق أي سجل مفتوح سابق
 * لنفس (shift_id, piece_task_id) على السيرفر، ثم نُدرج الجديد.
 *
 * هذا يُنفَّذ لأن الفهرس idx_shift_piece_work_one_open يمنع وجود سجلين مفتوحين
 * لنفس الزوج، بينما الواجهة قد تُنشئ سجلاً جديداً كل مرة يختار العامل قطعة.
 */
async function closeOpenShiftPieceWorkConflicts(payload: Record<string, unknown>): Promise<void> {
  if (payload.ended_at) return; // السجل نفسه مغلق، لا تعارض
  const { shift_id, piece_task_id } = payload as { shift_id?: string; piece_task_id?: string };
  if (!shift_id || !piece_task_id) return;

  const nowIso = new Date().toISOString();
  // نُغلق أي سجل مفتوح قديم لنفس الزوج (إن وُجد)
  await supabase
    .from("shift_piece_work")
    .update({ ended_at: nowIso })
    .eq("shift_id", shift_id)
    .eq("piece_task_id", piece_task_id)
    .is("ended_at", null);
}

async function syncOneItem(item: SyncQueueItem): Promise<SyncAttemptResult> {
  const { table_name, payload, operation } = item;

  if (operation === "delete") {
    const { error } = await supabase.from(table_name).delete().eq("id", String(payload.id));
    if (!error) return { success: true, isUniqueConflict: false, isRetryable: false };
    return classifyError(error);
  }

  // معالجة خاصة لـ shift_piece_work قبل upsert
  if (table_name === "shift_piece_work" && operation === "insert") {
    try {
      await closeOpenShiftPieceWorkConflicts(payload);
    } catch {
      // إذا فشل الإغلاق، نكمل — ربما لا يوجد تعارض أصلاً
    }
  }

  const { error } = await supabase.from(table_name).upsert(payload as never);

  if (!error) return { success: true, isUniqueConflict: false, isRetryable: false };
  return classifyError(error);
}

/**
 * تصنيف الخطأ:
 * - 23505 (unique_violation) → تعارض تفرّد
 * - 409 (Conflict) → تعارض تفرّد (HTTP mapping)
 * - 4xx أخرى → غير قابل لإعادة المحاولة (خطأ دائم)
 * - 5xx أو network error → قابل لإعادة المحاولة
 */
function classifyError(error: unknown): SyncAttemptResult {
  const err = error as { code?: string; status?: number; message?: string };

  // 23505 = unique_violation في Postgres
  if (err.code === "23505") {
    return { success: false, isUniqueConflict: true, isRetryable: false, errorMessage: err.message };
  }

  // 409 Conflict = PostgREST يُرجع هذا عندما لا يُمرِّر كود Postgres
  if (err.status === 409) {
    return { success: false, isUniqueConflict: true, isRetryable: false, errorMessage: err.message };
  }

  // 4xx أخرى (400, 401, 403, 404, 422) = خطأ دائم
  if (err.status && err.status >= 400 && err.status < 500) {
    return { success: false, isUniqueConflict: false, isRetryable: false, errorMessage: err.message };
  }

  // 5xx أو خطأ شبكة = قابل لإعادة المحاولة
  return { success: false, isUniqueConflict: false, isRetryable: true, errorMessage: err.message };
}

/**
 * يُفرغ طابور المزامنة بالكامل، عنصراً بعد عنصر، بالترتيب الزمني.
 * لا يُوقِف العملية عند فشل عنصر واحد — يسجّل الفشل ويكمل البقية.
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number; blocked: number }> {
  if (isSyncing) return { synced: 0, failed: 0, blocked: 0 };
  if (!connectivityMonitor.getStatus()) return { synced: 0, failed: 0, blocked: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;
  let blocked = 0;

  try {
    const items = await localDb.syncQueue.orderBy("created_at").toArray();

    for (const item of items) {
      const result = await syncOneItem(item);

      if (result.success) {
        if (item.queue_id !== undefined) {
          await localDb.syncQueue.delete(item.queue_id);
        }
        synced++;
        continue;
      }

      // فشل دائم (تعارض تفرّد أو 4xx) — لا إعادة محاولة
      if (!result.isRetryable) {
        if (item.queue_id !== undefined) {
          const newAttempts = item.attempts + 1;
          if (newAttempts >= MAX_ATTEMPTS_BEFORE_BLOCK) {
            // بعد 5 محاولات، نُعلّمه كـ blocked ونُبقيه في الطابور للمراجعة
            await localDb.syncQueue.update(item.queue_id, {
              attempts: newAttempts,
              last_error: `[BLOCKED] ${result.errorMessage ?? "تعارض دائم"}`,
            });
            blocked++;
            console.error(
              `🚫 عنصر عالق نهائياً (${item.table_name}): ${result.errorMessage ?? "تعارض"} — يحتاج مراجعة يدوية.`
            );
          } else {
            // فرصة أخيرة: قد يكون تعارضاً مؤقتاً (سجل مفتوح أُغلق للتو)
            await localDb.syncQueue.update(item.queue_id, {
              attempts: newAttempts,
              last_error: result.errorMessage ?? "تعارض دائم",
            });
            failed++;
          }
        }
        continue;
      }

      // خطأ مؤقت (شبكة/5xx) — إعادة محاولة
      failed++;
      if (item.queue_id !== undefined) {
        await localDb.syncQueue.update(item.queue_id, {
          attempts: item.attempts + 1,
          last_error: result.errorMessage ?? "فشل مؤقت، سيُعاد المحاولة",
        });
      }
    }
  } finally {
    isSyncing = false;
  }

  return { synced, failed, blocked };
}

/** يجب استدعاؤها مرة واحدة عند إقلاع التطبيق لتفعيل المزامنة التلقائية */
export function startAutoSync(): () => void {
  const unsubscribe = connectivityMonitor.subscribe((isOnline) => {
    if (isOnline) void processSyncQueue();
  });

  // محاولة دورية إضافية كل 60 ثانية
  const interval = setInterval(() => {
    if (connectivityMonitor.getStatus()) void processSyncQueue();
  }, 60_000);

  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}

/**
 * دالة مساعدة للمراجعة اليدوية: تُرجع كل العناصر العالقة (blocked) في الطابور.
 */
export async function getBlockedSyncItems(): Promise<SyncQueueItem[]> {
  const all = await localDb.syncQueue.toArray();
  return all.filter((it) => it.last_error?.startsWith("[BLOCKED]"));
}

/**
 * دالة مساعدة لحذف عنصر عالق نهائياً (بعد تأكيد المستخدم).
 */
export async function deleteBlockedSyncItem(queueId: number): Promise<void> {
  await localDb.syncQueue.delete(queueId);
}