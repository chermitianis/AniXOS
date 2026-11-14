import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, ArrowLeft, Package, Boxes, ExternalLink, FileSpreadsheet,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";

interface OrderDetail {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  quoted_price: number | null;
  client_name: string | null;
}

interface OrderLine {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  piece_type: string;
  parent_item_id: string | null;
}

export function OrderDetailPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const { goToSection, consumeParams } = useNav();
  const companyId = staffUser?.company_id ?? null;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasConsumedRef = useRef(false);

  // ✅ قراءة projectId من navigation params (مرة واحدة فقط)
  useEffect(() => {
    if (hasConsumedRef.current) return;
    hasConsumedRef.current = true;

    const params = consumeParams();
    if (params?.projectId) {
      setProjectId(params.projectId);
    } else {
      setError("Aucun projet sélectionné");
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId || !projectId) return;
    setIsLoading(true);
    void (async () => {
      try {
        // 1. جلب المشروع (الذي يمثل الطلب)
        const { data: projectData, error: projErr } = await supabase
          .from("projects")
          .select(`
            id, name, code, description, status, due_date, created_at, quoted_price,
            clients ( name )
          `)
          .eq("id", projectId)
          .eq("company_id", companyId)
          .single();

        if (projErr || !projectData) throw projErr || new Error("Project not found");

        const p = projectData as Record<string, unknown>;
        const client = p.clients as { name?: string } | null;

        setOrder({
          id: p.id as string,
          name: p.name as string,
          code: p.code as string | null,
          description: p.description as string | null,
          status: p.status as string,
          due_date: p.due_date as string | null,
          created_at: p.created_at as string,
          quoted_price: p.quoted_price as number | null,
          client_name: client?.name ?? null,
        });

        // 2. جلب بنود الـ Devis
        const { data: quoteData } = await supabase
          .from("quotes")
          .select("id")
          .eq("project_id", projectId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (quoteData) {
          const { data: items } = await supabase
            .from("quote_items")
            .select("id, description, quantity, unit_price, piece_type, parent_item_id")
            .eq("quote_id", (quoteData as { id: string }).id)
            .order("sequence_order");

          setLines((items as OrderLine[]) ?? []);
        } else {
          setLines([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId, projectId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading", { defaultValue: "Chargement..." })}
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
        {error ?? "Erreur"}
      </div>
    );
  }

  const mainProducts = lines.filter((l) => l.piece_type === "main_product");
  const technicalPieces = lines.filter((l) => l.piece_type === "technical_piece");

  const total = mainProducts.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
      approved: { label: "Approuvé", color: "bg-blue-100 text-blue-700" },
      ready_for_production: { label: "Prêt pour production", color: "bg-indigo-100 text-indigo-700" },
      in_production: { label: "En production", color: "bg-emerald-100 text-emerald-700" },
      completed: { label: "Terminé", color: "bg-green-100 text-green-700" },
    };
    const info = map[status] ?? { label: status, color: "bg-slate-100 text-slate-600" };
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${info.color}`}>{info.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => goToSection("orders")}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold text-slate-800">
              {order.name}
            </h1>
            {statusBadge(order.status)}
          </div>
          <p className="text-xs text-slate-400">
            {order.client_name ?? "—"} · {new Date(order.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => goToSection("projects", { projectId: order.id })}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <ExternalLink size={12} />
            {t("orders.viewProject", { defaultValue: "Voir le projet" })}
          </button>
          <button
            onClick={() => goToSection("nomenclature")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            <FileSpreadsheet size={12} />
            {t("setup.createNomenclature", { defaultValue: "Créer nomenclature" })}
          </button>
        </div>
      </div>

      {/* Informations */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("orders.client", { defaultValue: "Client" })}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">
            {order.client_name ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("orders.dueDate", { defaultValue: "Date de livraison" })}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-700">
            {order.due_date
              ? new Date(order.due_date).toLocaleDateString("fr-FR")
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("orders.total", { defaultValue: "Total" })}
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-800" dir="ltr">
            {total.toFixed(2)} TND
          </p>
        </div>
      </div>

      {/* Produits principaux */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Boxes size={14} className="text-indigo-600" />
            {t("orders.mainProducts", { defaultValue: "Produits principaux" })} ({mainProducts.length})
          </h2>
        </div>
        {mainProducts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("orders.noMainProducts", { defaultValue: "Aucun produit principal" })}
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("orders.description", { defaultValue: "Description" })}
                </th>
                <th className="px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("orders.quantity", { defaultValue: "Qté" })}
                </th>
                <th className="px-4 py-2 text-end text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("orders.unitPrice", { defaultValue: "Prix unitaire" })}
                </th>
                <th className="px-4 py-2 text-end text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {t("orders.subtotal", { defaultValue: "Sous-total" })}
                </th>
              </tr>
            </thead>
            <tbody>
              {mainProducts.map((line) => (
                <tr key={line.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <Boxes size={12} className="text-indigo-500" />
                      {line.description}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-600">{line.quantity}</td>
                  <td className="px-4 py-3 text-end text-sm text-slate-600" dir="ltr">
                    {line.unit_price.toFixed(2)} TND
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-bold text-slate-800" dir="ltr">
                    {(line.quantity * line.unit_price).toFixed(2)} TND
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pièces techniques */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Package size={14} className="text-slate-500" />
            {t("orders.technicalPieces", { defaultValue: "Pièces techniques" })} ({technicalPieces.length})
          </h2>
        </div>
        {technicalPieces.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {t("orders.noTechnicalPieces", { defaultValue: "Aucune pièce technique" })}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {technicalPieces.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-4 py-2.5">
                <Package size={12} className="shrink-0 text-slate-400" />
                <span className="flex-1 truncate text-sm font-semibold text-slate-700">
                  {line.description}
                </span>
                <span className="shrink-0 text-xs text-slate-500" dir="ltr">
                  ×{line.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}