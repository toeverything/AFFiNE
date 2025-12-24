import { html, LitElement, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

type PortalEvent = {
  name: 'connectedCallback' | 'disconnectedCallback' | 'willUpdate';
  target: LitReactPortal;
};

type PortalListener = (event: PortalEvent) => void;

function createLitPortalAnchor(callback: (event: PortalEvent) => void) {
  return html`<lit-react-portal
    .notify=${callback}
    portalId=${nanoid()}
  ></lit-react-portal>`;
}

export const LIT_REACT_PORTAL = 'lit-react-portal';

@customElement(LIT_REACT_PORTAL)
class LitReactPortal extends LitElement {
  portalId!: string;
  notify?: PortalListener;

  static override get properties() {
    return {
      portalId: { type: String },
      notify: { attribute: false },
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    this.notify?.({
      name: 'connectedCallback',
      target: this,
    });
  }

  override attributeChangedCallback(
    name: string,
    oldVal: string,
    newVal: string
  ) {
    super.attributeChangedCallback(name, oldVal, newVal);
    if (name.toLowerCase() === 'portalid') {
      this.notify?.({
        name: 'willUpdate',
        target: this,
      });
    }
  }

  // do not enable shadow root
  override createRenderRoot() {
    return this;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.notify?.({
      name: 'disconnectedCallback',
      target: this,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [LIT_REACT_PORTAL]: LitReactPortal;
  }
}

export type ElementOrFactory = React.ReactNode | (() => React.ReactNode);

type LitPortal = {
  id: string;
  portal: React.ReactPortal;
  litElement: LitReactPortal;
};

export type ReactToLit = (
  elementOrFactory: ElementOrFactory,
  rerendering?: boolean
) => TemplateResult;

// returns a factory function that renders a given element to a lit template
export const useLitPortalFactory = () => {
  const [portals, setPortals] = useState<LitPortal[]>([]);

  const reactToLit: ReactToLit = useCallback(
    (elementOrFactory, rerendering) => {
      const element =
        typeof elementOrFactory === 'function'
          ? elementOrFactory()
          : elementOrFactory;
      return createLitPortalAnchor(event => {
        setPortals(portals => {
          const { name, target } = event;
          const id = target.portalId;
          let newPortals = portals;
          const updatePortals = () => {
            let oldPortalIndex = portals.findIndex(
              p => p.litElement === target
            );
            oldPortalIndex =
              oldPortalIndex === -1 ? portals.length : oldPortalIndex;
            newPortals = portals.toSpliced(oldPortalIndex, 1, {
              id,
              portal: ReactDOM.createPortal(element, target),
              litElement: target,
            });
          };
          switch (name) {
            case 'connectedCallback':
              updatePortals();
              break;
            case 'disconnectedCallback':
              newPortals = portals.filter(p => p.litElement.isConnected);
              break;
            case 'willUpdate':
              if (!target.isConnected || !rerendering) {
                break;
              }
              updatePortals();
              break;
          }
          return newPortals;
        });
      });
    },
    []
  );

  return [reactToLit, portals] as const;
};

// render a react element to a lit template
export const useLitPortal = (elementOrFactory: ElementOrFactory) => {
  const [anchor, setAnchor] = useState<HTMLElement>();
  const template = useMemo(
    () =>
      createLitPortalAnchor(event => {
        let anchor: HTMLElement | undefined;
        if (event.name !== 'disconnectedCallback') {
          anchor = event.target as HTMLElement;
        }
        setAnchor(anchor);
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
