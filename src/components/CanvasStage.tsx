import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { engine, usePaintStore } from "../state/store";
import { stageHooks } from "../state/stageHooks";
import { viewport } from "../state/viewport";
import { screenToCanvas } from "../engine/coords";
import { getTool, isShapeTool } from "../tools/registry";
import { clampZoom } from "../lib/zoom";
import { rgbToHex } from "../engine/color";
import { HANDLE_CURSOR, selectionHandles, type HandleId } from "../engine/selectionHandles";
import type { MouseButton, Point, Rect, TextStyle, ToolId } from "../engine/types";
import type { PointerInfo, ToolContext } from "../tools/Tool";

// The resize-grip cursor under a point on a selection, or null. Mirrors
// SelectTool.hitHandle so the pointer telegraphs a grab before the drag.
function handleCursorAt(p: Point, r: Rect, zoom: number): string | null {
  const tol = 6 / zoom;
  for (const h of selectionHandles(r)) {
    if (Math.abs(p.x - h.x) <= tol && Math.abs(p.y - h.y) <= tol)
      return HANDLE_CURSOR[h.id];
  }
  return null;
}

// Multi-line spacing factor for the text tool (matches the editor and raster).
const LINE_HEIGHT = 1.2;

const fontString = (ts: TextStyle, scale = 1) =>
  `${ts.italic ? "italic " : ""}${ts.bold ? "bold " : ""}${ts.fontSize * scale}px ${ts.fontFamily}`;

type TextEdit = { cx: number; cy: number; value: string };

