export type SidebarLayoutTransitionSession = Readonly<{
  id: number;
  targetWidth: number;
}>;

type SidebarLayoutTransitionEvent = "active" | "settled" | "disposed";
type SidebarLayoutTransitionListener = (
  event: SidebarLayoutTransitionEvent,
) => void;

export type SidebarLayoutTransitionCoordinator = {
  activate: () => void;
  begin: (targetWidth: number) => SidebarLayoutTransitionSession;
  cancel: (session: SidebarLayoutTransitionSession) => boolean;
  complete: (
    session: SidebarLayoutTransitionSession,
    completedWidth: number,
  ) => boolean;
  dispose: () => void;
  isActive: () => boolean;
  isDisposed: () => boolean;
  subscribe: (listener: SidebarLayoutTransitionListener) => () => void;
};

export const createSidebarLayoutTransitionCoordinator =
  (): SidebarLayoutTransitionCoordinator => {
    let activeSession: SidebarLayoutTransitionSession | null = null;
    let disposed = false;
    let nextSessionId = 0;
    const listeners = new Set<SidebarLayoutTransitionListener>();

    const notify = (event: SidebarLayoutTransitionEvent): void => {
      for (const listener of listeners) {
        listener(event);
      }
    };

    const settle = (session: SidebarLayoutTransitionSession): boolean => {
      if (disposed || activeSession?.id !== session.id) return false;
      activeSession = null;
      notify("settled");
      return true;
    };

    return {
      activate: () => {
        disposed = false;
      },
      begin: (targetWidth) => {
        nextSessionId += 1;
        const session = { id: nextSessionId, targetWidth };
        if (disposed) return session;

        const wasActive = activeSession !== null;
        activeSession = session;
        if (!wasActive) notify("active");
        return session;
      },
      cancel: (session) => settle(session),
      complete: (session, completedWidth) => {
        if (session.targetWidth !== completedWidth) return false;
        return settle(session);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        activeSession = null;
        // Disposal is cancellation, not a successful rail settle. Consumers
        // cancel queued work without publishing a final resize commit.
        notify("disposed");
        listeners.clear();
      },
      isActive: () => !disposed && activeSession !== null,
      isDisposed: () => disposed,
      subscribe: (listener) => {
        if (disposed) return () => undefined;
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  };

type SidebarAwareResizeCommitterArgs = {
  coordinator: SidebarLayoutTransitionCoordinator | null;
  onCommit: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frameId: number) => void;
};

type SidebarAwareResizeCommitter = {
  dispose: () => void;
  requestCommit: () => void;
};

export const createSidebarAwareResizeCommitter = ({
  coordinator,
  onCommit,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (frameId) => window.cancelAnimationFrame(frameId),
}: SidebarAwareResizeCommitterArgs): SidebarAwareResizeCommitter => {
  let dirty = false;
  let disposed = false;
  let frameId: number | null = null;

  const cancelQueuedFrame = (): void => {
    if (frameId === null) return;
    cancelFrame(frameId);
    frameId = null;
  };

  const flush = (): void => {
    frameId = null;
    if (disposed || !dirty) return;
    if (coordinator?.isDisposed()) {
      dirty = false;
      return;
    }
    if (coordinator?.isActive()) return;

    dirty = false;
    onCommit();
  };

  const schedule = (): void => {
    if (
      disposed ||
      frameId !== null ||
      coordinator?.isDisposed() ||
      coordinator?.isActive()
    ) {
      return;
    }
    frameId = requestFrame(flush);
  };

  const unsubscribe =
    coordinator?.subscribe((event) => {
      if (disposed) return;
      if (event === "disposed") {
        dirty = false;
        cancelQueuedFrame();
        return;
      }
      if (event === "active") {
        cancelQueuedFrame();
        return;
      }
      if (dirty) schedule();
    }) ?? (() => undefined);

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      dirty = false;
      cancelQueuedFrame();
      unsubscribe();
    },
    requestCommit: () => {
      if (disposed) return;
      if (coordinator?.isDisposed()) {
        dirty = false;
        cancelQueuedFrame();
        return;
      }
      dirty = true;
      if (coordinator?.isActive()) {
        cancelQueuedFrame();
        return;
      }
      schedule();
    },
  };
};
