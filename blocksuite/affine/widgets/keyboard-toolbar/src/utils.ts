import type {
  KeyboardSubToolbarConfig,
  KeyboardToolbarActionItem,
  KeyboardToolbarItem,
  KeyboardToolPanelConfig,
} from './config.js';

export function isKeyboardToolBarActionItem(
  item: KeyboardToolbarItem
): item is KeyboardToolbarActionItem {
  return 'action' in item;
}

export function isKeyboardSubToolBarConfig(
  item: KeyboardToolbarItem
): item is KeyboardSubToolbarConfig {
  return 'items' in item;
}

export function isKeyboardToolPanelConfig(
  item: KeyboardToolbarItem
): item is KeyboardToolPanelConfig {
  return 'groups' in item;
}

export function formatDate(date: Date) {
  // yyyy-mm-dd
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const strTime = `${year}-${month}-${day}`;
  return strTime;
}

export function formatTime(date: Date) {
  // mm-dd hh:mm
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const strTime = `${month}-${day} ${hours}:${minutes}`;
  return strTime;
}

/**
 * keyboard-focus-tabbar-coordination (round 2): the widget's fallback
 * `show`/`hide` keyboard actions (`widget.ts`, used whenever the platform's
 * `VirtualKeyboardProvider` does not itself implement `show`/`hide` -- true
 * on BOTH the PWA `createVisualViewportVirtualKeyboardProvider` and the
 * native iOS Capacitor provider, per that file's own "Keyboard.show() is
 * not implemented" comment) only take effect when the widget's own
 * `rootComponent` -- the page/note ROOT block's component, not any specific
 * row -- IS `document.activeElement`. Real on-device capture
 * (`affine-dev-MobileDebugLog_debug-plus-1.log`) shows a
 * `keyboard-toolbar-inputmode-toggle` event fired with `isActiveElement:
 * false, inputModeBefore: "", inputModeAfter: ""` -- a confirmed silent
 * no-op -- while editing a Journal Todo row, whose actual focused element
 * (the row itself, or its title cell's inline editor, per
 * `list/pc/renderer.ts`'s `focusRowTitle`) is never literally
 * `rootComponent`, even though it IS a DOM descendant of it (this package
 * uses `ShadowlessElement` throughout -- no shadow-root boundary blocks a
 * `.contains()` check). Exact equality was too strict for row/cell-level
 * editing contexts; membership in the root's own subtree is the correct
 * test for "the editor area currently has focus." This is the confirmed
 * mechanism behind both the "+' button doesn't collapse the keyboard" and
 * "keyboard-toggle button doesn't (re)open the keyboard" reports.
 */
export function isRootComponentActive(
  rootComponent: HTMLElement | null | undefined,
  activeElement: Element | null
): boolean {
  return !!rootComponent && rootComponent.contains(activeElement);
}

/**
 * 999.1 A-2: `std.selection` can name a block the user has already left.
 * Database rows (Journal Todo) are data-view output, not block-tree
 * components, so focusing one never updates `std.selection`; the selection
 * keeps pointing at the paragraph the user was in before. The toolbar's
 * scroll-into-view then scrolled the page to that stale paragraph whenever
 * it re-ran (e.g. the toolbar re-mounting on a tap of the already-focused
 * row), while focus stayed in the row.
 *
 * The selection is stale when an editable element has focus that neither
 * contains nor is contained by the selected block. With nothing editable focused, keep the
 * existing behaviour (not stale).
 */
export function isSelectionStaleForFocus(
  selectedBlock: Element,
  activeElement: Element | null | undefined
): boolean {
  if (!activeElement) return false;
  const tag = activeElement.tagName;
  const editable =
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    (activeElement instanceof HTMLElement &&
      (activeElement.isContentEditable ||
        activeElement.getAttribute('contenteditable') === 'true'));
  if (!editable) return false;
  // Ordinary text: the focused editable is the note-level contenteditable
  // root, an ANCESTOR of the selected block -- not stale.
  if (activeElement.contains(selectedBlock)) return false;
  return !selectedBlock.contains(activeElement);
}

/**
 * 999.1 62px floor: bottom padding for the `<affine-keyboard-tool-panel>`
 * spacer. The spacer is `box-sizing: border-box`, so this padding is a hard
 * minimum height. The tab-bar safe area only matters while the keyboard is
 * closed (or a "+" panel replaces it); with the keyboard open it made the
 * toolbar stop `appTabSafeArea` px above the keyboard whenever the real
 * keyboard offset was smaller (e.g. at full scroll).
 */
export function panelPaddingBottom(
  panelOpened: boolean,
  keyboardVisible: boolean,
  appTabSafeArea: string
): string {
  return !panelOpened && keyboardVisible ? '0px' : appTabSafeArea;
}

/** See `shouldRescrollAfterKeyboardChange`. */
export const KEYBOARD_OPEN_RESCROLL_WINDOW_MS = 1000;

/**
 * 999.1: whether a keyboard height change should re-run the toolbar's
 * scroll-into-view. Tapping text in the lower half of the screen left the
 * caret under the toolbar: the scroll ran at tap time, while the toolbar was
 * still at the screen bottom, and iOS's own focus pan only clears the
 * keyboard, not the toolbar on top of it. Re-check while the keyboard opens
 * and settles, but only within a short window after it opened -- later
 * height changes come from the user scrolling (offset settle) and must not
 * yank the page back to the caret.
 */
export function shouldRescrollAfterKeyboardChange(
  keyboardVisible: boolean,
  keyboardOpenedAtMs: number | undefined,
  nowMs: number
): boolean {
  return (
    keyboardVisible &&
    keyboardOpenedAtMs !== undefined &&
    nowMs - keyboardOpenedAtMs < KEYBOARD_OPEN_RESCROLL_WINDOW_MS
  );
}

/**
 * 999.1: how far to scroll the page viewport so the edit point clears the
 * keyboard toolbar. Targets the caret when there is one -- targeting the
 * block's bottom dragged the page for tall blocks (a whole database table)
 * -- and falls back to the block bottom otherwise. 0 = no scroll.
 */
export function scrollIntoViewDelta(
  toolbarTop: number,
  blockBottom: number,
  caretBottom: number | null,
  gap: number
): number {
  const target = caretBottom ?? blockBottom;
  return Math.max(0, target + gap - toolbarTop);
}

/**
 * 999.11: comparable key for a `std.selection` value. Touching the page to
 * scroll re-emits the SAME selection, and the toolbar's selection effect used
 * to treat every emission as a caret move -- scrolling the caret's block
 * back into view on every touchstart (the page "jumped back" to linked notes
 * whenever the user tried to scroll up). Only a changed key should scroll.
 */
export function selectionKey(
  selections: ReadonlyArray<{ toJSON: () => unknown }>
): string {
  return JSON.stringify(selections.map(selection => selection.toJSON()));
}

/**
 * 999.11: whether a selection emission should scroll the edit point into
 * view. The keyboard toolbar is re-created on every touch inside a linked
 * note's nested editor, so the "last selection" memory must outlive the
 * toolbar instance: it is keyed by the editor root and shared by all
 * instances (a WeakMap, so roots are not retained). Records `key`.
 */
export function shouldScrollForSelectionChange(
  memory: WeakMap<object, string>,
  root: object,
  key: string
): boolean {
  if (memory.get(root) === key) return false;
  memory.set(root, key);
  return true;
}
