import type { ReactNode } from "react";
import { usePaintStore } from "../state/store";
import { isImplemented, isShapeTool } from "../tools/registry";
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

function SizeAndOpacityControls() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const brushSize = usePaintStore((s) => s.brushSize);
  const setBrushSize = usePaintStore((s) => s.setBrushSize);
  const shapeSize = usePaintStore((s) => s.shapeSize);
  const setShapeSize = usePaintStore((s) => s.setShapeSize);
  const brushOpacity = usePaintStore((s) => s.brushOpacity);
  const setBrushOpacity = usePaintStore((s) => s.setBrushOpacity);

  const isShape =
    activeToolId === "line" ||
    activeToolId === "curve" ||
    isShapeTool(activeToolId);
  const isFreehand = !isShape;

  const currentSize = isFreehand ? brushSize : shapeSize;
  const min = 1;
  const max = isFreehand ? 600 : 64;

  const sizeToSlider = (size: number) => {
    const fraction = (size - min) / (max - min);
    return Math.round(Math.sqrt(Math.max(0, Math.min(1, fraction))) * 100);
  };

  const sliderToSize = (val: number) => {
    const t = Math.max(0, Math.min(100, val)) / 100;
    return Math.max(min, Math.min(max, Math.round(min + t * t * (max - min))));
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = sliderToSize(Number(e.target.value));
    if (isFreehand) {
      setBrushSize(newSize);
    } else {
      setShapeSize(newSize);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      {/* Size Slider */}
      <div className="flex items-center gap-1.5 text-ink">
        <span title="Stroke size" className="flex items-center text-ink-muted">
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 16"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
          >
            <path d="M2 3 Q 6 1, 10 3 T 18 3" strokeWidth="1.2" />
            <path d="M2 8 Q 6 5.5, 10 8 T 18 8" strokeWidth="2.2" />
            <path d="M2 13 Q 6 10.5, 10 13 T 18 13" strokeWidth="3.4" />
          </svg>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={sizeToSlider(currentSize)}
          onChange={handleSizeChange}
          className="h-1.5 w-20 cursor-pointer accent-[#0078d4]"
          title={`Size: ${currentSize}px`}
        />
        <span className="w-8 text-[11px] font-mono tabular-nums text-ink-muted">
          {currentSize}px
        </span>
      </div>

      {/* Opacity Slider (located to the right of size, wraps if narrow) */}
      <div className="flex items-center gap-1.5 text-ink">
        <span title="Opacity" className="flex items-center text-ink-muted">
          <Icon name="opacity" size={13} />
        </span>
        <input
          type="range"
          min={1}
          max={100}
          value={brushOpacity}
          onChange={(e) => setBrushOpacity(Number(e.target.value))}
          className="h-1.5 w-20 cursor-pointer accent-[#0078d4]"
          title={`Opacity: ${brushOpacity}%`}
        />
        <span className="w-8 text-[11px] font-mono tabular-nums text-ink-muted">
          {brushOpacity}%
        </span>
      </div>
    </div>
  );
}

export function Toolbar() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const setTool = usePaintStore((s) => s.setTool);
  const hasSelection = usePaintStore((s) => s.hasSelection);
  const transparentSelection = usePaintStore((s) => s.transparentSelection);

  return (
    <div className="flex shrink-0 items-stretch gap-1 border-b border-hairline bg-surface px-2 py-1.5 select-none">
      {/* 1. Selection Group */}
      <Group label="Selection">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Rectangle selection (S)"
            onClick={() => setTool("select")}
            className={`flex flex-col items-center justify-center rounded px-2 py-1 transition-colors ${
              activeToolId === "select" || activeToolId === "freeSelect"
                ? "bg-neutral-500/20 text-accent font-medium shadow-xs"
                : "text-ink hover:bg-neutral-500/10 active:bg-neutral-500/20"
            }`}
            style={{ height: "46px", width: "44px" }}
          >
            <Icon name="select" size={20} />
            <Icon name="chevronDown" size={10} />
          </button>

          {/* Quick Select Aux Buttons */}
          <div className="flex flex-col gap-0.5">
            <ToolButton
              title="Free-form selection (Lasso)"
              active={activeToolId === "freeSelect"}
              onClick={() => setTool("freeSelect")}
            >
              <Icon name="lasso" size={14} />
            </ToolButton>
            <ToolButton
              title={
                transparentSelection
                  ? "Transparent selection: ON (Color 2 is transparent)"
                  : "Transparent selection: OFF (Background is opaque)"
              }
              active={transparentSelection}
              onClick={A.toggleTransparentSelection}
            >
              <span className="text-[10px] font-bold">Tr</span>
            </ToolButton>
          </div>
        </div>
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
              ? "bg-neutral-500/20 text-accent font-medium shadow-xs"
              : "text-ink hover:bg-neutral-500/10 active:bg-neutral-500/20"
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

      <Divider />

      {/* 6. Size & Opacity Group */}
      <Group label="Size">
        <SizeAndOpacityControls />
      </Group>

      <ContextGroup />

      {/* 7. Colors Group, pushed to the right */}
      <div className="ml-auto flex items-stretch">
        <Divider />
        <Group label="Colors">
          <ColorControls />
        </Group>
      </div>
    </div>
  );
}
