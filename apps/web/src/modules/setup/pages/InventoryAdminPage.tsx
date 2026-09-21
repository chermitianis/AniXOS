import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import type { InventoryItem, InventoryTransactionType } from "../../../shared/types/database";

export function InventoryAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowStockIds, setLowStockIds] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState(t("setup.defaultUnitPiece"));
  const [reorderThreshold, setReorderThreshold] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txItemId, setTxItemId] = useState<string | null>(null);
  const [txType, setTxType] = useState<InventoryTransactionType>("in");
  const [txQuantity, setTxQuantity] = useState("");
  const [txReference, setTxReference] = useState("");

  async function loadItems() {
    const { data } = await supabase.from("inventory_items").select("*").order("name");
    setItems((data as InventoryItem[]) ?? []);

    const { data: lowStock } = await supabase.from("v_inventory_low_stock").select("id");
    setLowStockIds(new Set((lowStock ?? []).map((r: { id: string }) => r.id)));
  }

  useEffect(() => {
    void loadItems();
  }, []);

  async function handleCreateItem(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      const { error: insertError } = await supabase.from("inventory_items").insert({
        company_id: staffUser.company_id,
        name,
        code,
        unit,
        reorder_threshold: Number(reorderThreshold) || 0,
        unit_cost: Number(unitCost) || 0,
      });

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.usernameTaken") : "Erreur");
        return;
      }

      setName("");
      setCode("");
      setReorderThreshold("0");
      setUnitCost("0");
      await loadItems();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransaction(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !txItemId || !txQuantity) return;

    await supabase.from("inventory_transactions").insert({
      company_id: staffUser.company_id,
      item_id: txItemId,
      transaction_type: txType,
      quantity: Number(txQuantity),
      reference: txReference || null,
      created_by: staffUser.id,
    });

    setTxItemId(null);
    setTxQuantity("");
    setTxReference("");
    await loadItems();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <form onSubmit={handleCreateItem} className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.addInventoryItem")}
        </h2>

        <AdminField label={t("setup.itemName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.codeLabel")}>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <AdminField label={t("setup.unit")}>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={adminInputClass} />
          </AdminField>
          <AdminField label={t("setup.unitCost")}>
            <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={adminInputClass} />
          </AdminField>
        </div>

        <AdminField label={t("setup.reorderThreshold")}>
          <input type="number" step="0.01" value={reorderThreshold} onChange={(e) => setReorderThreshold(e.target.value)} className={adminInputClass} />
        </AdminField>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.addInventoryItem")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
          {t("setup.inventoryItems")} ({items.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className={`rounded-lg p-3 text-sm ${lowStockIds.has(item.id) ? "bg-red-50" : "bg-slate-50"}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{item.name}</span>
                {lowStockIds.has(item.id) && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                    {t("setup.lowStock")}
                  </span>
                )}
              </div>
              <div className="mb-2 truncate text-xs text-slate-400" dir="ltr">
                {item.quantity_on_hand} {item.unit} — {t("setup.codeLabel")}: {item.code}
              </div>
              <button
                onClick={() => setTxItemId(item.id)}
                className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white"
              >
                {t("setup.recordTransaction")}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>

      {txItemId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleTransaction} className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg sm:p-5">
            <h3 className="mb-4 text-base font-bold text-slate-800 sm:text-lg">
              {t("setup.recordTransactionTitle")}
            </h3>

            <AdminField label={t("setup.transactionType")}>
              <select value={txType} onChange={(e) => setTxType(e.target.value as InventoryTransactionType)} className={adminInputClass}>
                <option value="in">{t("setup.transactionIn")}</option>
                <option value="out">{t("setup.transactionOut")}</option>
                <option value="adjustment">{t("setup.transactionAdjustment")}</option>
              </select>
            </AdminField>

            <AdminField label={txType === "adjustment" ? t("setup.adjustmentValue") : t("setup.quantity")}>
              <input
                type="number"
                step="0.001"
                value={txQuantity}
                onChange={(e) => setTxQuantity(e.target.value)}
                className={adminInputClass}
                required
              />
            </AdminField>

            <AdminField label={t("setup.reference")}>
              <input value={txReference} onChange={(e) => setTxReference(e.target.value)} className={adminInputClass} />
            </AdminField>

            <div className="flex gap-2">
              <button type="button" onClick={() => setTxItemId(null)} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
                {t("common.cancel")}
              </button>
              <button type="submit" className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white">
                {t("common.confirm")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}