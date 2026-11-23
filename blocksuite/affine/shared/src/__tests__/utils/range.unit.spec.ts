import {
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import * as PointToRangeUtils from '../../utils/dom/point-to-range';
import { handleNativeRangeAtPoint } from '../../utils/dom/point-to-range';

describe('test handleNativeRangeAtPoint', () => {
  let caretRangeFromPointSpy: MockInstance<
    (clientX: number, clientY: number) => Range | null
  >;
  let resetNativeSelectionSpy: MockInstance<(range: Range | null) => void>;

  beforeEach(() => {
    caretRangeFromPointSpy = vi.spyOn(
      PointToRangeUtils.api,
      'caretRangeFromPoint'
    );
    resetNativeSelectionSpy = vi.spyOn(
      PointToRangeUtils.api,
      'resetNativeSelection'
    );
  });

  it('does nothing if caretRangeFromPoint returns null', () => {
    caretRangeFromPointSpy.mockReturnValue(null);

    handleNativeRangeAtPoint(10, 10);
    expect(resetNativeSelectionSpy).not.toHaveBeenCalled();
  });

  it('keeps range untouched if startContainer is a Text node', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';

    const text = div.firstChild!;

    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);

    caretRangeFromPointSpy.mockReturnValue(range);

    handleNativeRangeAtPoint(10, 10);

    expect(range.startContainer).toBe(text);
    expect(range.startOffset).toBe(2);
    expect(resetNativeSelectionSpy).toHaveBeenCalled();
  });

  it('moves caret into direct text child when clicking element', () => {
    const div = document.createElement('div');
    div.append('hello');

    const range = document.createRange();
    range.setStart(div, 1);
    range.collapse(true);

    caretRangeFromPointSpy.mockReturnValue(range);

    handleNativeRangeAtPoint(10, 10);

    expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(range.startContainer.textContent).toBe('hello');
    expect(range.startOffset).toBe(5);
    expect(resetNativeSelectionSpy).toHaveBeenCalled();
  });

  it('moves caret to last meaningful text inside nested element', () => {
    const div = document.createElement('div');
    div.innerHTML = `<span>a</span><span><em>b</em>c</span>`;

    const range = document.createRange();
    range.setStart(div, 2);
    range.collapse(true);

    caretRangeFromPointSpy.mockReturnValue(range);

    handleNativeRangeAtPoint(10, 10);

    expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(range.startContainer.textContent).toBe('c');
    expect(range.startOffset).toBe(1);
    expect(resetNativeSelectionSpy).toHaveBeenCalled();
  });

  it('falls back to searching startContainer when offset element has no text', () => {
    const div = document.createElement('div');
    div.innerHTML = `<span></span><span>ok</span>`;

    const range = document.createRange();
    range.setStart(div, 1);
    range.collapse(true);

    caretRangeFromPointSpy.mockReturnValue(range);

    handleNativeRangeAtPoint(10, 10);

    expect(range.startContainer.textContent).toBe('ok');
    expect(range.startOffset).toBe(2);
    expect(resetNativeSelectionSpy).toHaveBeenCalled();
  });
});
