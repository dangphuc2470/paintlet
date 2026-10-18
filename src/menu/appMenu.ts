import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as A from "../actions";

// The native menu is built once in Rust and is app-global on macOS. A click
// (or ⌘-accelerator) is emitted only to the focused editor window. Listen on
// this webview, not the global event bus — a global listener runs the command
// in every open window at once.

const ACTIONS: Record<string, () => void> = {
  about: A.openAboutWindow,
  settings: A.openSettingsDialog,
  quit: A.quitApp,
  new: A.newDocument,
  open: A.openFile,
  save: A.saveFile,
  "save-as": A.saveFileAs,
  close: A.closeWindow,
  undo: A.undo,
  redo: A.redo,
  cut: A.cut,
  copy: A.copy,
  paste: A.paste,
  delete: A.deleteSelection,
  "select-all": A.selectAll,
  "transparent-selection": A.toggleTransparentSelection,
  resize: A.openResizeDialog,
  crop: A.crop,
  "flip-h": A.flipHorizontal,
  "flip-v": A.flipVertical,
  "rotate-right": A.rotateRight,
  "rotate-left": A.rotateLeft,
  "rotate-180": A.rotate180,
  "zoom-in": A.zoomIn,
  "zoom-out": A.zoomOut,
  "actual-size": A.actualSize,
  fit: A.fitToWindow,
};

export function bindMenuActions(): Promise<() => void> {
  return getCurrentWebviewWindow().listen<string>("menu-action", (event) => {
    ACTIONS[event.payload]?.();
  });
}
