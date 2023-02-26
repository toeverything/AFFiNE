import { useTranslation } from '@affine/i18n';
import React, {
  MouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AffineOfficialWorkspace } from '../../../shared';
import { CollaborationPanel } from './panel/collaboration';
import { GeneralPanel } from './panel/general';
import {
  StyledIndicator,
  StyledSettingContainer,
  StyledSettingContent,
  StyledTabButtonWrapper,
  WorkspaceSettingTagItem,
} from './style';

export type WorkspaceSettingDetailProps = {
  workspace: AffineOfficialWorkspace;
};

export const enum Panel {
  General = 'general',
  Collaboration = 'collaboration',
  Publish = 'publish',
  Export = 'export',
  // TODO: add it back for desktop version
  // Sync = 'sync'
}

export type PanelProps = {
  workspace: AffineOfficialWorkspace;
};

const panelMap = {
  [Panel.General]: {
    name: 'General',
    ui: GeneralPanel,
  },
  [Panel.Collaboration]: {
    name: 'Collaboration',
    ui: CollaborationPanel,
  },
  [Panel.Publish]: {
    name: 'Publish',
    ui: () => <>Publish</>,
  },
  [Panel.Export]: {
    name: 'Export',
    ui: () => <>Export</>,
  },
} satisfies {
  [Key in Panel]: {
    name: string;
    ui: React.FC<PanelProps>;
  };
};

function assertInstanceOf<T, U extends T>(
  obj: T,
  type: new (...args: any[]) => U
): asserts obj is U {
  if (!(obj instanceof type)) {
    throw new Error('Object is not instance of type');
  }
}

export const WorkspaceSettingDetail: React.FC<WorkspaceSettingDetailProps> = ({
  workspace,
}) => {
  const isAffine = workspace.flavour === 'affine';
  if (!(workspace.flavour === 'affine' || workspace.flavour === 'local')) {
    throw new Error('Unsupported workspace flavour');
  }
  const [activeTab, setActiveTab] = useState<Panel>(Panel.General);
  if (!(activeTab in panelMap)) {
    throw new Error('Invalid activeTab: ' + activeTab);
  }
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const startTransaction = useCallback(() => {
    if (indicatorRef.current && containerRef.current) {
      const indicator = indicatorRef.current;
      const activeTabElement = containerRef.current.querySelector(
        `[data-tab-key="${activeTab}"]`
      );
      assertInstanceOf(activeTabElement, HTMLElement);
      requestAnimationFrame(() => {
        indicator.style.left = `${activeTabElement.offsetLeft}px`;
        indicator.style.width = `${activeTabElement.offsetWidth}px`;
      });
    }
  }, [activeTab]);
  const handleTabClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      assertInstanceOf(event.target, HTMLElement);
      const key = event.target.getAttribute('data-tab-key');
      if (!key || !(key in panelMap)) {
        throw new Error('data-tab-key is invalid: ' + key);
      }
      setActiveTab(key as Panel);
      startTransaction();
    },
    [startTransaction]
  );
  const Component = useMemo(() => panelMap[activeTab].ui, [activeTab]);
  return (
    <StyledSettingContainer
      aria-label="workspace-setting-detail"
      ref={containerRef}
    >
      <StyledTabButtonWrapper>
        {Object.entries(panelMap).map(([key, value]) => {
          if (!isAffine && key === 'Sync') {
            return null;
          }
          return (
            <WorkspaceSettingTagItem
              key={key}
              isActive={activeTab === key}
              data-tab-key={key}
              onClick={handleTabClick}
            >
              {t(value.name)}
            </WorkspaceSettingTagItem>
          );
        })}
        <StyledIndicator
          ref={ref => {
            indicatorRef.current = ref;
            startTransaction();
          }}
        />
      </StyledTabButtonWrapper>
      <StyledSettingContent>
        <Component
          key={activeTab}
          data-tab-ui={activeTab}
          workspace={workspace}
        />
      </StyledSettingContent>
    </StyledSettingContainer>
  );
};
