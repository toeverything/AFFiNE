/**
 * SVG icon generation utilities
 */

import { resolveCssVariable } from './css-utils.js';

/**
 * Get SVG string for bulleted list icon based on depth
 */
export function getBulletIconSvg(depth: number): string {
  const bulletIndex = depth % 4;
  const blueColor = resolveCssVariable('var(--affine-blue-700)') || '#1E96EB';
  const bulletSvgs = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="7" cy="12" r="3" fill="${blueColor}"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M7 14.25C8.243 14.25 9.25 13.243 9.25 12C9.25 10.757 8.243 9.75 7 9.75C5.757 9.75 4.75 10.757 4.75 12C4.75 13.243 5.757 14.25 7 14.25ZM7 15C8.657 15 10 13.657 10 12C10 10.343 8.657 9 7 9C5.343 9 4 10.343 4 12C4 13.657 5.343 15 7 15Z" fill="${blueColor}" fill-rule="evenodd"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M6.408 9.245C6.735 8.918 7.265 8.918 7.592 9.245L9.755 11.408C10.082 11.735 10.082 12.265 9.755 12.592L7.592 14.755C7.265 15.082 6.735 15.082 6.408 14.755L4.245 12.592C3.918 12.265 3.918 11.735 4.245 11.408L6.408 9.245Z" fill="${blueColor}"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M9.163 12L7 9.837L4.837 12L7 14.163L9.163 12ZM7.592 9.245C7.265 8.918 6.735 8.918 6.408 9.245L4.245 11.408C3.918 11.735 3.918 12.265 4.245 12.592L6.408 14.755C6.735 15.082 7.265 15.082 7.592 14.755L9.755 12.592C10.082 12.265 10.082 11.735 9.755 11.408L7.592 9.245Z" fill="${blueColor}" fill-rule="evenodd"/></svg>`,
  ];
  return bulletSvgs[bulletIndex];
}

/**
 * Get SVG string for checkbox icon (checked or unchecked)
 */
export function getCheckboxIconSvg(checked: boolean): string {
  if (checked) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M3.25 6C3.25 4.48122 4.48122 3.25 6 3.25H18C19.5188 3.25 20.75 4.48122 20.75 6V18C20.75 19.5188 19.5188 20.75 18 20.75H6C4.48122 20.75 3.25 19.5188 3.25 18V6ZM16.5303 9.53033C16.8232 9.23744 16.8232 8.76256 16.5303 8.46967C16.2374 8.17678 15.7626 8.17678 15.4697 8.46967L10.5 13.4393L9.03033 11.9697C8.73744 11.6768 8.26256 11.6768 7.96967 11.9697C7.67678 12.2626 7.67678 12.7374 7.96967 13.0303L9.96967 15.0303C10.2626 15.3232 10.7374 15.3232 11.0303 15.0303L16.5303 9.53033Z" fill="#1E96EB" fill-rule="evenodd"/></svg>';
  } else {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M6 3.25C4.48122 3.25 3.25 4.48122 3.25 6V18C3.25 19.5188 4.48122 20.75 6 20.75H18C19.5188 20.75 20.75 19.5188 20.75 18V6C20.75 4.48122 19.5188 3.25 18 3.25H6ZM4.75 6C4.75 5.30964 5.30964 4.75 6 4.75H18C18.6904 4.75 19.25 5.30964 19.25 6V18C19.25 18.6904 18.6904 19.25 18 19.25H6C5.30964 19.25 4.75 18.6904 4.75 18V6Z" fill="#666666" fill-rule="evenodd"/></svg>';
  }
}

/**
 * Get SVG string for toggle icon (down or right)
 */
export function getToggleIconSvg(expanded: boolean): string {
  if (expanded) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17L16.59 8.59L18 10L12 16L6 10L7.41 8.59Z" fill="#666666"/></svg>';
  } else {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z" fill="#666666"/></svg>';
  }
}
