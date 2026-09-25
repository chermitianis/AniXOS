import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Loader2, Cog, Wrench } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { PiecePicker, type PieceWithProject } from "../components/PiecePicker";

interface Operation {
  id: string;
  piece_task_id: string | null;
  stage: string;
  label: string | null;
  estimated_hours: number;
  hourly_rate: number;
  subtotal: number;
  sequence_order: number;
  machine_id: string | null;
}

interface MachineOption {
  id: string;
  name: string;
  code: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  usinage_cnc: "Usinage CNC",
  tournage_classique: "Tournage classique",
  usinage_classique: "Usinage classique",
  rectification: "Rectification",
  ajustage: "Ajustage",
  stt: "STT",
  anodisation: "Anodisation",
  controle_qualite: "Contrôle qualité",
  autre: "Autre",
};

export function GammesTempsPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [selectedPiece, setSelectedPiece] = useState<PieceWithProject | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (pieceId: string) => {
    setIsLoading(true);
    const [{ data: opsData }, { data: machinesData }] = await Promise.all([
      supabase
        .from("piece_costing_operations")
        .select("*")
        .eq("piece_task_id", pieceId)
        .order("sequence_order"),
      supabase.from("machines").select("id, name, code").order("name"),
    ]);
    setOperations((opsData as Operation[]) ?? []);
    setMachines((machinesData as MachineOption[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPiece) void load(selectedPiece.id);
    else {
      setOperations([]);
      setMachines([]);
    }
  }, [selectedPiece, load]);

  async function handleUpdateOperation(id: string, patch: Partial<Operation>) {
    setOperations((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
    await supabase.from("piece_costing_operations").update(patch).eq("id", id);
  }

  const totals = useMemo(() => {
    const hours = operations.reduce((s, o) => s + Number(o.estimated_hours || 0), 0);
    const cost = operations.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    return { hours, cost };
  }, [operations]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <PiecePicker selectedId={selectedPiece?.id} onSelect={setSelectedPiece} />

      <div className="space-y-4">
        {!selectedPiece ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            <Cog size={32} className="mx-auto mb-2 text-slate-300" />
            Sélectionnez une pièce à gauche
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold text-slate-800">
                    {selectedPiece.name}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono" dir="ltr">{selectedPiece.code ?? "—"}</span>
                    <span>· {selectedPiece.project_name}</span>
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="text-[10px] uppercase text-slate-400">Total gamme</div>
                  <div className="text-lg font-extrabold text-indigo-700" dir="ltr">
                    {totals.hours.toFixed(2)} h
                  </div>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <Loader2 className="mx-auto animate-spin" size={18} />
              </div>
            ) : operations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                Aucune opération. Ajoutez des opérations dans le chiffrage d'abord.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 text-start">#</th>
                      <th className="px-3 py-2.5 text-start">Opération</th>
                      <th className="px-3 py-2.5 text-end">Heures</th>
                      <th className="px-3 py-2.5 text-start">Machine affectée</th>
                      <th className="px-3 py-2.5 text-end">Coût</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {operations.map((op, i) => (
                      <tr key={op.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 text-start text-xs text-slate-400">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2.5 text-start">
                          <div className="font-semibold text-slate-700">
                            {op.label ?? STAGE_LABELS[op.stage] ?? op.stage}
                          </div>
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock size={10} />
                            {op.estimated_hours} h × {op.hourly_rate} TND/h
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-end text-sm font-semibold text-slate-700" dir="ltr">
                          {Number(op.estimated_hours).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-start">
                          <div className="flex items-center gap-1.5">
                            <Wrench size={12} className="shrink-0 text-slate-400" />
                            <select
                              value={op.machine_id ?? ""}
                              onChange={(e) =>
                                void handleUpdateOperation(op.id, {
                                  machine_id: e.target.value || null,
                                })
                              }
                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="">— Aucune —</option>
                              {machines.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.code ? `${m.code} — ` : ""}{m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-end font-bold text-indigo-700" dir="ltr">
                          {Number(op.subtotal).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-end text-xs font-bold uppercase text-slate-500">
                        Total gamme
                      </td>
                      <td className="px-3 py-2.5 text-end font-extrabold text-indigo-700" dir="ltr">
                        {totals.cost.toFixed(2)} TND
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="rounded-lg bg-indigo-50 px-3 py-2 text-[11px] text-indigo-700">
              Les opérations proviennent du chiffrage. Vous pouvez ici assigner les machines
              prévues à chaque étape. Ces informations enrichissent l'Ordre de Fabrication.
            </div>
          </>
        )}
      </div>
    </div>
  );
}