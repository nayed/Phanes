import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export type WindowButton = "minimize" | "maximize" | "close";

/**
 * The window buttons of Phanes' own header bar, in order, on each side. They
 * follow the desktop's button layout (GNOME Tweaks › Windows › Titlebar
 * Buttons), read from GTK by `window_button_layout`.
 */
export interface ButtonLayout {
  left: WindowButton[];
  right: WindowButton[];
}

export const useWindowButtons = create<ButtonLayout>(() => ({
  left: [],
  right: ["minimize", "maximize", "close"],
}));

/** Read the layout now and follow it when the setting changes. */
export async function installWindowButtons(): Promise<void> {
  try {
    useWindowButtons.setState(await invoke<ButtonLayout>("window_button_layout"));
  } catch {
    // Keeps the default: all three on the right.
  }
  await listen<ButtonLayout>("window-button-layout", (event) => useWindowButtons.setState(event.payload));
}
