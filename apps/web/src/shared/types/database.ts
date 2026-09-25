// apps/web/src/shared/types/database.ts
// ملف وسيط: يستخرج الأسماء المطلوبة من الأنواع المولّدة في ../../types/database

import type { Database } from '../../types/database';

type PublicSchema = Database['public'];
type Tables = PublicSchema['Tables'];
type Views = PublicSchema['Views'];

// ==================== الاشتراكات والشركة ====================
type RawSubscriptionStatus =
  PublicSchema['Functions']['get_company_subscription_status'] extends {
    Returns: infer R;
  }
    ? R
    : unknown;

export type CompanySubscriptionStatus =
  RawSubscriptionStatus extends readonly (infer Item)[]
    ? Item
    : RawSubscriptionStatus;

// ==================== الأدوار والمستخدمون ====================
export type Role = Tables['roles']['Row'];
export type StaffUser = Tables['staff_users']['Row'];

// ==================== العمال والآلات والعملاء ====================
export type Worker = Tables['workers']['Row'];
export type Machine = Tables['machines']['Row'];
export type Client = Tables['clients']['Row'];

// ==================== المشاريع والقطع ====================
export type Project = Tables['projects']['Row'];
export type PieceTask = Tables['pieces_tasks']['Row'];

// ==================== أنواع المهام وأسباب التوقف ====================
export type TaskType = Tables['task_types']['Row'];
export type StopReason = Tables['stop_reasons']['Row'];

// ==================== التخطيط ====================
export type PlanningEntry = Tables['planning']['Row'];

// ==================== جلسات العمل والورديات ====================
export type WorkSession = Tables['work_sessions']['Row'];
export type WorkShift = Tables['work_shifts']['Row'];
export type ShiftPieceWork = Tables['shift_piece_work']['Row'];   // ← موجود في migration 0047
export type WorkSessionCorrection = Tables['work_session_corrections']['Row'];

// ==================== الأصناف المعدودة ====================
export type SessionType =
  | 'work'
  | 'stop'
  | 'pause'
  | 'setup'
  | 'maintenance'
  | 'production'
  | 'downtime';

export type CorrectedByType = 'worker' | 'manager' | 'system';

// ==================== التسليمات والشكاوى ====================
export type PieceHandoff = Tables['piece_handoffs']['Row'];
export type WorkshopReclamation = Tables['workshop_reclamations']['Row'];   // ← موجود في migration 0048

// ==================== سجل النشاط ====================
export type ActivityLogEntry = Tables['activity_log']['Row'];

// ==================== التسميات ====================
export type Nomenclature = Tables['nomenclatures']['Row'];
export type NomenclatureColumn = Tables['nomenclature_columns']['Row'];
export type NomenclatureRow = Tables['nomenclature_rows']['Row'];
export type NomenclatureCell = Tables['nomenclature_cells']['Row'];

export type NomenclatureColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'formula'
  | 'material'
  | 'unit'
  | 'currency'
  | 'value'
  | 'name'
  | 'operation';

// ==================== المخزون ====================
export type InventoryItem = Tables['inventory_items']['Row'];
export type InventoryTransactionType = 'in' | 'out' | 'adjustment' | 'transfer';

// ==================== أوامر التصنيع ====================
export type ManufacturingOrder = Tables['manufacturing_orders']['Row'];

export type ManufacturingOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'cancelled';

// ==================== عروض الأسعار ====================
export type Quote = Tables['quotes']['Row'];

// ==================== التقارير ولوحة التحكم ====================
export type ProjectProfitability = Views['v_project_profitability']['Row'];
export type LiveOperation = Views['v_live_operations']['Row'];
// ==================== نوع واجهة Kiosk (CNC / Classique) ====================
/**
 * تصنيف واجهة Kiosk. يُستخدم في 4 جداول:
 *   - workers.interface_type       → أي واجهة يرى العامل (cnc / classique / both)
 *   - machines.interface_type      → أي واجهة تناسب الآلة (cnc / classique / both)
 *   - task_types.interface_type    → أي واجهة تظهر فيها بطاقة المهمة
 *   - stop_reasons.interface_type  → أي واجهة يظهر فيها زر التوقف
 *
 * القيمة 'manual' مُبقاة مؤقتًا للتوافق مع البيانات القديمة (migration 0091)؛
 * ستُزال في migration 0092. كود الفلترة يعاملها كـ'classique'.
 */
export type InterfaceType = "cnc" | "classique" | "manual" | "both";

// ==================== تصدير نوع قاعدة البيانات نفسه ====================
export type { Database };