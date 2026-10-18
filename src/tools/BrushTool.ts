import { brushCursor } from "../lib/cursors";
import type { Point } from "../engine/types";
import { usePaintStore, type BrushType } from "../state/store";
import type { PointerInfo, Tool, ToolContext } from "./Tool";

// Comprehensive Windows 11 MS Paint brush engine supporting all 9 brush types:
// 1. Brush (standard smooth round with continuous spline smoothing)
// 2. Calligraphy brush (45° angled chisel ribbon)
// 3. Calligraphy pen (-45° angled chisel ribbon)
// 4. Airbrush (continuous spray particles)
// 5. Oil brush (textured multi-bristle stroke)
// 6. Crayon (waxy grain texture)
// 7. Marker (translucent flat chisel continuous stroke)
// 8. Natural pencil (graphite textured soft pencil)
// 9. Watercolor brush (translucent continuous wash without joint overlap)
export class BrushTool implements Tool {
  id = "brush" as const;
  cursor = brushCursor;

  private drawing = false;
  private last: Point | null = null;
  private points: Point[] = [];
  private color = "#000000";
  private sprayTimer: ReturnType<typeof setInterval> | null = null;
  private currentContext: ToolContext | null = null;

  onPointerDown(p: PointerInfo, ctx: ToolContext): void {
    this.drawing = true;
    this.last = p.point;
    this.points = [p.point];
    this.color = p.button === "secondary" ? ctx.color2 : ctx.color1;
    this.currentContext = ctx;

    const brushType = usePaintStore.getState().brushType;
    this.drawDab(p.point, ctx, brushType);

    if (brushType === "airbrush") {
      this.clearSprayTimer();
      this.sprayTimer = setInterval(() => {
        if (this.drawing && this.last && this.currentContext) {
          this.sprayParticles(this.last, this.currentContext);
        }
      }, 35);
    }
  }

  onPointerMove(p: PointerInfo, ctx: ToolContext): void {
    if (!this.drawing || !this.last) return;
    this.currentContext = ctx;
    this.points.push(p.point);

    const brushType = usePaintStore.getState().brushType;
    if (
      brushType === "watercolor" ||
      brushType === "brush" ||
      brushType === "marker"
    ) {
      // Continuous single-path rendering to eliminate joint overlapping dots/beading
      this.renderContinuousStroke(ctx, brushType);
    } else {
      this.drawSegment(this.last, p.point, ctx, brushType);
    }
    this.last = p.point;
  }

  onPointerUp(_p: PointerInfo, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.clearSprayTimer();
    this.drawing = false;
    this.last = null;
    this.points = [];
    this.currentContext = null;
    ctx.commit(this.id, false);
  }

  onDeactivate(ctx: ToolContext): void {
    this.clearSprayTimer();
    if (this.drawing) {
      this.drawing = false;
      this.last = null;
      this.points = [];
      this.currentContext = null;
      ctx.clearPreview();
    }
  }

  private clearSprayTimer(): void {
    if (this.sprayTimer !== null) {
      clearInterval(this.sprayTimer);
      this.sprayTimer = null;
    }
  }

