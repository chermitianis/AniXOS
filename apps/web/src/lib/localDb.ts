// ============================================================================
// قاعدة البيانات المحلية (IndexedDB عبر Dexie.js)
// تعمل بنفس الكود على الويب المباشر، وعلى Electron (Chromium)، وعلى
// Capacitor على أندرويد (WebView) — بخلاف نظام ملفات Node.js الذي لا يعمل
// على Capacitor، وهو سبب استبعاد فكرة ملفات data/*.json من الهيكل السابق.
//
// الاستخدام هنا مزدوج:
//   1) كاش للبيانات المرجعية (عمال، آلات، مشاريع...) لتبقى الواجهة تعمل
//      حتى لو انقطع الاتصال أثناء يوم العمل.
//   2) طابور مزامنة للعمليات التي حدثت أثناء الانقطاع (work_sessions،
//      activity_log) لإرسالها لاحقاً عند عودة الاتصال.
// ============================================================================

import Dexie, { type Table } from "dexie";
import type {
  Worker,
  Machine,
  Project,
  PieceTask,
  TaskType,
  StopReason,
  PlanningEntry,
  WorkSession,
  WorkShift,
  ShiftPieceWork,
  WorkshopReclamation,
  WorkSessionCorrection,
  ActivityLogEntry,
  PieceHandoff,
} from "../shared/types/database";

export type SyncOperation = "insert" | "update" | "delete";
export type SyncTableName =
  | "work_shifts"
  | "shift_piece_work"
  | "work_sessions"
  | "work_session_corrections"
  | "activity_log"
  | "pieces_tasks"
  | "piece_handoffs"
  | "machine_tools"
  | "workshop_reclamations"
  | "machines";   // ← أُضيف لدعم التعديل أوفلاين من MachinesAdminPage

export interface SyncQueueItem {
  // معرّف تلقائي محلي للصف داخل الطابور نفسه (ليس معرّف السجل المُزامَن)
  queue_id?: number;
  table_name: SyncTableName;
  operation: SyncOperation;
  // نسخة كاملة من السجل المطلوب إرساله (يحمل id حقيقياً تم توليده محلياً
  // مسبقاً بواسطة crypto.randomUUID() ليبقى ثابتاً عبر إعادة المحاولات)
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  last_error?: string;
}

// نوع كاش بيانات دخول العمال — يُملأ حصرياً عبر kiosk-credentials-sync
// Edge Function أثناء الاتصال، ويُستخدم فقط لمقارنة bcrypt محلياً عند
// انقطاع الإنترنت الكامل. لا يُعرض هذا الجدول أو يُستخدم في أي مكان آخر.
export interface WorkerCredentialCache {
  id: string; // نفس worker.id في قاعدة البيانات
  username: string;
  password_hash: string;
  full_name: string;
  photo_url: string | null;
  is_active: boolean;
  synced_at: string;
  // قفل محلي بسيط (مطابق لمنطق السيرفر) لحماية إضافية أثناء العمل أوفلاين
  local_failed_attempts: number;
  local_locked_until: string | null;
}

// واجهة كاش أدوات الماكينة محلياً
export interface LocalMachineTool {
  id: string;
  company_id: string;
  machine_id: string;
  tool_number: number;
  tool_name: string;
  tool_diameter: number;
  tool_length: number;
  is_occupied: boolean;
  updated_at: string;
}

class AnixosLocalDb extends Dexie {
  // ------ كاش البيانات المرجعية (للقراءة السريعة/أوفلاين) ------
  workers!: Table<Worker, string>;
  machines!: Table<Machine, string>;
  projects!: Table<Project, string>;
  piecesTasks!: Table<PieceTask, string>;
  taskTypes!: Table<TaskType, string>;
  stopReasons!: Table<StopReason, string>;
  planning!: Table<PlanningEntry, string>;

  // ------ بيانات تشغيلية محلية بانتظار المزامنة ------
  workShifts!: Table<WorkShift, string>;
  shiftPieceWork!: Table<ShiftPieceWork, string>;
  workshopReclamations!: Table<WorkshopReclamation, string>;
  workSessions!: Table<WorkSession, string>;
  workSessionCorrections!: Table<WorkSessionCorrection, string>;
  activityLog!: Table<ActivityLogEntry, string>;
  pieceHandoffs!: Table<PieceHandoff, string>;

  // ------ جدول أدوات الآلات ------
  machineTools!: Table<LocalMachineTool, string>;

  // ------ طابور المزامنة نفسه ------
  syncQueue!: Table<SyncQueueItem, number>;

  // ------ كاش آمن لبيانات دخول العمال (لدعم الدخول أوفلاين) ------
  workerCredentials!: Table<WorkerCredentialCache, string>;

  constructor() {
    super("anixos_local_db");

    // الإصدار الأول الأساسي
    this.version(1).stores({
      workers: "id, company_id, username",
      machines: "id, company_id, code",
      projects: "id, company_id, code",
      piecesTasks: "id, company_id, project_id",
      taskTypes: "id, company_id, sort_order",
      stopReasons: "id, company_id, sort_order",
      planning: "id, company_id, worker_id, planned_date, [worker_id+planned_date]",

      workSessions: "id, company_id, worker_id, started_at, ended_at",
      activityLog: "id, company_id, worker_id, event_time",
      pieceHandoffs: "id, company_id, piece_task_id, created_at, is_read",

      syncQueue: "++queue_id, table_name, created_at",
      workerCredentials: "id, username",
    });

    // الإصدار الثاني: إضافة جدول أدوات الآلات محلياً
    this.version(2).stores({
      machineTools: "id, machine_id, company_id, [machine_id+tool_number]",
    });

    // الإصدار الثالث: فصل الحصة (Shift) عن الحدث (Event) — جدول مستقل
    // يبقى محفوظاً محلياً بعد إغلاق التطبيق أو انقطاع الكهرباء
    this.version(3).stores({
      workShifts: "id, company_id, worker_id, started_at, ended_at",
    });

    // الإصدار الرابع: سجل تدقيق التصحيحات محلياً (append-only، لا يُعدَّل)
    this.version(4).stores({
      workSessionCorrections: "id, company_id, work_session_id, created_at",
    });

    // الإصدار الخامس: فترات الاشتغال الفعلي على كل قطعة ضمن الحصة (الجدول
    // الثاني في تقرير الحصة: القطعة/المشروع/البداية/النهاية/الوقت الجملي)
    this.version(5).stores({
      shiftPieceWork: "id, company_id, shift_id, piece_task_id, [shift_id+piece_task_id], ended_at",
    });

    // الإصدار السادس: رسائل réclamation من العامل إلى الإدارة (دعم أوفلاين)
    this.version(6).stores({
      workshopReclamations: "id, company_id, worker_id, created_at",
    });
  }
}

export const localDb = new AnixosLocalDb();