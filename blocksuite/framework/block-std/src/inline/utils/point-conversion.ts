import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

import type { VElement, VLine } from '../components/index.js';
import { INLINE_ROOT_ATTR, ZERO_WIDTH_SPACE } from '../consts.js';
import type { DomPoint, TextPoint } from '../types.js';
import {
  isInlineRoot,
  isNativeTextInVText,
  isVElement,
  isVLine,
} from './guard.js';
import { calculateTextLength, getTextNodesFromElement } from './text.js';

export function nativePointToTextPoint(
  node: unknown,
  offset: number
): TextPoint | null {
  if (isNativeTextInVText(node)) {
    return [node, offset];
  }

  if (isVElement(node)) {
    const texts = getTextNodesFromElement(node);
    const vElement = texts[0].parentElement?.closest('[data-v-element="true"]');

    if (
      texts.length === 1 &&
      vElement instanceof HTMLElement &&
      vElement.dataset.vEmbed === 'true'
    ) {
      return [texts[0], 0];
    }

    if (texts.length > 0) {
      return texts[offset] ? [texts[offset], 0] : null;
    }
  }

  if (isVLine(node) || isInlineRoot(node)) {
    return getTextPointRoughlyFromElementByOffset(node, offset, true);
  }

  if (!(node instanceof Node)) {
    return null;
  }

  const vNodes = getVNodesFromNode(node);

  if (vNodes) {
    return getTextPointFromVNodes(vNodes, node, offset);
  }

  return null;
}

export function textPointToDomPoint(
  text: Text,
  offset: number,
  rootElement: HTMLElement
): DomPoint | null {
  if (rootElement.dataset.vRoot !== 'true') {
    throw new BlockSuiteError(
      ErrorCode.InlineEditorError,
      'textRangeToDomPoint should be called with editor root element'
    );
  }

  if (!rootElement.contains(text)) return null;

  const texts = getTextNodesFromElement(rootElement);
  if (texts.length === 0) return null;

  const goalIndex = texts.indexOf(text);
  let index = 0;
  for (const text of texts.slice(0, goalIndex)) {
    index += calculateTextLength(text);
  }

  if (text.wholeText !== ZERO_WIDTH_SPACE) {
    index += offset;
  }

  const textParentElement = text.parentElement;
  if (!textParentElement) {
    throw new BlockSuiteError(
      ErrorCode.InlineEditorError,
      'text element parent not found'
    );
  }

  const lineElement = textParentElement.closest('v-line');

  if (!lineElement) {
    throw new BlockSuiteError(
      ErrorCode.InlineEditorError,
      'line element not found'
    );
  }

  const lineIndex = Array.from(rootElement.querySelectorAll('v-line')).indexOf(
    lineElement
  );

  return { text, index: index + lineIndex };
}

function getVNodesFromNode(node: Node): VElement[] | VLine[] | null {
  const vLine = node.parentElement?.closest('v-line');

  if (vLine) {
    return Array.from(vLine.querySelectorAll('v-element'));
  }

  const container =
    node instanceof Element
      ? node.closest(`[${INLINE_ROOT_ATTR}]`)
      : node.parentElement?.closest(`[${INLINE_ROOT_ATTR}]`);

  if (container) {
    return Array.from(container.querySelectorAll('v-line'));
  }

  return null;
}

function getTextPointFromVNodes(
  vNodes: VLine[] | VElement[],
  node: Node,
  offset: number
): TextPoint | null {
  const first = vNodes[0];
  for (let i = 0; i < vNodes.length; i++) {
    const vNode = vNodes[i];

    if (i === 0 && AFollowedByB(node, vNode)) {
      return getTextPointRoughlyFromElementByOffset(first, offset, true);
    }

    if (AInsideB(node, vNode)) {
      return getTextPointRoughlyFromElementByOffset(first, offset, false);
    }

    if (i === vNodes.length - 1 && APrecededByB(node, vNode)) {
      return getTextPointRoughlyFromElement(vNode);
    }

    if (
      i < vNodes.length - 1 &&
      APrecededByB(node, vNode) &&
      AFollowedByB(node, vNodes[i + 1])
    ) {
      return getTextPointRoughlyFromElement(vNode);
    }
  }

  return null;
}

function getTextPointRoughlyFromElement(element: Element): TextPoint | null {
  const texts = getTextNodesFromElement(element);
  if (texts.length === 0) return null;
  const text = texts[texts.length - 1];
  return [text, calculateTextLength(text)];
}

function getTextPointRoughlyFromElementByOffset(
  element: Element,
  offset: number,
  fromStart: boolean
): TextPoint | null {
  const texts = getTextNodesFromElement(element);
  if (texts.length === 0) return null;
  const text = fromStart ? texts[0] : texts[texts.length - 1];
  return [text, offset === 0 ? offset : text.length];
}

function AInsideB(a: Node, b: Node): boolean {
  return (
    b.compareDocumentPosition(a) === Node.DOCUMENT_POSITION_CONTAINED_BY ||
    b.compareDocumentPosition(a) ===
      (Node.DOCUMENT_POSITION_CONTAINED_BY | Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

function AFollowedByB(a: Node, b: Node): boolean {
  return a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;
}

function APrecededByB(a: Node, b: Node): boolean {
  return a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_PRECEDING;
}
