import { useEffect } from "react";
import { AppRouter } from "./app/AppRouter";
import { WorkerPlanningApp } from "./modules/worker-planning/pages/WorkerPlanningApp";
import { startAutoSync } from "./lib/syncEngine";
import { OdooAutoSync } from "./modules/settings/components/OdooAutoSync";

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
  // ✅ تشغيل المزامنة التلقائية بمجرد تحميل التطبيق
  // (بغض النظر عن وجود جلسة Auth، لأن جهاز الكشك لا يملك جلسة Auth
  //  لكنه يحتاج إلى تفريغ طابور المزامنة المحلي).
  useEffect(() => {
    const stopSync = startAutoSync();
    return () => {
      stopSync();
    };
  }, []);

  return (
    <>
      <OdooAutoSync />
      <AppRouter />
    </>
  );
}

export default App;