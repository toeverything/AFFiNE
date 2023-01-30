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
} from '@/components/workspace-setting';
import { SettingsIcon } from '@blocksuite/icons';
import { useAppState } from '@/providers/app-state-provider';
import WorkspaceLayout from '@/components/workspace-layout';
import { WorkspaceUnit } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { PageListHeader } from '@/components/header';

type TabNames = 'General' | 'Sync' | 'Collaboration' | 'Publish' | 'Export';

const tabMap: {
  name: TabNames;
  panelRender: (workspace: WorkspaceUnit) => ReactNode;
}[] = [
  {
    name: 'General',
    panelRender: workspace => <GeneralPage workspace={workspace} />,
  },
  {
    name: 'Sync',
    panelRender: workspace => <SyncPage workspace={workspace} />,
  },
  {
    name: 'Collaboration',
    panelRender: workspace => <MembersPage workspace={workspace} />,
  },
  {
    name: 'Publish',
    panelRender: workspace => <PublishPage workspace={workspace} />,
  },
  // TODO: next version will finish this feature
  // {
  //   name: 'Export',
  //   panelRender: workspace => <ExportPage workspace={workspace} />,
  // },
];

const WorkspaceSetting = () => {
  const { t } = useTranslation();
  const { currentWorkspace, isOwner } = useAppState();

  const [activeTab, setActiveTab] = useState<TabNames>(tabMap[0].name);
  const handleTabChange = (tab: TabNames) => {
    setActiveTab(tab);
  };

  const activeTabPanelRender = tabMap.find(
    tab => tab.name === activeTab
  )?.panelRender;
  let tableArr: {
    name: TabNames;
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
  return (
    <>
      <StyledSettingContainer>
        <PageListHeader icon={<SettingsIcon />}>{t('Settings')}</PageListHeader>
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
