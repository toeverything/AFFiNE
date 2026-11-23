import type { Constructor } from '@blocksuite/global/utils';
import type { CSSResultGroup, CSSResultOrNative } from 'lit';
import { CSSResult, LitElement } from 'lit';

export class ShadowlessElement extends LitElement {
  // Map of the number of styles injected into a node
  // A reference count of the number of ShadowlessElements that are still connected
  static connectedCount = new WeakMap<
    Constructor, // class
    WeakMap<Node, number>
  >();

  static onDisconnectedMap = new WeakMap<
    Constructor, // class
    WeakMap<Node, (() => void) | null>
  >();

  // styles registered in ShadowlessElement will be available globally
  // even if the element is not being rendered
  protected static override finalizeStyles(
    styles?: CSSResultGroup
  ): CSSResultOrNative[] {
    const elementStyles = super.finalizeStyles(styles);
    // XXX: This breaks component encapsulation and applies styles to the document.
    // These styles should be manually scoped.
    elementStyles.forEach((s: CSSResultOrNative) => {
      if (s instanceof CSSResult && typeof document !== 'undefined') {
        const styleRoot = document.head;
        const style = document.createElement('style');
        style.textContent = s.cssText;
        styleRoot.append(style);
      }
    });
    return elementStyles;
  }

  private getConnectedCount() {
    const SE = this.constructor as typeof ShadowlessElement;
    return SE.connectedCount.get(SE)?.get(this.getRootNode()) ?? 0;
  }

  private setConnectedCount(count: number) {
    const SE = this.constructor as typeof ShadowlessElement;

    if (!SE.connectedCount.has(SE)) {
      SE.connectedCount.set(SE, new WeakMap());
    }

    SE.connectedCount.get(SE)?.set(this.getRootNode(), count);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const parentRoot = this.getRootNode();
    const SE = this.constructor as typeof ShadowlessElement;
    const insideShadowRoot = parentRoot instanceof ShadowRoot;
    const styleInjectedCount = this.getConnectedCount();

    if (styleInjectedCount === 0 && insideShadowRoot) {
      const elementStyles = SE.elementStyles;
      const injectedStyles: HTMLStyleElement[] = [];
      elementStyles.forEach((s: CSSResultOrNative) => {
        if (s instanceof CSSResult && typeof document !== 'undefined') {
          const style = document.createElement('style');
          style.textContent = s.cssText;
          parentRoot.prepend(style);
          injectedStyles.push(style);
        }
      });
      if (!SE.onDisconnectedMap.has(SE)) {
        SE.onDisconnectedMap.set(SE, new WeakMap());
      }
      SE.onDisconnectedMap.get(SE)?.set(parentRoot, () => {
        injectedStyles.forEach(style => style.remove());
      });
    }
    this.setConnectedCount(styleInjectedCount + 1);
  }

  override createRenderRoot() {
    return this;
  }

  override disconnectedCallback(): void {
    const parentRoot = this.getRootNode();
    super.disconnectedCallback();
    const SE = this.constructor as typeof ShadowlessElement;
    let styleInjectedCount = this.getConnectedCount();
    styleInjectedCount--;
    this.setConnectedCount(styleInjectedCount);

    if (styleInjectedCount === 0) {
      // remove the style element when the last shadowless element is disconnected in the parent root
      SE.onDisconnectedMap.get(SE)?.get(parentRoot)?.();
    }
  }
}
