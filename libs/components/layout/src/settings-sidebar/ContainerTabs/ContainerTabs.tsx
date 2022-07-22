import { cloneElement, useMemo, useCallback, type ReactElement } from 'react';
import { styled } from '@toeverything/components/ui';
import {
    CommentIcon,
    LayoutIcon,
    SettingsIcon,
} from '@toeverything/components/icons';
import { LayoutSettings } from '../Layout';
import { Comments } from '../Comments';
import { useActiveComment } from '../Comments/use-comments';
import { SettingsPanel } from '../Settings';
import { TabItemTitle } from './TabItemTitle';
import { useTabs } from './use-tabs';

const _defaultTabsKeys = ['layout', 'comment', 'settings'] as const;

export const ContainerTabs = () => {
    const { activeCommentId, resolveComment } = useActiveComment();

    const getSettingsTabsData = useCallback((): SettingsTabItemType[] => {
        return [
            {
                type: 'layout',
                text: 'Layout',
                icon: (
                    <IconWrapper>
                        <LayoutIcon />
                    </IconWrapper>
                ),
                panel: <LayoutSettings />,
            },
            {
                type: 'comment',
                text: 'Comment',
                icon: (
                    <IconWrapper>
                        <CommentIcon />
                    </IconWrapper>
                ),
                panel: (
                    <StyledSidebarContent>
                        <Comments
                            activeCommentId={activeCommentId}
                            resolveComment={resolveComment}
                        />
                    </StyledSidebarContent>
                ),
            },
            {
                type: 'settings',
                text: 'Settings',
                icon: (
                    <IconWrapper>
                        <SettingsIcon />
                    </IconWrapper>
                ),
                panel: <SettingsPanel />,
            },
        ];
    }, [activeCommentId, resolveComment]);

    const settingsTabsData = useMemo(() => {
        return getSettingsTabsData();
    }, [getSettingsTabsData]);

    const [activeTab, setActiveTab] = useTabs(
        _defaultTabsKeys as unknown as string[],
        'settings'
    );

    return (
        <>
            <StyledTabsTitlesContainer>
                {settingsTabsData.map(tab => {
                    const { type, text, icon } = tab;
                    return (
                        <TabItemTitle
                            title={text}
                            icon={icon}
                            isActive={activeTab === type}
                            onClick={() => {
                                setActiveTab(type);
                            }}
                            key={type}
                        />
                    );
                })}
            </StyledTabsTitlesContainer>
            <StyledTabsPanelsContainer>
                {settingsTabsData.map(tab => {
                    const { type, panel } = tab;
                    return type === activeTab
                        ? cloneElement(panel, { key: type })
                        : null;
                })}
            </StyledTabsPanelsContainer>
        </>
    );
};

const StyledTabsTitlesContainer = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 24,
        marginBottom: 24,
        marginLeft: theme.affine.spacing.smSpacing,
        marginRight: theme.affine.spacing.smSpacing,
    };
});

const StyledTabsPanelsContainer = styled('div')(({ theme }) => {
    return {
        height: 'calc(100vh - 80px)',
        borderTop: `1px solid ${theme.affine.palette.tagHover}`,
    };
});

type SettingsTabsTypes = typeof _defaultTabsKeys[number];

type SettingsTabItemType = {
    type: SettingsTabsTypes;
    text: string;
    icon: ReactElement;
    panel: ReactElement;
};

const StyledSidebarContent = styled('div')(({ theme }) => {
    return {
        marginLeft: theme.affine.spacing.lgSpacing,
    };
});

const IconWrapper = styled('div')({
    fontSize: 0,

    '& > svg': {
        fontSize: '20px',
    },
});
