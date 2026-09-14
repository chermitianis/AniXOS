import { localDb, type SyncTableName, type SyncOperation } from "./localDb";

/**
 * إضافة عملية إلى طابور المزامنة المحلي، لتُرسَل لاحقاً عند عودة الاتصال.
 * يُستخدم هذا فقط عند اكتشاف أن الجهاز في وضع Offline؛ عندما يكون متصلاً،
 * تذهب الكتابة مباشرة إلى Supabase دون المرور بالطابور إطلاقاً.
 */
export async function enqueueSync(
  tableName: SyncTableName,
  operation: SyncOperation,
  payload: Record<string, unknown>
): Promise<void> {
  await localDb.syncQueue.add({
    table_name: tableName,
    operation,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
  });
}

export async function getPendingSyncCount(): Promise<number> {
  return localDb.syncQueue.count();
}
