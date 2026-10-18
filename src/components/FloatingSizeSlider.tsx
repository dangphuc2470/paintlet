import React, { useState } from "react";
import { usePaintStore } from "../state/store";
import { isShapeTool } from "../tools/registry";
import { Icon } from "./Icon";

export function FloatingSizeSlider() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const brushSize = usePaintStore((s) => s.brushSize);
  const setBrushSize = usePaintStore((s) => s.setBrushSize);
  const brushOpacity = usePaintStore((s) => s.brushOpacity);
  const setBrushOpacity = usePaintStore((s) => s.setBrushOpacity);
  const shapeSize = usePaintStore((s) => s.shapeSize);
  const setShapeSize = usePaintStore((s) => s.setShapeSize);

  const [hoveredSlider, setHoveredSlider] = useState<"size" | "opacity" | null>(null);
  const [draggingSlider, setDraggingSlider] = useState<"size" | "opacity" | null>(null);

  // Responsive layout based on vertical room:
  // If enough vertical space (height >= 650px): stack vertically (flex-col) to stay compact horizontally.
  // If not enough vertical space (height < 650px): place side-by-side (flex-row).
  const [hasVerticalSpace, setHasVerticalSpace] = useState(
    typeof window !== "undefined" ? window.innerHeight >= 650 : true,
  );

  React.useEffect(() => {
    const handleResize = () => {
      setHasVerticalSpace(window.innerHeight >= 650);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sliderHeight = hasVerticalSpace ? "120px" : "180px";

  const isShape =
    activeToolId === "line" ||
    activeToolId === "curve" ||
    isShapeTool(activeToolId);
  const isFreehand = !isShape;

  const currentSize = isFreehand ? brushSize : shapeSize;
  const min = 1;
  const max = isFreehand ? 600 : 64;

  // Quadratic conversion for size
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

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBrushOpacity(Number(e.target.value));
  };

  return (
    <div
      className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 flex ${
        hasVerticalSpace ? "flex-col" : "flex-row"
      } items-center gap-2 select-none pointer-events-auto transition-all`}
    >
      {/* 1. Size Slider Pill */}
      <div
        className={`relative flex flex-col items-center rounded-full bg-surface/90 ${
          hasVerticalSpace ? "py-2" : "py-3"
        } px-1.5 shadow-lg backdrop-blur-md border border-hairline/60 transition-all`}
        onMouseEnter={() => setHoveredSlider("size")}
        onMouseLeave={() => setHoveredSlider((curr) => (curr === "size" ? null : curr))}
        style={{ width: "38px" }}
      >
        {/* Top Wavy Stroke Icon */}
        <div className="mb-1.5 flex flex-col items-center gap-0.5 text-ink/75" title="Brush size">
          <svg
            width="18"
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
        </div>

        {/* Vertical Range Slider */}
        <div className="relative flex items-center justify-center py-1">
          <input
            type="range"
            min={0}
            max={100}
            value={sizeToSlider(currentSize)}
            onChange={handleSizeChange}
            onMouseDown={() => setDraggingSlider("size")}
            onMouseUp={() => setDraggingSlider(null)}
            onTouchStart={() => setDraggingSlider("size")}
            onTouchEnd={() => setDraggingSlider(null)}
            className="cursor-pointer"
            style={{
              WebkitAppearance: "slider-vertical",
              width: "16px",
              height: sliderHeight,
              accentColor: "#0078d4",
            }}
            title={`Size: ${currentSize}px`}
          />
        </div>

        {/* Size Tooltip Badge */}
        {(hoveredSlider === "size" || draggingSlider === "size") && (
          <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-surface shadow-md pointer-events-none z-40">
            {currentSize}px
          </div>
        )}
      </div>

      {/* 2. Opacity Slider Pill (Windows 11 Paint style) */}
      <div
        className={`relative flex flex-col items-center rounded-full bg-surface/90 ${
          hasVerticalSpace ? "py-2" : "py-3"
        } px-1.5 shadow-lg backdrop-blur-md border border-hairline/60 transition-all`}
        onMouseEnter={() => setHoveredSlider("opacity")}
        onMouseLeave={() => setHoveredSlider((curr) => (curr === "opacity" ? null : curr))}
        style={{ width: "38px" }}
      >
        {/* Top Water Droplet Icon */}
        <div className="mb-1.5 flex flex-col items-center text-ink/75" title="Brush opacity">
          <Icon name="opacity" size={16} />
        </div>

        {/* Vertical Range Slider */}
        <div className="relative flex items-center justify-center py-1">
          <input
            type="range"
            min={1}
            max={100}
            value={brushOpacity}
            onChange={handleOpacityChange}
            onMouseDown={() => setDraggingSlider("opacity")}
            onMouseUp={() => setDraggingSlider(null)}
            onTouchStart={() => setDraggingSlider("opacity")}
            onTouchEnd={() => setDraggingSlider(null)}
            className="cursor-pointer"
            style={{
              WebkitAppearance: "slider-vertical",
              width: "16px",
              height: sliderHeight,
              accentColor: "#0078d4",
            }}
            title={`Opacity: ${brushOpacity}%`}
          />
        </div>

        {/* Opacity Tooltip Badge */}
        {(hoveredSlider === "opacity" || draggingSlider === "opacity") && (
          <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-surface shadow-md pointer-events-none z-40">
            {brushOpacity}%
          </div>
        )}
      </div>
    </div>
  );
}
