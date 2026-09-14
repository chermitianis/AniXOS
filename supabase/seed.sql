-- ============================================================================
-- seed.sql — بيانات اختبار حقيقية (وليست وهمية) لبيئة التطوير المحلية فقط
-- تُستخدم لاختبار دورة العمل الكاملة: عرض سعر → مخطط → تشغيل الكشك → تقارير
-- لا يُشغَّل هذا الملف مطلقاً على بيئة الإنتاج الفعلية.
--
-- ملاحظة: إنشاء المالك (auth.users + staff_users) يجب أن يتم فعلياً عبر
-- Edge Function (tenant-provisioning) وليس عبر SQL مباشر، لأن Supabase Auth
-- الحقيقي يتطلب استدعاء API وليس إدخالاً مباشراً في auth.users. هذا الملف
-- يفترض أن الشركة والمالك أُنشئا بالفعل عبر ذلك الـ Function، ويكتفي بملء
-- بيانات التشغيل (عمال، آلات، مشروع...) لشركة موجودة مسبقاً.
--
-- استبدل :company_id بالمعرّف الفعلي الذي أرجعته tenant-provisioning عند
-- التشغيل الحقيقي، مثال:
--   psql ... -v company_id="'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'" -f seed.sql
-- ============================================================================

\set company_id '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''

-- ------------------------------------------------------------------
-- العمال
-- كلمة سر الاختبار لكلا الحسابين هي: worker123
-- الـ hash أدناه حقيقي (bcryptjs، 10 rounds)، تم توليده واختباره فعلياً
-- عبر bcrypt.hashSync('worker123', 10) — وليس نصاً وهمياً.
-- ------------------------------------------------------------------
insert into workers (company_id, full_name, username, password_hash, hourly_cost)
values
  (:company_id, 'أحمد بن علي', 'ahmad', '$2b$10$l8Fmiza753Aj2iKb0EFlkO1lFTN2nQBYaiJ98FTAFde3NgctzasGS', 25.00),
  (:company_id, 'يوسف الصالح', 'youssef', '$2b$10$l8Fmiza753Aj2iKb0EFlkO1lFTN2nQBYaiJ98FTAFde3NgctzasGS', 22.50)
on conflict (company_id, username) do nothing;

-- ------------------------------------------------------------------
-- الآلات
-- ------------------------------------------------------------------
insert into machines (company_id, name, code, machine_type)
values
  (:company_id, 'آلة تفريز CNC رقم 1', 'CNC-01', 'تفريز CNC'),
  (:company_id, 'آلة خراطة يدوية', 'LATHE-01', 'خراطة')
on conflict (company_id, code) do nothing;

-- ------------------------------------------------------------------
-- عميل تجريبي + مشروع مرتبط به
-- ------------------------------------------------------------------
insert into clients (company_id, name, contact_person, phone)
values (:company_id, 'مصنع الفولاذ المتحدة', 'م. خالد الأحمدي', '+966500000000')
returning id \gset client_

insert into projects (company_id, client_id, name, code, status, estimated_hours, quoted_price, start_date, due_date)
values (
  :company_id, :'client_id', 'تصنيع قاعدة معدنية لخط الإنتاج', 'PRJ-2026-001',
  'in_progress', 40, 15000.00, current_date, current_date + interval '10 days'
)
on conflict (company_id, code) do nothing
returning id \gset project_

-- ------------------------------------------------------------------
-- قطع/مهام المشروع
-- ------------------------------------------------------------------
insert into pieces_tasks (company_id, project_id, name, code, phase, estimated_time_minutes, sequence_order)
values
  (:company_id, :'project_id', 'قاعدة رئيسية - جهة يمين', 'PC-001', 'تفريز', 120, 1),
  (:company_id, :'project_id', 'قاعدة رئيسية - جهة يسار', 'PC-002', 'تفريز', 120, 2);

-- ------------------------------------------------------------------
-- أنواع المهام الإنتاجية (مثال واقعي تُدخله الشركة بنفسها، وليس ثابتاً بالكود)
-- ------------------------------------------------------------------
insert into task_types (company_id, name, color, sort_order) values
  (:company_id, 'تركيب وضبط', '#2563EB', 1),
  (:company_id, 'برمجة CNC', '#2563EB', 2),
  (:company_id, 'مراقبة الجودة', '#2563EB', 3),
  (:company_id, 'تشغيل البرنامج', '#2563EB', 4)
on conflict (company_id, name) do nothing;

-- ------------------------------------------------------------------
-- أسباب التوقف (مثال واقعي أيضاً وقابل للتعديل من الشركة)
-- ------------------------------------------------------------------
insert into stop_reasons (company_id, name, color, sort_order, requires_note) values
  (:company_id, 'استراحة', '#F97316', 1, false),
  (:company_id, 'عطل في الآلة', '#F97316', 2, true),
  (:company_id, 'انتظار المواد الخام', '#F97316', 3, false)
on conflict (company_id, name) do nothing;
