import { useState, useRef, useEffect, type ReactNode } from "react";
import { usePaintStore, type BrushType } from "../state/store";
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

function RotateDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
        title="Rotate"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-[22px] min-w-[36px] items-center justify-between gap-1 rounded px-1.5 text-ink transition-colors hover:bg-hover ${
          open ? "bg-hover ring-1 ring-hairline" : ""
        }`}
      >
        <Icon name="rotate" size={14} />
        <Icon name="chevronDown" size={8} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-hairline bg-surface-raised py-1 shadow-xl text-ink"
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              A.rotateRight();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="rotateRight90" size={16} />
            <span>Rotate right 90°</span>
          </button>
          <button
            type="button"
            onClick={() => {
              A.rotateLeft();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="rotateLeft90" size={16} />
            <span>Rotate left 90°</span>
          </button>
          <button
            type="button"
            onClick={() => {
              A.rotate180();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="rotate180" size={16} />
            <span>Rotate 180°</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="rotateCustom" size={16} />
            <span>Rotate custom</span>
          </button>
        </div>
      )}
    </div>
  );
}

function FlipDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
        title="Flip"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-[22px] min-w-[36px] items-center justify-between gap-1 rounded px-1.5 text-ink transition-colors hover:bg-hover ${
          open ? "bg-hover ring-1 ring-hairline" : ""
        }`}
      >
        <Icon name="flip" size={14} />
        <Icon name="chevronDown" size={8} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-40 rounded-md border border-hairline bg-surface-raised py-1 shadow-xl text-ink"
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              A.flipVertical();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="flipVertical" size={16} />
            <span>Flip vertical</span>
          </button>
          <button
            type="button"
            onClick={() => {
              A.flipHorizontal();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-hover"
          >
            <Icon name="flipHorizontal" size={16} />
            <span>Flip horizontal</span>
          </button>
        </div>
      )}
    </div>
  );
}

function BrushStrokePreview({ type }: { type: BrushType }) {
  switch (type) {
    case "brush":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "calligraphy1":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 13.5 C 20 11, 26 4, 38 12 C 48 18.5, 58 17, 70 10.5"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M 22 7 C 32 10, 42 18, 52 17"
            stroke="currentColor"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "calligraphy2":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 14 C 24 8, 48 16, 70 10"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="square"
          />
        </svg>
      );
    case "airbrush": {
      const dots = [
        { cx: 7, cy: 11, r: 0.6, o: 0.4 }, { cx: 9, cy: 10, r: 0.8, o: 0.7 }, { cx: 12, cy: 9, r: 0.5, o: 0.3 },
        { cx: 14, cy: 8, r: 0.7, o: 0.8 }, { cx: 16, cy: 7, r: 0.6, o: 0.5 }, { cx: 18, cy: 7.5, r: 0.9, o: 0.9 },
        { cx: 20, cy: 6.5, r: 0.5, o: 0.4 }, { cx: 22, cy: 7, r: 0.7, o: 0.7 }, { cx: 24, cy: 8, r: 0.8, o: 0.85 },
        { cx: 27, cy: 9, r: 0.6, o: 0.6 }, { cx: 30, cy: 11, r: 0.7, o: 0.75 }, { cx: 33, cy: 13, r: 0.9, o: 0.9 },
        { cx: 36, cy: 15, r: 0.6, o: 0.5 }, { cx: 39, cy: 17, r: 0.8, o: 0.8 }, { cx: 42, cy: 18, r: 0.7, o: 0.7 },
        { cx: 45, cy: 18.5, r: 0.9, o: 0.85 }, { cx: 48, cy: 18, r: 0.5, o: 0.4 }, { cx: 51, cy: 17, r: 0.8, o: 0.75 },
        { cx: 54, cy: 16, r: 0.7, o: 0.8 }, { cx: 57, cy: 14.5, r: 0.6, o: 0.6 }, { cx: 60, cy: 13, r: 0.8, o: 0.8 },
        { cx: 63, cy: 12, r: 0.7, o: 0.7 }, { cx: 66, cy: 11.5, r: 0.6, o: 0.5 }, { cx: 69, cy: 11, r: 0.5, o: 0.4 },
        { cx: 15, cy: 5, r: 0.5, o: 0.3 }, { cx: 21, cy: 4.5, r: 0.4, o: 0.25 }, { cx: 25, cy: 6, r: 0.5, o: 0.3 },
        { cx: 38, cy: 14, r: 0.5, o: 0.35 }, { cx: 44, cy: 21, r: 0.4, o: 0.25 }, { cx: 46, cy: 16, r: 0.5, o: 0.3 },
        { cx: 50, cy: 20.5, r: 0.4, o: 0.3 }, { cx: 55, cy: 18, r: 0.5, o: 0.35 }, { cx: 62, cy: 10, r: 0.4, o: 0.25 }
      ];
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="currentColor">
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="1 3"
            opacity="0.5"
            fill="none"
          />
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={d.r} opacity={d.o} />
          ))}
        </svg>
      );
    }
    case "oil":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 10 C 24 3.5, 48 17.5, 70 10.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M 6 14 C 24 6.5, 48 20.5, 70 13.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.8"
          />
        </svg>
      );
    case "crayon":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="2.5 1.5 1 2 3 1.5"
          />
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="1 2.5 2 1"
            opacity="0.75"
          />
        </svg>
      );
    case "marker":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 13 C 24 6, 48 20, 70 13"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="square"
            opacity="0.55"
          />
        </svg>
      );
    case "naturalPencil":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeDasharray="1 3"
            opacity="0.45"
          />
        </svg>
      );
    case "watercolor":
      return (
        <svg width="76" height="24" viewBox="0 0 76 24" fill="none">
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.25"
          />
          <path
            d="M 6 12 C 24 5, 48 19, 70 12"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      );
  }
}

