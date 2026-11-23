import { DisposableGroup } from '@blocksuite/global/disposable';
import type { ReactiveController, ReactiveElement } from 'lit';

import {
  type AdvancedPortalOptions,
  createLitPortal,
} from '../portal/index.js';
import type { HoverOptions } from './types.js';
import { whenHover } from './when-hover.js';

type OptionsParams = Omit<
  ReturnType<typeof whenHover>,
  'setFloating' | 'dispose'
> & {
  abortController: AbortController;
};
type HoverPortalOptions = Omit<AdvancedPortalOptions, 'abortController'>;

const DEFAULT_HOVER_OPTIONS: HoverOptions = {
  transition: {
    duration: 100,
    in: {
      opacity: '1',
      transition: 'opacity 0.1s ease-in-out',
    },
    out: {
      opacity: '0',
      transition: 'opacity 0.1s ease-in-out',
    },
  },
  setPortalAsFloating: true,
  allowMultiple: false,
};

const abortHoverPortal = ({
  portal,
  hoverOptions,
  abortController,
}: {
  portal: HTMLDivElement | undefined;
  hoverOptions: HoverOptions;
  abortController: AbortController;
}) => {
  if (!portal || !hoverOptions.transition) {
    abortController.abort();
    return;
  }
  // Transition out
  Object.assign(portal.style, hoverOptions.transition.out);

  portal.addEventListener(
    'transitionend',
    () => {
      abortController.abort();
    },
    { signal: abortController.signal }
  );
  portal.addEventListener(
    'transitioncancel',
    () => {
      abortController.abort();
    },
    { signal: abortController.signal }
  );

  // Make sure the portal is aborted after the transition ends
  setTimeout(() => abortController.abort(), hoverOptions.transition.duration);
};

export class HoverController implements ReactiveController {
  static globalAbortController?: AbortController;

  private _abortController?: AbortController;

  private readonly _hoverOptions: HoverOptions;

  private _isHovering = false;

  private readonly _onHover: (
    options: OptionsParams
  ) => HoverPortalOptions | null;

  private _portal?: HTMLDivElement;

  private _setReference: (element?: Element | undefined) => void = () => {
    console.error('setReference is not ready');
  };

  protected _disposables = new DisposableGroup();

  host: ReactiveElement;

  /**
   * Callback when the portal needs to be aborted.
   */
  onAbort = () => {
    this.abort();
  };

  /**
   * Whether the host is currently hovering.
   *
   * This property is unreliable when the floating element disconnect from the DOM suddenly.
   */
  get isHovering() {
    return this._isHovering;
  }

  get portal() {
    return this._portal;
  }

  get setReference() {
    return this._setReference;
  }

  constructor(
    host: ReactiveElement,
    onHover: (options: OptionsParams) => HoverPortalOptions | null,
    hoverOptions?: Partial<HoverOptions>
  ) {
    this._hoverOptions = { ...DEFAULT_HOVER_OPTIONS, ...hoverOptions };
    (this.host = host).addController(this);
    this._onHover = onHover;
  }

  abort(force = false) {
    if (!this._abortController) return;
    if (force) {
      this._abortController.abort();
      return;
    }
    abortHoverPortal({
      portal: this._portal,
      hoverOptions: this._hoverOptions,
      abortController: this._abortController,
    });
  }

  hostConnected() {
    if (this._disposables.disposed) {
      this._disposables = new DisposableGroup();
    }
    // Start a timer when the host is connected
    const { setReference, setFloating, dispose } = whenHover(isHover => {
      if (!this.host.isConnected) {
        return;
      }

      this._isHovering = isHover;
      if (!isHover) {
        this.onAbort();
        return;
      }

      if (this._abortController) {
        return;
      }

      this._abortController = new AbortController();
      this._abortController.signal.addEventListener('abort', () => {
        this._abortController = undefined;
      });

      if (!this._hoverOptions.allowMultiple) {
        HoverController.globalAbortController?.abort();
        HoverController.globalAbortController = this._abortController;
      }

      const portalOptions = this._onHover({
        setReference,
        abortController: this._abortController,
      });
      if (!portalOptions) {
        // Sometimes the portal is not ready to show
        this._abortController.abort();
        return;
      }
      this._portal = createLitPortal({
        ...portalOptions,
        abortController: this._abortController,
      }).portal;

      const transition = this._hoverOptions.transition;
      if (transition) {
        Object.assign(this._portal.style, transition.in);
      }

      if (this._hoverOptions.setPortalAsFloating) {
        setFloating(this._portal);
      }
    }, this._hoverOptions);
    this._setReference = setReference;
    this._disposables.add(dispose);
  }

  hostDisconnected() {
    this._abortController?.abort();
    this._disposables.dispose();
  }
}
