import { styled } from '@toeverything/components/ui';
import type { ValueOf } from '@toeverything/utils';

const StyledTabs = styled('div')(({ theme }) => {
    return {
        width: '100%',
        height: '30px',
        marginTop: '12px',
        display: 'flex',
        fontSize: '12px',
        fontWeight: '600',
    };
});

const StyledTabTitle = styled('div')<{
    isActive?: boolean;
    isDisabled?: boolean;
}>`
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;

    line-height: 18px;
    padding-top: 4px;
    border-top: 2px solid #ecf1fb;
    position: relative;
    cursor: pointer;
    color: ${({ theme, isActive }) =>
        isActive ? theme.affine.palette.primary : 'rgba(62, 111, 219, 0.6)'};

    &::after {
        content: '';
        width: 0;
        height: 2px;
        background-color: ${({ isActive, theme }) =>
            isActive
                ? theme.affine.palette.primary
                : 'rgba(62, 111, 219, 0.6)'};
        position: absolute;
        left: 100%;
        top: -2px;
        transition: all 0.2s;
    }

    &.active {
        &::after {
            width: 100%;
            left: 0;
            transition-delay: 0.1s;
        }
        & ~ div::after {
            left: 0;
        }
    }
`;

export const TAB_TITLE = {
    PAGES: 'PAGES',
    GALLERY: 'GALLERY',
    TOC: 'TOC',
} as const;

export const TabMap = new Map<
    TabValue,
    { value: TabValue; disabled?: boolean }
>([
    [TAB_TITLE.PAGES, { value: TAB_TITLE.PAGES }],
    [TAB_TITLE.GALLERY, { value: TAB_TITLE.GALLERY, disabled: true }],
    [TAB_TITLE.TOC, { value: TAB_TITLE.TOC }],
]);

type TabValue = ValueOf<typeof TAB_TITLE>;

interface Props {
    activeTab: TabValue;
    onTabChange: (v: TabValue) => void;
}

const Tabs = (props: Props) => {
    const { activeTab, onTabChange } = props;

    return (
        <StyledTabs>
            {[...TabMap.entries()].map(([k, { value, disabled = false }]) => {
                const isActive = activeTab === value;

                return (
                    <StyledTabTitle
                        key={value}
                        className={isActive ? 'active' : ''}
                        isActive={isActive}
                        isDisabled={disabled}
                        onClick={() => onTabChange(value)}
                    >
                        {k}
                    </StyledTabTitle>
                );
            })}
        </StyledTabs>
    );
};

export { Tabs };
