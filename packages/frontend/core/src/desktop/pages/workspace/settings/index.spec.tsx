/**
 * @vitest-environment happy-dom
 */

import { render } from '@testing-library/react';
import type * as ReactRouterDom from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const openAll = vi.hoisted(() => vi.fn());
const openDialog = vi.hoisted(() => vi.fn());
const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));
const WorkspaceDialogServiceToken = vi.hoisted(
  () => class WorkspaceDialogService {}
);
const WorkbenchServiceToken = vi.hoisted(() => class WorkbenchService {});

vi.mock('@affine/core/modules/dialogs', () => ({
  WorkspaceDialogService: WorkspaceDialogServiceToken,
}));

vi.mock('@affine/core/modules/workbench', () => ({
  WorkbenchService: WorkbenchServiceToken,
}));

vi.mock('@toeverything/infra', () => ({
  useService: (token: unknown) => {
    if (token === WorkbenchServiceToken) {
      return {
        workbench: {
          openAll,
        },
      };
    }
    if (token === WorkspaceDialogServiceToken) {
      return {
        open: openDialog,
      };
    }
    return {};
  },
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [searchParamsState.value],
  };
});

import { Component } from './index';

describe('workspace settings page', () => {
  beforeEach(() => {
    openAll.mockReset();
    openDialog.mockReset();
    searchParamsState.value = new URLSearchParams();
  });

  test('passes tab and scrollAnchor through to the settings dialog', () => {
    searchParamsState.value = new URLSearchParams({
      tab: 'workspace:integrations',
      scrollAnchor: 'integration-calendar',
    });

    render(<Component />);

    expect(openAll).toHaveBeenCalled();
    expect(openDialog).toHaveBeenCalledWith('setting', {
      activeTab: 'workspace:integrations',
      scrollAnchor: 'integration-calendar',
    });
  });
});