  private renderContinuousStroke(ctx: ToolContext, type: BrushType): void {
    const o = ctx.overlay;
    o.save();
    o.clearRect(0, 0, o.canvas.width, o.canvas.height);

    if (this.points.length === 0) {
      o.restore();
      return;
    }

    if (type === "watercolor") {
      // Smooth continuous watercolor wash: single stroke path prevents opacity stacking at joint points
      o.strokeStyle = this.color;
      o.lineCap = "round";
      o.lineJoin = "round";
      o.lineWidth = ctx.size;
      o.globalAlpha = 0.35;

      if (this.points.length === 1) {
        o.fillStyle = this.color;
        o.beginPath();
        o.arc(this.points[0].x, this.points[0].y, ctx.size / 2, 0, Math.PI * 2);
        o.fill();
      } else {
        o.beginPath();
        o.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length - 1; i++) {
          const midX = (this.points[i].x + this.points[i + 1].x) / 2;
          const midY = (this.points[i].y + this.points[i + 1].y) / 2;
          o.quadraticCurveTo(this.points[i].x, this.points[i].y, midX, midY);
        }
        o.lineTo(
          this.points[this.points.length - 1].x,
          this.points[this.points.length - 1].y,
        );
        o.stroke();

        // Inner soft core for organic watercolor depth
        o.lineWidth = Math.max(1, ctx.size * 0.55);
        o.globalAlpha = 0.15;
        o.stroke();
      }
    } else if (type === "marker") {
      // Smooth continuous marker stroke
      o.strokeStyle = this.color;
      o.lineCap = "square";
      o.lineJoin = "bevel";
      o.lineWidth = ctx.size;
      o.globalAlpha = 0.55;

      if (this.points.length === 1) {
        const w = ctx.size;
        const h = Math.max(2, ctx.size * 0.35);
        o.fillStyle = this.color;
        o.fillRect(this.points[0].x - w / 2, this.points[0].y - h / 2, w, h);
      } else {
        o.beginPath();
        o.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length - 1; i++) {
          const midX = (this.points[i].x + this.points[i + 1].x) / 2;
          const midY = (this.points[i].y + this.points[i + 1].y) / 2;
          o.quadraticCurveTo(this.points[i].x, this.points[i].y, midX, midY);
        }
        o.lineTo(
          this.points[this.points.length - 1].x,
          this.points[this.points.length - 1].y,
        );
        o.stroke();
      }
    } else if (type === "brush") {
      // Standard smooth brush with quadratic spline smoothing
      o.strokeStyle = this.color;
      o.lineCap = "round";
      o.lineJoin = "round";
      o.lineWidth = ctx.size;

      if (this.points.length === 1) {
        o.fillStyle = this.color;
        o.beginPath();
        o.arc(this.points[0].x, this.points[0].y, Math.max(0.5, ctx.size / 2), 0, Math.PI * 2);
        o.fill();
      } else {
        o.beginPath();
        o.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length - 1; i++) {
          const midX = (this.points[i].x + this.points[i + 1].x) / 2;
          const midY = (this.points[i].y + this.points[i + 1].y) / 2;
          o.quadraticCurveTo(this.points[i].x, this.points[i].y, midX, midY);
        }
        o.lineTo(
          this.points[this.points.length - 1].x,
          this.points[this.points.length - 1].y,
        );
        o.stroke();
      }
    }
    o.restore();
  }

  private drawDab(pt: Point, ctx: ToolContext, type: BrushType): void {
    const o = ctx.overlay;
    switch (type) {
      case "brush": {
        o.save();
        o.fillStyle = this.color;
        o.beginPath();
        o.arc(pt.x, pt.y, Math.max(0.5, ctx.size / 2), 0, Math.PI * 2);
        o.fill();
        o.restore();
        break;
      }
      case "calligraphy1": {
        o.save();
        o.strokeStyle = this.color;
        o.lineWidth = 1.5;
        const L = Math.max(2, ctx.size);
        const dx = L * 0.3535;
        const dy = -L * 0.3535;
        o.beginPath();
        o.moveTo(pt.x - dx, pt.y - dy);
        o.lineTo(pt.x + dx, pt.y + dy);
        o.stroke();
        o.restore();
        break;
      }
      case "calligraphy2": {
        o.save();
        o.strokeStyle = this.color;
        o.lineWidth = 1.5;
        const L = Math.max(2, ctx.size);
        const dx = L * 0.3535;
        const dy = L * 0.3535;
        o.beginPath();
        o.moveTo(pt.x - dx, pt.y - dy);
        o.lineTo(pt.x + dx, pt.y + dy);
        o.stroke();
        o.restore();
        break;
      }
      case "airbrush": {
        this.sprayParticles(pt, ctx);
        break;
      }
      case "oil": {
        o.save();
        o.fillStyle = this.color;
        o.globalAlpha = 0.8;
        const r = Math.max(1, ctx.size / 2);
        o.beginPath();
        o.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        o.fill();
        o.restore();
        break;
      }
      case "crayon": {
        o.save();
        o.fillStyle = this.color;
        const r = Math.max(1, ctx.size / 2);
        const num = Math.max(6, Math.round(r * 1.5));
        for (let i = 0; i < num; i++) {
          const a = Math.random() * Math.PI * 2;
          const dist = Math.pow(Math.random(), 0.6) * r;
          o.globalAlpha = 0.4 + Math.random() * 0.4;
          o.fillRect(pt.x + Math.cos(a) * dist, pt.y + Math.sin(a) * dist, 1.2, 1.2);
        }
        o.restore();
        break;
      }
      case "marker": {
        o.save();
        o.fillStyle = this.color;
        o.globalAlpha = 0.55;
        const w = ctx.size;
        const h = Math.max(2, ctx.size * 0.35);
        o.fillRect(pt.x - w / 2, pt.y - h / 2, w, h);
        o.restore();
        break;
      }
      case "naturalPencil": {
        o.save();
        o.fillStyle = this.color;
        o.globalAlpha = 0.8;
        o.beginPath();
        o.arc(pt.x, pt.y, Math.max(0.5, ctx.size * 0.35), 0, Math.PI * 2);
        o.fill();
        o.restore();
        break;
      }
      case "watercolor": {
        o.save();
        o.fillStyle = this.color;
        o.globalAlpha = 0.35;
        o.beginPath();
        o.arc(pt.x, pt.y, Math.max(1, ctx.size / 2), 0, Math.PI * 2);
        o.fill();
        o.restore();
        break;
      }
    }
  }

  private drawSegment(
    from: Point,
    to: Point,
    ctx: ToolContext,
    type: BrushType,
  ): void {
    const o = ctx.overlay;
    switch (type) {
      case "calligraphy1": {
        // 45° angle chisel ribbon
        o.save();
        o.fillStyle = this.color;
        const L = Math.max(2, ctx.size);
        const dx = L * 0.3535;
        const dy = -L * 0.3535;
        o.beginPath();
        o.moveTo(from.x - dx, from.y - dy);
        o.lineTo(from.x + dx, from.y + dy);
        o.lineTo(to.x + dx, to.y + dy);
        o.lineTo(to.x - dx, to.y - dy);
        o.closePath();
        o.fill();
        o.restore();
        break;
      }
      case "calligraphy2": {
        // -45° angle chisel ribbon
        o.save();
        o.fillStyle = this.color;
        const L = Math.max(2, ctx.size);
        const dx = L * 0.3535;
        const dy = L * 0.3535;
        o.beginPath();
        o.moveTo(from.x - dx, from.y - dy);
        o.lineTo(from.x + dx, from.y + dy);
        o.lineTo(to.x + dx, to.y + dy);
        o.lineTo(to.x - dx, to.y - dy);
        o.closePath();
        o.fill();
        o.restore();
        break;
      }
      case "airbrush": {
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const stepSize = Math.max(2, ctx.size * 0.25);
        const steps = Math.max(1, Math.ceil(dist / stepSize));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const cur = {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
          };
          this.sprayParticles(cur, ctx);
        }
        break;
      }
      case "oil": {
        // Oil brush bristles
        o.save();
        o.lineCap = "round";
        o.lineJoin = "round";
        const numBristles = 7;
        const bristleWidth = Math.max(1, ctx.size / 5);
        const angle = Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const halfW = ctx.size / 2;

        for (let b = 0; b < numBristles; b++) {
          const offsetRatio = (b / (numBristles - 1)) * 2 - 1;
          const offset = offsetRatio * halfW;
          const jitter = (Math.random() - 0.5) * (ctx.size * 0.08);
          const totalOffset = offset + jitter;

          const bFromX = from.x + cos * totalOffset;
          const bFromY = from.y + sin * totalOffset;
          const bToX = to.x + cos * totalOffset;
          const bToY = to.y + sin * totalOffset;

          o.strokeStyle = this.color;
          o.globalAlpha = 0.65 + Math.random() * 0.3;
          o.lineWidth = bristleWidth;
          o.beginPath();
          o.moveTo(bFromX, bFromY);
          o.lineTo(bToX, bToY);
          o.stroke();
        }
        o.restore();
        break;
      }
      case "crayon": {
        // Crayon waxy grain
        o.save();
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const stepSize = Math.max(1.5, ctx.size * 0.15);
        const steps = Math.max(1, Math.ceil(dist / stepSize));
        const radius = Math.max(1, ctx.size / 2);

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = from.x + (to.x - from.x) * t;
          const cy = from.y + (to.y - from.y) * t;

          o.fillStyle = this.color;
          const numGrains = Math.max(6, Math.round(radius * 1.5));
          for (let g = 0; g < numGrains; g++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.pow(Math.random(), 0.6) * radius;
            const gx = cx + Math.cos(a) * r;
            const gy = cy + Math.sin(a) * r;
            o.globalAlpha = 0.35 + Math.random() * 0.45;
            o.fillRect(gx, gy, 1.2, 1.2);
          }
        }
        o.restore();
        break;
      }
      case "naturalPencil": {
        // Natural soft graphite pencil
        o.save();
        o.strokeStyle = this.color;
        o.lineWidth = Math.max(1, ctx.size * 0.7);
        o.lineCap = "round";
        o.lineJoin = "round";
        o.globalAlpha = 0.85;
        o.beginPath();
        o.moveTo(from.x, from.y);
        o.lineTo(to.x, to.y);
        o.stroke();

        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.ceil(dist / 3));
        o.fillStyle = this.color;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = from.x + (to.x - from.x) * t;
          const cy = from.y + (to.y - from.y) * t;
          const a = Math.random() * Math.PI * 2;
          const r = (Math.random() * ctx.size) / 2;
          o.globalAlpha = 0.15 + Math.random() * 0.35;
          o.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1);
        }
        o.restore();
        break;
      }
    }
  }

  private sprayParticles(pt: Point, ctx: ToolContext): void {
    const o = ctx.overlay;
    o.save();
    o.fillStyle = this.color;
    const radius = Math.max(3, ctx.size / 2);
    const count = Math.max(14, Math.round(radius * 1.8));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      const px = pt.x + r * Math.cos(angle);
      const py = pt.y + r * Math.sin(angle);
      const dotRadius = 0.5 + Math.random() * 0.7;
      o.globalAlpha = 0.15 + Math.random() * 0.25;
      o.beginPath();
      o.arc(px, py, dotRadius, 0, Math.PI * 2);
      o.fill();
    }
    o.restore();
  }
}
