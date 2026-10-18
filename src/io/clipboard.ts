import { readImage, writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { Image } from "@tauri-apps/api/image";
import { engine, usePaintStore } from "../state/store";
import { viewport } from "../state/viewport";

// A fallback clipboard living inside the app, so copy/paste always works even
// if the system clipboard rejects an image — and it's faster for in-app
// round-trips (no encode/decode).
let internal: ImageData | null = null;

// Pixels to copy: the selection (or float) if there is one, else the whole
// image — matching Paint, where ⌘C with nothing selected copies everything.
function selectionOrWhole(): ImageData {
  return engine.getSelectionPixels() ?? engine.fullImageData();
}

export async function copySelection(): Promise<void> {
  const img = selectionOrWhole();
  internal = img;
  try {
    const tImg = await Image.new(new Uint8Array(img.data), img.width, img.height);
    await writeImage(tImg);
  } catch {
    // System clipboard unavailable; the internal copy still enables paste.
  }
}

export async function cutSelection(): Promise<void> {
  await copySelection();
  engine.deleteSelection(usePaintStore.getState().color2);
}

// Compute the paste position in canvas logical coordinates so the pasted image
// lands in the top-left of the currently visible viewport rather than stuck at (0, 0).
export function getVisiblePastePosition(): { x: number; y: number } {
  const container = viewport.el;
  const canvas = engine.overlay?.canvas;
  if (!container || !canvas) return { x: 0, y: 0 };

  const canvasRect = canvas.getBoundingClientRect();
  const viewRect = container.getBoundingClientRect();
  const zoom = usePaintStore.getState().view.zoom;

  // Place at top-left of the currently visible canvas portion.
  // Add a 64px offset from viewport left to clear the floating vertical size slider (~54px),
  // and 20px from viewport top for breathing room.
  const targetScreenX = Math.max(canvasRect.left, viewRect.left + 64);
  const targetScreenY = Math.max(canvasRect.top, viewRect.top + 20);

  const canvasX = Math.max(0, Math.round((targetScreenX - canvasRect.left) / zoom));
  const canvasY = Math.max(0, Math.round((targetScreenY - canvasRect.top) / zoom));

  return { x: canvasX, y: canvasY };
}

let lastPasteTimestamp = 0;

export async function pasteImageBlob(blob: Blob): Promise<boolean> {
  const now = Date.now();
  if (now - lastPasteTimestamp < 150) return false;
  lastPasteTimestamp = now;

  try {
    const bitmap = await createImageBitmap(blob);
    const at = getVisiblePastePosition();
    engine.pasteImage(bitmap, bitmap.width, bitmap.height, at);
    usePaintStore.getState().setTool("select");
    return true;
  } catch (err) {
    console.error("Failed to paste image blob:", err);
    return false;
  }
}

export async function pasteClipboard(): Promise<void> {
  const now = Date.now();
  if (now - lastPasteTimestamp < 150) return;

  // 1. Fast in-process Web standard navigator.clipboard (WebKit native pasteboard)
  if (typeof navigator !== "undefined" && navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ok = await pasteImageBlob(blob);
          if (ok) return;
        }
      }
    } catch {
      // Permission denied or format unavailable; proceed to fallback
    }
  }

  let img: ImageData | null = null;

  // 2. Tauri native clipboard manager plugin (Rust IPC fallback)
  try {
    const tImg = await readImage();
    if (tImg) {
      const size = await tImg.size();
      const rgba = await tImg.rgba();
      if (size.width > 0 && size.height > 0) {
        const expectedLen = size.width * size.height * 4;
        if (rgba.length === expectedLen) {
          img = new ImageData(
            new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
            size.width,
            size.height,
          );
        } else {
          // If stride/length differs, safely fill canvas and extract
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext("2d")!;
          const id = ctx.createImageData(size.width, size.height);
          id.data.set(rgba.subarray(0, id.data.length));
          img = id;
        }
      }
    }
  } catch (err) {
    console.warn("Tauri readImage failed:", err);
  }

  // 3. Fallback: in-app internal copy buffer
  if (!img) {
    img = internal;
  }
  if (!img) return;

  lastPasteTimestamp = Date.now();
  const at = getVisiblePastePosition();
  engine.pasteImageData(img, at);
  // Drop into the selection tool so the pasted float can be moved immediately.
  usePaintStore.getState().setTool("select");
}
