// blocksuite/affine/components/src/date-picker/style.ts
import { css } from 'lit';

export const datePickerStyle = css`
  :host {
    display: block;
    overflow: visible;
  }

  .date-picker {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    gap: var(--gap-v);
    font-family: var(--affine-font-family);
    overflow: visible;
  }

  .popup.date-picker {
    background: var(--affine-background-overlay-panel-color);
    border-radius: 12px;
    box-shadow: var(--affine-menu-shadow);
  }

  /* small action */
  .date-picker-small-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }

  .interactive.date-picker-small-action,
  .interactive.action-label.today {
    color: var(--affine-icon-color);
  }

  .date-picker-small-action:hover {
    color: var(--affine-icon-hover-color);
    background: var(--affine-icon-hover-background);
  }

  .date-picker-small-action.left > svg {
    transform: rotate(0deg);
  }

  .date-picker-small-action.right > svg {
    transform: rotate(180deg);
  }

  .date-picker-small-action.down > svg {
    transform: rotate(-90deg);
  }

  /* action-header */
  .date-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .date-picker-header__buttons {
    display: flex;
  }

  .date-picker-header__date {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--affine-text-primary-color);
    font-weight: 600;
    padding: 2px;
    border-radius: 4px;
    font-size: 14px;
    line-height: 22px;
  }

  .date-picker-header__date > div {
    padding: 0px 4px;
  }

  .date-picker-header__action {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--affine-icon-color);
  }

  .date-picker-header__action.with-slot {
    gap: 4px;
  }

  .date-picker-header__action .action-label {
    font-size: 12px;
    padding: 0px 4px;
    height: 20px;
    border-radius: 4px;
    transition: all 0.23s ease;
    max-width: 100px;
  }

  .date-picker-header__action .action-label > span {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }

  /** days header */
  .days-header {
    display: flex;
    gap: var(--gap-h);
  }

  .days-header > div {
    color: var(--affine-text-secondary-color);
    font-weight: 500;
    font-size: 12px;
    cursor: default;
  }

  /** week */
  .date-picker-weeks {
    display: flex;
    flex-direction: column;
    gap: var(--gap-v);    /* ← vertical spacing between each week’s bar */
    overflow: visible;
  }

  .date-picker-week {
    display: flex;
    gap: var(--gap-h);
    overflow: visible;
    position: relative; /* stacking context */
  }

  /* background bar behind the interior “in-range” days */
  .range-bg {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: rgba(35, 130, 226, 0.41);
    border-radius: 0;
    z-index: 0;
  }

  /** cell */
  .date-cell {
    position: relative; /* above .range-bg */
    z-index: 1;
    width: var(--cell-size);
    height: var(--cell-size);
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    border-radius: 8px;
  }

  .date-cell[data-date] {
    font-weight: 400;
    font-size: 14px;
  }

  .date-cell.date-cell--not-curr-month {
    opacity: 0.1;
  }

  .date-cell.date-cell--selected {
    background: var(--affine-primary-color);
    color: var(--affine-pure-white);
    font-weight: 500;
  }

  /** interactive */
  .interactive {
    cursor: pointer;
    user-select: none;
    position: relative;
    border: none;
    background-color: unset;
    font-family: var(--affine-font-family);
    color: var(--affine-text-primary-color);
  }

  .interactive::after,
  .interactive::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    transition: background 0.23s ease;
  }

  .interactive::after {
    opacity: 1;
    background: transparent;
  }

  .interactive:hover::after {
    background: var(--affine-hover-color);
  }

  .interactive::before {
    opacity: 0;
    box-shadow: 0 0 0 3px var(--affine-primary-color);
  }

  .interactive:focus-visible {
    outline: none;
    outline: 1px solid var(--affine-primary-color);
  }

  .interactive:focus-visible::before {
    opacity: 0.5;
  }

  .interactive[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /** Month / Year picker */
  .date-picker-month {
    --btn-width: 36px;
  }
  .date-picker-year {
    --btn-width: 46px;
  }
  .date-picker-month,
  .date-picker-year {
    display: grid;
    grid-template-columns: repeat(3, var(--btn-width));
    gap: 18px 32px;
    justify-content: space-between;
  }
  .date-picker-month button,
  .date-picker-year button {
    height: 34px;
    width: var(--btn-width);
    padding: 4px;
    border-radius: 8px;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .date-picker-month button.active,
  .date-picker-year button.active {
    color: var(--affine-primary-color);
    font-weight: 600;
  }

  .date-picker .date-picker-header {
    padding: 0px;
    transition: padding 0.23s ease;
  }

  .date-picker--mode-month,
  .date-picker--mode-year {
    gap: 26px;
  }

  /** footer */
  .date-picker-footer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--affine-border-color);
  }
  .footer-button {
    height: 28px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--affine-text-secondary-color);
    cursor: pointer;
    font-size: var(--affine-font-sm);
    padding: 0 12px;
  }
  .footer-button:hover {
    background: var(--affine-hover-color);
  }

  /** ===== R A N G E   H I G H L I G H T ===== **/

  /* clear built-in in-range styling, but leave today’s circle intact */
  .date-cell.date-cell--in-range
    :not(.date-cell--today)
    :not(.date-cell--range-start)
    :not(.date-cell--range-end) {
    background: none !important;
    margin: 0;
  }

  /* background bar behind the interior “in-range” days */
  .range-bg {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: rgba(35, 131, 226, 0.21);
    border-radius: 8px;             /* ← round the edges */
    z-index: 0;
  }

  /* lift start/end pills & today bubble above the bar */
  .date-cell.date-cell--range-start,
  .date-cell.date-cell--range-end,
  .date-cell.date-cell--today {
    position: relative;
    z-index: 1;
  }

  /* full pill for both range start & end */
  .date-cell.date-cell--range-start {
    background-color: rgba(35, 131, 226) !important;
    color: var(--affine-pure-white) !important;
    border-radius: 8px !important;
    margin: 0;
  }  

  .date-cell.date-cell--range-end {
    background-color: rgba(35, 131, 226, 0.43) !important;
    color: var(--affine-pure-white) !important;
    border-radius: 8px !important;
    margin: 0;
  }

  /* today: perfect red circle */
  .date-cell.date-cell--today {
    background-color: rgb(205, 60, 58) !important;
    color: var(--affine-pure-white);
    font-weight: 600;
    border-radius: 50% !important;
    margin: 0;
  }
`;
