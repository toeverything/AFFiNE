import { css } from 'lit';

export const calendarViewStyles = css`
  affine-data-view-calendar {
    display: block;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    --calendar-entry-height: 22px;
    --calendar-entry-gap: 3px;
    --calendar-entry-slot-height: calc(
      var(--calendar-entry-height) + var(--calendar-entry-gap)
    );
    --calendar-grid-border-color: color-mix(
      in srgb,
      var(--affine-border-color) 58%,
      transparent
    );
    --calendar-entry-bg: color-mix(
      in srgb,
      var(--affine-primary-color) 12%,
      var(--affine-background-primary-color)
    );
    --calendar-entry-hover-bg: color-mix(
      in srgb,
      var(--affine-primary-color) 18%,
      var(--affine-background-primary-color)
    );
    --calendar-entry-text-color: color-mix(
      in srgb,
      var(--affine-primary-color) 72%,
      var(--affine-text-primary-color)
    );
    --calendar-external-fallback-color: #b45309;
  }

  .calendar-scroll {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .calendar-shell {
    position: relative;
    min-width: 720px;
    padding: 0 0 12px;
  }

  .calendar-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    margin-bottom: 8px;
  }

  .calendar-title {
    color: var(--affine-text-primary-color);
    font-size: 15px;
    font-weight: 600;
  }

  .calendar-nav {
    display: flex;
    gap: 6px;
  }

  .calendar-nav button,
  .calendar-setup button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--affine-border-color);
    border-radius: 6px;
    background: var(--affine-background-primary-color);
    color: var(--affine-text-primary-color);
    height: 28px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    line-height: 20px;
    white-space: nowrap;
  }

  .calendar-nav button svg,
  .calendar-setup button svg,
  .calendar-new-row svg,
  .calendar-empty-month-hint-action svg,
  .calendar-empty-month-hint-close svg {
    width: 16px;
    height: 16px;
    color: var(--affine-icon-secondary);
    flex: 0 0 auto;
  }

  .calendar-nav .calendar-icon-button {
    width: 28px;
    padding: 5px;
  }

  .calendar-nav .calendar-today-button {
    color: var(--affine-primary-color);
  }

  .calendar-weekdays,
  .calendar-week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .calendar-week {
    position: relative;
  }

  .calendar-segments {
    position: absolute;
    left: 0;
    right: 0;
    top: 30px;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: var(--calendar-entry-slot-height);
    row-gap: 0;
    column-gap: 0;
    padding: 0;
    pointer-events: none;
  }

  .calendar-segments .calendar-entry {
    align-self: start;
    height: var(--calendar-entry-height);
    box-sizing: border-box;
    pointer-events: auto;
    margin: 0 6px;
  }

  .calendar-segments .calendar-entry-preview {
    align-self: start;
    pointer-events: none;
    margin: 0 6px;
  }

  .calendar-weekday {
    color: var(--affine-text-secondary-color);
    font-size: 12px;
    padding: 4px 6px;
    user-select: none;
    -webkit-user-select: none;
  }

  .calendar-grid {
    border-top: 1px solid var(--calendar-grid-border-color);
    border-left: 1px solid var(--calendar-grid-border-color);
  }

  .calendar-day {
    position: relative;
    min-height: 112px;
    border-right: 1px solid var(--calendar-grid-border-color);
    border-bottom: 1px solid var(--calendar-grid-border-color);
    padding: 6px;
  }

  .calendar-day.is-outside {
    background: color-mix(
      in srgb,
      var(--affine-background-secondary-color) 55%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-day:not(.is-outside):hover {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 2%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-day.is-drop-target {
    box-shadow: inset 0 0 0 1px var(--affine-primary-color);
    background: color-mix(in srgb, var(--affine-primary-color) 8%, transparent);
  }

  .calendar-day.is-today {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 6%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-day-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: max-content;
    min-width: 20px;
    height: 20px;
    padding: 0 2px;
    border-radius: 4px;
    color: var(--affine-text-secondary-color);
    font-size: 12px;
    line-height: 18px;
    margin-bottom: 4px;
    user-select: none;
    -webkit-user-select: none;
  }

  .calendar-day:not(.is-outside) .calendar-day-number {
    color: var(--affine-text-primary-color);
  }

  .calendar-day.is-outside .calendar-day-number {
    color: color-mix(
      in srgb,
      var(--affine-text-secondary-color) 60%,
      transparent
    );
  }

  .calendar-day.is-today .calendar-day-number {
    color: var(--affine-primary-color);
    font-weight: 600;
  }

  .calendar-day.is-today:hover {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 9%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-entry {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--calendar-entry-height);
    margin-top: var(--calendar-entry-gap);
    padding: 0 6px;
    border-radius: 4px;
    color: var(--calendar-entry-text-color);
    background: var(--calendar-entry-bg);
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .calendar-nav button:hover,
  .calendar-setup button:hover {
    background: var(--affine-hover-color);
  }

  .calendar-entry.row:hover {
    background: var(--calendar-entry-hover-bg);
  }

  .calendar-entry:focus-visible {
    outline: 1px solid var(--affine-primary-color);
    outline-offset: 1px;
  }

  .calendar-entry.external:hover {
    opacity: 0.9;
  }

  .calendar-entry.selected {
    box-shadow: inset 0 0 0 1px var(--affine-primary-color);
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 15%,
      var(--calendar-entry-bg)
    );
  }

  .calendar-entry.continues-left {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .calendar-entry.continues-right {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .calendar-entry-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .calendar-entry-title.is-empty {
    color: var(--affine-text-secondary-color);
  }

  .calendar-entry-title.title-segments {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .calendar-entry-title-segment {
    display: inline-flex;
    align-items: center;
    min-width: 0;
  }

  .calendar-entry-title-segment.linked-doc-segment {
    gap: 3px;
    min-width: 14px;
  }

  .calendar-entry-title-segment.linked-doc-segment svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .calendar-entry-title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .calendar-entry-title-segment.linked-doc-segment .calendar-entry-title-text {
    flex-shrink: 1;
  }

  .calendar-entry-properties {
    display: inline-flex;
    gap: 3px;
    min-width: 0;
  }

  .calendar-entry-property {
    max-width: 72px;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--affine-pure-white) 80%, transparent);
    color: var(--affine-text-primary-color);
    font-size: 10px;
    font-weight: 500;
    line-height: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .calendar-entry.external {
    color: var(--affine-pure-white);
    background: var(
      --calendar-external-color,
      var(--calendar-external-fallback-color)
    );
  }

  .calendar-entry[draggable='true'] {
    cursor: grab;
  }

  .calendar-entry[draggable='true']:active {
    opacity: 0.7;
  }

  .calendar-resize-handle {
    display: none;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 1;
  }

  .calendar-resize-handle.left {
    left: 0;
    border-radius: 4px 0 0 4px;
  }

  .calendar-resize-handle.right {
    right: 0;
    border-radius: 0 4px 4px 0;
  }

  .calendar-resize-handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 10px;
    transform: translate(-50%, -50%);
    border-radius: 1px;
    background: var(--affine-icon-secondary);
  }

  .calendar-resize-handle:hover::after {
    background: var(--affine-primary-color);
  }

  .calendar-entry:hover .calendar-resize-handle {
    display: block;
  }

  .calendar-entry-preview {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--calendar-entry-height);
    height: var(--calendar-entry-height);
    margin-top: var(--calendar-entry-gap);
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 4px;
    border: 1.5px dashed var(--affine-primary-color);
    background: color-mix(in srgb, var(--affine-primary-color) 6%, transparent);
    color: var(--affine-primary-color);
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .calendar-entry-preview svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .calendar-entry-preview.continues-left {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
    padding-left: 6px;
  }

  .calendar-entry-preview.continues-right {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: none;
    padding-right: 6px;
  }

  .calendar-day-entries > .calendar-entry:first-child,
  .calendar-day-entries > .calendar-entry-preview:first-child {
    margin-top: 0;
  }

  .calendar-day-entries {
    padding-top: calc(
      var(--calendar-segment-slots, 0) * var(--calendar-entry-slot-height)
    );
  }

  .calendar-new-row {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 24px;
    margin-top: 3px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--affine-primary-color);
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    padding: 3px 8px;
    opacity: 0;
    cursor: pointer;
    box-sizing: border-box;
    transition:
      opacity 0.1s ease,
      background 0.1s ease;
  }

  .calendar-new-row svg,
  .calendar-empty-month-hint-action svg {
    width: 14px;
    height: 14px;
    color: var(--affine-primary-color);
  }

  .calendar-day:hover .calendar-new-row,
  .calendar-new-row:focus-visible {
    opacity: 1;
  }

  .calendar-day:hover .calendar-new-row {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 10%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-day:hover .calendar-new-row:disabled,
  .calendar-day.is-today:hover .calendar-new-row:disabled,
  .calendar-new-row:disabled {
    background: transparent;
    opacity: 0;
    pointer-events: none;
  }

  .calendar-day.is-today:hover .calendar-new-row,
  .calendar-day.is-today .calendar-new-row:focus-visible {
    background: var(--affine-primary-color);
    color: var(--affine-pure-white);
  }

  .calendar-day.is-today .calendar-new-row:hover {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 88%,
      var(--affine-pure-white)
    );
  }

  .calendar-day.is-today:hover .calendar-new-row svg,
  .calendar-day.is-today .calendar-new-row:focus-visible svg {
    color: var(--affine-pure-white);
  }

  .calendar-new-row:hover {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 16%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-empty-month-hint {
    position: absolute;
    top: 44px;
    left: 8px;
    right: 8px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
    padding: 6px 8px 6px 12px;
    border: 1px solid
      color-mix(in srgb, var(--affine-primary-color) 18%, transparent);
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--affine-background-primary-color) 92%,
      var(--affine-primary-color)
    );
    box-shadow: var(--affine-menu-shadow);
    box-sizing: border-box;
  }

  .calendar-empty-month-hint-copy {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .calendar-empty-month-hint-title {
    flex: 0 0 auto;
    color: var(--affine-text-primary-color);
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
  }

  .calendar-empty-month-hint-body {
    min-width: 0;
    color: var(--affine-text-secondary-color);
    font-size: 12px;
    line-height: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-empty-month-hint-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .calendar-empty-month-hint-action,
  .calendar-empty-month-hint-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 24px;
    padding: 3px 8px;
    border: 0;
    border-radius: 5px;
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 10%,
      var(--affine-background-primary-color)
    );
    color: var(--affine-primary-color);
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    cursor: pointer;
  }

  .calendar-empty-month-hint-close {
    width: 24px;
    padding: 4px;
    background: transparent;
    color: var(--affine-icon-secondary);
  }

  .calendar-empty-month-hint-close svg {
    width: 14px;
    height: 14px;
  }

  .calendar-empty-month-hint-action:hover,
  .calendar-empty-month-hint-close:hover {
    background: color-mix(
      in srgb,
      var(--affine-primary-color) 16%,
      var(--affine-background-primary-color)
    );
  }

  .calendar-setup-wrap {
    position: relative;
  }

  .calendar-setup-wrap .calendar-shell {
    filter: grayscale(1) blur(1px);
    opacity: 0.55;
    pointer-events: none;
  }

  .calendar-setup {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .calendar-setup button {
    height: 32px;
    padding: 7px 12px;
  }

  .calendar-event-popover {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 318px;
    padding: 4px;
    font-size: 13px;
    line-height: 20px;
  }

  .calendar-event-popover-title {
    padding: 2px 4px;
    color: var(--affine-text-primary-color);
    font-weight: 600;
    font-size: 14px;
    line-height: 22px;
    margin-bottom: 2px;
  }

  .calendar-event-popover-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 2px 4px;
    color: var(--affine-text-secondary-color);
  }

  .calendar-event-popover-icon {
    display: flex;
    align-items: center;
    flex: 0 0 16px;
    height: 20px;
    color: var(--affine-icon-secondary);
  }

  .calendar-event-popover-icon svg {
    width: 16px;
    height: 16px;
  }

  .calendar-event-popover-description {
    white-space: pre-wrap;
    word-break: break-word;
  }
`;
