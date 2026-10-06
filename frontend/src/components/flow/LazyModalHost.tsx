import { Component, ReactNode, Suspense, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import Modal from "../common/Modal";
import Spinner from "../common/Spinner";

// SMALL INTENTIONAL PLACEHOLDER SHOWN WHILE A LAZY DIALOG'S CHUNK IS STILL ARRIVING
function ModalSkeleton({ onCancel }: { onCancel?: () => void }) {
  const t = useTranslation();
  return (
    <Modal open size="sm" onClose={onCancel} title={t.flow.loading} panelClass="min-h-[9rem] justify-center">
      <div role="status" aria-live="polite" className="py-4">
        <Spinner label={t.flow.loading} />
      </div>
    </Modal>
  );
}

// a chunk that fails to load (offline, stale deploy) must not take the whole app down
class ChunkBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // closing the store flag matters for dialogs that hold the simulation while open (the briefing)
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  open: boolean;
  // closes the dialog if the player gives up while the skeleton is showing, or its chunk fails
  onCancel?: () => void;
  children: ReactNode;
}

// MOUNTS A LAZY DIALOG ONLY AFTER ITS FIRST OPEN (so the chunk is never needed at boot) and shows
// the skeleton, instead of nothing, while that first open waits for the chunk
export default function LazyModalHost({ open, onCancel, children }: Props) {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);
  if (!everOpened) return null;
  return (
    <ChunkBoundary onFail={onCancel}>
      <Suspense fallback={open ? <ModalSkeleton onCancel={onCancel} /> : null}>{children}</Suspense>
    </ChunkBoundary>
  );
}
