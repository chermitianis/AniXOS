import { useWorkerSession } from "../../../auth/WorkerSessionContext";
import { WorkerLoginPage } from "./WorkerLoginPage";
import { KioskMainPage } from "./KioskMainPage";

/** يُقرَّر هنا فقط: هل نعرض شاشة الدخول أم الواجهة الرئيسية للكشك */
export function KioskRouter() {
  const { activeWorker } = useWorkerSession();
  return activeWorker ? <KioskMainPage /> : <WorkerLoginPage />;
}
