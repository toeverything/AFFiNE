import { IconButton, styled } from '@toeverything/components/ui';
import { LogoIcon, SideBarViewIcon } from '@toeverything/components/icons';
import { useShowSettingsSidebar } from '@toeverything/datasource/state';
import { CurrentPageTitle } from './Title';
import { EditorBoardSwitcher } from './EditorBoardSwitcher';

export const LayoutHeader = () => {
    const { toggleSettingsSidebar: toggleInfoSidebar } =
        useShowSettingsSidebar();

    return (
        <StyledContainerForHeaderRoot>
            <StyledHeaderRoot>
                <FlexContainer>
                    <StyledLogoIcon />
                    <TitleContainer>
                        <CurrentPageTitle />
                    </TitleContainer>
                </FlexContainer>
                <FlexContainer>
                    <IconButton onClick={toggleInfoSidebar}>
                        <SideBarViewIcon />
                    </IconButton>
                </FlexContainer>
                <StyledContainerForEditorBoardSwitcher>
                    <EditorBoardSwitcher />
                </StyledContainerForEditorBoardSwitcher>
            </StyledHeaderRoot>
        </StyledContainerForHeaderRoot>
    );
};

const StyledContainerForHeaderRoot = styled('div')(({ theme }) => {
    return {
        width: '100%',
        zIndex: theme.affine.zIndex.header,
    };
});

const StyledHeaderRoot = styled('div')(({ theme }) => {
    return {
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 60,
        marginLeft: 36,
        marginRight: 36,
    };
});

const FlexContainer = styled('div')({ display: 'flex' });

const TitleContainer = styled('div')(({ theme }) => {
    return {
        // marginLeft: theme.affine.spacing.lgSpacing,
        marginLeft: 100,
        maxWidth: 500,
        overflowX: 'hidden',
        color: theme.affine.palette.primaryText,
        lineHeight: '18px',
        fontSize: '15px',
        fontStyle: 'normal',
        fontWeight: '400',
        letterSpacing: '1.06px',
        display: 'flex',
        alignItems: 'center',
    };
});

const StyledLogoIcon = styled(LogoIcon)(({ theme }) => {
    return {
        color: theme.affine.palette.primary,
        cursor: 'pointer',
    };
});

const StyledContainerForEditorBoardSwitcher = styled('div')(({ theme }) => {
    return {
        position: 'absolute',
        left: '50%',
    };
});
