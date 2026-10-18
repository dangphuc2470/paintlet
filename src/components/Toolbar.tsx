import { useState, useRef, useEffect, type ReactNode } from "react";
import { usePaintStore } from "../state/store";
import { isImplemented } from "../tools/registry";
import type { ToolId } from "../engine/types";
import { Icon, type IconName } from "./Icon";
import { ToolButton } from "./ToolButton";
import { ColorControls } from "./ColorControls";
import { TextOptions } from "./TextOptions";
import * as A from "../actions";

type ToolDef = {
  id: ToolId;
  icon: IconName;
  label: string;
  key?: string;
};

const SHAPE_TOOLS: ToolDef[] = [
  { id: "line", icon: "line", label: "Line" },
  { id: "curve", icon: "curve", label: "Curve" },
  { id: "rectangle", icon: "rectangle", label: "Rectangle" },
  { id: "roundedRectangle", icon: "roundedRectangle", label: "Rounded rectangle" },
  { id: "ellipse", icon: "ellipse", label: "Ellipse" },
  { id: "polygon", icon: "polygon", label: "Polygon" },
];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1.5">
      <div className="flex flex-1 items-center">{children}</div>
      <span className="text-[10px] leading-none text-ink-muted select-none">{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 w-px self-stretch bg-hairline" />;
}

