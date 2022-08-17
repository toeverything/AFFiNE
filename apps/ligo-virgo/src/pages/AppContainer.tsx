import { css, Global } from '@emotion/react';
import { LayoutHeader, SettingsSidebar } from '@toeverything/components/layout';
import { styled } from '@toeverything/components/ui';
import { Outlet } from 'react-router-dom';

export function LigoVirgoRootContainer() {
    return (
        <>
            <Global
                styles={css`
                    #root {
                        display: flex;
                        flex-direction: row;
                        height: 100vh;
                    }
                `}
            />
            <StyledContentContainer>
                <LayoutHeader />
                <StyledMainContainer>
                    <Outlet />
                </StyledMainContainer>
            </StyledContentContainer>
            <SettingsSidebar />
        </>
    );
}

const StyledMainContainer = styled('div')({
    flex: 'auto',
    display: 'flex',
    overflowY: 'hidden',
});

const StyledContentContainer = styled('div')({
    flex: 'auto',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
});
