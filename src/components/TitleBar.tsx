import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePaintStore } from "../state/store";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import * as A from "../actions";

export function TitleBar() {
  const filePath = usePaintStore((s) => s.filePath);
  const isDirty = usePaintStore((s) => s.isDirty);
  const canUndo = usePaintStore((s) => s.canUndo);
  const canRedo = usePaintStore((s) => s.canRedo);

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
      className="relative flex h-8 shrink-0 items-center justify-between border-b border-hairline/60 bg-surface px-2 text-xs text-ink-muted select-none"
    >
      {/* Quick Action items to the right of traffic lights (traffic lights occupy ~74px) */}
      <div className="flex items-center gap-1 pl-[74px]">
        <button
          type="button"
          title="Save (⌘S)"
          onClick={() => A.saveFile()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-500/15 active:bg-neutral-500/25 text-ink transition-colors"
        >
          <Icon name="save" size={13} />
        </button>
        <button
          type="button"
          title="Copy image to clipboard / Share"
          onClick={() => A.copy()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-500/15 active:bg-neutral-500/25 text-ink transition-colors"
        >
          <Icon name="share" size={13} />
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-hairline" />
        <button
          type="button"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={() => A.undo()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-500/15 active:bg-neutral-500/25 disabled:opacity-30 disabled:pointer-events-none text-ink transition-colors"
        >
          <Icon name="undo" size={13} />
        </button>
        <button
          type="button"
          title="Redo (⌘Y / ⇧⌘Z)"
          disabled={!canRedo}
          onClick={() => A.redo()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-500/15 active:bg-neutral-500/25 disabled:opacity-30 disabled:pointer-events-none text-ink transition-colors"
        >
          <Icon name="redo" size={13} />
        </button>
      </div>

      {/* Centered Document Title */}
      <div
        data-tauri-drag-region
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5"
      >
        <Logo size={14} />
        <span
          data-tauri-drag-region
          className={focused ? "font-semibold text-ink" : "text-ink/75"}
        >
          {isDirty ? "• " : ""}{name} - Paint
        </span>
      </div>

      {/* Right spacer */}
      <div className="w-10" />
    </div>
  );
}
