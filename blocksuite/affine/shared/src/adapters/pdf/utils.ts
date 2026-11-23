/**
 * Pure utility functions for PDF adapter
 */

// Layout constants
export const BLOCK_CHILDREN_CONTAINER_PADDING_LEFT = 24;
export const MAX_PAPER_WIDTH = 550;
export const MAX_PAPER_HEIGHT = 800;

// Color constants
export const PDF_COLORS = {
  /** Primary link color */
  link: '#0066cc',
  /** Primary text color */
  text: '#333333',
  /** Secondary/muted text color */
  textMuted: '#666666',
  /** Tertiary/disabled text color */
  textDisabled: '#999999',
  /** Border/divider color */
  border: '#cccccc',
  /** Code block background */
  codeBackground: '#f5f5f5',
  /** Card/container background */
  cardBackground: '#f9f9f9',
} as const;

/**
 * Table layout with no borders (for custom styled containers)
 */
export const TABLE_LAYOUT_NO_BORDERS = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
} as const;

/**
 * Generate placeholder text for images that cannot be rendered
 */
export function getImagePlaceholder(caption?: string): string {
  return caption ? `[Image: ${caption}]` : '[Image]';
}

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
