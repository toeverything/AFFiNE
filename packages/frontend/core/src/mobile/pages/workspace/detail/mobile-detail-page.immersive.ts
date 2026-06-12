export const EDGELESS_IMMERSIVE_TAP_SLOP = 8;

const IMMERSIVE_TAP_EXCLUDE_SELECTORS = [
  'edgeless-toolbar-widget',
  '.edgeless-toolbar-container',
  'affine-edgeless-zoom-toolbar-widget',
  '.edgeless-zoom-toolbar-container',
  '.affine-edgeless-selected-rect',
].join(', ');

export function getLandscapeWindowMeasurement({
  width,
  height,
  matchesLandscape,
}: {
  width: number;
  height: number;
  matchesLandscape: boolean;
}) {
  const geometryLandscape = width > height;

  return {
    isLandscape: matchesLandscape && geometryLandscape,
    settled: matchesLandscape === geometryLandscape,
  };
}

export function isLandscapeWindow({
  width,
  height,
  matchesLandscape,
}: {
  width: number;
  height: number;
  matchesLandscape: boolean;
}) {
  return getLandscapeWindowMeasurement({
    width,
    height,
    matchesLandscape,
  }).isLandscape;
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

export function shouldLockEdgelessDocumentScroll(mode: 'page' | 'edgeless') {
  return mode === 'edgeless';
}

export function shouldTrackMobileDetailPageTitleScroll(
  mode: 'page' | 'edgeless'
) {
  return mode === 'page';
}

export function shouldShowMobileDetailPageTitle(scrollY: number) {
  return scrollY >= 158;
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

export function getImmersiveZoomToolbarBottom({
  immersive,
  chromeVisible,
  tabBarOffset,
}: {
  immersive: boolean;
  chromeVisible: boolean;
  tabBarOffset?: string;
}) {
  if (!immersive) {
    return undefined;
  }

  if (chromeVisible && tabBarOffset) {
    return `calc(10px + ${tabBarOffset})`;
  }

  return '10px';
}
