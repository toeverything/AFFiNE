/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
// oxlint-disable-next-line import-x-js/no-extraneous-dependencies
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RadioGroup } from '../radio';

afterEach(cleanup);

describe('RadioGroup pen activation', () => {
  test('suppresses the synthesized click after pen pointerup', () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    const { getByText } = render(
      <RadioGroup
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', attrs: { onClick } },
        ]}
      />
    );

    const item = getByText('B').closest('button');
    expect(item).not.toBeNull();

    fireEvent.pointerDown(item!, {
      pointerType: 'pen',
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(item!, {
      pointerType: 'pen',
      pointerId: 1,
      clientX: 12,
      clientY: 12,
    });
    fireEvent.click(item!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(onClick).not.toHaveBeenCalled();
  });

  test('clears pen click suppression when no synthesized click arrives', async () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <RadioGroup
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />
    );

    const item = getByText('B').closest('button');
    expect(item).not.toBeNull();

    fireEvent.pointerDown(item!, {
      pointerType: 'pen',
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(item!, {
      pointerType: 'pen',
      pointerId: 1,
      clientX: 12,
      clientY: 12,
    });

    await new Promise(resolve => window.setTimeout(resolve, 20));
    fireEvent.click(item!);

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
