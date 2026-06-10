export const EDGELESS_IMMERSIVE_TAP_SLOP = 8;

const IMMERSIVE_TAP_EXCLUDE_SELECTORS = [
  'edgeless-toolbar-widget',
  '.edgeless-toolbar-container',
  'affine-edgeless-zoom-toolbar-widget',
  '.edgeless-zoom-toolbar-container',
  '.affine-edgeless-selected-rect',
].join(', ');

export function isLandscapeWindow({
  width,
  height,
  matchesLandscape,
}: {
  width: number;
  height: number;
  matchesLandscape: boolean;
}) {
  return matchesLandscape && width > height;
}

export function shouldEnableEdgelessImmersive({
  mode,
  isLandscape,
}: {
  mode: 'page' | 'edgeless';
  isLandscape: boolean;
}) {
  return mode === 'edgeless' && isLandscape;
}

export function isImmersiveTapTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(IMMERSIVE_TAP_EXCLUDE_SELECTORS);
}

export function isTapWithinSlop(
  start: { clientX: number; clientY: number },
  end: { clientX: number; clientY: number },
  slop = EDGELESS_IMMERSIVE_TAP_SLOP
) {
  return (
    Math.abs(start.clientX - end.clientX) <= slop &&
    Math.abs(start.clientY - end.clientY) <= slop
  );
}
