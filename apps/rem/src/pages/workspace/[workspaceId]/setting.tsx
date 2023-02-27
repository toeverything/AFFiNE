import { useTranslation } from '@affine/i18n';
import { SettingsIcon } from '@blocksuite/icons';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/router';
import { useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { Unreachable } from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import {
  NextPageWithLayout,
  RemWorkspaceFlavour,
  SettingPanel,
  settingPanel,
  settingPanelValues,
} from '../../../shared';

prefetchNecessaryData();

const settingPanelAtom = atomWithStorage<SettingPanel>(
  'workspaceId',
  settingPanel.General
);

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useLoadWorkspace(currentWorkspace);
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
  if (!router.isReady) {
    return <PageLoading />;
  } else if (!currentWorkspace) {
    throw new Unreachable();
  } else if (settingPanelValues.indexOf(currentTab as SettingPanel) === -1) {
    return <PageLoading />;
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const Setting = UIPlugins[currentWorkspace.flavour].SettingsDetail;
    return (
      <>
        <Helmet>
          <title>{t('Workspace Settings')} - AFFiNE</title>
        </Helmet>
        <WorkspaceTitle icon={<SettingsIcon />}>
          {t('Workspace Settings')}
        </WorkspaceTitle>
        <Setting
          currentWorkspace={currentWorkspace}
          currentTab={currentTab as SettingPanel}
          onChangeTab={onChangeTab}
        />
      </>
    );
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const Setting = UIPlugins[currentWorkspace.flavour].SettingsDetail;
    return (
      <>
        <WorkspaceTitle icon={<SettingsIcon />}>
          {t('Workspace Settings')}
        </WorkspaceTitle>
        <Setting
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
