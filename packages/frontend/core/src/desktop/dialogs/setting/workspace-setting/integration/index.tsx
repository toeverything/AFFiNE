import { SettingHeader } from '@affine/component/setting-components';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { SubPageProvider, useSubPageIsland } from '../../sub-page';
import {
  IntegrationCard,
  IntegrationCardContent,
  IntegrationCardHeader,
} from './card';
import { getAllowedIntegrationList } from './constants';
import { type IntegrationItem } from './constants';
import { list } from './index.css';

export const IntegrationSetting = () => {
  const t = useI18n();
  const [opened, setOpened] = useState<string | null>(null);
  const workspaceService = useService(WorkspaceService);
  const isCloudWorkspace = workspaceService.workspace.flavour !== 'local';
  console.log('isCloudWorkspace', isCloudWorkspace);

  const integrationList = useMemo(
    () => getAllowedIntegrationList(isCloudWorkspace),
    [isCloudWorkspace]
  );
  const handleCardClick = useCallback((card: IntegrationItem) => {
    if ('setting' in card && card.setting) {
      setOpened(card.id);
    }
  }, []);

  return (
    <>
      <SettingHeader
        title={t['com.affine.integration.integrations']()}
        subtitle={
          <>
            {t['com.affine.integration.setting.description']()}
            {/* <br /> */}
            {/* <a>{t['Learn how to develop a integration for AFFiNE']()}</a> */}
          </>
        }
      />
      <ul className={list}>
        {integrationList.map(item => {
          const title =
            typeof item.name === 'string'
              ? t[item.name]()
              : t[item.name.i18nKey]();
          const desc =
            typeof item.desc === 'string'
              ? t[item.desc]()
              : t[item.desc.i18nKey]();
          return (
            <li key={item.id}>
              <IntegrationCard
                onClick={() => handleCardClick(item)}
                link={'link' in item ? item.link : undefined}
              >
                <IntegrationCardHeader icon={item.icon} title={title} />
                <IntegrationCardContent desc={desc} />
              </IntegrationCard>

              {'setting' in item && item.setting ? (
                <IntegrationSettingPage
                  open={opened === item.id}
                  onClose={() => setOpened(null)}
                >
                  {item.setting}
                </IntegrationSettingPage>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
};

const IntegrationSettingPage = ({
  children,
  open,
  onClose,
}: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) => {
  const t = useI18n();
  const island = useSubPageIsland();

  if (!island) {
    return null;
  }

  return (
    <SubPageProvider
      backText={t['com.affine.integration.integrations']()}
      island={island}
      open={open}
      onClose={onClose}
    >
      {children}
    </SubPageProvider>
  );
};
