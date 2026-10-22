import { useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

export function OdooAutoSync() {
  useEffect(() => {
    let isMounted = true;

    async function runSync() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // جلب الإعدادات مباشرة بدون الحاجة لـ company_id (بفضل RLS)
        const { data: config } = await supabase
          .from("odoo_config")
          .select("is_active")
          .maybeSingle(); // RLS ستجلب صف الشركة الخاص بالمستخدم فقط

        if (!config?.is_active) return;

        // استدعاء دالة السحب (Pull)
        await supabase.functions.invoke("sync-odoo-pull", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        console.log("Auto-sync background pull executed successfully.");
      } catch (err) {
        console.warn("Auto-sync failed", err);
      }
    }

    // تشغيلها فوراً عند فتح التطبيق
    runSync();

    // ثم كل 30 ثانية
    const interval = setInterval(() => {
      if (isMounted) runSync();
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return null;
}
