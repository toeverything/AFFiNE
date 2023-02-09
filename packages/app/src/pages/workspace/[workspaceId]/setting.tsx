import {
  StyledSettingContainer,
  StyledSettingContent,
  StyledSettingSidebar,
  StyledSettingTabContainer,
  WorkspaceSettingTagItem,
} from '@/components/workspace-setting/style';
import { ReactElement, ReactNode, useState } from 'react';
import {
  GeneralPage,
  MembersPage,
  PublishPage,
  SyncPage,
  ExportPage,
} from '@/components/workspace-setting';
import { SettingsIcon } from '@blocksuite/icons';
import { useAppState } from '@/providers/app-state-provider';
import WorkspaceLayout from '@/components/workspace-layout';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { PageListHeader } from '@/components/header';
import Head from 'next/head';

const useTabMap = () => {
  const { t } = useTranslation();
  const { isOwner } = useAppState();
  const tabMap: {
    name: string;
    panelRender: (workspace: WorkspaceUnit) => ReactNode;
  }[] = [
    {
      name: t('General'),
      panelRender: workspace => <GeneralPage workspace={workspace} />,
    },
    {
      name: t('Sync'),
      panelRender: workspace => <SyncPage workspace={workspace} />,
    },
    {
      name: t('Collaboration'),
      panelRender: workspace => <MembersPage workspace={workspace} />,
    },
    {
      name: t('Publish'),
      panelRender: workspace => <PublishPage workspace={workspace} />,
    },
    // TODO: next version will finish this feature
    {
      name: t('Export'),
      panelRender: workspace => <ExportPage workspace={workspace} />,
    },
  ];
  const [activeTab, setActiveTab] = useState<string>(tabMap[0].name);
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const activeTabPanelRender = tabMap.find(
    tab => tab.name === activeTab
  )?.panelRender;
  let tableArr: {
    name: string;
    panelRender: (workspace: WorkspaceUnit) => ReactNode;
  }[] = tabMap;
  if (!isOwner) {
    tableArr = [
      {
        name: 'General',
        panelRender: workspace => <GeneralPage workspace={workspace} />,
      },
    ];
  }
  return { activeTabPanelRender, tableArr, handleTabChange, activeTab };
};

const WorkspaceSetting = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useAppState();
  const { activeTabPanelRender, tableArr, handleTabChange, activeTab } =
    useTabMap();
  return (
    <>
      <Head>
        <title>{t('Settings')} - AFFiNE</title>
      </Head>
      <PageListHeader icon={<SettingsIcon />}>{t('Settings')}</PageListHeader>

      <StyledSettingContainer>
        <StyledSettingSidebar>
          <StyledSettingTabContainer>
            {tableArr.map(({ name }) => {
              return (
                <WorkspaceSettingTagItem
                  key={name}
                  isActive={activeTab === name}
                  onClick={() => {
                    handleTabChange(name);
                  }}
                >
                  {name}
                </WorkspaceSettingTagItem>
              );
            })}
          </StyledSettingTabContainer>
        </StyledSettingSidebar>

        <StyledSettingContent>
          {currentWorkspace && activeTabPanelRender?.(currentWorkspace)}
        </StyledSettingContent>
      </StyledSettingContainer>
    </>
  );
};
WorkspaceSetting.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceSetting;
