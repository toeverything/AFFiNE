import { IntegrationTypeIcon } from '@affine/core/modules/integration';
import type { I18nString } from '@affine/i18n';
import { Logo1Icon, TodayIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import { CalendarSettingPanel } from './calendar/setting-panel';
import { GitHubSettingPanel } from './github/setting-panel';
import MCPIcon from './mcp-server/MCP.inline.svg';
import { McpServerSettingPanel } from './mcp-server/setting-panel';
import { ReadwiseSettingPanel } from './readwise/setting-panel';
import { RulesSettingPanel } from './rules/setting-panel';

type IntegrationCard = {
  id: string;
  name: I18nString;
  desc: I18nString;
  icon: ReactNode;
  cloud?: boolean;
} & (
  | {
      setting: ReactNode;
    }
  | {
      link: string;
    }
);

const INTEGRATION_LIST = [
  {
    id: 'readwise' as const,
    name: 'com.affine.integration.readwise.name',
    desc: 'com.affine.integration.readwise.desc',
    icon: <IntegrationTypeIcon type="readwise" />,
    setting: <ReadwiseSettingPanel />,
  },
  {
    id: 'calendar' as const,
    name: 'com.affine.integration.calendar.name',
    desc: 'com.affine.integration.calendar.desc',
    icon: <TodayIcon />,
    setting: <CalendarSettingPanel />,
    cloud: true,
  },
  {
    id: 'mcp-server' as const,
    name: 'com.affine.integration.mcp-server.name',
    desc: 'com.affine.integration.mcp-server.desc',
    icon: <img src={MCPIcon} />,
    setting: <McpServerSettingPanel />,
    cloud: true,
  },
  {
    id: 'github' as const,
    name: 'GitHub' as I18nString,
    desc: 'Connect GitHub repositories for the AION Agent Platform.' as I18nString,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
      </svg>
    ),
    setting: <GitHubSettingPanel />,
  },
  {
    id: 'rules' as const,
    name: 'Project Rules' as I18nString,
    desc: 'Mark AFFiNE documents as project rules for the AION agent.' as I18nString,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    setting: <RulesSettingPanel />,
  },
  {
    id: 'web-clipper' as const,
    name: 'com.affine.integration.web-clipper.name',
    desc: 'com.affine.integration.web-clipper.desc',
    icon: <Logo1Icon />,
    link: 'https://chromewebstore.google.com/detail/affine-web-clipper/mpbbkmbdpleomiogkbkkpfoljjpahmoi',
  },
] satisfies (IntegrationCard | false)[];

type IntegrationId = Exclude<
  Extract<(typeof INTEGRATION_LIST)[number], {}>,
  false
>['id'];

export type IntegrationItem = Exclude<IntegrationCard, 'id'> & {
  id: IntegrationId;
};

export function getAllowedIntegrationList(isCloudWorkspace: boolean) {
  return INTEGRATION_LIST.filter(item => {
    if (!item) return false;
    const requiredCloud = 'cloud' in item && item.cloud;
    if (requiredCloud && !isCloudWorkspace) return false;
    return true;
  }) as IntegrationItem[];
}
