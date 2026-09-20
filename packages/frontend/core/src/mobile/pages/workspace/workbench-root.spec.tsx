// @vitest-environment happy-dom

import { render, waitFor } from '@testing-library/react';
import { type PropsWithChildren, useEffect } from 'react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

const Activity = Reflect.get(React, 'Activity') as React.ComponentType<
  PropsWithChildren<{ mode: 'visible' | 'hidden' }>
>;

describe('React Activity mobile contract', () => {
  it('disconnects effects while hidden and reconnects them when visible', async () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    const Probe = () => {
      useEffect(() => {
        connect();
        return disconnect;
      }, []);
      return <button type="button">home focus</button>;
    };
    const view = render(
      <Activity mode="visible">
        <Probe />
      </Activity>
    );
    await waitFor(() => expect(connect).toHaveBeenCalledOnce());

    view.rerender(
      <Activity mode="hidden">
        <Probe />
      </Activity>
    );
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce());

    view.rerender(
      <Activity mode="visible">
        <Probe />
      </Activity>
    );
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
  });

  it('hides portaled content and exposes the raw focus contract', async () => {
    const portalHost = document.createElement('div');
    document.body.append(portalHost);
    const Probe = () => (
      <>
        <button type="button">home focus</button>
        {createPortal(<div>home portal</div>, portalHost)}
      </>
    );
    const view = render(
      <Activity mode="visible">
        <Probe />
      </Activity>
    );
    const button = view.container.querySelector('button');
    expect(button).not.toBeNull();
    if (!button) return;
    button.focus();
    expect(document.activeElement).toBe(button);

    view.rerender(
      <Activity mode="hidden">
        <Probe />
      </Activity>
    );
    expect(document.activeElement).toBe(button);
    expect(
      getComputedStyle(portalHost.firstElementChild as Element).display
    ).toBe('none');
    portalHost.remove();
  });
});
