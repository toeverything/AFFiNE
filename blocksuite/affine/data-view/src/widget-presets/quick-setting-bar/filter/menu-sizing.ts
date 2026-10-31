/**
 * Lets the filter's condition menu (and its date sub-menu) grow to fit the
 * calendar on desktop. On mobile the same menu is a full-screen sheet
 * (`mobile-menu`, `height: 100%`), and `max-height: fit-content` capped it
 * at its header + padding -- the date picker was squeezed into a ~48px
 * scroll strip (999.10) -- so leave it alone there.
 */
export function sizeFilterMenuToContent(
  menuElement: HTMLElement,
  isMobile: boolean
): void {
  if (isMobile) return;
  menuElement.style.minHeight = 'fit-content';
  menuElement.style.maxHeight = 'fit-content';
  menuElement.style.minWidth = '200px';
}