const BRUSH_ITEMS: { id: BrushType; label: string }[] = [
  { id: "brush", label: "Brush" },
  { id: "calligraphy1", label: "Calligraphy brush" },
  { id: "calligraphy2", label: "Calligraphy pen" },
  { id: "airbrush", label: "Airbrush" },
  { id: "oil", label: "Oil brush" },
  { id: "crayon", label: "Crayon" },
  { id: "marker", label: "Marker" },
  { id: "naturalPencil", label: "Natural pencil" },
  { id: "watercolor", label: "Watercolor brush" },
];

function BrushDropdown() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const brushType = usePaintStore((s) => s.brushType);
  const setBrushType = usePaintStore((s) => s.setBrushType);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isBrushActive = activeToolId === "brush";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
        title="Brushes"
        onClick={() => setOpen((v) => !v)}
        className={`flex flex-col items-center justify-between rounded p-1 transition-colors ${
          open
            ? "bg-hover text-ink ring-1 ring-hairline"
            : isBrushActive
              ? "bg-accent/20 text-accent ring-1 ring-inset ring-accent/50"
              : "text-ink hover:bg-hover active:bg-hover"
        }`}
        style={{ height: "46px", width: "44px" }}
      >
        <div className="flex flex-1 items-center justify-center">
          <Icon name="brushTip" size={20} />
        </div>
        <Icon name="chevronDown" size={10} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-hairline bg-surface-raised py-1 shadow-xl text-ink"
          role="menu"
        >
          {BRUSH_ITEMS.map((item) => {
            const isSelected = isBrushActive && brushType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setBrushType(item.id);
                  setOpen(false);
                }}
                className={`relative flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-hover ${
                  isSelected ? "bg-neutral-500/10 font-medium text-ink" : "text-ink"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0.5 top-1.5 bottom-1.5 w-1 rounded-full bg-accent" />
                )}
                <span className="text-xs pl-1">{item.label}</span>
                <BrushStrokePreview type={item.id} />
              </button>
            );
          })}
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

      {/* 2. Image Group: Crop, Remove Background, Rotate, Flip, Resize */}
      <Group label="Image">
        <div className="flex items-center gap-1">
          {/* Column 1: Crop (top), Remove background (bottom) */}
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              title="Crop to selection"
              disabled={!hasSelection}
              onClick={() => A.crop()}
              className="flex h-[22px] w-[26px] items-center justify-center rounded text-ink transition-colors hover:bg-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              <Icon name="crop" size={14} />
            </button>
            <button
              type="button"
              title="Remove background"
              onClick={() => A.toggleTransparentSelection()}
              className="flex h-[22px] w-[26px] items-center justify-center rounded text-ink transition-colors hover:bg-hover"
            >
              <Icon name="removeBackground" size={14} />
            </button>
          </div>

          {/* Column 2: Rotate dropdown (top), Flip dropdown (bottom) */}
          <div className="flex flex-col gap-0.5">
            <RotateDropdown />
            <FlipDropdown />
          </div>

          {/* Column 3: Resize (full-height tile) */}
          <button
            type="button"
            title="Resize canvas & image"
            onClick={() => A.openResizeDialog()}
            className="flex flex-col items-center justify-center rounded p-1 text-ink transition-colors hover:bg-hover active:bg-neutral-500/15"
            style={{ height: "46px", width: "44px" }}
          >
            <Icon name="resize" size={24} />
          </button>
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
        <BrushDropdown />
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
