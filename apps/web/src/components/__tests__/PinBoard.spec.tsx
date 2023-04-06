/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { PageMeta } from '@blocksuite/store';
import matchers from '@testing-library/jest-dom/matchers';
import type { RenderResult } from '@testing-library/react';
import { render, renderHook } from '@testing-library/react';
import { createStore, getDefaultStore, Provider } from 'jotai';
import type { FC, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, test } from 'vitest';

import { workspacesAtom } from '../../atoms';
import {
  currentWorkspaceAtom,
  useCurrentWorkspace,
} from '../../hooks/current/use-current-workspace';
import { useWorkspacesHelper } from '../../hooks/use-workspaces';
import { ThemeProvider } from '../../providers/ThemeProvider';
import type { BlockSuiteWorkspace } from '../../shared';
import type { PivotsProps } from '../pure/workspace-slider-bar/Pivots';
import Pivots from '../pure/workspace-slider-bar/Pivots';

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
  //  create one workspace with 2 root pages and 2 pivot pages
  //  - hasPivotPage
  //    - pivot1
  //    - pivot2
  //  - noPivotPage

  const mutationHook = renderHook(() => useWorkspacesHelper(), {
    wrapper: ProviderWrapper,
  });
  const rootPageIds = ['hasPivotPage', 'noPivotPage'];
  const pivotPageIds = ['pivot1', 'pivot2'];
  const id = await mutationHook.result.current.createLocalWorkspace('test0');
  await store.get(workspacesAtom);
  mutationHook.rerender();

  await store.get(currentWorkspaceAtom);
  const currentWorkspaceHook = renderHook(() => useCurrentWorkspace(), {
    wrapper: ProviderWrapper,
  });
  currentWorkspaceHook.result.current[1](id);
  const currentWorkspace = await store.get(currentWorkspaceAtom);
  const blockSuiteWorkspace =
    currentWorkspace?.blockSuiteWorkspace as BlockSuiteWorkspace;

  rootPageIds.forEach(rootPageId => {
    mutationHook.result.current.createWorkspacePage(id, rootPageId);
    blockSuiteWorkspace.meta.setPageMeta(rootPageId, {
      isPivots: true,
      subpageIds: rootPageId === rootPageIds[0] ? pivotPageIds : [],
    });
  });
  pivotPageIds.forEach(pivotId => {
    mutationHook.result.current.createWorkspacePage(id, pivotId);
    blockSuiteWorkspace.meta.setPageMeta(pivotId, {
      title: pivotId,
    });
  });

  const App = (props: PivotsProps) => {
    return (
      <ThemeProvider>
        <ProviderWrapper>
          <Pivots {...props} />
        </ProviderWrapper>
      </ThemeProvider>
    );
  };

  const app = render(
    <App
      blockSuiteWorkspace={blockSuiteWorkspace as BlockSuiteWorkspace}
      allMetas={blockSuiteWorkspace.meta.pageMetas as PageMeta[]}
      openPage={() => {}}
    />
  );

  return {
    rootPageIds,
    pivotPageIds,
    app,
    blockSuiteWorkspace,
  };
};
const openOperationMenu = async (app: RenderResult, pageId: string) => {
  const rootPivot = await app.findByTestId(`pivot-${pageId}`);
  const operationBtn = (await rootPivot.querySelector(
    '[data-testid="pivot-operation-button"]'
  )) as HTMLElement;
  await operationBtn.click();
  const menu = await app.findByTestId('pivot-operation-menu');
  expect(menu).toBeInTheDocument();
};
describe('PinBoard', () => {
  test('add pivot', async () => {
    const { app, blockSuiteWorkspace, rootPageIds, pivotPageIds } =
      await initPinBoard();
    const [hasPivotPageId] = rootPageIds;
    await openOperationMenu(app, hasPivotPageId);

    const addBtn = await app.findByTestId('pivot-operation-add');
    await addBtn.click();

    const metas = blockSuiteWorkspace.meta.pageMetas ?? [];
    const rootPageMeta = blockSuiteWorkspace.meta.getPageMeta(hasPivotPageId);
    const addedPageMeta = metas.find(
      meta => !pivotPageIds.includes(meta.id) && !rootPageIds.includes(meta.id)
    ) as PageMeta;

    // Page meta have been added
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(5);
    // New page meta is added in initial page meta

    expect(rootPageMeta?.subpageIds.includes(addedPageMeta.id)).toBe(true);
    app.unmount();
  });

  test('delete pivot', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasPivotPageId],
    } = await initPinBoard();
    await openOperationMenu(app, hasPivotPageId);

    const deleteBtn = await app.findByTestId('pivot-operation-move-to-trash');
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

  test('rename pivot', async () => {
    const {
      app,
      rootPageIds: [hasPivotPageId],
    } = await initPinBoard();
    await openOperationMenu(app, hasPivotPageId);

    const renameBtn = await app.findByTestId('pivot-operation-rename');
    await renameBtn.click();

    const input = await app.findByTestId(`pivot-input-${hasPivotPageId}`);
    expect(input).toBeInTheDocument();

    // TODO: Fix this test
    // fireEvent.change(input, { target: { value: 'tteesstt' } });
    //
    // expect(
    //   blockSuiteWorkspace.meta.getPageMeta(rootPageId)?.name
    // ).toBe('tteesstt');
    app.unmount();
  });

  test('move pivot', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasPivotPageId],
      pivotPageIds: [pivotId1, pivotId2],
    } = await initPinBoard();
    await openOperationMenu(app, pivotId1);

    const moveToBtn = await app.findByTestId('pivot-operation-move-to');
    await moveToBtn.click();

    const pivotsMenu = await app.findByTestId('pivots-menu');
    expect(pivotsMenu).toBeInTheDocument();

    await (
      pivotsMenu.querySelector(
        `[data-testid="pivot-${pivotId2}"]`
      ) as HTMLElement
    ).click();

    const rootPageMeta = blockSuiteWorkspace.meta.getPageMeta(hasPivotPageId);

    expect(rootPageMeta?.subpageIds.includes(pivotId1)).toBe(false);
    expect(rootPageMeta?.subpageIds.includes(pivotId2)).toBe(true);
    app.unmount();
  });

  test('remove from pivots', async () => {
    const {
      app,
      blockSuiteWorkspace,
      rootPageIds: [hasPivotPageId],
      pivotPageIds: [pivotId1],
    } = await initPinBoard();
    await openOperationMenu(app, pivotId1);

    const moveToBtn = await app.findByTestId('pivot-operation-move-to');
    await moveToBtn.click();

    const removeFromPivotsBtn = await app.findByTestId(
      'remove-from-pivots-button'
    );
    removeFromPivotsBtn.click();

    const hasPivotsPageMeta =
      blockSuiteWorkspace.meta.getPageMeta(hasPivotPageId);

    expect(hasPivotsPageMeta?.subpageIds.length).toBe(1);
    expect(hasPivotsPageMeta?.subpageIds.includes(pivotId1)).toBe(false);
  });
});
