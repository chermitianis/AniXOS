// ============================================================================
// companyWorkSettingsApi — CRUD pour les paramètres de travail par entreprise
//
// Table : company_work_settings (1 ligne par company_id)
//
// RÈGLE DE SÉCURITÉ (C5) : chaque requête filtre explicitement par company_id.
// ============================================================================

import { supabase } from "../../lib/supabaseClient";
import type { CompanyWorkSettings } from "../types/database";

// ---------------------------------------------------------------------------
// Type normalisé côté client (avec valeurs par défaut garanties)
// ---------------------------------------------------------------------------
export interface WorkSettings {
  id: string | null;
  company_id: string;
  cnc_shifts_per_day: number;
  cnc_shift_hours: number;
  cnc_shift_start_time: string;
  classique_shifts_per_day: number;
  classique_shift_hours: number;
  classique_shift_start_time: string;
  working_days: number[];
  piece_drawing_base_path: string | null;
  piece_drawing_path_pattern: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Valeurs par défaut — utilisées si la ligne n'existe pas encore
// ---------------------------------------------------------------------------
export const DEFAULT_WORK_SETTINGS: Omit<WorkSettings, "id" | "company_id" | "created_at" | "updated_at"> = {
  cnc_shifts_per_day: 3,
  cnc_shift_hours: 8,
  cnc_shift_start_time: "06:00",
  classique_shifts_per_day: 1,
  classique_shift_hours: 8,
  classique_shift_start_time: "08:00",
  working_days: [1, 2, 3, 4, 5, 6], // Lundi → Samedi
  piece_drawing_base_path: null,
  piece_drawing_path_pattern: "{projectCode}/{pieceName}.pdf",
};

// ---------------------------------------------------------------------------
// Normalisation d'une ligne DB vers WorkSettings
// ---------------------------------------------------------------------------
function normalize(
  row: CompanyWorkSettings | null,
  companyId: string,
): WorkSettings {
  if (!row) {
    return {
      id: null,
      company_id: companyId,
      ...DEFAULT_WORK_SETTINGS,
      created_at: null,
      updated_at: null,
    };
  }
  // working_days est stocké en JSONB ; on garantit un tableau de nombres
  const wd = Array.isArray(row.working_days)
    ? (row.working_days as unknown as number[]).filter((d) => typeof d === "number")
    : DEFAULT_WORK_SETTINGS.working_days;

  return {
    id: row.id,
    company_id: row.company_id,
    cnc_shifts_per_day: row.cnc_shifts_per_day ?? DEFAULT_WORK_SETTINGS.cnc_shifts_per_day,
    cnc_shift_hours: row.cnc_shift_hours ?? DEFAULT_WORK_SETTINGS.cnc_shift_hours,
    cnc_shift_start_time: row.cnc_shift_start_time ?? DEFAULT_WORK_SETTINGS.cnc_shift_start_time,
    classique_shifts_per_day:
      row.classique_shifts_per_day ?? DEFAULT_WORK_SETTINGS.classique_shifts_per_day,
    classique_shift_hours:
      row.classique_shift_hours ?? DEFAULT_WORK_SETTINGS.classique_shift_hours,
    classique_shift_start_time:
      row.classique_shift_start_time ?? DEFAULT_WORK_SETTINGS.classique_shift_start_time,
    working_days: wd.length > 0 ? wd : DEFAULT_WORK_SETTINGS.working_days,
    piece_drawing_base_path: row.piece_drawing_base_path ?? null,
    piece_drawing_path_pattern: row.piece_drawing_path_pattern ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET — lit les paramètres de l'entreprise (ou retourne les défauts)
// ---------------------------------------------------------------------------
export async function getWorkSettings(companyId: string): Promise<WorkSettings> {
  const { data, error } = await supabase
    .from("company_work_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  return normalize((data as CompanyWorkSettings | null) ?? null, companyId);
}

// ---------------------------------------------------------------------------
// UPSERT — crée ou met à jour les paramètres
// ---------------------------------------------------------------------------
export async function saveWorkSettings(
  companyId: string,
  patch: Partial<Omit<WorkSettings, "id" | "company_id" | "created_at" | "updated_at">>,
): Promise<WorkSettings> {
  // On lit d'abord pour préserver les champs non modifiés (upsert partiel).
  const current = await getWorkSettings(companyId);

  const payload = {
    company_id: companyId,
    cnc_shifts_per_day: patch.cnc_shifts_per_day ?? current.cnc_shifts_per_day,
    cnc_shift_hours: patch.cnc_shift_hours ?? current.cnc_shift_hours,
    cnc_shift_start_time: patch.cnc_shift_start_time ?? current.cnc_shift_start_time,
    classique_shifts_per_day:
      patch.classique_shifts_per_day ?? current.classique_shifts_per_day,
    classique_shift_hours:
      patch.classique_shift_hours ?? current.classique_shift_hours,
    classique_shift_start_time:
      patch.classique_shift_start_time ?? current.classique_shift_start_time,
    working_days: patch.working_days ?? current.working_days,
    piece_drawing_base_path:
      patch.piece_drawing_base_path !== undefined
        ? patch.piece_drawing_base_path
        : current.piece_drawing_base_path,
    piece_drawing_path_pattern:
      patch.piece_drawing_path_pattern !== undefined
        ? patch.piece_drawing_path_pattern
        : current.piece_drawing_path_pattern,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("company_work_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select()
    .single();

  if (error) throw error;
  return normalize(data as CompanyWorkSettings, companyId);
}

// ---------------------------------------------------------------------------
// Utilitaires pour le calcul des shifts
// ---------------------------------------------------------------------------

/**
 * Retourne les heures de début pour une interface et un numéro de shift.
 * Exemple : interface="cnc", shift=2, settings.cnc_shift_start_time="06:00",
 *           settings.cnc_shift_hours=8 → "14:00"
 */
export function getShiftStartTime(
  settings: WorkSettings,
  iface: "cnc" | "classique",
  shiftNumber: number,
): string {
  const isCnc = iface === "cnc";
  const baseStart = isCnc ? settings.cnc_shift_start_time : settings.classique_shift_start_time;
  const shiftHours = isCnc ? settings.cnc_shift_hours : settings.classique_shift_hours;

  const [hStr, mStr] = baseStart.split(":");
  const baseH = parseInt(hStr ?? "0", 10);
  const baseM = parseInt(mStr ?? "0", 10);
  const totalMinutes = baseH * 60 + baseM + (shiftNumber - 1) * shiftHours * 60;

  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * Retourne les heures de fin pour une interface et un numéro de shift.
 * Exemple : interface="cnc", shift=2, start="14:00", hours=8 → "22:00"
 */
export function getShiftEndTime(
  settings: WorkSettings,
  iface: "cnc" | "classique",
  shiftNumber: number,
): string {
  const start = getShiftStartTime(settings, iface, shiftNumber);
  const isCnc = iface === "cnc";
  const shiftHours = isCnc ? settings.cnc_shift_hours : settings.classique_shift_hours;

  const [hStr, mStr] = start.split(":");
  const baseH = parseInt(hStr ?? "0", 10);
  const baseM = parseInt(mStr ?? "0", 10);
  const totalMinutes = baseH * 60 + baseM + shiftHours * 60;

  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * Nombre total de shifts par jour pour une interface.
 */
export function getShiftsPerDay(
  settings: WorkSettings,
  iface: "cnc" | "classique",
): number {
  return iface === "cnc" ? settings.cnc_shifts_per_day : settings.classique_shifts_per_day;
}