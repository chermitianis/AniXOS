-- 0045_unify_machine_tool_count.sql
-- ============================================================================
-- إصلاح تكرار آخر ناتج عن تعارض 0031/0032: كلاهما أضاف عموداً منفصلاً لنفس
-- المفهوم (عدد أدوات مغازة الآلة) — machines.tool_count (0031) و
-- machines.total_tool_slots (0032). واجهة الإدارة (MachinesAdminPage) تكتب
-- فقط إلى tool_count، بينما كانت واجهة الكشك (MachineToolsModal) تقرأ من
-- total_tool_slots — القيمتان لا تتزامنان أبداً، فكانت واجهة الكشك تفترض
-- دوماً 10 (القيمة الافتراضية) بغض النظر عمّا أدخله المدير فعلياً.
-- الحل: توحيد على tool_count فقط (المعتمد من الإدارة) وحذف العمود المكرر.
-- ============================================================================

update machines set tool_count = total_tool_slots
where tool_count = 0 and total_tool_slots is not null and total_tool_slots > 0;

alter table machines drop column if exists total_tool_slots;
