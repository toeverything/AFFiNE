/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import matchers from '@testing-library/jest-dom/matchers';
import type { RenderResult } from '@testing-library/react';
import { render, renderHook } from '@testing-library/react';
import { createStore, getDefaultStore, Provider } from 'jotai';
import type { FC, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, test } from 'vitest';

import { workspacesAtom } from '../../atoms';
import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useAppHelper } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import type { BlockSuiteWorkspace } from '../../shared';
import type { PinboardProps } from '../pure/workspace-slider-bar/Pinboard';
import Pinboard from '../pure/workspace-slider-bar/Pinboard';

expect.extend(matchers);

let store = getDefaultStore();
beforeEach(async () => {
  store = createStore();
  await store.get(workspacesAtom);
});

const ProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
  return <Provider store={store}>{children}</Provider>;
};

const initPinBoard = async () => {
  //  create one workspace with 2 root pages and 2 pinboard pages
  //  - hasPinboardPage
  //    - hasPinboardPage
  //      - pinboard1
  //      - pinboard2
  //    - noPinboardPage

  const mutationHook = renderHook(() => useAppHelper(), {
    wrapper: ProviderWrapper,
  });
  const rootPageIds = ['hasPinboardPage', 'noPinboardPage'];
  const pinboardPageIds = ['pinboard1', 'pinboard2'];
  const id = await mutationHook.result.current.createLocalWorkspace('test0');

  store.set(rootCurrentWorkspaceIdAtom, id);
  await store.get(workspacesAtom);

  await store.get(rootCurrentWorkspaceAtom);
  const currentWorkspaceHook = renderHook(() => useCurrentWorkspace(), {
    wrapper: ProviderWrapper,
  });
  currentWorkspaceHook.result.current[1](id);
  const currentWorkspace = await store.get(rootCurrentWorkspaceAtom);
  const blockSuiteWorkspace =
    currentWorkspace?.blockSuiteWorkspace as BlockSuiteWorkspace;

  mutationHook.rerender();
  // create root pinboard
  mutationHook.result.current.createWorkspacePage(id, 'rootPinboard');
  blockSuiteWorkspace.meta.setPageMeta('rootPinboard', {
    isRootPinboard: true,
    subpageIds: rootPageIds,
  });
  // create parent
  rootPageIds.forEach(rootPageId => {
    mutationHook.result.current.createWorkspacePage(id, rootPageId);
    blockSuiteWorkspace.meta.setPageMeta(rootPageId, {
      subpageIds: rootPageId === rootPageIds[0] ? pinboardPageIds : [],
    });
  });
  // create children to first parent
  pinboardPageIds.forEach(pinboardId => {
    mutationHook.result.current.createWorkspacePage(id, pinboardId);
    blockSuiteWorkspace.meta.setPageMeta(pinboardId, {
      title: pinboardId,
    });
  });

  const App = (props: PinboardProps) => {
    return (
      <ThemeProvider>
        <ProviderWrapper>
          <Pinboard {...props} />
        </ProviderWrapper>
      </ThemeProvider>
    );
  };

  const app = render(
    <App
      blockSuiteWorkspace={blockSuiteWorkspace as BlockSuiteWorkspace}
      openPage={() => {}}
    />
  );

  return {
    rootPageIds,
    pinboardPageIds,
    app,
    blockSuiteWorkspace,
  };
};
const openOperationMenu = async (app: RenderResult, pageId: string) => {
  const rootPinboard = await app.findByTestId(`pinboard-${pageId}`);
  const operationBtn = (await rootPinboard.querySelector(
    '[data-testid="pinboard-operation-button"]'
  )) as HTMLElement;
  await operationBtn.click();
  const menu = await app.findByTestId('pinboard-operation-menu');
  expect(menu).toBeInTheDocument();
};
describe('PinBoard', () => {
  test('add pinboard', async () => {
    const { app, blockSuiteWorkspace, rootPageIds } = await initPinBoard();
    const [hasChildrenPageId] = rootPageIds;
    await openOperationMenu(app, hasChildrenPageId);

    const addBtn = await app.findByTestId('pinboard-operation-add');
    await addBtn.click();

    const hasChildrenPageMeta =
      blockSuiteWorkspace.meta.getPageMeta(hasChildrenPageId);

    // Page meta have been added
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(6);
    // New page meta is added in initial page meta

    expect(hasChildrenPageMeta?.subpageIds.length).toBe(3);
    app.unmount();
  });

  test('delete pinboard', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasChildrenPageId],
    } = await initPinBoard();
    await openOperationMenu(app, hasChildrenPageId);

    const deleteBtn = await app.findByTestId(
      'pinboard-operation-move-to-trash'
    );
    await deleteBtn.click();

    const confirmBtn = await app.findByTestId('move-to-trash-confirm');
    expect(confirmBtn).toBeInTheDocument();
    await confirmBtn.click();

    // Every page should be tagged as trash
    expect(blockSuiteWorkspace.meta.pageMetas.filter(m => m.trash).length).toBe(
      3
    );
    app.unmount();
  });

  test('rename pinboard', async () => {
    const {
      app,
      rootPageIds: [hasChildrenPageId],
    } = await initPinBoard();
    await openOperationMenu(app, hasChildrenPageId);

    const renameBtn = await app.findByTestId('pinboard-operation-rename');
    await renameBtn.click();

    const input = await app.findByTestId(`pinboard-input-${hasChildrenPageId}`);
    expect(input).toBeInTheDocument();

    // TODO: Fix this test
    // fireEvent.change(input, { target: { value: 'tteesstt' } });
    // expect(
    //   blockSuiteWorkspace.meta.getPageMeta(hasChildrenPageId)?.name
    // ).toBe('tteesstt');
    app.unmount();
  });

  test('move pinboard', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasChildrenPageId],
      pinboardPageIds: [pinboardId1, pinboardId2],
    } = await initPinBoard();
    await openOperationMenu(app, pinboardId1);

    const moveToBtn = await app.findByTestId('pinboard-operation-move-to');
    await moveToBtn.click();

    const pinboardMenu = await app.findByTestId('pinboard-menu');
    expect(pinboardMenu).toBeInTheDocument();

    await (
      pinboardMenu.querySelector(
        `[data-testid="pinboard-${pinboardId2}"]`
      ) as HTMLElement
    ).click();

    const hasChildrenPageMeta =
      blockSuiteWorkspace.meta.getPageMeta(hasChildrenPageId);

    expect(hasChildrenPageMeta?.subpageIds.includes(pinboardId1)).toBe(false);
    expect(hasChildrenPageMeta?.subpageIds.includes(pinboardId2)).toBe(true);
    app.unmount();
  });

  test('remove from pinboard', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasChildrenPageId],
      pinboardPageIds: [pinboardId1],
    } = await initPinBoard();
    await openOperationMenu(app, pinboardId1);

    const moveToBtn = await app.findByTestId('pinboard-operation-move-to');
    await moveToBtn.click();

    const removeFromPinboardBtn = await app.findByTestId(
      'remove-from-pinboard-button'
    );
    removeFromPinboardBtn.click();

    const hasPinboardPageMeta =
      blockSuiteWorkspace.meta.getPageMeta(hasChildrenPageId);

    expect(hasPinboardPageMeta?.subpageIds.length).toBe(1);
    expect(hasPinboardPageMeta?.subpageIds.includes(pinboardId1)).toBe(false);
    app.unmount();
  });
});
