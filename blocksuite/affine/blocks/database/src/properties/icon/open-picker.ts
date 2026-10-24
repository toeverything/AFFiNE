import {
  type IconData,
  IconPickerServiceIdentifier,
} from '@blocksuite/affine-shared/services';
import type { EditorHost } from '@blocksuite/std';

/**
 * The callout block already registers `icon-picker-wrapper` and owns that tag,
 * so this borrows the element rather than shipping a second copy of it -- two
 * classes cannot claim one tag name, and a copy would drift.
 */
const WRAPPER_TAG = 'icon-picker-wrapper';

type Wrapper = HTMLElement & {
  iconPickerComponent?: unknown;
  props?: {
    onSelect?: (icon?: IconData) => void;
    onClose?: () => void;
  };
};

/** Opens the editor's own icon picker under `anchor`. Returns a close fn. */
export const openIconPicker = (
  std: EditorHost['std'] | undefined,
  anchor: HTMLElement,
  onSelect: (icon?: IconData) => void,
  /**
   * Fired once, whichever route closed the picker -- a selection, a click
   * outside, or the caller. Without it the caller keeps a handle to a picker
   * that is already gone, and its next click spends itself closing nothing.
   */
  onClosed?: () => void
): (() => void) | undefined => {
  const service = std?.getOptional(IconPickerServiceIdentifier);
  if (!service || !customElements.get(WRAPPER_TAG)) return undefined;

  const wrapper = document.createElement(WRAPPER_TAG) as Wrapper;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('click', onOutside, true);
    wrapper.remove();
    onClosed?.();
  };
  const onOutside = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node)) close();
  };

  wrapper.iconPickerComponent = service.iconPickerComponent;
  wrapper.props = {
    onSelect: icon => {
      onSelect(icon);
      close();
    },
    onClose: close,
  };

  const rect = anchor.getBoundingClientRect();
  Object.assign(wrapper.style, {
    // getBoundingClientRect gives viewport coordinates, so the wrapper has to
    // be positioned in that same frame. With `absolute` under <body> it drifts
    // by the scroll offset as soon as the document is scrolled.
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.bottom + 4}px`,
    zIndex: '1000',
    boxShadow: 'var(--affine-menu-shadow)',
    borderRadius: '8px',
  });
  document.body.append(wrapper);
  setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  return close;
};
