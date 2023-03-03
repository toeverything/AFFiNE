import { useTranslation } from '@affine/i18n';
import { SettingsIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { useWorkspacesHelper } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import {
  NextPageWithLayout,
  RemWorkspaceFlavour,
  SettingPanel,
  settingPanel,
  settingPanelValues,
} from '../../../shared';

const settingPanelAtom = atomWithStorage<SettingPanel>(
  'workspaceId',
  settingPanel.General
);

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useSyncRouterWithCurrentWorkspace(router);
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

  const helper = useWorkspacesHelper();

  const onDeleteWorkspace = useCallback(() => {
    assertExists(currentWorkspace);
    const workspaceId = currentWorkspace.id;
    helper.deleteWorkspace(workspaceId);
  }, [currentWorkspace, helper]);
  const onTransformWorkspace = useCallback(
    (targetWorkspaceId: string) => {
      router
        .replace({
          pathname: `/workspace/[workspaceId]/all`,
          query: {
            workspaceId: targetWorkspaceId,
          },
        })
        .then(() => {
          router.reload();
        });
    },
    [router]
  );
  if (!router.isReady) {
    return <PageLoading />;
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
    return <PageLoading />;
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const Setting = WorkspacePlugins[currentWorkspace.flavour].SettingsDetail;
    return (
      <>
        <Helmet>
          <title>{t('Workspace Settings')} - AFFiNE</title>
        </Helmet>
        <WorkspaceTitle icon={<SettingsIcon />}>
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
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const Setting = WorkspacePlugins[currentWorkspace.flavour].SettingsDetail;
    return (
      <>
        <WorkspaceTitle icon={<SettingsIcon />}>
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
