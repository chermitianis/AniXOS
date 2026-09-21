import { useEffect } from "react";
import { AppRouter } from "./app/AppRouter";
import { WorkerPlanningApp } from "./modules/worker-planning/pages/WorkerPlanningApp";
import { startAutoSync } from "./lib/syncEngine";
import { supabase } from "./lib/supabaseClient";

// La PWA "Planning opérateur" (Mission 1) vit sur sa propre route /planning,
// totalement hors du flux Admin/Kiosk/StaffAuth : ni session Supabase Auth,
// ni SubscriptionGate "admin", ni synchronisation offline Dexie (réservée au
// Kiosk, cf. décision d'architecture §6.11). Elle a son propre manifest PWA
// dédié (voir index.html + public/planning-manifest.webmanifest).
const isWorkerPlanningRoute = window.location.pathname.startsWith("/planning");

function App() {
  if (isWorkerPlanningRoute) {
    return <WorkerPlanningApp />;
  }

  return <AppWithSync />;
}

function AppWithSync() {
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