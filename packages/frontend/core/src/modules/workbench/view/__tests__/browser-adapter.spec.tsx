/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { LiveData } from '@toeverything/infra';
import type { Location } from 'history';
import { type PropsWithChildren, useLayoutEffect } from 'react';
// oxlint-disable-next-line no-restricted-imports
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Observable } from 'rxjs';
import { describe, expect, test } from 'vitest';

import { createNavigableHistory } from '../../../../utils/navigable-history';
import type { Workbench } from '../../entities/workbench';
import { useBindWorkbenchToBrowserRouter } from '../browser-adapter';

const basename = '/workspace/ws';

function createFakeWorkbench(initialPath: string) {
  const history = createNavigableHistory({
    initialEntries: [initialPath],
    initialIndex: 0,
  });
  const location$ = LiveData.from<Location>(
    new Observable(subscriber => {
      subscriber.next(history.location);
      return history.listen(update => subscriber.next(update.location));
    }),
    history.location
  );
  const view = { history, location$ };
  const workbench = {
    activeView$: new LiveData(view),
  } as unknown as Workbench;
  return { workbench, history };
}

function wrapper(initialPath: string) {
  return function Router({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`${basename}${initialPath}`]}>
        {children}
      </MemoryRouter>
    );
  };
}

describe('useBindWorkbenchToBrowserRouter', () => {
  test('a redirect replacing a just-replaced location is not undone', async () => {
    // Mobile Journal tab: the tab replaces the view with /journals; while the
    // browser location /journals renders, the journals page's layout effect
    // replaces the view with today's existing journal doc.
    const { workbench, history } = createFakeWorkbench('/home');
    let redirected = false;
    renderHook(
      () => {
        const location = useLocation();
        useLayoutEffect(() => {
          if (location.pathname === `${basename}/journals` && !redirected) {
            redirected = true;
            history.replace('/doc-id');
          }
        }, [location]);
        useBindWorkbenchToBrowserRouter(workbench, basename);
      },
      { wrapper: wrapper('/home') }
    );

    await act(async () => {
      history.replace('/journals');
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(history.location.pathname).toBe('/doc-id');
    expect(history.entries.map(entry => entry.pathname)).not.toContain(
      '/journals'
    );
  });

  test('a location pushed by the browser is still pushed onto the view', async () => {
    const { workbench, history } = createFakeWorkbench('/home');
    const { rerender } = renderHook(
      () => useBindWorkbenchToBrowserRouter(workbench, basename),
      { wrapper: wrapper('/all') }
    );
    rerender();

    expect(history.location.pathname).toBe('/all');
  });
});
