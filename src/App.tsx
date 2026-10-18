import { useEffect } from "react";
import { engine, usePaintStore } from "./state/store";
import { stageHooks } from "./state/stageHooks";
import type { ToolId } from "./engine/types";
import { bindMenuActions } from "./menu/appMenu";
import * as A from "./actions";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openFilePath } from "./io/fileIO";
import { pasteImageBlob } from "./io/clipboard";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { CanvasStage } from "./components/CanvasStage";
import { StatusBar } from "./components/StatusBar";
import { ResizeDialog } from "./components/dialogs/ResizeDialog";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { SavePromptDialog } from "./components/dialogs/SavePromptDialog";
import { applyTheme } from "./lib/theme";

// Single-key tool shortcuts (no modifier), exactly the set Windows Paint binds
// and nothing more: no brush key, no shape keys, and `B` is the fill bucket
// rather than the brush. Paint's `Z` picks its magnifier, a tool Paintlet has
// no equivalent for, so `Z` stays unbound.
//
// These live in a keydown handler rather than the menu because single-key menu
// accelerators would hijack every keystroke in the text editor.
const TOOL_KEYS: Record<string, ToolId> = {
  p: "pencil",
  b: "fill",
  t: "text",
  e: "eraser",
  i: "eyedropper",
};

// `S` is the exception: in Paint it cycles the selection modes rather than
// picking one, so pressing it again swaps the marquee for the lasso and back.
// A live selection survives the swap — CanvasStage only bakes one down when
// leaving for a tool outside this pair.
const SELECT_CYCLE: ToolId[] = ["select", "freeSelect"];

