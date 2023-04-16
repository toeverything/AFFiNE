import { useTranslation } from '@affine/i18n';
import { atomWithSyncStorage } from '@affine/jotai';
import type { SettingPanel } from '@affine/workspace/type';
import {
  settingPanel,
  settingPanelValues,
  WorkspaceFlavour,
} from '@affine/workspace/type';
import { SettingsIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useAtom } from 'jotai';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useOnTransformWorkspace } from '../../../hooks/root/use-on-transform-workspace';
import { useSyncRouterWithCurrentWorkspaceId } from '../../../hooks/use-sync-router-with-current-workspace-id';
import { useAppHelper } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import { WorkspacePlugins } from '../../../plugins';
import type { NextPageWithLayout } from '../../../shared';

const settingPanelAtom = atomWithSyncStorage<SettingPanel>(
  'workspaceId',
  settingPanel.General
);

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useSyncRouterWithCurrentWorkspaceId(router);
  const [currentTab, setCurrentTab] = useAtom(settingPanelAtom);
  useEffect(() => {});
  const onChangeTab = useCallback(
    (tab: SettingPanel) => {
      setCurrentTab(tab as SettingPanel);
      router.push({
        pathname: router.pathname,
        query: {
          ...router.query,
          currentTab: tab,
        },
      });
    },
    [router, setCurrentTab]
  );
  useEffect(() => {
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
      router.replace({
        pathname: router.pathname,
        query: {
          ...router.query,
          currentTab: settingPanel.General,
        },
      });
      return;
    } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
      setCurrentTab(settingPanel.General);
      router.replace({
        pathname: router.pathname,
        query: {
          ...router.query,
          currentTab: settingPanel.General,
        },
      });
      return;
    } else if (queryCurrentTab !== currentTab) {
      router.replace({
        pathname: router.pathname,
        query: {
          ...router.query,
          currentTab: currentTab,
        },
      });
      return;
    }
  }, [currentTab, router, setCurrentTab]);

  const helper = useAppHelper();

  const onDeleteWorkspace = useCallback(() => {
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
  } else if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const Setting =
      WorkspacePlugins[currentWorkspace.flavour].UI.SettingsDetail;
    return (
      <>
        <Head>
          <title>{t('Settings')} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<SettingsIcon />}
        >
          {t('Workspace Settings')}
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
      WorkspacePlugins[currentWorkspace.flavour].UI.SettingsDetail;
    return (
      <>
        <Head>
          <title>{t('Settings')} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<SettingsIcon />}
        >
          {t('Workspace Settings')}
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
