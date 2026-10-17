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
function getVisiblePastePosition(): { x: number; y: number } {
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

export async function pasteClipboard(): Promise<void> {
  let img: ImageData | null = null;
  try {
    const tImg = await readImage();
    const size = await tImg.size();
    const rgba = await tImg.rgba();
    img = new ImageData(new Uint8ClampedArray(rgba), size.width, size.height);
  } catch {
    img = internal; // nothing usable on the system clipboard
  }
  if (!img) return;

  const at = getVisiblePastePosition();
  engine.pasteImageData(img, at);
  // Drop into the selection tool so the pasted float can be moved immediately.
  usePaintStore.getState().setTool("select");
}
