import { ZERO_WIDTH_SPACE } from '../consts.js';

export function calculateTextLength(text: Text): number {
  if (text.wholeText === ZERO_WIDTH_SPACE) {
    return 0;
  } else {
    return text.wholeText.length;
  }
}

export function getTextNodesFromElement(element: Element): Text[] {
  const textSpanElements = Array.from(
    element.querySelectorAll('[data-v-text="true"]')
  );
  const textNodes = textSpanElements.flatMap(textSpanElement => {
    const textNode = Array.from(textSpanElement.childNodes).find(
      (node): node is Text => node instanceof Text
    );
    if (!textNode) return [];

    return textNode;
  });

  return textNodes;
}
