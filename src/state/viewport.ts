// The scrollable work-area element that hosts the canvas "paper". CanvasStage
// registers it on mount so imperative view commands (Fit to Window from the
// menu, zoom-at-cursor scroll adjustments) can measure and scroll it without
// routing DOM refs through React state.
export const viewport: { el: HTMLDivElement | null } = { el: null };

// The stage's padding around the paper, used when fitting to window.
// X padding ensures canvas clears the floating vertical size slider (~54px wide).
export const STAGE_PADDING = 40;
export const STAGE_PADDING_X = 80;
export const STAGE_PADDING_Y = 40;
