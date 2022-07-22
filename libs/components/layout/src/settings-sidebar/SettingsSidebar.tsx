import { styled } from '@toeverything/components/ui';
import { useShowSettingsSidebar } from '@toeverything/datasource/state';
import { ContainerTabs } from './ContainerTabs';

const SETTINGS_SIDEBAR_WIDTH = 370;

export const SettingsSidebar = () => {
    const { showSettingsSidebar } = useShowSettingsSidebar();

    return (
        <StyledContainerForSidebar
            isShow={showSettingsSidebar}
            id="id-side-panel"
        >
            {showSettingsSidebar ? <ContainerTabs /> : null}
        </StyledContainerForSidebar>
    );
};

const StyledContainerForSidebar = styled('div', {
    shouldForwardProp: (prop: string) => !['isShow'].includes(prop),
})<{ isShow?: boolean }>(({ theme, isShow }) => {
    return {
        flex: 'none',
        width: isShow ? SETTINGS_SIDEBAR_WIDTH : 0,
        // TODO: animation not working
        transition: 'all 300ms ease-in-out',
        borderLeft: `1px solid ${theme.affine.palette.menuSeparator}`,
        zIndex: 100,
        backgroundColor: 'white',
        overflow: 'hidden',
    };
});
