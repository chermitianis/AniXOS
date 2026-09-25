import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useWorkerSession } from "../../../auth/WorkerSessionContext";
import { useActiveTask } from "../hooks/useActiveTask";
import { useWorkerPlanning } from "../hooks/useWorkerPlanning";
import type { ActiveWorkerProfile } from "../../../auth/WorkerSessionContext";
import { TopNavBar } from "../components/TopNavBar";
import { ContextBar } from "../components/ContextBar";
import { ProductionTasksGrid } from "../components/ProductionTasksGrid";
import { StopReasonsGrid } from "../components/StopReasonsGrid";
import { SidePanel } from "../components/SidePanel";
import { FooterBar } from "../components/FooterBar";
import { ProjectPieceSelectorModal } from "../components/ProjectPieceSelectorModal";
import { SessionCorrectionModal } from "../components/SessionCorrectionModal";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import { startCredentialsSync } from "../../../lib/credentialsSync";
import {
  fetchPieceOperationsWithEstimate,
  type PieceOperationEstimate,
} from "../api/kioskApi";
import type { WorkSession } from "../../../shared/types/database";

export function KioskMainPage() {
  const { activeWorker, logout, hasOpenPieceEvents } = useWorkerSession();

  if (!activeWorker) return null;

  return <KioskWorkspace worker={activeWorker} onLogout={logout} hasOpenPieceEvents={hasOpenPieceEvents} />;
}

interface KioskWorkspaceProps {
  worker: ActiveWorkerProfile;
  onLogout: () => Promise<void>;
  hasOpenPieceEvents: () => Promise<boolean>;
}

function KioskWorkspace({ worker, onLogout, hasOpenPieceEvents }: KioskWorkspaceProps) {
  const { t } = useTranslation();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [correctionSession, setCorrectionSession] = useState<WorkSession | null>(null);
  const [showMaxActiveWarning, setShowMaxActiveWarning] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logRefreshSignal, setLogRefreshSignal] = useState(0);
  const [pieceOperations, setPieceOperations] = useState<PieceOperationEstimate[]>([]);

  useEffect(() => {
    const stopCredentialsSync = startCredentialsSync();
    return () => {
      stopCredentialsSync();
    };
  }, []);

  useEffect(() => {
    if (!showMaxActiveWarning) return;
    const timeout = setTimeout(() => setShowMaxActiveWarning(false), 4000);
    return () => clearTimeout(timeout);
  }, [showMaxActiveWarning]);

  const {
    machine,
    project,
    pieceTask,
    activeSessions,
    selectPlanningOption,
    toggleProductionTask,
    toggleStopReason,
    completePiece,
    pausePiece,
    changePhase,
    refreshActiveSessions,
  } = useActiveTask(worker.id, worker.shift_id);

  const { projectOptions, loadPiecesForOption, reload: reloadPlanning } = useWorkerPlanning(worker.id);

  // Charger les opérations estimées à chaque changement de pièce
  useEffect(() => {
    let isMounted = true;
    if (!pieceTask?.id) {
      setPieceOperations([]);
      return;
    }
    void fetchPieceOperationsWithEstimate(pieceTask.id).then((ops) => {
      if (isMounted) setPieceOperations(ops);
    });
    return () => {
      isMounted = false;
    };
  }, [pieceTask?.id]);

  /** Total estimé en minutes pour la pièce, calculé depuis les opérations. */
  const estimatedTotalMinutes = pieceOperations.reduce(
    (sum, op) => sum + Math.round(op.estimated_hours * 60),
    0,
  );

  async function handleSelectFromModal(...args: Parameters<typeof selectPlanningOption>) {
    await selectPlanningOption(...args);
    setIsSelectorOpen(false);
  }

  async function handleCompletePiece() {
    await completePiece();
    void reloadPlanning();
  }

  async function handlePausePiece() {
    await pausePiece();
    void reloadPlanning();
  }

  async function handleLogoutRequest() {
    if (await hasOpenPieceEvents()) {
      setIsLogoutConfirmOpen(true);
    } else {
      setIsLoggingOut(true);
      await onLogout();
    }
  }

  async function confirmLogoutAnyway() {
    setIsLogoutConfirmOpen(false);
    setIsLoggingOut(true);
    await onLogout();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <TopNavBar
        sessionStartedAt={worker.session_started_at}
        workerId={worker.id}
        onLogout={() => void handleLogoutRequest()}
        isLoggingOut={isLoggingOut}
      />

      <ContextBar
        worker={worker}
        machine={machine}
        project={project}
        pieceTask={pieceTask}
        estimatedTotalMinutes={estimatedTotalMinutes || null}
        onOpenSelector={() => setIsSelectorOpen(true)}
        onCompletePiece={() => void handleCompletePiece()}
        onPausePiece={() => void handlePausePiece()}
        onChangePhase={(delta) => void changePhase(delta)}
      />

      {showMaxActiveWarning && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
          <AlertTriangle size={16} />
          {t("kiosk.maxActiveEventsReached")}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 md:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
          <ProductionTasksGrid
            activeSessions={activeSessions}
            pieceOperations={pieceOperations}
            onToggle={toggleProductionTask}
            onMaxActiveEvents={() => setShowMaxActiveWarning(true)}
            onCorrectSession={setCorrectionSession}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-orange-100 bg-white">
          <StopReasonsGrid
            activeSessions={activeSessions}
            onToggle={toggleStopReason}
            onMaxActiveEvents={() => setShowMaxActiveWarning(true)}
            onCorrectSession={setCorrectionSession}
          />
        </div>

        <SidePanel
          workerId={worker.id}
          activeSessions={activeSessions}
          refreshSignal={logRefreshSignal}
          onOpenSessionForCorrection={setCorrectionSession}
        />
      </div>

      <FooterBar />

      {isSelectorOpen && (
        <ProjectPieceSelectorModal
          projectOptions={projectOptions}
          loadPiecesForOption={loadPiecesForOption}
          onSelect={(option, piece) => void handleSelectFromModal(option, piece)}
          onClose={() => setIsSelectorOpen(false)}
        />
      )}

      {correctionSession && (
        <SessionCorrectionModal
          session={correctionSession}
          workerId={worker.id}
          onClose={() => setCorrectionSession(null)}
          onSaved={() => {
            void refreshActiveSessions();
            setLogRefreshSignal((v) => v + 1);
          }}
        />
      )}

      {isLogoutConfirmOpen && (
        <LogoutConfirmModal
          onCancel={() => setIsLogoutConfirmOpen(false)}
          onConfirm={() => void confirmLogoutAnyway()}
        />
      )}
    </div>
  );
}