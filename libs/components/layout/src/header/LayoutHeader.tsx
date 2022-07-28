import { IconButton, styled } from '@toeverything/components/ui';
import {
    LogoIcon,
    SideBarViewIcon,
    SearchIcon,
} from '@toeverything/components/icons';
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
                    <StyledHelper>
                        <StyledShare>Share</StyledShare>
                        <div style={{ margin: '0px 12px' }}>
                            <IconButton size="large">
                                <SearchIcon />
                            </IconButton>
                        </div>

                        <IconButton onClick={toggleInfoSidebar} size="large">
                            <SideBarViewIcon />
                        </IconButton>
                    </StyledHelper>
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
        backgroundColor: '#fff',
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

const StyledHelper = styled('div')({
    display: 'flex',
    alignItems: 'center',
});

const StyledShare = styled('div')({
    padding: '10px 12px',
    fontWeight: 600,
    fontSize: '14px',
    color: '#3E6FDB',
    cursor: 'pointer',

    '&:hover': {
        background: '#F5F7F8',
        borderRadius: '5px',
    },
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
