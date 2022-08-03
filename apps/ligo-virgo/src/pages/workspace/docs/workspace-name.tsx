import {
    MuiButton as Button,
    Switch,
    styled,
    MuiOutlinedInput as OutlinedInput,
} from '@toeverything/components/ui';
import { LogoIcon } from '@toeverything/components/icons';
import {
    useUserAndSpaces,
    useShowSpaceSidebar,
} from '@toeverything/datasource/state';
import { useCallback, useEffect, useRef, useState } from 'react';
import { services } from '@toeverything/datasource/db-service';

const WorkspaceContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    minHeight: 60,
    padding: '12px 0px',
    color: '#566B7D',
});
const LeftContainer = styled('div')({
    flex: 'auto',
    display: 'flex',
});

const LogoContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    minWidth: 24,
});

const StyledLogoIcon = styled(LogoIcon)(({ theme }) => {
    return {
        color: theme.affine.palette.primary,
        width: '16px !important',
        height: '16px !important',
    };
});

const WorkspaceNameContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    flex: 'auto',
    width: '100px',
    marginRight: '10px',
    input: {
        padding: '5px 10px',
    },
    span: {
        width: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
});

const WorkspaceReNameContainer = styled('div')({
    marginRight: '10px',
    input: {
        padding: '5px 10px',
    },
});

const ToggleDisplayContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    color: '#3E6FDB',
    padding: 6,
    minWidth: 64,
});

export const WorkspaceName = () => {
    const { currentSpaceId } = useUserAndSpaces();
    const { fixedDisplay, toggleSpaceSidebar } = useShowSpaceSidebar();
    const [inRename, setInRename] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');

    const fetchWorkspaceName = useCallback(async () => {
        if (!currentSpaceId) {
            return;
        }

        const name = await services.api.userConfig.getWorkspaceName(
            currentSpaceId
        );
        setWorkspaceName(name);

        const workspaceId = await services.api.userConfig.getWorkspaceId(
            currentSpaceId
        );
        setWorkspaceId(workspaceId);
    }, [currentSpaceId]);

    useEffect(() => {
        fetchWorkspaceName();
    }, [currentSpaceId]);

    useEffect(() => {
        let unobserve: () => void;
        const observe = async () => {
            unobserve = await services.api.userConfig.observe(
                { workspace: currentSpaceId },
                () => {
                    fetchWorkspaceName();
                }
            );
        };
        observe();

        return () => {
            unobserve?.();
        };
    }, [currentSpaceId, fetchWorkspaceName]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                e.preventDefault();
                setInRename(false);
            }
        },
        []
    );
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            services.api.userConfig.setWorkspaceName(
                currentSpaceId,
                e.currentTarget.value
            );
        },
        []
    );

    return (
        <WorkspaceContainer>
            <LeftContainer>
                <LogoContainer>
                    <StyledLogoIcon />
                </LogoContainer>

                {inRename ? (
                    <WorkspaceReNameContainer>
                        <OutlinedInput
                            value={workspaceName}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onMouseLeave={() => setInRename(false)}
                        />
                    </WorkspaceReNameContainer>
                ) : (
                    <WorkspaceNameContainer>
                        <span onClick={() => setInRename(true)}>
                            {workspaceName || workspaceId}
                        </span>
                    </WorkspaceNameContainer>
                )}
            </LeftContainer>
            <ToggleDisplayContainer onClick={toggleSpaceSidebar}>
                <Switch
                    checked={fixedDisplay}
                    checkedLabel="ON"
                    uncheckedLabel="OFF"
                />
            </ToggleDisplayContainer>
        </WorkspaceContainer>
    );
};
