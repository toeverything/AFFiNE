/**
 * The options for the embed iframe status card
 * layout: the layout of the card, horizontal or vertical
 * width: the width of the card, if not set, the card width will be 100%
 * height: the height of the card, if not set, the card height will be 100%
 * @example
 * {
 *   layout: 'horizontal',
 *   height: 114,
 * }
 */
export type EmbedIframeStatusCardOptions = {
  layout: 'horizontal' | 'vertical';
  width?: number;
  height?: number;
};
