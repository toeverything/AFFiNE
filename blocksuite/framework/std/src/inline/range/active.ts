import { RANGE_SYNC_EXCLUDE_ATTR } from './consts.js';

function getClosestElement(target: EventTarget | null) {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

export function isRangeSyncExcludedTarget(target: EventTarget | null) {
  return !!getClosestElement(target)?.closest(
    `[${RANGE_SYNC_EXCLUDE_ATTR}="true"]`
  );
}

export function shouldDeactivateEditorOnFocusOut(
  editorHost: HTMLElement,
  relatedTarget: EventTarget | null
) {
  if (!relatedTarget || !(relatedTarget instanceof Node)) {
    return false;
  }

  if (editorHost.contains(relatedTarget)) {
    return false;
  }

  if (isRangeSyncExcludedTarget(relatedTarget)) {
    return false;
  }

  return true;
}

/**
 * Check if the active element is in the editor host.
 * TODO(@mirone): this is a trade-off, we need to use separate awareness store for every store to make sure the selection is isolated.
 *
 * @param editorHost - The editor host element.
 * @returns Whether the active element is in the editor host.
 */
export function isActiveInEditor(editorHost: HTMLElement) {
  const currentActiveElement = document.activeElement;
  if (!currentActiveElement) return false;
  // The input or textarea in the widget should be ignored.
  if (isRangeSyncExcludedTarget(currentActiveElement)) return false;
  const currentEditorHost = currentActiveElement?.closest('editor-host');
  if (!currentEditorHost) return false;
  return currentEditorHost === editorHost;
}
