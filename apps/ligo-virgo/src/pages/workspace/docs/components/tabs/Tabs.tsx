import { useState } from 'react';
import { MuiDivider as Divider, styled } from '@toeverything/components/ui';
import type { ValueOf } from '@toeverything/utils';

const StyledTabs = styled('div')({
    width: '100%',
    height: '12px',
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
});

const StyledDivider = styled(Divider)<{ isActive?: boolean }>(
    ({ isActive }) => {
        return {
            flex: 1,
            backgroundColor: isActive ? '#3E6FDB' : '#ECF1FB',
            borderWidth: '2px',
        };
    }
);

const TAB_TITLE = {
    PAGES: 'pages',
    GALLERY: 'gallery',
    TOC: 'toc',
} as const;

const TabMap = new Map<TabKey, TabValue>([
    ['PAGES', 'pages'],
    ['GALLERY', 'gallery'],
    ['TOC', 'toc'],
]);

type TabKey = keyof typeof TAB_TITLE;
type TabValue = ValueOf<typeof TAB_TITLE>;

const Tabs = () => {
    const [activeTab, setActiveTab] = useState<TabValue>(TAB_TITLE.PAGES);

    const onClick = (v: TabValue) => {
        setActiveTab(v);
    };

    return (
        <StyledTabs>
            {[...TabMap.entries()].map(([k, v]) => {
                return (
                    <StyledDivider
                        key={v}
                        isActive={v === activeTab}
                        onClick={() => onClick(v)}
                    />
                );
            })}
        </StyledTabs>
    );
};

export { Tabs };
