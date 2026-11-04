import { create } from "zustand";

export interface AlertButton {
  id: string;
  label: string;
  /** "suggested" is the blue default action, "destructive" is red. */
  appearance?: "default" | "suggested" | "destructive";
}

export interface AlertRequest {
  heading: string;
  body?: string;
  buttons: AlertButton[];
  /** Returned when the dialog is dismissed with Escape. */
  cancelId: string;
  /** Button focused when the dialog opens. */
  defaultId?: string;
}

type Panel = "about" | "shortcuts";

interface DialogStore {
  alert: (AlertRequest & { resolve: (id: string) => void }) | null;
  panel: Panel | null;
  toast: { id: number; message: string } | null;
}

export const useDialogs = create<DialogStore>(() => ({ alert: null, panel: null, toast: null }));

/** Show an alert dialog (libadwaita AdwAlertDialog style) and resolve with the chosen button id. */
export function ask(request: AlertRequest): Promise<string> {
  return new Promise((resolve) => {
    useDialogs.setState({
      alert: {
        ...request,
        resolve: (id) => {
          useDialogs.setState({ alert: null });
          resolve(id);
        },
      },
    });
  });
}

export function showPanel(panel: Panel): void {
  useDialogs.setState({ panel });
}

export function closePanel(): void {
  useDialogs.setState({ panel: null });
}

let toastId = 0;
let toastTimer: number | undefined;

/** A short message at the bottom of the window, e.g. when an action fails. */
export function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  useDialogs.setState({ toast: { id: ++toastId, message } });
  toastTimer = window.setTimeout(() => useDialogs.setState({ toast: null }), 4000);
}
