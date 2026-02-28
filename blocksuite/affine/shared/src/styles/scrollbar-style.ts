import { css, unsafeCSS } from 'lit';

/**
 * You should add a container before the scrollbar style to prevent the style pollution of the whole doc.
 */
export const scrollbarStyle = (container: string) => {
  if (!container) {
    console.error(
      'To prevent style pollution of the whole doc, you must add a container before the scrollbar style.'
    );
    return css``;
  }

  // sanitize container name
  if (container.includes('{') || container.includes('}')) {
    console.error('Invalid container name! Please use a valid CSS selector.');
    return css``;
  }

  return css`
    ${unsafeCSS(container)} {
      scrollbar-gutter: stable;
    }
    ${unsafeCSS(container)}::-webkit-scrollbar {
      -webkit-appearance: none;
      width: 4px;
      height: 4px;
    }
    ${unsafeCSS(container)}::-webkit-scrollbar-thumb {
      border-radius: 2px;
      background-color: #b1b1b1;
    }
    ${unsafeCSS(container)}::-webkit-scrollbar-corner {
      display: none;
    }
  `;
};
