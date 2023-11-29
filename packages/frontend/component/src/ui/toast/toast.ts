// Copyright: https://github.com/toeverything/blocksuite/commit/8032ef3ab97aefce01664b36502fc392c5db8b78#diff-bf5b41be21936f9165a8400c7f20e24d3dbc49644ba57b9258e0943f0dc1c464
import { DebugLogger } from '@affine/debug';
import type { TemplateResult } from 'lit';
import { css, html } from 'lit';

const logger = new DebugLogger('toast');

export const sleep = (ms = 0) =>
  new Promise(resolve => setTimeout(resolve, ms));

let ToastContainer: HTMLDivElement | null = null;

/**
 * DO NOT USE FOR USER INPUT
 * See https://stackoverflow.com/questions/494143/creating-a-new-dom-element-from-an-html-string-using-built-in-dom-methods-or-pro/35385518#35385518
 */
const htmlToElement = <T extends ChildNode>(html: string | TemplateResult) => {
  const template = document.createElement('template');
  if (typeof html === 'string') {
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
  } else {
    const { strings, values } = html;
    const v = [...values, '']; // + last empty part
    template.innerHTML = strings.reduce((acc, cur, i) => acc + cur + v[i], '');
  }
  return template.content.firstChild as T;
};

const createToastContainer = (portal?: HTMLElement) => {
  portal = portal || document.body;
  const styles = css`
    width: 100%;
    position: fixed;
    z-index: 9999;
    bottom: 78px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
  `;
  const template = html`<div
    style="${styles}"
    data-testid="affine-toast-container"
  ></div>`;
  const element = htmlToElement<HTMLDivElement>(template);
  portal.append(element);
  return element;
};

export type ToastOptions = {
  duration?: number;
  portal?: HTMLElement;
};

const animateToastOut = (toastElement: HTMLDivElement) => {
  toastElement.style.opacity = '0';
  setTimeout(() => toastElement.remove(), 300); // Match transition duration
};

const createAndShowNewToast = (
  message: string,
  duration: number,
  portal?: HTMLElement
) => {
  if (!ToastContainer || (portal && !portal.contains(ToastContainer))) {
    ToastContainer = createToastContainer(portal);
  }

  const toastStyles = css`
    position: absolute;
    bottom: 0;
    max-width: 480px;
    text-align: center;
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-sm);
    padding: 10px 16px;
    margin: 0;
    color: var(--affine-white);
    background: var(--affine-tooltip);
    box-shadow: var(--affine-float-button-shadow);
    border-radius: 8px;
    opacity: 0;
    transform: translateY(100%);
    transition:
      transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1),
      opacity 0.3s ease;
  `;

  const toastTemplate = html`<div
    style="${toastStyles}"
    data-testid="affine-toast"
  >
    ${message}
  </div>`;
  const toastElement = htmlToElement<HTMLDivElement>(toastTemplate);
  // message is not trusted
  toastElement.textContent = message;
  ToastContainer.append(toastElement);
  logger.debug(`toast with message: "${message}"`);
  window.dispatchEvent(
    new CustomEvent('affine-toast:emit', { detail: message })
  );

  setTimeout(() => {
    toastElement.style.opacity = '1';
    toastElement.style.transform = 'translateY(0)';
  }, 100);

  setTimeout(() => {
    animateToastOut(toastElement);
  }, duration);
};

/**
 * @example
 * ```ts
 * toast('Hello World');
 * ```
 */
export const toast = (
  message: string,
  { duration = 3000, portal }: ToastOptions = {}
) => {
  if (ToastContainer && ToastContainer.children.length >= 2) {
    // If there are already two toasts, remove the oldest one immediately
    const oldestToast = ToastContainer.children[0] as HTMLDivElement;
    oldestToast.remove();
  }

  // If there is one toast already, start its disappearing animation
  if (ToastContainer && ToastContainer.children.length === 1) {
    const currentToast = ToastContainer.children[0] as HTMLDivElement;
    animateToastOut(currentToast);
  }

  createAndShowNewToast(message, duration, portal);
};

export default toast;
