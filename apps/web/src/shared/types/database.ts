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
export type ShiftPieceWork = Tables['shift_piece_work']['Row'];
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
export type WorkshopReclamation = Tables['workshop_reclamations']['Row'];

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

// ==================== عروض الأسعار ====================
export type Quote = Tables['quotes']['Row'];

// ==================== التقارير ولوحة التحكم ====================
export type ProjectProfitability = Views['v_project_profitability']['Row'];
export type LiveOperation = Views['v_live_operations']['Row'];

// ==================== نوع واجهة Kiosk (CNC / Classique) ====================
export type InterfaceType = "cnc" | "classique" | "manual" | "both";

// ============================================================================
// PRODUCTION — Ordres de fabrication, opérations, work packages
// ============================================================================

/** Ordre de fabrication (table manufacturing_orders) */
export type ManufacturingOrder = Tables['manufacturing_orders']['Row'];

/**
 * Statuts d'un OF — alignés sur le workflow Production :
 *   draft        → créé, non préparé
 *   preparing    → en cours de préparation (Préparation des dossiers)
 *   ready        → prêt à planifier (attente planification)
 *   scheduled    → planifié (place dans le planning)
 *   in_progress  → travail démarré sur au moins un paquet
 *   completed    → tous les paquets terminés
 *   cancelled    → annulé
 */
export type ManufacturingOrderStatus =
  | 'draft'
  | 'preparing'
  | 'ready'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/** Statut d'un paquet de travail (of_work_packages) */
export type OfWorkPackageStatus = 'pending' | 'in_progress' | 'completed';

/** Paquet de travail attaché à un OF (table of_work_packages) */
export type OfWorkPackage = Tables['of_work_packages']['Row'];

/** Opération figée d'un OF (table of_operations) */
export type OfOperation = Tables['of_operations']['Row'];

/** Statut de production d'une pièce (pieces_tasks.production_status) */
export type ProductionStatus =
  | 'not_sent'
  | 'sent'
  | 'in_preparation'
  | 'ready_to_start'
  | 'scheduled'
  | 'in_progress'
  | 'partially_done'
  | 'completed'
  | 'on_hold';

/** Statut de chiffrage d'une pièce (pieces_tasks.costing_status) */
export type CostingStatus = 'non_etudie' | 'brouillon' | 'en_attente' | 'valide';

/** Paramètres de travail par entreprise (table company_work_settings) */
export type CompanyWorkSettings = Tables['company_work_settings']['Row'];

// ==================== تصدير نوع قاعدة البيانات نفسه ====================
export type { Database };