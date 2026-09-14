import { useEffect } from "react";
import { AppRouter } from "./app/AppRouter";
import { startAutoSync } from "./lib/syncEngine";
import { supabase } from "./lib/supabaseClient";

function App() {
  useEffect(() => {
    let stopSync: (() => void) | null = null;

    // استماع لتغيرات الجلسة وتفعيل طابور المزامنة العام فقط عند وجود جلسة نشطة
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (!stopSync) stopSync = startAutoSync();
      } else {
        if (stopSync) {
          stopSync();
          stopSync = null;
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (stopSync) stopSync();
    };
  }, []);

  return <AppRouter />;
}

export default App;