// Arrow key → the direction it nudges a selection. One pixel per press, as in
// Paint; no coarse-step modifier, because Paint has none.
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function App() {
  const theme = usePaintStore((s) => s.theme);
  const setTool = usePaintStore((s) => s.setTool);
  const savePrompt = usePaintStore((s) => s.savePrompt);
  const closeSavePrompt = usePaintStore((s) => s.closeSavePrompt);
  const openSavePrompt = usePaintStore((s) => s.openSavePrompt);

  // Handle file opened into this window
  useEffect(() => {
    invoke<string | null>("get_window_file")
      .then((path) => {
        if (path) {
          openFilePath(path);
        }
      })
      .catch(console.error);
  }, []);

  // The menu bar is app-global and built once in Rust. Each editor window
  // listens and runs the command on its own canvas, so ⌘C/⌘V hit the focused
  // window instead of whichever webview last installed the menu.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    bindMenuActions()
      .then((u) => (unlisten = u))
      .catch((err) => console.error("Failed to bind app menu:", err));
    return () => unlisten?.();
  }, []);

  // Guard the window close button: if the document has unsaved changes, ask
  // with 3-button save prompt (Save / Don't Save / Cancel) before letting it close.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        stageHooks.flushTextEdit?.();
        const isDirty = usePaintStore.getState().isDirty || engine.isDirty;
        if (isDirty) {
          event.preventDefault();
          openSavePrompt(() => {
            getCurrentWindow().destroy();
          });
        }
      })
      .then((u) => (unlisten = u))
      .catch((err) => console.error("Failed to install close guard:", err));
    return () => unlisten?.();
  }, [openSavePrompt]);

  // Files macOS hands us (Finder double-click, Open With). The listener is
  // installed before the webview_ready handshake, so any opens Rust buffered
  // while this webview was still loading are replayed to a listener that
  // exists — nothing delivered during launch is lost. Only this window
  // listens; the About window has no document to replace.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string[]>("document-open", (e) => void A.openFromSystem(e.payload))
      .then((u) => {
        unlisten = u;
        invoke("webview_ready").catch((err) =>
          console.error("Failed to report webview readiness:", err),
        );
      })
      .catch((err) =>
        console.error("Failed to listen for document opens:", err),
      );
    return () => unlisten?.();
  }, []);

  // Resolve theme → data-theme on <html>. "system" follows the OS and updates
  // live when the user flips appearance. Shared with the About window's webview,
  // which starts with no data-theme of its own.
  useEffect(() => applyTheme(theme), [theme]);

  // Native clipboard paste event: handles image pasted from macOS WebKit clipboard
  // directly without depending solely on Tauri IPC or synthetic events.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (editable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            void pasteImageBlob(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Keyboard lives on this window. The macOS menu bar is shared, so ⌘-keys
  // must be handled here — only the webview that has focus receives them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "=" || key === "+") {
          e.preventDefault();
          A.zoomIn();
        } else if (key === "-" || key === "_") {
          e.preventDefault();
          A.zoomOut();
        } else if (key === "0") {
          e.preventDefault();
          A.actualSize();
        } else if (key === "9") {
          e.preventDefault();
          A.fitToWindow();
        } else if (key === "y") {
          e.preventDefault();
          A.redo();
        } else if (key === "a") {
          e.preventDefault();
          A.selectAll();
        } else if (key === "c") {
          e.preventDefault();
          A.copy();
        } else if (key === "x") {
          e.preventDefault();
          A.cut();
        } else if (key === "v") {
          if (editable) return;
          // Allow native WebKit 'paste' event to fire for zero-copy ImageBitmap decoding.
          // Fall back to A.paste() only if no native paste happened.
          setTimeout(() => {
            A.paste();
          }, 60);
        } else if (key === "z" && e.shiftKey) {
          e.preventDefault();
          A.redo();
        } else if (key === "z") {
          e.preventDefault();
          A.undo();
        } else if (key === "s" && e.shiftKey) {
          e.preventDefault();
          A.saveFileAs();
        } else if (key === "s") {
          e.preventDefault();
          A.saveFile();
        } else if (key === "n") {
          e.preventDefault();
          A.newDocument();
        } else if (key === "o") {
          e.preventDefault();
          A.openFile();
        } else if (key === "w") {
          e.preventDefault();
          A.closeWindow();
        } else if (key === ",") {
          e.preventDefault();
          A.openSettingsDialog();
        } else if (key === "q") {
          e.preventDefault();
          A.quitApp();
        }
        return;
      }

      if (editable) return;

      // An open dialog owns the keyboard: an unmodified key must not reach the
      // canvas behind it and silently switch tools or delete the selection.
      // Matched by role rather than a store flag because the Edit Color popup's
      // open state is local to ColorControls — the same check CanvasStage's Esc
      // handler makes, for the same reason.
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        A.deleteSelection();
        return;
      }

      const dir = NUDGE[e.key];
      if (dir) {
        // Swallowed only when a selection actually moved; with nothing
        // selected the arrows keep scrolling the work area.
        if (A.nudgeSelection(dir[0], dir[1])) e.preventDefault();
        return;
      }

      if (e.altKey) return; // Option makes these keys type symbols, not commands

      const key = e.key.toLowerCase();
      if (key === "s") {
        // From anywhere else this lands on the marquee (indexOf → -1 → 0).
        const i = SELECT_CYCLE.indexOf(usePaintStore.getState().activeToolId);
        setTool(SELECT_CYCLE[(i + 1) % SELECT_CYCLE.length]);
        return;
      }
      const id = TOOL_KEYS[key];
      if (id) setTool(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool]);

  return (
    <div className="relative flex h-full flex-col bg-surface text-ink">
      <TitleBar />
      <Toolbar />
      <div className="relative flex flex-1 overflow-hidden">
        <CanvasStage />
      </div>
      <StatusBar />
      <ResizeDialog />
      <SettingsDialog />
      <SavePromptDialog
        isOpen={savePrompt.isOpen}
        onClose={closeSavePrompt}
        onProceed={savePrompt.onProceed}
      />
    </div>
  );
}

export default App;
