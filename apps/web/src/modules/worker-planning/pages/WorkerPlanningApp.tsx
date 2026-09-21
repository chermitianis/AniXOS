import { PlanningSessionProvider, usePlanningSession } from "../context/PlanningSessionContext";
import { WorkerPlanningHomePage } from "./WorkerPlanningHomePage";
import { WorkerPlanningQRScannerPage } from "./WorkerPlanningQRScannerPage";

/** Racine de la PWA Planning opérateur, montée directement sur la route
 * `/planning` (en dehors de tout le flux Admin/Kiosk — voir App.tsx). Pas de
 * StaffAuthProvider, pas de SubscriptionGate "admin" : la seule barrière est
 * le token QR géré par PlanningSessionContext. */
export function WorkerPlanningApp() {
  return (
    <PlanningSessionProvider>
      <WorkerPlanningGate />
    </PlanningSessionProvider>
  );
}

function WorkerPlanningGate() {
  const { session } = usePlanningSession();
  return session ? <WorkerPlanningHomePage /> : <WorkerPlanningQRScannerPage />;
}
