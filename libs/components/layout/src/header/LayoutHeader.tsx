import { useMemo } from 'react';

import { IconButton, styled } from '@toeverything/components/ui';
import {
    LogoIcon,
    SideBarViewIcon,
    SearchIcon,
    SideBarViewCloseIcon,
} from '@toeverything/components/icons';
import {
    useShowSettingsSidebar,
    useLocalTrigger,
} from '@toeverything/datasource/state';

import { EditorBoardSwitcher } from './EditorBoardSwitcher';
import { fsApiSupported, FileSystem } from './FileSystem';
import { CurrentPageTitle } from './Title';

export const LayoutHeader = () => {
    const [isLocalWorkspace] = useLocalTrigger();
    const { toggleSettingsSidebar: toggleInfoSidebar, showSettingsSidebar } =
        useShowSettingsSidebar();

    const warningTips = useMemo(() => {
        if (!fsApiSupported()) {
            return 'Your browser does not support the local fs storage feature, please upgrade to the latest version of Chrome or Edge browser';
        } else if (!isLocalWorkspace) {
            return 'You are in DEMO mode. Changes will NOT be saved unless you SYNC TO DISK';
        } else {
            return 'AFFiNE is under active development and the current version is UNSTABLE. Please DO NOT store information or data';
        }
    }, [isLocalWorkspace]);

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
                        <FileSystem />
                        <StyledShare disabled={true}>Share</StyledShare>
                        <div style={{ margin: '0px 12px' }}>
                            <IconButton
                                size="large"
                                hoverColor={'transparent'}
                                disabled={true}
                                style={{ cursor: 'not-allowed' }}
                            >
                                <SearchIcon />
                            </IconButton>
                        </div>

                        <IconButton onClick={toggleInfoSidebar} size="large">
                            {showSettingsSidebar ? (
                                <SideBarViewCloseIcon />
                            ) : (
                                <SideBarViewIcon />
                            )}
                        </IconButton>
                    </StyledHelper>
                </FlexContainer>
                <StyledContainerForEditorBoardSwitcher>
                    <EditorBoardSwitcher />
                </StyledContainerForEditorBoardSwitcher>
            </StyledHeaderRoot>
            <StyledUnstableTips>
                <StyledUnstableTipsText>{warningTips}</StyledUnstableTipsText>
            </StyledUnstableTips>
        </StyledContainerForHeaderRoot>
    );
};

const StyledUnstableTips = styled('div')(({ theme }) => {
    return {
        width: '100%',
        height: '2em',
        display: 'flex',
        zIndex: theme.affine.zIndex.header,
        backgroundColor: '#fff8c5',
        borderWidth: '1px 0',
        borderColor: '#e4e49588',
        borderStyle: 'solid',
    };
});

const StyledUnstableTipsText = styled('span')(({ theme }) => {
    return {
        margin: 'auto 36px',
        width: '100%',
        textAlign: 'center',
    };
});

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

const StyledShare = styled('div')<{ disabled?: boolean }>({
    padding: '10px 12px',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'not-allowed',
    color: '#98ACBD',
    textTransform: 'none',
    /* disabled for current time */
    // color: '#3E6FDB',
    // '&:hover': {
    //     background: '#F5F7F8',
    //     borderRadius: '5px',
    // },
});

const StyledLogoIcon = styled(LogoIcon)(({ theme }) => {
    return {
        color: theme.affine.palette.primary,
        cursor: 'pointer',
    };
});

const StyledContainerForEditorBoardSwitcher = styled('div')({
    width: '100%',
    position: 'absolute',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
});
