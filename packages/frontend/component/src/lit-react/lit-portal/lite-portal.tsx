import { html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

type PortalEvent = {
  name: 'connectedCallback' | 'disconnectedCallback' | 'willUpdate';
  target: LitReactPortal;
  previousPortalId?: string;
};

type PortalListener = (event: PortalEvent) => void;
const listeners: Set<PortalListener> = new Set();

export function createLitPortalAnchor(callback: (event: PortalEvent) => void) {
  const id = nanoid();
  // todo(@Peng): clean up listeners?
  listeners.add(event => {
    if (event.target.portalId !== id) {
      return;
    }
    callback(event);
  });
  return html`<lit-react-portal portalId=${id}></lit-react-portal>`;
}

export const LIT_REACT_PORTAL = 'lit-react-portal';

@customElement(LIT_REACT_PORTAL)
class LitReactPortal extends LitElement {
  portalId: string = '';

  static override get properties() {
    return {
      portalId: { type: String },
    };
  }

  // do not enable shadow root
  override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    listeners.forEach(l =>
      l({
        name: 'connectedCallback',
        target: this,
      })
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    listeners.forEach(l =>
      l({
        name: 'disconnectedCallback',
        target: this,
      })
    );
  }

  override willUpdate(changedProperties: any) {
    super.willUpdate(changedProperties);
    listeners.forEach(l =>
      l({
        name: 'willUpdate',
        target: this,
        previousPortalId: changedProperties.get('portalId'),
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [LIT_REACT_PORTAL]: LitReactPortal;
  }
}

export type ElementOrFactory = React.ReactElement | (() => React.ReactElement);

type LitPortal = {
  id: string;
  portal: React.ReactPortal;
};

// returns a factory function that renders a given element to a lit template
export const useLitPortalFactory = () => {
  const [portals, setPortals] = useState<LitPortal[]>([]);

  return [
    useCallback(
      (elementOrFactory: React.ReactElement | (() => React.ReactElement)) => {
        const element =
          typeof elementOrFactory === 'function'
            ? elementOrFactory()
            : elementOrFactory;
        return createLitPortalAnchor(event => {
          const portalId = event.target.portalId;
          setPortals(portals => {
            const newPortals = portals.filter(
              p => p.id !== event.previousPortalId && p.id !== portalId
            );
            if (event.name !== 'disconnectedCallback') {
              newPortals.push({
                id: portalId,
                portal: ReactDOM.createPortal(element, event.target),
              });
            }
            return newPortals;
          });
        });
      },
      [setPortals]
    ),
    portals,
  ] as const;
};

// render a react element to a lit template
export const useLitPortal = (
  elementOrFactory: React.ReactElement | (() => React.ReactElement)
) => {
  const [anchor, setAnchor] = useState<HTMLElement>();
  const template = useMemo(
    () =>
      createLitPortalAnchor(event => {
        if (event.name !== 'disconnectedCallback') {
          setAnchor(event.target as HTMLElement);
        } else {
          setAnchor(undefined);
        }
      }),
    []
  );

  const element = useMemo(
    () =>
      typeof elementOrFactory === 'function'
        ? elementOrFactory()
        : elementOrFactory,
    [elementOrFactory]
  );
  return {
    template,
    portal: anchor ? ReactDOM.createPortal(element, anchor) : undefined,
  };
};
