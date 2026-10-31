// The quote builder's resizable preview (components/quote-studio.js): its share
// of the content area snaps to 33, 40 or 50 %, and its width in pixels always
// leaves room for the inputs. Pure, so it's tested in node.
export const SNAPS = [0.33, 0.4, 0.5];
export const DEFAULT_SHARE = 0.4;
export const MIN_PREVIEW = 280, MIN_INPUTS = 360, HANDLE = 16;

export function snapShare(p) {
  for (const s of SNAPS) if (Math.abs(p - s) < 0.025) return s;
  return p;
}

// px for a share of the area, after the costs column; never under 280, and the inputs keep 360
export function previewWidth(share, areaW, costsW = 0) {
  const room = areaW - costsW - HANDLE;
  return Math.round(Math.max(MIN_PREVIEW, Math.min(share * areaW, room - MIN_INPUTS)));
}

export const clampShare = (p) => Math.max(0.15, Math.min(0.8, p));
