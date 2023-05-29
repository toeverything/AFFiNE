/**
 * @vitest-environment happy-dom
 */
import { WorkspaceSubPath } from '@affine/workspace/type';
import { renderHook } from '@testing-library/react';
import { useRouter } from 'next/router';
import routerMock from 'next-router-mock';
import { createDynamicRouteParser } from 'next-router-mock/dynamic-routes';
import { beforeAll, describe, expect, test } from 'vitest';

import { RouteLogic, useRouterHelper } from '../use-router-helper';

beforeAll(() => {
  routerMock.useParser(
    createDynamicRouteParser([
      '/workspace/[workspaceId]/[pageId]',
      '/workspace/[workspaceId]/all',
      '/workspace/[workspaceId]/trash',
      '/workspace/[workspaceId]/setting',
      '/workspace/[workspaceId]/shared',
    ])
  );
});

describe('useRouterHelper', () => {
  test('should return a expected router helper', async () => {
    const routerHook = renderHook(() => useRouter());
    const helperHook = renderHook(router => useRouterHelper(router), {
      initialProps: routerHook.result.current,
    });
    const hook = helperHook.result.current;
    expect(hook).toBeTypeOf('object');
    Object.values(hook).forEach(value => {
      expect(value).toBeTypeOf('function');
    });
  });

  test('should jump to the expected sub path', async () => {
    const routerHook = renderHook(() => useRouter());
    // set current path to '/'
    await routerHook.result.current.replace('/');
    const helperHook = renderHook(router => useRouterHelper(router), {
      initialProps: routerHook.result.current,
    });
    const hook = helperHook.result.current;
    await hook.jumpToSubPath('workspace0', WorkspaceSubPath.ALL);
    routerHook.rerender();
    expect(routerHook.result.current.pathname).toBe(
      '/workspace/[workspaceId]/all'
    );
    expect(routerHook.result.current.asPath).toBe('/workspace/workspace0/all');
    // `router.back` is not working in `next-router-mock`
    // routerHook.result.current.back()
    // routerHook.rerender()
    // expect(routerHook.result.current.pathname).toBe('/')
  });

  test('should jump to the expected page', async () => {
    const routerHook = renderHook(() => useRouter());
    // set current path to '/'
    await routerHook.result.current.replace('/');
    const helperHook = renderHook(router => useRouterHelper(router), {
      initialProps: routerHook.result.current,
    });
    const hook = helperHook.result.current;
    await hook.jumpToPage('workspace0', 'page0');
    routerHook.rerender();
    expect(routerHook.result.current.pathname).toBe(
      '/workspace/[workspaceId]/[pageId]'
    );
    expect(routerHook.result.current.asPath).toBe(
      '/workspace/workspace0/page0'
    );
    // `router.back` is not working in `next-router-mock`
    // routerHook.result.current.back()
    // routerHook.rerender()
    // expect(routerHook.result.current.pathname).toBe('/')

    await hook.jumpToPage('workspace1', 'page1', RouteLogic.REPLACE);
    routerHook.rerender();
    expect(routerHook.result.current.pathname).toBe(
      '/workspace/[workspaceId]/[pageId]'
    );
    expect(routerHook.result.current.asPath).toBe(
      '/workspace/workspace1/page1'
    );
  });
});
