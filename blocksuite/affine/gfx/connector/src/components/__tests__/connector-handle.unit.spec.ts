import { describe, expect, it, vi } from 'vitest';

import { resolveConnectorEndpointTarget } from '../connector-handle';

describe('resolveConnectorEndpointTarget', () => {
  it('keeps an anchor match found at the raw cursor position instead of overriding it with a grid-snapped point', () => {
    // Regression: grid-snapping used to run unconditionally before the
    // anchor search, so an anchor sitting off the grid could never be
    // reached once "snap to grid" was enabled — the point was already
    // moved out of the anchor's hit radius before renderConnector() got
    // a chance to look for it.
    const renderConnector = vi.fn((point: [number, number]) => {
      if (point[0] === 13 && point[1] === 27) {
        return { id: 'shape-1', position: [0.5, 0] as [number, number] };
      }
      return {};
    });

    const result = resolveConnectorEndpointTarget(
      [13, 27],
      [0, 0],
      true,
      20,
      [],
      renderConnector
    );

    expect(result).toEqual({ id: 'shape-1', position: [0.5, 0] });
    expect(renderConnector).toHaveBeenCalledTimes(1);
    expect(renderConnector).toHaveBeenCalledWith([13, 27], []);
  });

  it('falls back to a grid-snapped point when nothing was found at the raw position', () => {
    const renderConnector = vi.fn((point: [number, number]) => {
      if (point[0] === 20 && point[1] === 20) {
        return { position: [20, 20] as [number, number] };
      }
      return {};
    });

    const result = resolveConnectorEndpointTarget(
      [13, 27],
      [0, 0],
      true,
      20,
      [],
      renderConnector
    );

    expect(result).toEqual({ position: [20, 20] });
    expect(renderConnector).toHaveBeenCalledTimes(2);
    expect(renderConnector).toHaveBeenNthCalledWith(1, [13, 27], []);
    expect(renderConnector).toHaveBeenNthCalledWith(2, [20, 20], []);
  });

  it('does not attempt a grid-snapped retry when snap-to-grid is disabled', () => {
    const renderConnector = vi.fn(() => ({}));

    resolveConnectorEndpointTarget(
      [13, 27],
      [0, 0],
      false,
      20,
      [],
      renderConnector
    );

    expect(renderConnector).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a grid-snapped retry when the grid size is zero', () => {
    const renderConnector = vi.fn(() => ({}));

    resolveConnectorEndpointTarget(
      [13, 27],
      [0, 0],
      true,
      0,
      [],
      renderConnector
    );

    expect(renderConnector).toHaveBeenCalledTimes(1);
  });
});
