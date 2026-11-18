// Phase 4 (MOBILE-15, Bug B, D-09): pure function computing the mobile
// bottom-nav bar's active `bottom` offset from the already-injected
// `VirtualKeyboardService.height$` (no new provider/listener). The `-2`
// matches `styles.css.ts`'s existing `data-fixed="true"` selector's own
// resting `bottom: -2` value; returning `undefined` when there is no
// keyboard height lets that stylesheet's own `-2px` apply unmodified,
// keeping the default (no-keyboard) case byte-identical to today.
export function computeAppTabsBottomOffset(
  keyboardHeight: number
): string | undefined {
  return keyboardHeight > 0 ? `${-2 - keyboardHeight}px` : undefined;
}
