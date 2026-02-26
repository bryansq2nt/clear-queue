'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

const TOAST_DURATION_MS = 6000;

export type PrimaryAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type UndoAction = {
  label: string;
  onUndo: () => void | Promise<void>;
};

export type ActionToastOptions = {
  message: string;
  primaryAction?: PrimaryAction;
  undoAction?: UndoAction;
};

type ToastState = ActionToastOptions | null;

type ActionToastContextValue = {
  showActionToast: (options: ActionToastOptions) => void;
  dismiss: () => void;
};

const ActionToastContext = createContext<ActionToastContextValue | null>(null);

export function ActionToastProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);
  const [toastKey, setToastKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showActionToast = useCallback((options: ActionToastOptions) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(options);
    setToastKey((k) => k + 1);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, TOAST_DURATION_MS);
  }, []);

  const handlePrimary = useCallback(() => {
    if (!toast?.primaryAction) return;
    const { href, onClick } = toast.primaryAction;
    if (href) router.push(href);
    onClick?.();
    dismiss();
  }, [toast, router, dismiss]);

  const handleUndo = useCallback(async () => {
    if (!toast?.undoAction) return;
    // Capture the undo function before dismiss() clears the toast state, so
    // onUndo() can call showActionToast() for a confirmation message without
    // it being immediately cleared by a subsequent dismiss() call.
    const undoFn = toast.undoAction.onUndo;
    dismiss();
    await Promise.resolve(undoFn());
  }, [toast, dismiss]);

  const value: ActionToastContextValue = { showActionToast, dismiss };

  return (
    <ActionToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 md:bottom-8"
        >
          <div className="animate-in slide-in-from-bottom-3 fade-in-0 duration-300 relative overflow-hidden rounded-xl bg-foreground shadow-2xl min-w-[300px] max-w-[460px]">
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="flex-1 text-sm font-medium text-background">
                {toast.message}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                {toast.primaryAction && (
                  <button
                    type="button"
                    onClick={handlePrimary}
                    className="rounded-md bg-background/15 px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/50"
                  >
                    {toast.primaryAction.label}
                  </button>
                )}
                {toast.undoAction && (
                  <button
                    type="button"
                    onClick={() => void handleUndo()}
                    className="rounded-md border border-background/30 px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/50"
                  >
                    {toast.undoAction.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-background/60 transition-colors hover:bg-background/15 hover:text-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Animated progress bar — resets on each new toast via key */}
            <div
              key={toastKey}
              className="absolute bottom-0 left-0 h-[3px] bg-background/40 rounded-full"
              style={{
                animation: `toast-progress ${TOAST_DURATION_MS}ms linear forwards`,
              }}
            />
          </div>
        </div>
      )}
    </ActionToastContext.Provider>
  );
}

export function useActionToast(): ActionToastContextValue {
  const ctx = useContext(ActionToastContext);
  if (!ctx) {
    throw new Error('useActionToast must be used within ActionToastProvider');
  }
  return ctx;
}
