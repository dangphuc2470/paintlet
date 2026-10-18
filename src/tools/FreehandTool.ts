import type { Point, ToolId } from "../engine/types";
import type { PointerInfo, Tool, ToolContext } from "./Tool";

function hardenRect(
  ctx2d: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  canvasW: number,
  canvasH: number,
  cutoff = 16,
): void {
  const pad = Math.ceil(radius) + 3;
  const left = Math.max(0, Math.floor(Math.min(x0, x1) - pad));
  const top = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const right = Math.min(canvasW, Math.ceil(Math.max(x0, x1) + pad));
  const bottom = Math.min(canvasH, Math.ceil(Math.max(y0, y1) + pad));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;

  const img = ctx2d.getImageData(left, top, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] >= cutoff) {
      d[i] = 255;
    } else if (d[i] > 0) {
      d[i] = 0;
    }
  }
  ctx2d.putImageData(img, left, top);
}

// Shared base for the freehand strokes (pencil, brush, eraser). The whole stroke
// accumulates on the OVERLAY and commits once on pointer-up, so one drag == one
// undo step and the base is untouched mid-stroke. Because pointer events are
// sparse, we always connect from the last point to the current one.
//
// For crisp pixel tools (pencil, eraser), we draw directly with Bresenham's line
// algorithm and integer pixel rects so there is ZERO anti-aliasing during the stroke
// and no shift on commit. For smooth tools (brush), we stroke lines with the chosen cap.
export abstract class FreehandTool implements Tool {
  abstract id: ToolId;
  abstract cursor: string;
  protected lineCap: CanvasLineCap = "round";
  // Harden anti-aliased edges on commit (pencil = true; brush = false; eraser = true).
  protected crisp = false;

  // Which color this stroke paints, given the button that started it.
  protected abstract colorFor(p: PointerInfo, ctx: ToolContext): string;

  private drawing = false;
  private last: Point | null = null;
  private color = "#000000";

  onPointerDown(p: PointerInfo, ctx: ToolContext): void {
    this.drawing = true;
    this.last = p.point;
    this.color = this.colorFor(p, ctx);
    // Draw a solid dot/pixel immediately on mouse down so a single click always leaves a mark
    const o = ctx.overlay;
    o.save();
    o.fillStyle = this.color;
    const isSquarePixel = this.crisp && Math.round(ctx.size) <= 1;
    const isBlockEraser = this.id === "eraser";

    if (isSquarePixel) {
      // 1px: exact 1x1 integer square pixel with zero antialiasing
      const px = Math.floor(p.point.x);
      const py = Math.floor(p.point.y);
      o.fillRect(px, py, 1, 1);
    } else if (isBlockEraser) {
      // Eraser: blocky square dab
      const size = Math.max(1, Math.round(ctx.size));
      const px = Math.floor(p.point.x);
      const py = Math.floor(p.point.y);
      const half = Math.floor((size - 1) / 2);
      o.fillRect(px - half, py - half, size, size);
    } else {
      // Bigger stroke (> 1px): round dab
      o.beginPath();
      o.arc(p.point.x, p.point.y, Math.max(0.5, ctx.size / 2), 0, Math.PI * 2);
      o.fill();
      if (this.crisp) {
        hardenRect(
          o,
          p.point.x,
          p.point.y,
          p.point.x,
          p.point.y,
          ctx.size / 2,
          o.canvas.width,
          o.canvas.height,
        );
      }
    }
    o.restore();
  }

  onPointerMove(p: PointerInfo, ctx: ToolContext): void {
    if (!this.drawing || !this.last) return;
    this.segment(this.last, p.point, ctx);
    this.last = p.point;
  }

  onPointerUp(_p: PointerInfo, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.last = null;
    ctx.commit(this.id, this.crisp);
  }

  // Discard an in-progress stroke without committing (tool switch / Esc).
  onDeactivate(ctx: ToolContext): void {
    if (this.drawing) {
      this.drawing = false;
      this.last = null;
      ctx.clearPreview();
    }
  }

  private segment(from: Point, to: Point, ctx: ToolContext): void {
    const o = ctx.overlay;
    o.save();
    const isSquarePixel = this.crisp && Math.round(ctx.size) <= 1;
    const isBlockEraser = this.id === "eraser";

    if (isSquarePixel) {
      // 1px: Bresenham line drawing exact 1x1 square pixels without antialiasing
      o.fillStyle = this.color;
      let x0 = Math.floor(from.x);
      let y0 = Math.floor(from.y);
      const x1 = Math.floor(to.x);
      const y1 = Math.floor(to.y);

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        o.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    } else if (isBlockEraser) {
      // Eraser: Bresenham square block
      o.fillStyle = this.color;
      const size = Math.max(1, Math.round(ctx.size));
      const half = Math.floor((size - 1) / 2);

      let x0 = Math.floor(from.x);
      let y0 = Math.floor(from.y);
      const x1 = Math.floor(to.x);
      const y1 = Math.floor(to.y);

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        o.fillRect(x0 - half, y0 - half, size, size);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    } else {
      // Bigger stroke (> 1px): round stroke with round cap and join
      o.strokeStyle = this.color;
      o.lineWidth = ctx.size;
      o.lineCap = "round";
      o.lineJoin = "round";
      o.beginPath();
      o.moveTo(from.x, from.y);
      o.lineTo(to.x, to.y);
      o.stroke();
      if (this.crisp) {
        hardenRect(
          o,
          from.x,
          from.y,
          to.x,
          to.y,
          ctx.size / 2,
          o.canvas.width,
          o.canvas.height,
        );
      }
    }
    o.restore();
  }
}
