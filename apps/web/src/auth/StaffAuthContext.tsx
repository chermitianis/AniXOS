// ============================================================================
// StaffAuthContext: جلسة الموظف الإداري (مدير، مشرف، محاسب...)
// مرتبطة بحساب Supabase Auth حقيقي. مسؤولة أيضاً عن جلب صف staff_users
// المرتبط + الدور والصلاحيات، لأن معظم قرارات الواجهة (القائمة الجانبية،
// إتاحة الأزرار...) تعتمد على تلك الصلاحيات.
// ============================================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
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
    const staffResponse = await supabase.from("staff_users").select("*").eq("id", userId).single();
    const staff = staffResponse.data as StaffUser | null;

    if (staffResponse.error || !staff) {
      // مستخدم موجود في Supabase Auth لكن بلا صف staff_users مرتبط —
      // حالة غير طبيعية (ربما جهاز Kiosk سجّل دخول هنا بالخطأ)
      setStaffUser(null);
      setRole(null);
      setError("staffAuth.notLinked");
      return;
    }

    setStaffUser(staff);
    setError(null);

    const roleResponse = await supabase.from("roles").select("*").eq("id", staff.role_id).single();
    setRole((roleResponse.data as Role | null) ?? null);
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
