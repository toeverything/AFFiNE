import { PinIcon } from '@toeverything/components/icons';
import { Input, styled } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import {
    useShowSpaceSidebar,
    useUserAndSpaces,
} from '@toeverything/datasource/state';
import {
    ChangeEvent,
    KeyboardEvent,
    useCallback,
    useEffect,
    useState,
} from 'react';
import { Logo } from './components/logo/Logo';

const WorkspaceContainer = styled('div')({
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '12px',
    color: '#566B7D',
});
const LeftContainer = styled('div')({
    flex: 'auto',
    display: 'flex',
    height: '52px',
    alignItems: 'center',
    margin: '0 12px',
});

const LogoContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    minWidth: 24,
});

const StyledPin = styled('div')({
    display: 'flex',
    justifyContent: 'end',
    alignItems: 'center',
});

const StyledWorkspace = styled('div')({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginLeft: '12px',
    paddingLeft: '12px',
});

const StyledWorkspaceDesc = styled('div')({
    fontSize: '12px',
    color: '#98ACBD',
    height: '18px',

    display: 'flex',
    alignItems: 'center',
});

const WorkspaceNameContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    flex: 'auto',
    width: '165px',
    height: '34px',
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
    height: '34px',
    display: 'flex',
    alignItems: 'center',

    input: {
        padding: '5px 10px',
    },
});

export const WorkspaceName = () => {
    const { currentSpaceId } = useUserAndSpaces();
    const { fixedDisplay, toggleSpaceSidebar } = useShowSpaceSidebar();
    const [inRename, setInRename] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');

    const fetchWorkspaceName = useCallback(async () => {
        if (!currentSpaceId) {
            return;
        }
        const name = await services.api.userConfig.getWorkspaceName(
            currentSpaceId
        );

        setWorkspaceName(name);
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

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            e.preventDefault();
            setInRename(false);
        }
    }, []);
    const handleChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const name = e.target.value;

            await setWorkspaceName(name);
            await services.api.userConfig.setWorkspaceName(
                currentSpaceId,
                name
            );
        },
        [currentSpaceId]
    );

    return (
        <WorkspaceContainer>
            <StyledPin>
                <PinIcon
                    style={{
                        width: '20px',
                        height: '20px',
                        color: fixedDisplay ? '#3E6FDB' : '',
                        cursor: 'pointer',
                    }}
                    onClick={toggleSpaceSidebar}
                />
            </StyledPin>
            <LeftContainer>
                <LogoContainer>
                    <Logo color={undefined} style={undefined} />
                </LogoContainer>

                <StyledWorkspace>
                    {inRename ? (
                        <WorkspaceReNameContainer>
                            <Input
                                autoFocus
                                style={{ width: '140px', height: '28px' }}
                                value={workspaceName}
                                onChange={handleChange}
                                onKeyDown={handleKeyDown}
                                onMouseLeave={() => setInRename(false)}
                            />
                        </WorkspaceReNameContainer>
                    ) : (
                        <WorkspaceNameContainer>
                            <span onClick={() => setInRename(true)}>
                                {workspaceName || currentSpaceId}
                            </span>
                        </WorkspaceNameContainer>
                    )}

                    <StyledWorkspaceDesc>
                        To shape, Not to Adapt.
                    </StyledWorkspaceDesc>
                </StyledWorkspace>
            </LeftContainer>
        </WorkspaceContainer>
    );
};
