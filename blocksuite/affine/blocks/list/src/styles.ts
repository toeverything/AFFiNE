import { css } from 'lit';

export const listPrefix = css`
  .affine-list-block__prefix {
    display: flex;
    color: var(--affine-blue-700);
    font-size: var(--affine-font-sm);
    user-select: none;
    position: relative;
  }

  .affine-list-block__numbered {
    min-width: 22px;
    height: 24px;
    margin-left: 2px;
  }

  .affine-list-block__todo-prefix {
    display: flex;
    align-items: center;
    cursor: pointer;
    width: 24px;
    height: 24px;
    color: var(--affine-icon-color);
  }

  .affine-list-block__todo-prefix.readonly {
    cursor: default;
  }

  .affine-list-block__todo-prefix > svg {
    width: 20px;
    height: 20px;
  }
`;

export const listBlockStyles = css`
  affine-list {
    display: block;
    font-size: var(--affine-font-base);
  }

  affine-list code {
    font-size: calc(var(--affine-font-base) - 3px);
    padding: 0px 4px 2px;
  }

  .affine-list-block-container {
    box-sizing: border-box;
    border-radius: 4px;
    position: relative;
  }
  .affine-list-block-container .affine-list-block-container {
    margin-top: 0;
  }
  .affine-list-rich-text-wrapper {
    position: relative;
    display: flex;
  }
  .affine-list-rich-text-wrapper rich-text {
    flex: 1;
  }

  .affine-list-todo-title {
    border: 1px solid var(--affine-border-color);
    border-radius: 6px;
    font-size: 12px;
    line-height: 20px;
    padding: 1px 8px;
    margin: 1px 8px 0 0;
    min-width: 140px;
    max-width: 260px;
  }

  .affine-list-todo-field-input {
    border: 1px solid var(--affine-border-color);
    border-radius: 6px;
    font-size: 12px;
    line-height: 20px;
    padding: 1px 8px;
    margin: 1px 0 0 8px;
    width: auto;
    min-width: 72px;
    max-width: 100%;
    text-align: left;
    flex: 0 1 auto;
  }

  .affine-list-todo-field-input-number {
    text-align: right;
  }

  .affine-list-todo-fields {
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    margin-left: 0;
    min-width: 0;
  }

  .affine-list-todo-fields[data-layout='inline'] {
    margin-left: 2px;
    margin-right: 0;
    justify-content: flex-start;
  }

  .affine-list-todo-fields[data-layout='aligned'] {
    margin-left: auto;
    width: min(40vw, 360px);
    justify-content: flex-end;
    display: grid;
    grid-template-columns: repeat(
      var(--affine-todo-field-count),
      minmax(108px, 1fr)
    );
    gap: 8px;
  }

  .affine-list-todo-fields[data-layout='right'] {
    margin-left: auto;
    justify-content: flex-end;
    width: min(40vw, 360px);
    display: grid;
    grid-template-columns: repeat(
      var(--affine-todo-field-count),
      minmax(108px, 1fr)
    );
    gap: 8px;
  }

  .affine-list-todo-fields[data-layout='aligned'] .affine-list-todo-field-input,
  .affine-list-todo-fields[data-layout='right'] .affine-list-todo-field-input {
    width: 100%;
    min-width: 0;
    max-width: none;
    margin-left: 0;
  }

  .affine-list-todo-fields[data-layout='right'] .affine-list-todo-field-input {
    justify-self: end;
  }

  .affine-list-rich-text-wrapper[data-todo-layout='inline'] rich-text {
    flex: 0 1 auto;
    width: auto;
    min-width: 1em;
  }

  .affine-list-rich-text-wrapper[data-todo-layout='inline'] {
    width: auto;
    max-width: 100%;
  }

  .affine-list-rich-text-wrapper[data-todo-layout='aligned'] rich-text,
  .affine-list-rich-text-wrapper[data-todo-layout='right'] rich-text {
    flex: 1;
    min-width: 0;
  }

  .affine-list--checked {
    color: var(--affine-text-secondary-color);
  }

  ${listPrefix}
`;
