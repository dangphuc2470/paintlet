import type { ReactNode } from "react";

// Minimal stroke-based icon set (Lucide-style geometry). Inline SVG rather than
// a font so glyphs render identically across the webview and inherit
// currentColor — the clean, consistent look the "macOS clothing" goal wants.
export type IconName =
  | "undo"
  | "redo"
  | "pencil"
  | "brush"
  | "fill"
  | "text"
  | "eraser"
  | "eyedropper"
  | "line"
  | "curve"
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "polygon"
  | "select"
  | "lasso"
  | "selectAll"
  | "swap"
  | "close"
  | "save"
  | "share"
  | "crop"
  | "resize"
  | "rotate"
  | "rotateRight90"
  | "rotateLeft90"
  | "rotate180"
  | "rotateCustom"
  | "flip"
  | "flipVertical"
  | "flipHorizontal"
  | "removeBackground"
  | "brushes"
  | "brushTip"
  | "opacity"
  | "transparentSelection"
  | "chevronDown"
  | "check"
  | "trash";

const PATHS: Record<IconName, ReactNode> = {
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  pencil: (
    <>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
  brush: (
    <>
      <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
      <path d="M9 8c-2 3-4 3.5-7 4l8 8c1-3 1.5-5 4-7" />
      <path d="M14.5 17.5 4.5 15" />
    </>
  ),
  fill: (
    <>
      <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11Z" />
      <path d="m5 2 5 5" />
      <path d="M2 13h15" />
      <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
    </>
  ),
  text: (
    <>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4.3-4.3a1.7 1.7 0 0 1 0-2.4l9.3-9.3a1.7 1.7 0 0 1 2.4 0l5.6 5.6a1.7 1.7 0 0 1 0 2.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </>
  ),
  eyedropper: (
    <>
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </>
  ),
  line: <path d="M5 19 19 5" />,
  curve: <path d="M4 20C9 6 15 18 20 4" />,
  rectangle: <rect x="3" y="4" width="18" height="16" rx="1.5" />,
  roundedRectangle: <rect x="3" y="4" width="18" height="16" rx="5.5" />,
  ellipse: <circle cx="12" cy="12" r="9" />,
  polygon: <path d="M12 3l9 6.5-3.5 10.5h-11L3 9.5Z" />,
  // Marquee: a dashed rectangle — the classic "select" cue.
  select: (
    <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="3.5 3" />
  ),
  // Free-form marquee: a dashed irregular loop.
  lasso: (
    <path
      d="M12 4c5 0 9 2.5 9 6s-4 6-9 6c-3 0-5.5-.8-7.2-2C3.6 13.2 3 12 3 10c0-3.5 4-6 9-6Zm-7 10.5c-1 1.5-1.5 3.5-1.5 5.5"
      strokeDasharray="3.5 3"
    />
  ),
  selectAll: (
    <rect x="3" y="3" width="18" height="18" rx="1.5" strokeDasharray="3.5 3" />
  ),
  transparentSelection: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.5" strokeDasharray="3.5 3" />
      <path d="m4 14 10-10" />
      <path d="m10 20 10-10" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4 4 7l3 3" />
      <path d="M4 7h13" />
      <path d="m17 20 3-3-3-3" />
      <path d="M20 17H7" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  resize: (
    <>
      {/* Dashed outer bracket corners (top-left & bottom-right) */}
      <path
        d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7 M10 3h2 M21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H17 M21 13v-2 M14 21h-2"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* Picture card (bottom-left) */}
      <rect
        x="3"
        y="9"
        width="13"
        height="12"
        rx="2.5"
        stroke="var(--vp-accent)"
        strokeWidth={1.5}
        fill="none"
      />
      {/* Sun dot inside picture */}
      <circle
        cx="12.5"
        cy="12.5"
        r="1.2"
        fill="var(--vp-accent)"
        stroke="none"
      />
      {/* Mountain wave inside picture */}
      <path
        d="M4.5 18.5c1.8-3 3.8-3.5 5.5-1.5s3 0.5 4.5-1.5"
        stroke="var(--vp-accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      {/* Resize expansion arrow (top-right) */}
      <path
        d="M15 4h5v5 M20 4l-6 6"
        stroke="var(--vp-accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  rotate: (
    <>
      <path d="M8 5c2-1.5 5-1.5 7 0l2 2" />
      <polyline points="17 3 17 7 13 7" />
      <path d="M4 19h16V12z" fill="var(--vp-accent)" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  rotateRight90: (
    <>
      <path d="M8 5c2-1.5 5-1.5 7 0l2 2" />
      <polyline points="17 3 17 7 13 7" />
      <path d="M4 19h16V12z" fill="var(--vp-accent)" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  rotateLeft90: (
    <>
      <path d="M16 5c-2-1.5-5-1.5-7 0L7 7" />
      <polyline points="7 3 7 7 11 7" />
      <path d="M20 19H4V12z" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  rotate180: (
    <>
      <path d="M10 5 4 19h6z" stroke="currentColor" fill="none" strokeWidth={1.5} />
      <path d="M14 5v14l6-14z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  rotateCustom: (
    <>
      <circle cx="12" cy="13" r="1.5" fill="currentColor" />
      <path d="M12 6a7 7 0 1 1-5 2.1" />
      <polyline points="7 4 7 8.5 11.5 8.5" />
    </>
  ),
  flip: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth={1.5} />
      <path d="M4 12 19 6v6z" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M4 12 19 18v-6z" fill="var(--vp-accent)" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  flipVertical: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth={1.5} />
      <path d="M4 12 19 6v6z" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M4 12 19 18v-6z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  flipHorizontal: (
    <>
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth={1.5} />
      <path d="M12 4 6 19h6z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} />
      <path d="M12 4 18 19h-6z" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </>
  ),
  removeBackground: (
    <>
      <path d="M3 7l4-4 M3 13l10-10 M3 19l16-16 M9 21l12-12 M15 21l6-6" stroke="currentColor" strokeWidth={1.2} />
      <circle cx="12" cy="10" r="3" fill="var(--vp-surface)" stroke="var(--vp-accent)" strokeWidth={1.5} />
      <path d="M7 19a5 5 0 0 1 10 0" fill="var(--vp-surface)" stroke="var(--vp-accent)" strokeWidth={1.5} />
    </>
  ),
  brushes: (
    <>
      <path d="M14 2v6" />
      <path d="M10 4v4" />
      <rect x="5" y="8" width="14" height="13" rx="2" />
      <path d="M5 13h14" />
    </>
  ),
  brushTip: (
    <>
      {/* Ferrule (top collar) */}
      <rect x="7" y="3" width="10" height="5" rx="1" strokeWidth={1.5} />
      <line x1="7" y1="5.5" x2="17" y2="5.5" strokeWidth={1} />
      {/* Bristle bundle tapering down */}
      <path d="M8 8c0 4 1 8 4 12 3-4 4-8 4-12z" strokeWidth={1.5} fill="none" />
      {/* Inner hair texture lines */}
      <path d="M12 8v8 M10 8c0 2.5 0.5 5 2 7" strokeWidth={1} opacity={0.6} />
    </>
  ),
  opacity: (
    <>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </>
  ),
  chevronDown: (
    <>
      <path d="m6 9 6 6 6-6" />
    </>
  ),
  check: (
    <>
      <polyline points="20 6 9 17 4 12" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