function SelectionDropdown() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const setTool = usePaintStore((s) => s.setTool);
  const hasSelection = usePaintStore((s) => s.hasSelection);
  const transparentSelection = usePaintStore((s) => s.transparentSelection);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSelectionActive = activeToolId === "select" || activeToolId === "freeSelect";
  const currentIcon: IconName = activeToolId === "freeSelect" ? "lasso" : "select";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title="Selection"
        onClick={() => setOpen((v) => !v)}
        className={`flex flex-col items-center justify-between rounded p-1 transition-colors ${
          open
            ? "bg-hover text-ink ring-1 ring-hairline"
            : isSelectionActive
              ? "bg-accent/20 text-accent ring-1 ring-inset ring-accent/50"
              : "text-ink hover:bg-hover active:bg-hover"
        }`}
        style={{ height: "46px", width: "44px" }}
      >
        <div className="flex flex-1 items-center justify-center">
          <Icon name={currentIcon} size={20} />
        </div>
        <Icon name="chevronDown" size={10} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-hairline bg-surface-raised py-1 shadow-xl text-ink"
          role="menu"
        >
          <div className="px-3 py-1 text-[11px] font-semibold text-ink-muted">
            Selection shapes
          </div>
          <button
            type="button"
            onClick={() => {
              setTool("select");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover ${
              activeToolId === "select" ? "text-accent font-medium" : "text-ink"
            }`}
          >
            <Icon name="select" size={16} />
            <span className="flex-1">Rectangular selection</span>
            {activeToolId === "select" && <Icon name="check" size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setTool("freeSelect");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover ${
              activeToolId === "freeSelect" ? "text-accent font-medium" : "text-ink"
            }`}
          >
            <Icon name="lasso" size={16} />
            <span className="flex-1">Free-form selection</span>
            {activeToolId === "freeSelect" && <Icon name="check" size={14} />}
          </button>

          <div className="my-1 border-t border-hairline" />

          <div className="px-3 py-1 text-[11px] font-semibold text-ink-muted">
            Selection options
          </div>
          <button
            type="button"
            onClick={() => {
              A.selectAll();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover text-ink"
          >
            <Icon name="selectAll" size={16} />
            <span className="flex-1">Select all</span>
            <span className="text-[10px] text-ink-muted">⌘A</span>
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => {
              A.deleteSelection();
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${
              hasSelection
                ? "hover:bg-hover text-ink"
                : "opacity-40 cursor-not-allowed text-ink-muted"
            }`}
          >
            <Icon name="trash" size={16} />
            <span className="flex-1">Delete</span>
            <span className="text-[10px] text-ink-muted">⌫</span>
          </button>

          <div className="my-1 border-t border-hairline" />

          <button
            type="button"
            onClick={() => {
              A.toggleTransparentSelection();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover text-ink"
          >
            <Icon name="transparentSelection" size={16} />
            <span className="flex-1">Transparent selection</span>
            <div
              className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                transparentSelection
                  ? "border-accent bg-accent text-white"
                  : "border-hairline bg-surface"
              }`}
            >
              {transparentSelection && <Icon name="check" size={12} />}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function ContextGroup() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  if (activeToolId === "text")
    return (
      <>
        <Divider />
        <Group label="Text">
          <TextOptions />
        </Group>
      </>
    );
  return null;
}

export function Toolbar() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const setTool = usePaintStore((s) => s.setTool);
  const hasSelection = usePaintStore((s) => s.hasSelection);

  return (
    <div className="flex shrink-0 items-stretch gap-1 border-b border-hairline bg-surface px-2 py-1.5 select-none">
      {/* 1. Selection Group */}
      <Group label="Selection">
        <SelectionDropdown />
      </Group>

      <Divider />

      {/* 2. Image Group: Crop, Resize, Rotate, Remove Background */}
      <Group label="Image">
        <div className="grid grid-flow-col grid-rows-2 gap-0.5">
          <ToolButton
            title="Crop to selection"
            disabled={!hasSelection}
            onClick={() => A.crop()}
          >
            <Icon name="crop" size={15} />
          </ToolButton>
          <ToolButton
            title="Rotate 90° right"
            onClick={() => A.rotateRight()}
          >
            <Icon name="rotate" size={15} />
          </ToolButton>
          <ToolButton
            title="Resize canvas & image"
            onClick={() => A.openResizeDialog()}
          >
            <Icon name="resize" size={15} />
          </ToolButton>
          <ToolButton
            title="Remove background"
            onClick={() => {
              // Placeholder notification or basic transparent knockout
              A.toggleTransparentSelection();
            }}
          >
            <Icon name="removeBackground" size={15} />
          </ToolButton>
        </div>
      </Group>

      <Divider />

      {/* 3. Tools Group (2 rows x 3 cols: Pencil, Fill, Text | Eraser, Picker, Blank) */}
      <Group label="Tools">
        <div className="grid grid-flow-col grid-rows-2 gap-0.5">
          {/* Row 1, Col 1: Pencil */}
          <ToolButton
            title="Pencil (P)"
            active={activeToolId === "pencil"}
            onClick={() => setTool("pencil")}
          >
            <Icon name="pencil" />
          </ToolButton>
          {/* Row 2, Col 1: Eraser */}
          <ToolButton
            title="Eraser (E)"
            active={activeToolId === "eraser"}
            onClick={() => setTool("eraser")}
          >
            <Icon name="eraser" />
          </ToolButton>

          {/* Row 1, Col 2: Fill bucket */}
          <ToolButton
            title="Fill with color (B)"
            active={activeToolId === "fill"}
            onClick={() => setTool("fill")}
          >
            <Icon name="fill" />
          </ToolButton>
          {/* Row 2, Col 2: Eyedropper / Color picker */}
          <ToolButton
            title="Color picker (I)"
            active={activeToolId === "eyedropper"}
            onClick={() => setTool("eyedropper")}
          >
            <Icon name="eyedropper" />
          </ToolButton>

          {/* Row 1, Col 3: Text */}
          <ToolButton
            title="Text (T)"
            active={activeToolId === "text"}
            onClick={() => setTool("text")}
          >
            <Icon name="text" />
          </ToolButton>
          {/* Row 2, Col 3: Blank empty cell (user requested leaving zoom empty) */}
          <div className="h-7 w-7 pointer-events-none" />
        </div>
      </Group>

      <Divider />

      {/* 4. Brushes Group (Standalone single tile with dropdown indicator) */}
      <Group label="Brushes">
        <button
          type="button"
          title="Brushes"
          onClick={() => setTool("brush")}
          className={`flex flex-col items-center justify-center rounded px-2.5 py-1 transition-colors ${
            activeToolId === "brush"
              ? "bg-accent/20 text-accent ring-1 ring-inset ring-accent/50"
              : "text-ink hover:bg-hover active:bg-hover"
          }`}
          style={{ height: "46px", width: "44px" }}
        >
          <Icon name="brushes" size={20} />
          <Icon name="chevronDown" size={10} />
        </button>
      </Group>

      <Divider />

      {/* 5. Shapes Group */}
      <Group label="Shapes">
        <div className="grid grid-flow-col grid-rows-2 gap-0.5">
          {SHAPE_TOOLS.map((t) => {
            const enabled = isImplemented(t.id);
            return (
              <ToolButton
                key={t.id}
                title={!enabled ? `${t.label} — coming soon` : t.label}
                active={activeToolId === t.id}
                disabled={!enabled}
                onClick={() => setTool(t.id)}
              >
                <Icon name={t.icon} />
              </ToolButton>
            );
          })}
        </div>
      </Group>

      <ContextGroup />

      {/* 6. Colors Group, pushed to the right */}
      <div className="ml-auto flex items-stretch">
        <Divider />
        <Group label="Colors">
          <ColorControls />
        </Group>
      </div>
    </div>
  );
}
