import type { EditorHost } from '@blocksuite/std';
import { baseTheme } from '@toeverything/theme';
import { html } from 'lit';

import { createToastContainer } from './create.js';
import { htmlToElement } from './html-to-element.js';

let ToastContainer: HTMLDivElement | null = null;

/**
 * @example
 * ```ts
 * toast('Hello World');
 * ```
 */
export const toast = (
  editorHost: EditorHost,
  message: string,
  duration = 2500
) => {
  if (!ToastContainer) {
    ToastContainer = createToastContainer(editorHost);
  }

  const styles = `
    max-width: 480px;
    text-align: center;
    font-family: ${baseTheme.fontSansFamily};
    font-size: var(--affine-font-sm);
    padding: 6px 12px;
    margin: 10px 0 0 0;
    color: var(--affine-white);
    background: var(--affine-tooltip);
    box-shadow: var(--affine-float-button-shadow);
    border-radius: 10px;
    transition: all 230ms cubic-bezier(0.21, 1.02, 0.73, 1);
    opacity: 0;
  `;

  const template = html`<div style="${styles}"></div>`;
  const element = htmlToElement<HTMLDivElement>(template);
  // message is not trusted
  element.textContent = message;
  ToastContainer?.append(element);

  const fadeIn = [
    {
      opacity: 0,
    },
    { opacity: 1 },
  ];
  const options = {
    duration: 230,
    easing: 'cubic-bezier(0.21, 1.02, 0.73, 1)',
    fill: 'forwards' as const,
  }; // satisfies KeyframeAnimationOptions;
  element.animate(fadeIn, options);

  setTimeout(() => {
    const fadeOut = fadeIn.reverse();
    const animation = element.animate(fadeOut, options);
    animation.finished
      .then(() => {
        element.style.maxHeight = '0';
        element.style.margin = '0';
        element.style.padding = '0';
        element.addEventListener(
          'transitionend',
          () => {
            element.remove();
          },
          {
            once: true,
          }
        );
      })
      .catch(console.error);
  }, duration);
  return element;
};
