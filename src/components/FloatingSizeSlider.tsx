import React, { useState } from "react";
import { usePaintStore } from "../state/store";
import { isShapeTool } from "../tools/registry";

export function FloatingSizeSlider() {
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const brushSize = usePaintStore((s) => s.brushSize);
  const setBrushSize = usePaintStore((s) => s.setBrushSize);
  const shapeSize = usePaintStore((s) => s.shapeSize);
  const setShapeSize = usePaintStore((s) => s.setShapeSize);

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isShape =
    activeToolId === "line" ||
    activeToolId === "curve" ||
    isShapeTool(activeToolId);
  const isFreehand = !isShape;

  const currentSize = isFreehand ? brushSize : shapeSize;
  const min = 1;
  const max = isFreehand ? 600 : 64;

  // Convert raw brush size to slider percentage (0 to 100) using quadratic curve
  const sizeToSlider = (size: number) => {
    const fraction = (size - min) / (max - min);
    return Math.round(Math.sqrt(Math.max(0, Math.min(1, fraction))) * 100);
  };

  // Convert slider percentage (0 to 100) to actual brush size
  const sliderToSize = (val: number) => {
    const t = Math.max(0, Math.min(100, val)) / 100;
    return Math.max(min, Math.min(max, Math.round(min + t * t * (max - min))));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = sliderToSize(Number(e.target.value));
    if (isFreehand) {
      setBrushSize(newSize);
    } else {
      setShapeSize(newSize);
    }
  };

  return (
    <div
      className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center rounded-full bg-surface/85 py-3 px-1.5 shadow-lg backdrop-blur-md select-none transition-all"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: "38px" }}
    >
      {/* Top Wavy Stroke Icon */}
      <div className="mb-2 flex flex-col items-center gap-0.5 text-ink opacity-70">
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

      {/* Native WebKit Vertical Range Slider */}
      <div className="relative flex items-center justify-center py-1">
        <input
          type="range"
          min={0}
          max={100}
          value={sizeToSlider(currentSize)}
          onChange={handleChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="cursor-pointer"
          style={{
            WebkitAppearance: "slider-vertical",
            width: "16px",
            height: "220px",
            accentColor: "#0078d4",
          }}
          title={`${currentSize}px`}
        />
      </div>

      {/* Size Tooltip Badge */}
      {(isHovered || isDragging) && (
        <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-surface shadow-md pointer-events-none">
          {currentSize}px
        </div>
      )}
    </div>
  );
}
