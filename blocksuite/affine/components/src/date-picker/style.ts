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

  /* the wrapper around all the week-rows */
  .date-picker-weeks {
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

  .date-picker-week {
    display: flex;
    gap: var(--gap-h);
    overflow: visible;
  }

  /** cell */

  .date-cell {
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

  .date-cell.date-cell--today {
    color: var(--affine-primary-color);
    font-weight: 600;
  }

  .date-cell.date-cell--selected {
    background: var(--affine-primary-color);
    color: var(--affine-pure-white);
    font-weight: 500;
  }

  /** interactive  */

  .interactive {
    cursor: pointer;
    /* transition:
      background 0.23s ease,
      color 0.23s ease; */
    user-select: none;
    position: relative;
    border: none;
    background-color: unset;
    font-family: var(--affine-font-family);
    color: var(--affine-text-primary-color);
  }

  /* --hover */

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

  /* --focus */

  .interactive::before {
    opacity: 0;
    transition: none;
    box-shadow: 0 0 0 3px var(--affine-primary-color);
  }

  /* .interactive:active, */

  .interactive:focus-visible {
    outline: none;
    outline: 1px solid var(--affine-primary-color);
  }

  /* .interactive:active::before, */

  .interactive:focus-visible::before {
    opacity: 0.5;
  }

  /** disabled */

  .interactive[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /** Month Select */

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
    width: fit-content;
    padding: 4px;
    border-radius: 8px;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--btn-width);
  }

  .date-picker-month button.active,
  .date-picker-year button.active {
    color: var(--affine-primary-color);
    /* background: var(--affine-primary-color); */
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

  .date-picker--mode-month .date-picker-header,
  .date-picker--mode-year .date-picker-header {
    /* padding: 0 10px; */
  }

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


  
  /* ===== full in-range cells (no rounding, bleed both sides) ===== */
  .date-cell.date-cell--in-range {
    background-color: rgba(35, 130, 226, 0.41);
    border-radius: 0;
    margin: 0 calc(var(--gap-h) / -2);  /* ← pull each cell half a gap into its neighbor */
  }

  /* ===== start of range: only round the left ===== */
  .date-cell.date-cell--range-start {
    background-color: rgba(35, 131, 226, 1);
    color: var(--affine-pure-white);
    border-top-left-radius: 8px;
    border-bottom-left-radius: 8px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    margin-left: calc(var(--gap-h) / -2); /* bleed into left neighbor */
    margin-right: 0;                      /* flush against the next cell */
  }

  /* ===== end of range: only round the right ===== */
  .date-cell.date-cell--range-end {
    background-color: rgba(35, 131, 226, 1);
    color: var(--affine-pure-white);
    /* only round the *right* corners */
    border-top-right-radius: 8px;
    border-bottom-right-radius: 8px;
    /* square off the *left* corners */
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    /* bleed half a gap into the right neighbor (or out of the row on the very last cell) */
    margin-right: calc(var(--gap-h) / -2);
    margin-left: 0;
  }

  /* ============================================
    bump the endpoints above the in-range cells
    so their corners never get clipped
    ============================================ */
  .date-cell.date-cell--range-start,
  .date-cell.date-cell--range-end {
    position: relative;    /* already inherited from .interactive */
    z-index: 1;            /* make sure this paints on top */
  }

  /* ===================================================
    if you want your start/end to look like a full pill
    (instead of only left or right caps), round both
    corners and cancel the half-bleed margins
    =================================================== */
  .date-cell.date-cell--range-start {
    border-radius: 8px;     /* full pill */
    margin: 0;              /* no bleed */
  }
  .date-cell.date-cell--range-end {
    border-radius: 8px;     /* full pill */
    margin: 0;              /* no bleed */
  }

  /* ===== today bubble: perfect red circle, no bleed ===== */
  .date-cell.date-cell--today {
    background-color: rgb(205, 60, 58);
    color: var(--affine-pure-white);
    font-weight: 600;
    border-radius: 50%;
    margin: 0;  /* cancel any bleed */
  }
`;
