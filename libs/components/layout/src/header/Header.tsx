import { ListIcon, LogoLink, SpaceIcon } from '@toeverything/components/common';
import { SideBarViewIcon } from '@toeverything/components/icons';
import {
    MuiIconButton as IconButton,
    styled,
    Tooltip,
    useTheme,
} from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';
import {
    useShowSettingsSidebar,
    useShowSpaceSidebar,
    useUserAndSpaces,
} from '@toeverything/datasource/state';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHistoryPortal } from './PageHistoryPortal';
import { PageSettingPortal } from './PageSettingPortal';
import { PageSharePortal } from './PageSharePortal';
import { CurrentPageTitle } from './Title';
import { UserMenuIcon } from './user-menu-icon';

function hideAffineHeader(pathname: string): boolean {
    return ['/', '/login', '/error/workspace', '/error/404', '/ui'].includes(
        pathname
    );
}

type HeaderIconProps = {
    isEdgelessView?: boolean;
};

export const AffineHeader = () => {
    const navigate = useNavigate();
    const params = useParams();
    const { pathname } = useLocation();
    const { toggleSpaceSidebar, setSpaceSidebarVisible } =
        useShowSpaceSidebar();
    const { toggleSettingsSidebar: toggleInfoSidebar } =
        useShowSettingsSidebar();
    const theme = useTheme();
    const isEdgelessView = pathname.endsWith('/edgeless');
    const pageHistoryPortalFlag = useFlag('BooleanPageHistoryPortal', false);
    const pageSettingPortalFlag = useFlag('PageSettingPortal', false);
    const BooleanPageSharePortal = useFlag('BooleanPageSharePortal', false);
    // TODO: remove this
    useUserAndSpaces();

    const showCenterTab =
        (params['workspace_id'] || pathname.includes('/space/')) && params['*'];

    if (hideAffineHeader(pathname)) {
        return null;
    }

    return (
        <StyledHeader style={{ zIndex: theme.affine.zIndex.header }}>
            <StyledHeaderLeft>
                <LogoLink /> &emsp;
                {/* <HeaderIcon
                    onClick={toggleSpaceSidebar}
                    onMouseEnter={() => setSpaceSidebarVisible(true)}
                    sx={{ mr: 4, ml: 4 }}
                >
                    <MenuIconBak />
                </HeaderIcon> */}
                {pageHistoryPortalFlag && (
                    <HeaderIcon sx={{ mr: 4 }}>
                        <PageHistoryPortal />
                    </HeaderIcon>
                )}
                <CurrentPageTitle />
            </StyledHeaderLeft>

            <StyledHeaderCenter>
                {showCenterTab && (
                    <>
                        <Tooltip content="Doc">
                            <HeaderIcon
                                style={{ width: '80px' }}
                                isEdgelessView={!isEdgelessView}
                                onClick={() =>
                                    isEdgelessView
                                        ? navigate(
                                              `/${
                                                  params['workspace_id'] ||
                                                  'space'
                                              }/${params['*'].slice(0, -11)}`
                                          )
                                        : null
                                }
                            >
                                <ListIcon />
                                <span
                                    style={{
                                        fontSize: '16px',
                                        marginLeft: '7.5px',
                                    }}
                                >
                                    Doc
                                </span>
                            </HeaderIcon>
                        </Tooltip>
                        <Tooltip content="Edgeless">
                            <HeaderIcon
                                isEdgelessView={isEdgelessView}
                                onClick={() =>
                                    isEdgelessView
                                        ? null
                                        : navigate(
                                              `/${
                                                  params['workspace_id'] ||
                                                  'space'
                                              }/${params['*']}` + '/edgeless'
                                          )
                                }
                            >
                                <SpaceIcon />
                            </HeaderIcon>
                        </Tooltip>
                    </>
                )}
            </StyledHeaderCenter>
            <StyledHeaderRight>
                {BooleanPageSharePortal && (
                    <HeaderIcon sx={{ mr: 4 }}>
                        <PageSharePortal />
                    </HeaderIcon>
                )}
                <UserMenuIcon />

                {pageSettingPortalFlag && (
                    <HeaderIcon>
                        <PageSettingPortal />
                    </HeaderIcon>
                )}

                <HeaderIcon sx={{ mr: 4 }} onClick={toggleInfoSidebar}>
                    <SideBarViewIcon />
                </HeaderIcon>
            </StyledHeaderRight>
        </StyledHeader>
    );
};

const StyledHeader = styled('div')`
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 64px;
    padding: 0 32px;
    background-color: #fff;
`;

const StyledHeaderLeft = styled('div')`
    display: flex;
    align-items: center;
`;

const StyledHeaderCenter = styled('div')`
    display: flex;
    align-items: center;
`;
const StyledHeaderRight = styled('div')`
    display: flex;
    align-items: center;
`;

const HeaderIcon = styled(IconButton, {
    shouldForwardProp: (prop: string) => prop !== 'isEdgelessView',
})<HeaderIconProps>(({ isEdgelessView = false }) => ({
    color: '#98ACBD',
    minWidth: 48,
    width: 48,
    height: 36,
    borderRadius: '8px',
    ...(isEdgelessView && {
        color: '#fff',
        backgroundColor: '#3E6FDB',
        '&:hover': {
            backgroundColor: '#3E6FDB',
        },
    }),
}));
