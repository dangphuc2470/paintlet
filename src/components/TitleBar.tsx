import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePaintStore } from "../state/store";
import { Logo } from "./Logo";

// Slim draggable strip under the traffic lights. With titleBarStyle "Overlay"
// the window content extends to the top edge and the traffic lights float over
// this strip's left side; the centered document title clears them. The whole
// strip is a Tauri drag region so the window moves when dragged here.
export function TitleBar() {
  const filePath = usePaintStore((s) => s.filePath);
  const isDirty = usePaintStore((s) => s.isDirty);
  // Document first, app second, joined by a plain hyphen — the order and
  // punctuation both Windows Paint and the macOS convention use. An unsaved
  // document is "Untitled", with no extension, since it has no file yet.
  const name = filePath ? filePath.split("/").pop() : "Untitled";
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const win = getCurrentWindow();
    win
      .isFocused()
      .then((f) => {
        if (!cancelled) setFocused(f);
      })
      .catch(() => {});
    win
      .onFocusChanged(({ payload }) => setFocused(payload))
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-7 shrink-0 items-center justify-center gap-1.5 bg-surface text-xs text-ink-muted select-none"
    >
      <Logo size={15} />
      <span
        data-tauri-drag-region
        className={focused ? "font-bold text-ink" : undefined}
      >
        {isDirty ? "• " : ""}{name} - Paintlet
      </span>
    </div>
  );
}
