import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, PlusCircle, Wrench } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { localDb, type LocalMachineTool } from "../../../lib/localDb";
import { TOOL_TYPES } from "../../../shared/constants/toolTypes";
import type { Machine } from "../../../shared/types/database";

interface Props {
  machine: Machine;
  onClose: () => void;
}

export function MachineToolsModal({ machine, onClose }: Props) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<LocalMachineTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. تحميل الأدوات محلياً أولاً (Offline-first)، ثم محاولة المزامنة مع Supabase
  useEffect(() => {
    let mounted = true;

    async function loadTools() {
      try {
        // أ) قراءة الأدوات المخزنة محلياً في Dexie
        const cachedTools = await localDb.machineTools
          .where("machine_id")
          .equals(machine.id)
          .sortBy("tool_number");

        if (mounted && cachedTools.length > 0) {
          setTools(cachedTools);
          setIsLoading(false);
        }

        // ب) جلب أحدث البيانات من Supabase عند توفر الاتصال
        const { data, error: fetchError } = await supabase
          .from("machine_tools")
          .select("*")
          .eq("machine_id", machine.id)
          .order("tool_number");

        if (!mounted) return;

        if (!fetchError && data) {
          const remoteTools: LocalMachineTool[] = data.map((t) => ({
            id: t.id,
            company_id: t.company_id,
            machine_id: t.machine_id,
            tool_number: t.tool_number,
            tool_name: t.tool_name ?? "",
            tool_diameter: Number(t.tool_diameter ?? 0),
            tool_length: Number(t.tool_length ?? 0),
            is_occupied: Boolean(t.is_occupied),
            updated_at: t.updated_at ?? new Date().toISOString(),
          }));

          setTools(remoteTools);
          // تحديث الكاش المحلي
          await localDb.machineTools.bulkPut(remoteTools);
        } else if (cachedTools.length === 0 && fetchError) {
          setError(fetchError.message);
        }
      } catch (err) {
        if (mounted) setError(String(err));
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadTools();
    return () => {
      mounted = false;
    };
  }, [machine.id]);

  // 2. تحديث أداة محلياً وفي Supabase/طابور المزامنة
  async function updateTool(
    tool: LocalMachineTool,
    patch: Partial<LocalMachineTool>
  ) {
    const updatedTool: LocalMachineTool = {
      ...tool,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    // أ) تحديث الواجهة فوراً
    setTools((items) =>
      items.map((item) => (item.id === tool.id ? updatedTool : item))
    );

    try {
      // ب) التحديث في Dexie محلياً
      await localDb.machineTools.put(updatedTool);

      // ج) محاولة التحديث في Supabase
      const { error: updateError } = await supabase
        .from("machine_tools")
        .update({
          tool_name: updatedTool.tool_name,
          tool_diameter: updatedTool.tool_diameter,
          tool_length: updatedTool.tool_length,
          is_occupied: updatedTool.is_occupied,
          updated_at: updatedTool.updated_at,
        })
        .eq("id", tool.id);

      if (updateError) {
        // إضافة العملية إلى طابور المزامنة في حالة وجود خطأ أو انقطاع
        await localDb.syncQueue.add({
          table_name: "machine_tools",
          operation: "update",
          payload: updatedTool as unknown as Record<string, unknown>,
          created_at: new Date().toISOString(),
          attempts: 0,
          last_error: updateError.message,
        });
      }
    } catch (err) {
      setError(t("common.saveError") ?? String(err));
    }
  }

  // 3. إنشاء أطقم أدوات افتراضية للآلة إذا كانت القائمة فارغة (احتياطي فقط
  //    — عادةً تُنشَأ هذه الأسطر تلقائياً من الإدارة عند تحديد عدد الأدوات)
  async function generateDefaultTools() {
    setIsLoading(true);
    const totalSlots = machine.tool_count || 10;
    const newTools: LocalMachineTool[] = [];

    for (let i = 1; i <= totalSlots; i++) {
      newTools.push({
        id: crypto.randomUUID(),
        company_id: machine.company_id ?? "",
        machine_id: machine.id,
        tool_number: i,
        tool_name: "",
        tool_diameter: 0,
        tool_length: 0,
        is_occupied: false,
        updated_at: new Date().toISOString(),
      });
    }

    setTools(newTools);
    await localDb.machineTools.bulkPut(newTools);

    // محاولة الإدخال الجماعي في السيرفر
    const { error: insertError } = await supabase
      .from("machine_tools")
      .insert(newTools);

    if (insertError) {
      setError(insertError.message);
    }
    setIsLoading(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="flex h-[92vh] w-[75vw] max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95">
        {/* الهيدر */}
        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-800 via-indigo-700 to-blue-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
              <Wrench size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black">{t("kiosk.machineTools")}</h2>
              <p className="text-xs font-semibold text-indigo-100">
                {machine.name} · {machine.code}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {/* محتوى الجدول والتحكم */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-sm font-bold text-slate-400">
              {t("common.loading")}
            </div>
          ) : tools.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-4 text-sm font-bold text-slate-500">
                {t("kiosk.noMachineTools")}
              </p>
              <button
                type="button"
                onClick={() => void generateDefaultTools()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 active:scale-95"
              >
                <PlusCircle size={18} />
                {t("kiosk.generateDefaultTools")}
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="p-3">{t("kiosk.toolNumber")}</th>
                  <th className="p-3">{t("kiosk.toolName")}</th>
                  <th className="p-3">{t("kiosk.toolDiameter")} (mm)</th>
                  <th className="p-3">{t("kiosk.toolLength")} (mm)</th>
                  <th className="p-3">{t("kiosk.toolStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tools.map((tool) => (
                  <tr key={tool.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="p-3 font-black text-indigo-900">
                      T{tool.tool_number}
                    </td>
                    <td className="p-3">
                      <select
                        value={tool.tool_name}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTools((items) =>
                            items.map((item) =>
                              item.id === tool.id ? { ...item, tool_name: value } : item
                            )
                          );
                          void updateTool(tool, { tool_name: value });
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 font-bold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none"
                      >
                        <option value="">{t("kiosk.toolNamePlaceholder")}</option>
                        {TOOL_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-black text-indigo-400">
                          ⌀
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={tool.tool_diameter || ""}
                          onChange={(e) =>
                            setTools((items) =>
                              items.map((item) =>
                                item.id === tool.id
                                  ? {
                                      ...item,
                                      tool_diameter: e.target.value
                                        ? Number(e.target.value)
                                        : 0,
                                    }
                                  : item
                              )
                            )
                          }
                          onBlur={(e) =>
                            void updateTool(tool, {
                              tool_diameter: e.target.value
                                ? Number(e.target.value)
                                : 0,
                            })
                          }
                          placeholder="0.00"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 ps-7 pe-2 font-bold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-xs font-black text-indigo-400">
                          L
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={tool.tool_length || ""}
                          onChange={(e) =>
                            setTools((items) =>
                              items.map((item) =>
                                item.id === tool.id
                                  ? {
                                      ...item,
                                      tool_length: e.target.value
                                        ? Number(e.target.value)
                                        : 0,
                                    }
                                  : item
                              )
                            )
                          }
                          onBlur={(e) =>
                            void updateTool(tool, {
                              tool_length: e.target.value
                                ? Number(e.target.value)
                                : 0,
                            })
                          }
                          placeholder="0.00"
                          title={t("kiosk.toolLengthHint")}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 ps-7 pe-2 font-bold text-slate-800 transition focus:border-indigo-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() =>
                          void updateTool(tool, {
                            is_occupied: !tool.is_occupied,
                          })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition active:scale-95 ${
                          tool.is_occupied
                            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {tool.is_occupied ? (
                          <>
                            <Check size={14} />
                            {t("kiosk.toolOccupied")}
                          </>
                        ) : (
                          <>
                            <X size={14} />
                            {t("kiosk.toolEmpty")}
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}