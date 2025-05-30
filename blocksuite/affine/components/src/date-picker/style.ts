import { css } from 'lit';

export const datePickerStyle = css`
  /* ───────────────────  HOST CONTAINER  ───────────────────── */
  /* Make the custom element a block and allow overflow for popups */
  :host {
    display: block;
    overflow: visible;
  }

  /* ───────────────────  LAYOUT  ───────────────────────────── */
  /* Vertical flex container for the date picker */
  .date-picker {
    display: flex;
    flex-direction: column;
    gap: var(--gap-v);
  }

  /* Styling for the popup panel: background, rounded corners, and shadow */
  .popup.date-picker {
    background: var(--affine-background-overlay-panel-color);
    border-radius: 12px;
    box-shadow: var(--affine-menu-shadow);
  }

  /* ───────────────────  NAVIGATION CONTROLS  ───────────────── */
  /* Small square buttons for navigating months/weeks/days */
  .date-picker-small-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }

  /* Icon color in normal state for nav buttons and 'Today' label */
  .interactive.date-picker-small-action,
  .interactive.action-label.today {
    color: var(--affine-icon-color);
  }

  /* Hover state: change icon color and add background highlight */
  .date-picker-small-action:hover {
    color: var(--affine-icon-hover-color);
    background: var(--affine-icon-hover-background);
  }

  /* Rotate the embedded SVG for directional arrows */
  .date-picker-small-action.left   > svg { transform: rotate(0deg);   }
  .date-picker-small-action.right  > svg { transform: rotate(180deg); }
  .date-picker-small-action.down   > svg { transform: rotate(-90deg); }

  /* ───────────────────  HEADER SECTION  ───────────────────── */
  /* Container for the header: month/year display and nav buttons */
  .date-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Wrapper for the prev/next navigation buttons */
  .date-picker-header__buttons {
    display: flex;
  }

  /* Current month/year label styling */
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
    padding: 0 4px;
  }

  /* Container for header actions like 'Today' and custom slots */
  .date-picker-header__action {
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--affine-icon-color);
  }
  /* Compact spacing when a slot is provided */
  .date-picker-header__action.with-slot {
    gap: 4px;
  }
  /* Individual action-label styling */
  .date-picker-header__action .action-label {
    font-size: 12px;
    padding: 0 4px;
    height: 20px;
    border-radius: 4px;
    transition: all 0.23s ease;
    max-width: 100px;
  }
  /* Center text within the label */
  .date-picker-header__action .action-label > span {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }

  /* ───────────────────  WEEKDAY HEADERS  ───────────────────── */
  /* Row displaying the names of the days (Sun, Mon, …) */
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

  /* ───────────────────  WEEKS & DAYS GRID  ────────────────── */
  /* Container for all week rows */
  .date-picker-weeks {
    display: flex;
    flex-direction: column;
    gap: var(--gap-v);
    overflow: visible;
  }

  /* Single week row: each day cell laid out horizontally */
  .date-picker-week {
    display: flex;
    gap: var(--gap-h);
    position: relative;
  }

  /* ────────────────  DATE CELL BASE STYLES  ───────────────── */
  .date-cell {
    position: relative;
    z-index: 0;
    width: var(--cell-size);
    height: var(--cell-size);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    user-select: none;
  }
  /* Default text style for any cell with a date attribute */
  .date-cell[data-date] {
    font-weight: 400;
    font-size: 14px;
  }
  /* Dim days outside the current month */
  .date-cell.date-cell--not-curr-month {
    opacity: 0.1;
  }
  /* Highlight when a date is selected */
  .date-cell.date-cell--selected {
    background: var(--affine-primary-color);
    color: var(--affine-pure-white);
    font-weight: 500;
  }

  /* ───────────────────  INTERACTIVE STATES  ───────────────── */
  /* Base styling for clickable elements */
  .interactive {
    cursor: pointer;
    user-select: none;
    position: relative;
    border: none;
    background: unset;
    font-family: var(--affine-font-family);
    color: var(--affine-text-primary-color);
  }
  /* Pseudo-elements used for hover/focus outlines */
  .interactive::after,
  .interactive::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    transition: background 0.23s ease;
  }
  /* Hover overlay effect */
  .interactive::after {
    opacity: 1;
    background: transparent;
  }
  .interactive:hover::after {
    background: var(--affine-hover-color);
  }
  /* Focus ring shadow */
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
  /* Disabled state styling */
  .interactive[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* ───────────────────  MONTH/YEAR PICKER  ────────────────── */
  /* Grid layout for selecting months */
  .date-picker-month {
    --btn-width: 36px;
  }
  /* Grid layout for selecting years */
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
  /* Styling for individual month/year buttons */
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
  /* Active state for the selected month/year */
  .date-picker-month button.active,
  .date-picker-year button.active {
    color: var(--affine-primary-color);
    font-weight: 600;
  }
  /* Transition adjustment for header padding in grid modes */
  .date-picker .date-picker-header {
    padding: 0;
    transition: padding 0.23s ease;
  }
  /* Increase the overall gap when showing month or year mode */
  .date-picker--mode-month,
  .date-picker--mode-year {
    gap: 26px;
  }

  /* ───────────────────  FOOTER ACTIONS  ───────────────────── */
  /* Separator above footer controls */
  .date-picker-footer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--affine-border-color);
  }
  /* Buttons in the footer (e.g., Clear, Apply) */
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

  /* ──────────  NOTION-STYLE RANGE HIGHLIGHT ──────────────── */
  /* Full background overlay behind selected range */
  .range-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(35, 131, 226, 0.21);
    border-radius: 8px !important;
    z-index: -1;
    pointer-events: none;
  }
  /* Individual “pill” segments at range edges */
  .range-overflow {
    position: absolute;
    top: 2px;
    left: 0;
    width: var(--cell-size);
    height: calc(var(--cell-size) - 2px);
    background: rgba(35, 131, 226, 0.21);
    border-radius: 8px;
    z-index: -1;
    pointer-events: none;
  }
  /* Bring the start, end, and today cells above the range background */
  .date-cell.date-cell--range-start,
  .date-cell.date-cell--range-end,
  .date-cell.date-cell--today {
    z-index: 1;
  }
  /* Solid pill color for the start of the range */
  .date-cell.date-cell--range-start {
    background: rgb(35,131,226) !important;
    color: var(--affine-pure-white);
  }
  /* Slightly translucent pill color for the end of the range */
  .date-cell.date-cell--range-end {
    background: rgba(35,131,226,0.43) !important;
    color: var(--affine-pure-white);
  }
  /* Override ‘Today’ styling in week/month/year modes */
  :host(:not([unit="day"])) .date-cell.date-cell--today {
    background: rgb(205,60,58) !important;
    color: var(--affine-pure-white);
    border-radius: 50% !important;
  }
  /* Remove background fill for interior in-range cells */
  .date-cell.date-cell--in-range
    :not(.date-cell--range-start)
    :not(.date-cell--range-end)
    :not(.date-cell--today) {
    background: none !important;
  }
  /* Show the little range pill only in day mode */
  :host([unit="day"]) .range-overflow {
    display: block;
  }
  /* Hide the overflow pill in other modes */
  :host(:not([unit="day"])) .range-overflow {
    display: none;
  }
`;
