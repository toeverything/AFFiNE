import { BlockSuiteError } from '@blocksuite/global/exceptions';
import {
  autoUpdate,
  computePosition,
  type ComputePositionReturn,
} from '@floating-ui/dom';
import { cssVar } from '@toeverything/theme';
import { render } from 'lit';
import { Subject } from 'rxjs';

import type { AdvancedPortalOptions, PortalOptions } from './types.js';

/**
 * Similar to `<blocksuite-portal>`, but only renders once when called.
 *
 * The template should be a **static** template since it will not be re-rendered unless `updatePortal` is called.
 *
 * See {@link Portal} for more details.
 */
export function createSimplePortal({
  template,
  container = document.body,
  signal = new AbortController().signal,
  renderOptions,
  shadowDom = true,
  identifyWrapper = true,
}: PortalOptions) {
  const portalRoot = document.createElement('div');
  if (identifyWrapper) {
    portalRoot.classList.add('blocksuite-portal');
  }
  if (shadowDom) {
    portalRoot.attachShadow({
      mode: 'open',
      ...(typeof shadowDom !== 'boolean' ? shadowDom : {}),
    });
  }
  signal.addEventListener('abort', () => {
    portalRoot.remove();
  });

  const root = shadowDom ? portalRoot.shadowRoot : portalRoot;
  if (!root) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.ValueNotExists,
      'Failed to create portal root'
    );
  }

  let updateId = 0;
  const updatePortal: (id: number) => void = id => {
    if (id !== updateId) {
      console.warn(
        'Potentially infinite recursion! Please clean up the old event listeners before `updatePortal`'
      );
      return;
    }
    updateId++;
    const curId = updateId;
    const templateResult =
      template instanceof Function
        ? template({ updatePortal: () => updatePortal(curId) })
        : template;
    render(templateResult, root, renderOptions);
  };

  updatePortal(updateId);
  container.append(portalRoot);

  // affine's modal will set pointer-events: none to body
  // in order to avoid the issue that the floating element in blocksuite cannot be clicked
  // we add pointer-events: auto here
  portalRoot.style.pointerEvents = 'auto';

  return portalRoot;
}

/**
 * Where el is the DOM element you'd like to test for visibility
 */
function isElementVisible(el: Element) {
  // The API is not stable, so we need to check the existence of the function first
  // See also https://caniuse.com/?search=checkVisibility
  if (el.checkVisibility) {
    // See https://drafts.csswg.org/cssom-view-1/#dom-element-checkvisibility
    return el.checkVisibility();
  }
  // Fallback to the old way
  // Remove this when the `checkVisibility` API is stable
  if (!el.isConnected) return false;

  if (el instanceof HTMLElement) {
    // See https://stackoverflow.com/questions/19669786/check-if-element-is-visible-in-dom
    return !(el.offsetParent === null);
  }
  return true;
}

/**
 * Similar to `createSimplePortal`, but supports auto update position.
 *
 * The template should be a **static** template since it will not be re-rendered.
 *
 * See {@link createSimplePortal} for more details.
 *
 * @example
 * ```ts
 * createLitPortal({
 *   template: RenameModal({
 *     model,
 *     abortController: renameAbortController,
 *   }),
 *   computePosition: {
 *     referenceElement: anchor,
 *     placement: 'top-end',
 *     middleware: [flip(), offset(4)],
 *     autoUpdate: true,
 *   },
 *   abortController: renameAbortController,
 * });
 * ```
 */
export function createLitPortal({
  computePosition: positionConfigOrFn,
  abortController,
  closeOnClickAway = false,
  positionStrategy = 'absolute',
  ...portalOptions
}: AdvancedPortalOptions) {
  let positionSlot = new Subject<ComputePositionReturn>();
  const template = portalOptions.template;
  const templateWithPosition =
    template instanceof Function
      ? ({ updatePortal }: { updatePortal: () => void }) => {
          // We need to create a new slot for each template, otherwise the slot may be used in the old template
          positionSlot = new Subject<ComputePositionReturn>();
          return template({ updatePortal, positionSlot });
        }
      : template;

  const portalRoot = createSimplePortal({
    ...portalOptions,
    signal: abortController.signal,
    template: templateWithPosition,
  });

  if (closeOnClickAway) {
    // Avoid triggering click away listener on initial render
    setTimeout(() =>
      document.addEventListener(
        'click',
        e => {
          if (portalRoot.contains(e.target as Node)) return;
          abortController.abort();
        },
        {
          signal: abortController.signal,
        }
      )
    );
  }

  if (!positionConfigOrFn) {
    return { portal: portalRoot, update: () => {} };
  }

  const visibility = portalRoot.style.visibility;
  portalRoot.style.visibility = 'hidden';
  portalRoot.style.position = positionStrategy;
  portalRoot.style.left = '0';
  portalRoot.style.top = '0';
  portalRoot.style.zIndex = cssVar('zIndexPopover');

  Object.assign(portalRoot.style, portalOptions.portalStyles);

  const computePositionOptions =
    positionConfigOrFn instanceof Function
      ? positionConfigOrFn(portalRoot)
      : positionConfigOrFn;
  const { referenceElement, ...options } = computePositionOptions;
  const update = () => {
    if (
      computePositionOptions.abortWhenRefRemoved !== false &&
      referenceElement instanceof Element &&
      !isElementVisible(referenceElement)
    ) {
      abortController.abort();
    }
    computePosition(referenceElement, portalRoot, {
      strategy: positionStrategy,
      ...options,
    })
      .then(positionReturn => {
        const { x, y } = positionReturn;
        // Use transform maybe cause overlay-mask offset issue
        // portalRoot.style.transform = `translate(${x}px, ${y}px)`;
        portalRoot.style.left = `${x}px`;
        portalRoot.style.top = `${y}px`;
        if (portalRoot.style.visibility === 'hidden') {
          portalRoot.style.visibility = visibility;
        }
        positionSlot.next(positionReturn);
      })
      .catch(console.error);
  };
  if (!computePositionOptions.autoUpdate) {
    update();
  } else {
    const autoUpdateOptions =
      computePositionOptions.autoUpdate === true
        ? {}
        : computePositionOptions.autoUpdate;
    const cleanup = autoUpdate(
      referenceElement,
      portalRoot,
      update,
      autoUpdateOptions
    );
    abortController.signal.addEventListener('abort', () => {
      cleanup();
    });
  }

  return { portal: portalRoot, update };
}
