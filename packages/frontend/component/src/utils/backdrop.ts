/// <reference types="react-router-dom" />
/**
 * This component is a hack to support `startViewTransition` in the modal.
 */
class ModalTransitionContainer extends HTMLElement {
  pendingTransitionNodes: Node[] = [];
  animationFrame: number | null = null;

  /**
   * This method will be called when the modal is removed from the DOM
   * https://github.com/facebook/react/blob/e4b4aac2a01b53f8151ca85148873096368a7de2/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L833
   */
  override removeChild<T extends Node>(child: T): T {
    if (typeof document.startViewTransition === 'function') {
      this.pendingTransitionNodes.push(child);
      this.requestTransition();
      return child;
    } else {
      // eslint-disable-next-line unicorn/prefer-dom-node-remove
      return super.removeChild(child);
    }
  }

  /**
   * We collect all the nodes that are removed in the single frame and then trigger the transition.
   */
  private requestTransition() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    this.animationFrame = requestAnimationFrame(() => {
      if (typeof document.startViewTransition === 'function') {
        const nodes = this.pendingTransitionNodes;
        document.startViewTransition(() => {
          nodes.forEach(child => {
            // eslint-disable-next-line unicorn/prefer-dom-node-remove
            super.removeChild(child);
          });
        });
        this.pendingTransitionNodes = [];
      }
    });
  }
}

let container: ModalTransitionContainer | null = null;
export function getBackdropContainer() {
  if (!container) {
    customElements.define(
      'modal-transition-container',
      ModalTransitionContainer
    );
    container = new ModalTransitionContainer();
    document.body.append(container);
  }
  return container;
}
