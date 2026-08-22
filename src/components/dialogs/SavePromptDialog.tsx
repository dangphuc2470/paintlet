import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePaintStore } from "../../state/store";
import { saveImage } from "../../io/fileIO";

// Native macOS alert prompt for unsaved changes.
// Invokes real AppKit NSAlert from Rust so it is 100% genuine macOS UI,
// with exact system fonts, native rounded pill buttons, and user's system accent color.
export function SavePromptDialog({
  isOpen,
  onClose,
  onProceed,
}: {
  isOpen: boolean;
  onClose: () => void;
  onProceed?: () => void;
}) {
  const filePath = usePaintStore((s) => s.filePath);
  const name = filePath ? filePath.split("/").pop() : "Untitled";

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    async function runPrompt() {
      try {
        const action = await invoke<string>("prompt_save_dialog", {
          documentName: name ?? "Untitled",
        });
        if (isCancelled) return;

        if (action === "save") {
          await saveImage(false);
          if (!usePaintStore.getState().isDirty) {
            onClose();
            onProceed?.();
          } else {
            onClose();
          }
        } else if (action === "dont_save") {
          usePaintStore.getState().setIsDirty(false);
          onClose();
          onProceed?.();
        } else {
          // "cancel"
          onClose();
        }
      } catch (e) {
        console.error("prompt_save_dialog failed:", e);
        onClose();
      }
    }

    void runPrompt();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, name, onClose, onProceed]);

  // Pure native AppKit modal, no DOM overlay rendered.
  return null;
}
