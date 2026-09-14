-- ============================================================================
-- 0004_devices.sql
-- كل جهاز فعلي (حاسوب/تابلت) يُسجَّل مرة واحدة ويُحدَّد دوره الدائم:
--   - 'kiosk' → محطة عامل ثابتة، تفتح مباشرة على تسجيل دخول العامل
--   - 'admin' → جهاز إداري عادي، يفتح على تسجيل دخول موظف
--
-- لكل جهاز Kiosk حساب Supabase Auth مخصص (auth_user_id) يُنشأ آلياً عند
-- التسجيل، ويبقى مسجّل الدخول بشكل دائم على ذلك الجهاز فقط. هذا الحساب هو
-- ما يمنح الجهاز صلاحية القراءة/الكتابة عبر RLS، بينما "جلسة العامل" التي
-- تُبنى فوقه لاحقاً (عبر اسم مستخدم/كلمة سر) هي جلسة منطقية داخل التطبيق
-- فقط ولا علاقة لها بـ Supabase Auth إطلاقاً.
-- ============================================================================

create table if not exists devices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,

  -- حساب Auth مخصص للجهاز (يُستخدم فقط إذا كان device_mode = 'kiosk')
  auth_user_id    uuid references auth.users(id) on delete set null,

  device_name     text not null,               -- اسم وصفي: "كشك آلة CNC-01"
  device_mode     text not null check (device_mode in ('admin', 'kiosk')),

  -- الآلة المرتبطة افتراضياً بهذا الكشك (اختياري، يسهّل تعبئة السياق تلقائياً)
  default_machine_id uuid,  -- FK تُضاف لاحقاً بعد إنشاء جدول machines

  is_active       boolean not null default true,
  last_seen_at    timestamptz,
  registered_at   timestamptz not null default now()
);

comment on table devices is 'سجل الأجهزة الفعلية ودورها الدائم (Kiosk أو إداري) لكل شركة';

create index if not exists idx_devices_company on devices (company_id);
create index if not exists idx_devices_auth_user on devices (auth_user_id);
