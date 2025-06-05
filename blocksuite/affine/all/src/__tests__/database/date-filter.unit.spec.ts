import { describe, expect, test } from 'vitest';
import { getRange } from '../../../../data-view/src/core/filter/filter-fn/date.js';

describe('getRange', () => {
    test('this day range covers now', () => {
        const [start, end] = getRange('this', 'day');
        const now = Date.now();
        expect(start).toBeLessThanOrEqual(now);
        expect(end).toBeGreaterThanOrEqual(now);
    });

    test('past month is before today', () => {
        const [start, end] = getRange('past', 'month');
        const now = Date.now();
        expect(end).toBeLessThanOrEqual(now);
        expect(start).toBeLessThan(end);
    });
});
