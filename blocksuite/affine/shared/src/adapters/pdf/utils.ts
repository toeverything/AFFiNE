/**
 * Pure utility functions for PDF adapter
 */

export const BLOCK_CHILDREN_CONTAINER_PADDING_LEFT = 24;
export const MAX_PAPER_WIDTH = 550;
export const MAX_PAPER_HEIGHT = 800;

/**
 * Check if text content has meaningful content
 */
export function hasTextContent(
  textContent: string | Array<string | { text: string; [key: string]: any }>
): boolean {
  if (typeof textContent === 'string') {
    return textContent.trim() !== '';
  }
  return textContent.length > 0;
}

/**
 * Convert text content array to plain string
 */
export function textContentToString(
  textContent: string | Array<string | { text: string; [key: string]: any }>
): string {
  if (typeof textContent === 'string') {
    return textContent;
  }
  return textContent
    .map(item => (typeof item === 'string' ? item : item.text))
    .join('');
}
