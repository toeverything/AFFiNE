import { describe, expect, it } from 'vitest';

import { pickRowIndexAtY } from '../view-presets/list/pc/controller/drag.js';

// 999.4: during a TOUCH drag the pointer is implicitly captured to the drag
// handle the gesture started on, so `pointermove`'s `evt.target` stays in
// the dragged row for the whole gesture. Resolving the hovered row via
// `evt.target.closest(row)` therefore always returned the dragged row
// itself: rows could not be moved above/below others or re-levelled on
// mobile. The hovered row must come from the pointer's coordinates.
describe('pickRowIndexAtY', () => {
  // three 28px rows at y 100-128, 128-156, 156-184
  const rows = [
    { top: 100, bottom: 128 },
    { top: 128, bottom: 156 },
    { top: 156, bottom: 184 },
  ];

  it('picks the row containing y, independent of which row the gesture started on', () => {
    expect(pickRowIndexAtY(rows, 110)).toBe(0);
    expect(pickRowIndexAtY(rows, 140)).toBe(1);
    expect(pickRowIndexAtY(rows, 183)).toBe(2);
  });

  it('treats a row boundary as the lower row (top inclusive, bottom exclusive)', () => {
    expect(pickRowIndexAtY(rows, 128)).toBe(1);
  });

  it('picks the next row below for a y in a gap between rows', () => {
    const gapped = [
      { top: 100, bottom: 120 },
      { top: 130, bottom: 150 },
    ];
    expect(pickRowIndexAtY(gapped, 125)).toBe(1);
  });

  it('returns -1 below the last row', () => {
    expect(pickRowIndexAtY(rows, 200)).toBe(-1);
  });
});
