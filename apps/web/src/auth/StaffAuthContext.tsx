import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import {
  syncActiveCompanyFromServer,
  clearActiveCompany,
} from "../lib/activeCompany";
import { clearCompanyIdCache } from "../lib/companyContext";
import type { StaffUser, Role } from "../shared/types/database";

interface StaffAuthState {
  session: Session | null;
  staffUser: StaffUser | null;
  role: Role | null;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthState | undefined>(undefined);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStaffProfile(userId: string) {
    // منذ 0059: شخص واحد (auth_user_id) قد يملك أكثر من صف staff_users (مالك
    // بعدة قواعد بيانات) — لهذا لم نعد نستخدم .single() هنا. الحالة الشائعة
    // (100% من المستخدمين اليوم، وكل موظف مستقبلاً بلا استثناء) تبقى صفاً
    // واحداً فقط فيُختار مباشرة؛ عند التعدد نُفضّل القاعدة المحفوظة محلياً من
    // آخر اختيار (شاشة اختيار القاعدة)، وإلا الأقدم إنشاءً كتراجع آمن.
    const staffResponse = await supabase.from("staff_users").select("*").eq("auth_user_id", userId);
    const staffRows = (staffResponse.data as StaffUser[] | null) ?? [];

    if (staffResponse.error || staffRows.length === 0) {
      setStaffUser(null);
      setRole(null);
      setError("staffAuth.notLinked");
      return;
    }

    let staff = staffRows[0];
    if (staffRows.length > 1) {
      const savedCompanyId = (() => {
        try {
          return localStorage.getItem("anixos_active_company_id");
        } catch {
          return null;
        }
      })();
      staff = staffRows.find((s) => s.company_id === savedCompanyId) ?? staffRows[0];
    }

    setStaffUser(staff);
    setError(null);

    const roleResponse = await supabase.from("roles").select("*").eq("id", staff.role_id).single();
    setRole((roleResponse.data as Role | null) ?? null);

    // مزامنة القاعدة النشطة من السيرفر (best-effort) — تُكتب في localStorage
    // ليقرأها AppRouter فورًا. لا تنتظر النتيجة (لا تُعطِّل تحميل الملف).
    void syncActiveCompanyFromServer(userId);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadStaffProfile(data.session.user.id);
      }
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        await loadStaffProfile(newSession.user.id);
      } else {
        setStaffUser(null);
        setRole(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const messageKey = "auth.loginFailed";
      setError(messageKey);
      return { error: messageKey };
    }
    return { error: null };
  }

  async function signOut() {
    clearActiveCompany();
    clearCompanyIdCache();
    await supabase.auth.signOut();
    setStaffUser(null);
    setRole(null);
  }

  return (
    <StaffAuthContext.Provider value={{ session, staffUser, role, isLoading, error, signIn, signOut }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth(): StaffAuthState {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error("useStaffAuth must be used within StaffAuthProvider");
  return ctx;
}