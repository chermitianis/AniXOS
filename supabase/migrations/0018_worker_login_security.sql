-- ============================================================================
-- 0018_worker_login_security.sql
-- حماية دخول العامل من هجمات التخمين (Brute Force): قفل مؤقت بعد 5 محاولات
-- فاشلة متتالية. هذه الأعمدة تُدار حصرياً من داخل Edge Function (worker-login)
-- بصلاحية service_role، ولا تُعدَّل مطلقاً من الواجهة الأمامية مباشرة.
-- ============================================================================

alter table workers
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

comment on column workers.failed_login_attempts is 'عداد المحاولات الفاشلة المتتالية؛ يُصفَّر عند نجاح الدخول';
comment on column workers.locked_until is 'إذا كانت في المستقبل، الحساب مقفول مؤقتاً عن الدخول';