// Hosts the stacked base + overlay + selection canvases and owns all pointer
// plumbing: map screen → logical coords, build a ToolContext from current store
// state, and dispatch to the active tool. Text is special-cased (a floating DOM
// editor), and the selection layer draws marching ants on an animation loop.
export function CanvasStage() {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const selectionRef = useRef<HTMLCanvasElement>(null);
  const selectionMarqueeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drawing = useRef(false);

  // Pointer-move / hover previews are coalesced to one animation frame (see
  // scheduleMove): raw pointer events fire faster than 60fps, and a full overlay
  // clear + shape re-stroke per event made the curve/polygon preview lag.
  const moveRaf = useRef(0);
  const lastPointer = useRef<{
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    buttons: number;
    button: number;
  } | null>(null);

  // Live color preview shown beside the eyedropper (client coords + sampled hex).
  const [dropper, setDropper] = useState<{
    cx: number;
    cy: number;
    color: string;
  } | null>(null);

  // Direct DOM ref for zero-latency 120Hz/240Hz preview ring tracking
  const previewRef = useRef<HTMLDivElement>(null);

  // Drag state for repositioning the floating text box before it's committed.
  const textDrag = useRef<{
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  // — panning (space-drag or middle-drag) —
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false); // handler-readable mirror of spaceHeld
  const [panning, setPanning] = useState(false);
  const pan = useRef<{
    id: number;
    x: number;
    y: number;
    sl: number;
    st: number;
  } | null>(null);

  // Zoom-at-cursor: the image point that must stay under this client position
  // across the re-render that applies a new zoom.
  const zoomAnchor = useRef<{
    clientX: number;
    clientY: number;
    ix: number;
    iy: number;
  } | null>(null);

  // — canvas drag-resize handles (all four corners + four edges of the paper) —
  // Dragging shows a dashed preview of the target bounds; the canvas is cropped
  // or extended (white fill) on release. Right/bottom handles keep the top-left
  // anchored; top/left handles offset the content so the opposite edge stays
  // put. The preview rect is in the current canvas's coordinate space, so its
  // x/y go negative when a top/left handle extends past the origin.
  const [resizePreview, setResizePreview] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const resizeDrag = useRef<{
    dir: HandleId;
    startW: number;
    startH: number;
    sx: number;
    sy: number;
  } | null>(null);
  // Cursor to force on the whole work area while a canvas-resize handle is being
  // dragged (pointer capture otherwise reverts it to the tool cursor once the
  // pointer leaves the little grip).
  const [canvasResizeCursor, setCanvasResizeCursor] = useState<string | null>(
    null,
  );
  // Cursor when hovering a selection resize grip (before the drag begins).
  const [handleCursor, setHandleCursor] = useState<string | null>(null);

  const { w, h } = usePaintStore((s) => s.imageSize);
  const zoom = usePaintStore((s) => s.view.zoom);
  const activeToolId = usePaintStore((s) => s.activeToolId);
  const brushSize = usePaintStore((s) => s.brushSize);
  const shapeSize = usePaintStore((s) => s.shapeSize);
  const color1 = usePaintStore((s) => s.color1);
  const textStyle = usePaintStore((s) => s.textStyle);
  const hasSelection = usePaintStore((s) => s.hasSelection);

  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  // Mirror into a ref so the tool-switch effect can read the latest edit
  // without re-subscribing.
  const textEditRef = useRef<TextEdit | null>(null);
  textEditRef.current = textEdit;

  // Bind the engine to the three canvases once, on mount. Programmatic resizes
  // (Open / Resize / Crop / undo) are handled inside the engine, which resizes
  // the backing stores directly — so this must NOT re-run on size changes or it
  // would wipe the pixels.
  useEffect(() => {
    if (baseRef.current && overlayRef.current && selectionRef.current) {
      const s = usePaintStore.getState().imageSize;
      engine.attach(
        baseRef.current,
        overlayRef.current,
        selectionRef.current,
        s.w,
        s.h,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot the current config into a ToolContext for the active action.
  const makeCtx = (): ToolContext => {
    const s = usePaintStore.getState();
    // Shapes use the discrete size selector; pencil/brush/eraser use the slider.
    const size = isShapeTool(s.activeToolId) ? s.shapeSize : s.brushSize;
    return {
      base: engine.base,
      overlay: engine.overlay,
      engine,
      color1: s.color1,
      color2: s.color2,
      size,
      zoom: s.view.zoom,
      clearPreview: () => engine.clearOverlay(),
      commit: (label, crisp) => engine.commit(label, crisp),
      setColor1: (c) => s.setColor1(c),
      setColor2: (c) => s.setColor2(c),
    };
  };

  // Measure the editor box (logical px) so the floating textarea matches what
  // the rasterized text will occupy.
  const measureBox = (value: string, ts: TextStyle) => {
    const o = engine.overlay;
    o.save();
    o.font = fontString(ts);
    const lines = value.length ? value.split("\n") : [""];
    const width = Math.max(1, ...lines.map((l) => o.measureText(l).width));
    o.restore();
    const lh = Math.round(ts.fontSize * LINE_HEIGHT);
    return { w: Math.ceil(width) + 2, h: lines.length * lh };
  };

  // Rasterize an in-progress text edit onto the base and record a history step.
  const commitText = (t: TextEdit) => {
    if (!t.value.trim()) return;
    const s = usePaintStore.getState();
    const ts = s.textStyle;
    const o = engine.overlay;
    const lh = Math.round(ts.fontSize * LINE_HEIGHT);
    const pad = (lh - ts.fontSize) / 2; // center each line in its line box
    const ruleW = Math.max(1, Math.round(ts.fontSize / 14)); // decoration thickness
    o.save();
    o.fillStyle = s.color1;
    o.textBaseline = "top";
    o.font = fontString(ts);
    t.value.split("\n").forEach((line, i) => {
      const top = t.cy + i * lh + pad;
      o.fillText(line, t.cx, top);
      // Canvas text has no underline/strike; draw them as crisp rules spanning
      // the measured line width, under and through the glyphs.
      if ((ts.underline || ts.strike) && line.length) {
        const w = o.measureText(line).width;
        if (ts.underline)
          o.fillRect(t.cx, Math.round(top + ts.fontSize * 0.92), w, ruleW);
        if (ts.strike)
          o.fillRect(t.cx, Math.round(top + ts.fontSize * 0.52), w, ruleW);
      }
    });
    o.restore();
    engine.commit("text");
  };

  // Expose the stage's private state to the action layer: committing a pending
  // text edit (before Save/New/Open/close) and cancelling an in-progress tool
  // session (before Undo/Redo). Selection tools are excluded from the latter —
  // their onDeactivate would bake the float and push a history step of its own.
  useEffect(() => {
    stageHooks.flushTextEdit = () => {
      if (textEditRef.current) {
        commitText(textEditRef.current);
        setTextEdit(null);
      }
    };
    stageHooks.cancelToolSession = () => {
      const id = usePaintStore.getState().activeToolId;
      if (id === "select" || id === "freeSelect" || id === "text") return;
      drawing.current = false;
      getTool(id)?.onDeactivate?.(makeCtx());
    };
    return () => {
      stageHooks.flushTextEdit = null;
      stageHooks.cancelToolSession = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commit the previous tool's pending state when the active tool changes:
  // freehand/shape cleanup, selection bake-down, and pending-text rasterization.
  // Exception (matches Win11 Paint): hopping between the marquee and the lasso
  // keeps the current selection — either tool can move what the other selected,
  // so skip the deactivate that would bake it down.
  const prevToolRef = useRef(activeToolId);
  useEffect(() => {
    const prev = prevToolRef.current;
    if (prev !== activeToolId) {
      const isSelect = (id: ToolId) => id === "select" || id === "freeSelect";
      if (prev === "text") {
        if (textEditRef.current) commitText(textEditRef.current);
        setTextEdit(null);
      } else if (!(isSelect(prev) && isSelect(activeToolId))) {
        getTool(prev)?.onDeactivate?.(makeCtx());
      }
      prevToolRef.current = activeToolId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeToolId]);

  // Animate the selection marquee (marching ants). Runs only while something is
  // selected/floating; also repaints the float on each frame so a drag-move
  // follows the pointer smoothly.
  useEffect(() => {
    if (!hasSelection) {
      engine.renderSelection(0);
      return;
    }
    let raf = 0;
    let lastTime = performance.now();
    let offset = 0;
    const loop = (time: number) => {
      const dt = Math.min(50, time - lastTime);
      lastTime = time;
      offset = (offset + dt * 0.008) % 8;
      engine.renderSelection(offset);
      if (selectionMarqueeRef.current && engine.selection) {
        const s = engine.selection;
        const curZoom = usePaintStore.getState().view.zoom;
        // left/top, not transform. A transformed box keeps WebKit from
        // re-resolving the edge grips' top/bottom when only the height changes,
        // so the midpoint dots stay put while the selection grows up or down.
        const boxW = Math.max(1, s.w * curZoom);
        const boxH = Math.max(1, s.h * curZoom);
        const marquee = selectionMarqueeRef.current;
        marquee.style.transform = "none";
        marquee.style.left = `${s.x * curZoom}px`;
        marquee.style.top = `${s.y * curZoom}px`;
        marquee.style.width = `${boxW}px`;
        marquee.style.height = `${boxH}px`;
        // Percentages (top/left: 50%) are not recomputed when only the height
        // changes, so the edge-midpoint grips stay where they were. Pin them
        // in pixels from the live box instead.
        const half = 3.5;
        for (const grip of marquee.querySelectorAll<HTMLElement>("[data-grip]")) {
          const id = grip.dataset.grip;
          if (id !== "n" && id !== "s" && id !== "e" && id !== "w") continue;
          grip.style.right = "auto";
          grip.style.bottom = "auto";
          grip.style.transform = "none";
          if (id === "n" || id === "s") grip.style.left = `${boxW / 2 - half}px`;
          if (id === "w") grip.style.left = `${-half}px`;
          if (id === "e") grip.style.left = `${boxW - half}px`;
          if (id === "n") grip.style.top = `${-half}px`;
          if (id === "s") grip.style.top = `${boxH - half}px`;
          if (id === "e" || id === "w") grip.style.top = `${boxH / 2 - half}px`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasSelection]);

  // The hover cursor (a resize grip or "move") only makes sense while a select
  // tool has something selected. Clear it on tool change or when the selection
  // goes away, so it can't linger over the next tool until the pointer moves.
  useEffect(() => {
    const isSelect = activeToolId === "select" || activeToolId === "freeSelect";
    if (!isSelect || !hasSelection) setHandleCursor(null);
    if (activeToolId !== "eyedropper") setDropper(null);
  }, [activeToolId, hasSelection]);

  // Focus the floating text editor when it's placed or repositioned (not on
  // every keystroke). preventScroll stops the browser from scrolling the work
  // area to reveal the editor, which used to shift the whole canvas.
  useEffect(() => {
    if (textEdit) textareaRef.current?.focus({ preventScroll: true });
    // Refocus on placement/drag (cx/cy change), not on typing (value change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textEdit?.cx, textEdit?.cy]);

  // Zoom gestures on the work area: ⌘/Ctrl-wheel (and Chromium's synthesized
  // ctrl-wheel for pinches) plus WebKit's native gesture events, which is what
  // the Tauri webview emits for a trackpad pinch. Both funnel through zoomAt so
  // the pixel under the pointer stays put. Registered manually because React
  // wheel listeners are passive (preventDefault would be ignored) and gesture
  // events have no React equivalent.
  useEffect(() => {
    const el = containerRef.current!;
    viewport.el = el;

    const zoomAt = (clientX: number, clientY: number, next: number) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const cur = usePaintStore.getState().view.zoom;
      const z = clampZoom(next);
      if (z === cur) return;
      const rect = overlay.getBoundingClientRect();
      zoomAnchor.current = {
        clientX,
        clientY,
        ix: (clientX - rect.left) / cur,
        iy: (clientY - rect.top) / cur,
      };
      usePaintStore.getState().setZoom(z);
    };

    const onWheel = (e: WheelEvent) => {
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        shiftKey: e.shiftKey,
        buttons: e.buttons,
        button: e.button,
      };
      if (!e.ctrlKey && !e.metaKey) {
        updatePreviewPos(e.clientX, e.clientY);
        return; // plain scroll keeps scrolling
      }
      e.preventDefault();
      // Normalize the delta: mouse wheels report deltaMode 1 (lines) or big
      // pixel steps (~100/notch); a trackpad pinch reports small pixel deltas.
      // Convert lines/pages to px, then clamp so one hard notch can't leap the
      // whole zoom range, and use a gentle factor so each step is modest.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → px
      else if (e.deltaMode === 2) dy *= el.clientHeight; // pages → px
      dy = Math.max(-48, Math.min(48, dy));
      const cur = usePaintStore.getState().view.zoom;
      zoomAt(e.clientX, e.clientY, cur * Math.exp(-dy * 0.0055));
    };

    // GestureEvent is WebKit-only and untyped; e.scale is relative to the
    // gesture's start, so anchor the factor to the zoom captured at start.
    let gestureStartZoom = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStartZoom = usePaintStore.getState().view.zoom;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      lastPointer.current = {
        clientX: g.clientX,
        clientY: g.clientY,
        shiftKey: false,
        buttons: 0,
        button: 0,
      };
      zoomAt(g.clientX, g.clientY, gestureStartZoom * g.scale);
    };
    const onGestureEnd = (e: Event) => e.preventDefault();

    const onScroll = () => {
      if (lastPointer.current) {
        updatePreviewPos(lastPointer.current.clientX, lastPointer.current.clientY);
        processMove();
      }
    };

    const onGlobalPointerMove = (e: PointerEvent) => {
      lastPointer.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        shiftKey: e.shiftKey,
        buttons: e.buttons,
        button: e.button,
      };
    };

    window.addEventListener("pointermove", onGlobalPointerMove, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      viewport.el = null;
      window.removeEventListener("pointermove", onGlobalPointerMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  // After a zoom-at-cursor renders, scroll so the anchored image point is back
  // under the pointer. Layout effect: must run before the frame paints.
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    if (a) {
      zoomAnchor.current = null;
      const el = containerRef.current;
      const overlay = overlayRef.current;
      if (el && overlay) {
        const rect = overlay.getBoundingClientRect();
        el.scrollLeft += rect.left + a.ix * zoom - a.clientX;
        el.scrollTop += rect.top + a.iy * zoom - a.clientY;
      }
    }
    if (lastPointer.current) {
      updatePreviewPos(lastPointer.current.clientX, lastPointer.current.clientY);
      processMove();
    }
  }, [zoom]);

  // Track the spacebar for space-drag panning (ignored while typing in a
  // field). Window blur releases it so a ⌘Tab away can't wedge pan mode on.
  useEffect(() => {
    const setHeld = (held: boolean) => {
      spaceHeldRef.current = held;
      setSpaceHeld(held);
    };
    const onDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (e.code !== "Space" || editable) return;
      e.preventDefault(); // space would otherwise scroll the work area
      setHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setHeld(false);
    };
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Pan gestures, in the capture phase so they win over the canvas tools:
  // space-drag or middle-button drag scrolls the work area directly.
  const onPanPointerDown = (e: React.PointerEvent) => {
    if (!spaceHeldRef.current && e.button !== 1) return;
    const el = containerRef.current!;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    pan.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sl: el.scrollLeft,
      st: el.scrollTop,
    };
    setPanning(true);
  };
  const onPanPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p || e.pointerId !== p.id) return;
    e.stopPropagation();
    const el = containerRef.current!;
    el.scrollLeft = p.sl - (e.clientX - p.x);
    el.scrollTop = p.st - (e.clientY - p.y);
  };
  const onPanPointerEnd = (e: React.PointerEvent) => {
    if (!pan.current || e.pointerId !== pan.current.id) return;
    e.stopPropagation();
    pan.current = null;
    setPanning(false);
    try {
      containerRef.current!.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
  };

  // Canvas-resize handle drag. Pointer capture keeps the gesture alive when the
  // cursor leaves the little handle. Which of the four edges a handle moves is
  // read from its compass id ("nw" moves top+left, "e" moves right, …). The
  // returned rect is in the current canvas's coordinate space: x/y are the new
  // top-left (negative when a top/left handle extends past the origin), so the
  // draw offset on commit is simply (-x, -y).
  const resizeTarget = (e: React.PointerEvent) => {
    const d = resizeDrag.current!;
    const z = usePaintStore.getState().view.zoom;
    const dx = (e.clientX - d.sx) / z;
    const dy = (e.clientY - d.sy) / z;
    const { dir } = d;
    let x0 = dir.includes("w") ? dx : 0;
    let y0 = dir.includes("n") ? dy : 0;
    let x1 = d.startW + (dir.includes("e") ? dx : 0);
    let y1 = d.startH + (dir.includes("s") ? dy : 0);
    // Never collapse below 1px — push whichever edge is actually being dragged.
    if (x1 - x0 < 1) {
      if (dir.includes("w")) x0 = x1 - 1;
      else x1 = x0 + 1;
    }
    if (y1 - y0 < 1) {
      if (dir.includes("n")) y0 = y1 - 1;
      else y1 = y0 + 1;
    }
    const x = Math.round(x0);
    const y = Math.round(y0);
    return { x, y, w: Math.round(x1) - x, h: Math.round(y1) - y };
  };
  const onHandleDown = (dir: HandleId) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeDrag.current = { dir, startW: w, startH: h, sx: e.clientX, sy: e.clientY };
    setResizePreview({ x: 0, y: 0, w, h });
    setCanvasResizeCursor(HANDLE_CURSOR[dir]);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!resizeDrag.current) return;
    e.stopPropagation();
    setResizePreview(resizeTarget(e));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = resizeDrag.current;
    if (!d) return;
    e.stopPropagation();
    const t = resizeTarget(e);
    resizeDrag.current = null;
    setResizePreview(null);
    setCanvasResizeCursor(null);
    if (t.w !== d.startW || t.h !== d.startH || t.x !== 0 || t.y !== 0)
      engine.setCanvasSizeAnchored(t.w, t.h, -t.x, -t.y);
  };

  // Keyboard shortcuts: Esc cancels in-progress actions; Arrow keys nudge selections
  // with acceleration and Windows 11 Shift-trail stamping.
  useEffect(() => {
    let arrowRepeatCount = 0;
    let lastArrowKey = "";

    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const activeId = usePaintStore.getState().activeToolId;

      // Arrow keys move active selection
      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        engine.hasSelectionOrFloat()
      ) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key !== lastArrowKey) {
          arrowRepeatCount = 0;
          lastArrowKey = e.key;
        } else {
          arrowRepeatCount++;
        }

        // Acceleration curve: 1px -> 2px -> 4px -> 8px when held
        const step =
          arrowRepeatCount < 4
            ? 1
            : arrowRepeatCount < 12
              ? 2
              : arrowRepeatCount < 24
                ? 4
                : 8;

        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;

        const color2 = usePaintStore.getState().color2;
        engine.nudgeSelection(dx, dy, e.shiftKey, color2);
        return;
      }

      if (e.key !== "Escape") return;
      if (drawing.current) {
        drawing.current = false;
        getTool(activeId)?.onDeactivate?.(makeCtx());
        engine.clearOverlay();
        return;
      }
      getTool(activeId)?.onKeyDown?.(e, makeCtx());
      if (
        (activeId === "select" || activeId === "freeSelect") &&
        engine.hasSelectionOrFloat()
      ) {
        engine.deselect();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        arrowRepeatCount = 0;
        lastArrowKey = "";
      }
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
    // makeCtx reads live store state, so an empty dep list is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttonOf = (e: React.PointerEvent): MouseButton =>
    e.button === 2 || (e.buttons & 2) === 2 ? "secondary" : "primary";

  const infoOf = (e: React.PointerEvent): PointerInfo => ({
    point: screenToCanvas(e.clientX, e.clientY, overlayRef.current!),
    button: buttonOf(e),
    shiftKey: e.shiftKey,
  });

  const updatePreviewPos = (clientX: number, clientY: number) => {
    if (!previewRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      previewRef.current.style.display = "none";
      return;
    }
    previewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    previewRef.current.style.display = "block";
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Middle button and space-drag belong to panning, never to tools.
    if (e.button === 1 || spaceHeldRef.current) return;
    updatePreviewPos(e.clientX, e.clientY);
    // Text tool: place/reposition the floating editor instead of stroking.
    if (activeToolId === "text") {
      // Cancel the browser's post-mousedown focus default, which would blur
      // the freshly mounted textarea back to <body> — where the next
      // keystrokes would hit the single-key tool shortcuts instead.
      e.preventDefault();
      const pt = screenToCanvas(e.clientX, e.clientY, overlayRef.current!);
      if (textEdit) commitText(textEdit); // commit any existing edit first
      setTextEdit({ cx: pt.x, cy: pt.y, value: "" });
      return;
    }
    const tool = getTool(activeToolId);
    if (!tool) return;
    overlayRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    tool.onPointerDown(infoOf(e), makeCtx());
  };

  // Build a PointerInfo from a plain snapshot of pointer fields (React events
  // are pooled, so we can't stash the event itself for the deferred frame).
  const infoFromRaw = (r: {
    clientX: number;
    clientY: number;
    shiftKey: boolean;
    buttons: number;
    button: number;
  }): PointerInfo => ({
    point: screenToCanvas(r.clientX, r.clientY, overlayRef.current!),
    button: r.button === 2 || (r.buttons & 2) === 2 ? "secondary" : "primary",
    shiftKey: r.shiftKey,
  });

  // Flush the latest pointer sample: update the coordinate readout, then either
  // continue the active stroke or run the hover behaviors (selection cursor,
  // eyedropper swatch, multi-click rubber-band). Runs once per animation frame.
  const processMove = () => {
    moveRaf.current = 0;
    const r = lastPointer.current;
    if (!r || !overlayRef.current) return;
    const info = infoFromRaw(r);
    const store = usePaintStore.getState();
    store.setCursorPos(info.point);
    const id = store.activeToolId;
    const tool = getTool(id);
    if (!drawing.current) {
      // Telegraph what a press would do over a selection: a resize grip (rect
      // Select tool only) or, inside the body, a move.
      if ((id === "select" || id === "freeSelect") && engine.hasSelectionOrFloat()) {
        const grip =
          id === "select" && engine.selection
            ? handleCursorAt(info.point, engine.selection, store.view.zoom)
            : null;
        setHandleCursor(grip ?? (engine.isInsideSelection(info.point) ? "move" : null));
      } else {
        setHandleCursor(null);
      }
      // Eyedropper: show the color under the pointer in a square beside it.
      if (id === "eyedropper") {
        const [pr, pg, pb] = engine.getPixel(info.point);
        setDropper({ cx: r.clientX, cy: r.clientY, color: rgbToHex(pr, pg, pb) });
      } else {
        setDropper(null);
      }
      tool?.onPointerHover?.(info, makeCtx());
      return;
    }
    tool?.onPointerMove(info, makeCtx());
  };

  const scheduleMove = (e: React.PointerEvent) => {
    updatePreviewPos(e.clientX, e.clientY);
    lastPointer.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      shiftKey: e.shiftKey,
      buttons: e.buttons,
      button: e.button,
    };
    if (!moveRaf.current) moveRaf.current = requestAnimationFrame(processMove);
  };

  // Apply any pending move immediately (before commit / leave), so the last
  // sample isn't lost to a frame that never runs.
  const flushMove = () => {
    if (moveRaf.current) {
      cancelAnimationFrame(moveRaf.current);
      processMove();
    }
  };

  const endStroke = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    flushMove();
    drawing.current = false;
    getTool(activeToolId)?.onPointerUp(infoOf(e), makeCtx());
    try {
      overlayRef.current!.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
    // After the eyedropper picks a color, jump straight to the bucket so the
    // freshly sampled color is ready to fill with — the common pick-then-fill
    // flow in one step.
    if (activeToolId === "eyedropper") {
      setDropper(null);
      usePaintStore.getState().setTool("fill");
    }
  };

  // — text-box drag (reposition the floating editor before committing) —
  const onTextHandleDown = (e: React.PointerEvent) => {
    if (!textEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    textDrag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: textEdit.cx,
      oy: textEdit.cy,
    };
  };
  const onTextHandleMove = (e: React.PointerEvent) => {
    const d = textDrag.current;
    if (!d || e.pointerId !== d.id) return;
    e.stopPropagation();
    const z = usePaintStore.getState().view.zoom;
    setTextEdit((t) =>
      t ? { ...t, cx: d.ox + (e.clientX - d.sx) / z, cy: d.oy + (e.clientY - d.sy) / z } : t,
    );
  };
  const onTextHandleUp = (e: React.PointerEvent) => {
    if (!textDrag.current || e.pointerId !== textDrag.current.id) return;
    e.stopPropagation();
    textDrag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  // The brush/pencil/eraser/shape tools hide the OS cursor entirely ("none"),
  // and render the live solid circular/square preview directly via previewRef with zero latency.
  const isPreviewTool =
    activeToolId === "brush" ||
    activeToolId === "pencil" ||
    activeToolId === "eraser" ||
    activeToolId === "line" ||
    activeToolId === "curve" ||
    isShapeTool(activeToolId);

  const toolCursor = isPreviewTool
    ? "none"
    : (getTool(activeToolId)?.cursor ??
      (activeToolId === "text" ? "text" : "default"));
  const cursor = panning
    ? "grabbing"
    : canvasResizeCursor
      ? canvasResizeCursor
      : spaceHeld
        ? "grab"
        : (handleCursor ?? toolCursor);
  const cssSize = { width: w * zoom, height: h * zoom };
  const box = textEdit ? measureBox(textEdit.value, textStyle) : null;
  const lineHeightPx = Math.round(textStyle.fontSize * LINE_HEIGHT) * zoom;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-work"
      style={{
        cursor:
          canvasResizeCursor ??
          (panning ? "grabbing" : spaceHeld ? "grab" : undefined),
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={onPanPointerDown}
      onPointerMoveCapture={onPanPointerMove}
      onPointerUpCapture={onPanPointerEnd}
      onPointerCancelCapture={onPanPointerEnd}
    >
      <div className="flex min-h-full min-w-full w-fit h-fit p-10">
        {/* The "paper": drop shadow + hairline ring around the document. */}
        <div className="relative m-auto shadow-2xl ring-1 ring-black/20 bg-white shrink-0" style={cssSize}>
          <canvas
            ref={baseRef}
            className="absolute left-0 top-0 bg-white"
            style={{ ...cssSize, imageRendering: "pixelated" }}
          />
          <canvas
            ref={overlayRef}
            className="absolute left-0 top-0 touch-none"
            style={{ ...cssSize, imageRendering: "pixelated", cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={scheduleMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => {
              if (previewRef.current) previewRef.current.style.display = "none";
              if (drawing.current) return;
              if (moveRaf.current) {
                cancelAnimationFrame(moveRaf.current);
                moveRaf.current = 0;
              }
              usePaintStore.getState().setCursorPos(null);
              setDropper(null);
            }}
          />
          {/* Live canvas hover solid preview circle/rect matching Windows 11 Paint (Zero-latency hardware transform) */}
          {isPreviewTool && !panning && !spaceHeld && !handleCursor && (
            <div
              ref={previewRef}
              className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform"
              style={{
                display: "none",
                width: Math.max(
                  2,
                  (isShapeTool(activeToolId) ||
                  activeToolId === "line" ||
                  activeToolId === "curve"
                    ? shapeSize
                    : brushSize) * zoom,
                ),
                height: Math.max(
                  2,
                  (isShapeTool(activeToolId) ||
                  activeToolId === "line" ||
                  activeToolId === "curve"
                    ? shapeSize
                    : brushSize) * zoom,
                ),
                backgroundColor:
                  activeToolId === "eraser"
                    ? "rgba(255, 255, 255, 0.9)"
                    : color1,
                borderRadius: activeToolId === "eraser" ? "2px" : "50%",
                border: "1px solid rgba(0, 0, 0, 0.8)",
                boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.85)",
              }}
            />
          )}
          {/* Selection layer: floating content (pixels). Pointer-transparent so
              the overlay below keeps receiving pointer events. */}
          <canvas
            ref={selectionRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ ...cssSize, imageRendering: "pixelated" }}
          />

          {/* Selection Marquee & 8 resize handles overlay: vector crisp, 1px lines, fixed 7px handles */}
          {hasSelection && engine.selection && !engine.hasLassoOutline() && (
            <div
              ref={selectionMarqueeRef}
              className="pointer-events-none absolute z-20"
              style={{
                left: engine.selection.x * zoom,
                top: engine.selection.y * zoom,
                width: Math.max(1, engine.selection.w * zoom),
                height: Math.max(1, engine.selection.h * zoom),
              }}
            >
              <svg className="w-full h-full overflow-visible pointer-events-none absolute inset-0">
                <rect
                  x="0.5"
                  y="0.5"
                  width="100%"
                  height="100%"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1"
                  className="marching-ants-white"
                />
                <rect
                  x="0.5"
                  y="0.5"
                  width="100%"
                  height="100%"
                  fill="none"
                  stroke="#000000"
                  strokeWidth="1"
                  className="marching-ants-black"
                />
              </svg>

              {/* 8 selection resize grips (Rectangular select tool) */}
              {activeToolId === "select" && (
                <>
                  {(
                    [
                      ["nw", { left: -3.5, top: -3.5 }],
                      ["n", { top: -3.5, left: -3.5 }],
                      ["ne", { right: -3.5, top: -3.5 }],
                      ["e", { right: -3.5, top: -3.5 }],
                      ["se", { right: -3.5, bottom: -3.5 }],
                      ["s", { bottom: -3.5, left: -3.5 }],
                      ["sw", { left: -3.5, bottom: -3.5 }],
                      ["w", { left: -3.5, top: -3.5 }],
                    ] as const
                  ).map(([id, pos]) => (
                    <div
                      key={id}
                      data-grip={id}
                      className="absolute z-20 h-[7px] w-[7px] border border-black bg-white shadow-xs"
                      style={pos}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Canvas resize handles on every corner and edge midpoint: drag to
              crop or extend the canvas. Each grip's compass id drives both its
              cursor and which edge(s) it moves. */}
          {(
            [
              ["nw", { left: -5, top: -5 }],
              ["n", { top: -5, left: "50%", transform: "translateX(-50%)" }],
              ["ne", { right: -5, top: -5 }],
              ["e", { right: -5, top: "50%", transform: "translateY(-50%)" }],
              ["se", { right: -5, bottom: -5 }],
              ["s", { bottom: -5, left: "50%", transform: "translateX(-50%)" }],
              ["sw", { left: -5, bottom: -5 }],
              ["w", { left: -5, top: "50%", transform: "translateY(-50%)" }],
            ] as const
          ).map(([dir, pos]) => (
            <div
              key={dir}
              data-dir={dir}
              title="Drag to resize the canvas"
              className="absolute z-30 h-2.5 w-2.5 rounded-[1px] border border-neutral-500 bg-white shadow-md"
              style={{ ...pos, cursor: HANDLE_CURSOR[dir] }}
              onPointerDown={onHandleDown(dir)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            />
          ))}

          {/* Dashed preview + size badge while a resize handle drags. The rect
              may start above/left of the paper when a top/left handle grows it. */}
          {resizePreview && (
            <>
              <div
                className="pointer-events-none absolute z-10 border border-dashed border-neutral-500"
                style={{
                  left: resizePreview.x * zoom,
                  top: resizePreview.y * zoom,
                  width: resizePreview.w * zoom,
                  height: resizePreview.h * zoom,
                }}
              />
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-xs text-ink shadow"
                style={{
                  left: (resizePreview.x + resizePreview.w) * zoom + 8,
                  top: (resizePreview.y + resizePreview.h) * zoom + 8,
                }}
              >
                {resizePreview.w} × {resizePreview.h}px
              </div>
            </>
          )}

          {/* Floating multi-line text editor — rasterized onto the canvas when
              a new action starts or the tool changes. A grab bar above it
              repositions the box before it's committed. */}
          {textEdit && box && (
            <>
              <div
                title="Drag to move the text"
                onPointerDown={onTextHandleDown}
                onPointerMove={onTextHandleMove}
                onPointerUp={onTextHandleUp}
                onPointerCancel={onTextHandleUp}
                className="absolute z-20 flex select-none items-center justify-center rounded-t bg-ink-muted text-[9px] leading-none text-white"
                style={{
                  left: textEdit.cx * zoom,
                  top: textEdit.cy * zoom - 15,
                  width: Math.max(box.w * zoom + 6, 30),
                  height: 15,
                  cursor: "move",
                }}
              >
                ⠿
              </div>
              <textarea
                ref={textareaRef}
                value={textEdit.value}
                spellCheck={false}
                wrap="off"
                onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                onKeyDown={(e) => {
                  // Enter inserts a newline (multi-line); Esc cancels the edit.
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setTextEdit(null);
                  }
                }}
                className="absolute m-0 resize-none overflow-hidden whitespace-pre border border-dashed border-ink-muted bg-transparent p-0 outline-none"
                style={{
                  left: textEdit.cx * zoom,
                  top: textEdit.cy * zoom,
                  width: box.w * zoom + 6,
                  height: box.h * zoom,
                  color: color1,
                  font: fontString(textStyle, zoom),
                  lineHeight: `${lineHeightPx}px`,
                  textDecorationLine:
                    `${textStyle.underline ? "underline " : ""}${
                      textStyle.strike ? "line-through" : ""
                    }`.trim() || "none",
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Eyedropper: the color under the pointer, shown in a square beside the
          dropper cursor (fixed to the viewport so the work-area scroll doesn't
          clip it). */}
      {dropper && (
        <div
          data-testid="dropper-swatch"
          className="pointer-events-none fixed z-50 h-7 w-7 rounded border-2 border-white shadow-md ring-1 ring-black/40"
          style={{ left: dropper.cx + 20, top: dropper.cy + 6, background: dropper.color }}
        />
      )}
    </div>
  );
}
