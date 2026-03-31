import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

const isTouchPreferredDevice = () => {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
    return true;
  }

  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
};

export const historySeniorTool = SeniorToolExtension('history', ({ block }) => {
  return {
    name: 'History',
    enable: isTouchPreferredDevice(),
    content: html`<edgeless-history-tool-group
      .edgeless=${block}
    ></edgeless-history-tool-group>`,
  };
});
