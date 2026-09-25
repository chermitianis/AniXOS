import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2, XCircle, ShieldCheck, Loader2, FileText, Cog, Calculator, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { PiecePicker, type PieceWithProject } from "../components/PiecePicker";

interface PieceCheck {
  hasChiffrage: boolean;
  hasDocuments: boolean;
  hasGamme: boolean;
  technicalStatus: "pending" | "approved";
  technicalValidatedAt: string | null;
  technicalNotes: string | null;
}

export function ValidationTechniquePage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [selectedPiece, setSelectedPiece] = useState<PieceWithProject | null>(null);
  const [check, setCheck] = useState<PieceCheck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  const load = useCallback(async (piece: PieceWithProject) => {
    setIsLoading(true);
    const [docsRes, opsRes, pieceRes] = await Promise.all([
      supabase
        .from("piece_documents")
        .select("id", { count: "exact", head: true })
        .eq("piece_task_id", piece.id),
      supabase
        .from("piece_costing_operations")
        .select("id", { count: "exact", head: true })
        .eq("piece_task_id", piece.id),
      supabase
        .from("pieces_tasks")
        .select("costing_status, technical_status, technical_validated_at, technical_notes")
        .eq("id", piece.id)
        .single(),
    ]);

    const pieceData = pieceRes.data as {
      costing_status: string | null;
      technical_status: "pending" | "approved" | null;
      technical_validated_at: string | null;
      technical_notes: string | null;
    } | null;

    setCheck({
      hasChiffrage: pieceData?.costing_status === "valide",
      hasDocuments: (docsRes.count ?? 0) > 0,
      hasGamme: (opsRes.count ?? 0) > 0,
      technicalStatus: pieceData?.technical_status ?? "pending",
      technicalValidatedAt: pieceData?.technical_validated_at ?? null,
      technicalNotes: pieceData?.technical_notes ?? null,
    });
    setNotes(pieceData?.technical_notes ?? "");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPiece) void load(selectedPiece);
    else setCheck(null);
  }, [selectedPiece, load]);

  async function handleApprove() {
    if (!staffUser || !selectedPiece) return;
    setSaving(true);
    try {
      await supabase
        .from("pieces_tasks")
        .update({
          technical_status: "approved",
          technical_validated_at: new Date().toISOString(),
          technical_notes: notes.trim() || null,
        } as never)
        .eq("id", selectedPiece.id);
      await load(selectedPiece);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selectedPiece) return;
    if (!window.confirm("Réinitialiser la validation technique ?")) return;
    setSaving(true);
    try {
      await supabase
        .from("pieces_tasks")
        .update({
          technical_status: "pending",
          technical_validated_at: null,
          technical_notes: null,
        } as never)
        .eq("id", selectedPiece.id);
      await load(selectedPiece);
    } finally {
      setSaving(false);
    }
  }

  const allDone = check?.hasChiffrage && check?.hasDocuments && check?.hasGamme;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <PiecePicker selectedId={selectedPiece?.id} onSelect={setSelectedPiece} />

      <div className="space-y-4">
        {!selectedPiece || !check ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            <ShieldCheck size={32} className="mx-auto mb-2 text-slate-300" />
            Sélectionnez une pièce à gauche
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold text-slate-800">
                    {selectedPiece.name}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono" dir="ltr">{selectedPiece.code ?? "—"}</span>
                    <span>· {selectedPiece.project_name}</span>
                  </div>
                </div>
                {check.technicalStatus === "approved" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                    <CheckCircle2 size={13} />
                    Validée
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    <AlertTriangle size={13} />
                    En attente
                  </span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto animate-spin" size={18} />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <CheckItem
                    icon={Calculator}
                    label="Chiffrage validé"
                    hint="Le coût de la pièce est calculé et approuvé"
                    done={check.hasChiffrage}
                  />
                  <CheckItem
                    icon={FileText}
                    label="Dossier technique"
                    hint="Au moins un document (plan, CAD, CAM, ...)"
                    done={check.hasDocuments}
                  />
                  <CheckItem
                    icon={Cog}
                    label="Gamme de fabrication"
                    hint="Au moins une opération définie"
                    done={check.hasGamme}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    Notes de validation (optionnel)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Remarques, réserves, références..."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {check.technicalStatus === "approved" ? (
                    <button
                      onClick={() => void handleReset()}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle size={15} />
                      Réinitialiser
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleApprove()}
                      disabled={saving}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                        allDone ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"
                      }`}
                    >
                      {saving ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}
                      {allDone ? "Approuver" : "Approuver quand même"}
                    </button>
                  )}
                </div>

                {check.technicalValidatedAt && (
                  <div className="text-end text-[11px] text-slate-400" dir="ltr">
                    Validée le{" "}
                    {new Date(check.technicalValidatedAt).toLocaleString("fr-FR")}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CheckItem({
  icon: Icon,
  label,
  hint,
  done,
}: {
  icon: typeof CheckCircle2;
  label: string;
  hint: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          done ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
        }`}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-700">{label}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>
      </div>
      {done ? (
        <CheckCircle2 size={18} className="shrink-0 text-green-500" />
      ) : (
        <XCircle size={18} className="shrink-0 text-slate-300" />
      )}
    </div>
  );
}