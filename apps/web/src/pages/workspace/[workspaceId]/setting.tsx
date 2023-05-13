import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { SettingPanel } from '@affine/workspace/type';
import {
  settingPanel,
  settingPanelValues,
  WorkspaceFlavour,
} from '@affine/workspace/type';
import { SettingsIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Head from 'next/head';
import type { NextRouter } from 'next/router';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useOnTransformWorkspace } from '../../../hooks/root/use-on-transform-workspace';
import { useAppHelper } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import { WorkspaceAdapters } from '../../../plugins';
import type { NextPageWithLayout } from '../../../shared';
import { toast } from '../../../utils';

const settingPanelAtom = atomWithStorage<SettingPanel>(
  'workspaceId',
  settingPanel.General
);

function useTabRouterSync(
  router: NextRouter,
  currentTab: SettingPanel,
  setCurrentTab: (tab: SettingPanel) => void
) {
  if (!router.isReady) {
    return;
  }
  const queryCurrentTab =
    typeof router.query.currentTab === 'string'
      ? router.query.currentTab
      : null;
  if (
    queryCurrentTab !== null &&
    settingPanelValues.indexOf(queryCurrentTab as SettingPanel) === -1
  ) {
    setCurrentTab(settingPanel.General);
    void router.replace({
      pathname: router.pathname,
      query: {
        ...router.query,
        currentTab: settingPanel.General,
      },
    });
    return;
  } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
    setCurrentTab(settingPanel.General);
    void router.replace({
      pathname: router.pathname,
      query: {
        ...router.query,
        currentTab: settingPanel.General,
      },
    });
    return;
  } else if (queryCurrentTab !== currentTab) {
    void router.replace({
      pathname: router.pathname,
      query: {
        ...router.query,
        currentTab: currentTab,
      },
    });
    return;
  }
}

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceIds = useAtomValue(rootWorkspacesMetadataAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  const t = useAFFiNEI18N();
  const [currentTab, setCurrentTab] = useAtom(settingPanelAtom);
  useEffect(() => {});
  const onChangeTab = useCallback(
    (tab: SettingPanel) => {
      setCurrentTab(tab as SettingPanel);
      void router.push({
        pathname: router.pathname,
        query: {
          ...router.query,
          currentTab: tab,
        },
      });
    },
    [router, setCurrentTab]
  );
  useTabRouterSync(router, currentTab, setCurrentTab);

  const helper = useAppHelper();

  const onDeleteWorkspace = useCallback(async () => {
    assertExists(currentWorkspace);
    const workspaceId = currentWorkspace.id;
    if (workspaceIds.length === 1 && workspaceId === workspaceIds[0].id) {
      toast(t['You cannot delete the last workspace']());
      throw new Error('You cannot delete the last workspace');
    } else {
      return await helper.deleteWorkspace(workspaceId);
    }
  }, [currentWorkspace, helper, t, workspaceIds]);
  const onTransformWorkspace = useOnTransformWorkspace();
  if (!router.isReady) {
    return <PageLoading />;
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
    return <PageLoading />;
  } else if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const Setting =
      WorkspaceAdapters[currentWorkspace.flavour].UI.SettingsDetail;
    return (
      <>
        <Head>
          <title>{t['Settings']()} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<SettingsIcon />}
        >
          {t['Workspace Settings']()}
        </WorkspaceTitle>
        <Setting
          onTransformWorkspace={onTransformWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          currentWorkspace={currentWorkspace}
          currentTab={currentTab as SettingPanel}
          onChangeTab={onChangeTab}
        />
      </>
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const Setting =
      WorkspaceAdapters[currentWorkspace.flavour].UI.SettingsDetail;
    return (
      <>
        <Head>
          <title>{t['Settings']()} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<SettingsIcon />}
        >
          {t['Workspace Settings']()}
        </WorkspaceTitle>
        <Setting
          onTransformWorkspace={onTransformWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          currentWorkspace={currentWorkspace}
          currentTab={currentTab as SettingPanel}
          onChangeTab={onChangeTab}
        />
      </>
    );
  }
  throw new Unreachable();
};

export default SettingPage;

SettingPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
