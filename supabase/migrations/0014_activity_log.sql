-- ============================================================================
-- 0014_activity_log.sql
-- سجل كل حدث بشكل مستقل عن work_sessions (لأغراض العرض السريع/البث الحي)
-- تبويب "Journal des événements" في الكشك يقرأ من هنا مباشرة، وكذلك
-- "المشاهدة الحية" في لوحة المدير عبر Supabase Realtime.
-- ============================================================================

create table if not exists activity_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  worker_id       uuid references workers(id) on delete set null,
  work_session_id uuid references work_sessions(id) on delete set null,
  machine_id      uuid references machines(id) on delete set null,

  event_type      text not null,      -- 'session_start' | 'session_end' | 'login' | 'logout' | ...
  event_label     text not null,      -- النص المعروض مباشرة في سجل الأحداث (اسم البطاقة المضغوطة)

  metadata        jsonb not null default '{}'::jsonb,

  event_time      timestamptz not null default now()
);

comment on table activity_log is 'سجل أحداث تشغيلي خفيف الوزن للبث الحي في الكشك ولوحة المدير';

create index if not exists idx_activity_log_company_time on activity_log (company_id, event_time desc);
create index if not exists idx_activity_log_worker on activity_log (worker_id, event_time desc);

-- تفعيل Realtime على هذا الجدول لبث الأحداث لحظياً للوحة المدير
-- (محاط بحماية: بعض بيئات الاختبار المحلية قد لا تملك publication باسم
--  supabase_realtime بعد، فلا نريد فشل الـ migration بالكامل بسبب هذا)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table activity_log;
  end if;
end $$;
