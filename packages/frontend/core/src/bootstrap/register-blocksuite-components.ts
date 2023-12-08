import { registerTOCComponents } from '@blocksuite/blocks';

registerTOCComponents(components => {
  for (const compName in components) {
    if (window.customElements.get(compName)) continue;

    window.customElements.define(
      compName,
      components[compName as keyof typeof components]
    );
  }
});
