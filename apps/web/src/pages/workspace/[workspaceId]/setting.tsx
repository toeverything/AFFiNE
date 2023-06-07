import type { SettingPanel } from '@affine/env/workspace';
import {
  settingPanel,
  settingPanelValues,
  WorkspaceSubPath,
} from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Head from 'next/head';
import type { NextRouter } from 'next/router';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import { PageLoading } from '../../../components/pure/loading';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useOnTransformWorkspace } from '../../../hooks/root/use-on-transform-workspace';
import { useAppHelper } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

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
    return helper.deleteWorkspace(workspaceId);
  }, [currentWorkspace, helper]);
  const onTransformWorkspace = useOnTransformWorkspace();
  if (!router.isReady) {
    return <PageLoading />;
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
    return <PageLoading />;
  }
  const { SettingsDetail, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Head>
        <title>{t['Settings']()} - AFFiNE</title>
      </Head>
      <Header
        currentWorkspace={currentWorkspace}
        currentEntry={{
          subPath: WorkspaceSubPath.SETTING,
        }}
      />
      <SettingsDetail
        onTransformWorkspace={onTransformWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        currentWorkspace={currentWorkspace}
        currentTab={currentTab as SettingPanel}
        onChangeTab={onChangeTab}
      />
    </>
  );
};

export default SettingPage;

SettingPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
