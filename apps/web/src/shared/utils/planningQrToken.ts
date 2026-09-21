// ============================================================================
// Format du "token" encodé dans le QR Code du Planning opérateur (/planning).
// Partagé entre modules/settings (génération) et modules/worker-planning
// (lecture par scan). Aucune donnée sensible autre que le secret lui-même —
// le secret seul n'a de valeur que comparé au serveur (planning_qr_codes).
// ============================================================================

const PREFIX = "anixos-planning:";
const SEPARATOR = ".";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedPlanningQrToken {
  companyId: string;
  secret: string;
}

export function buildPlanningQrToken(companyId: string, secret: string): string {
  return `${PREFIX}${companyId}${SEPARATOR}${secret}`;
}

export function parsePlanningQrToken(raw: string): ParsedPlanningQrToken | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX)) return null;

  const withoutPrefix = trimmed.slice(PREFIX.length);
  const sepIndex = withoutPrefix.indexOf(SEPARATOR);
  if (sepIndex <= 0) return null;

  const companyId = withoutPrefix.slice(0, sepIndex);
  const secret = withoutPrefix.slice(sepIndex + 1);
  if (!secret || !UUID_RE.test(companyId)) return null;

  return { companyId, secret };
}

/** Génère un nouveau secret "inspiré de l'instant présent" (date + heure à la
 * seconde/milliseconde près), complété par une part aléatoire cryptographique
 * pour rester réellement infalsifiable — exactement le comportement demandé
 * pour le bouton "Recréer" côté Paramètres. */
export function generatePlanningQrSecret(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;

  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);

  return `${stamp}-${randomPart}`;
}
