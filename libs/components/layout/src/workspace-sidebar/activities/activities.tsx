import {
    MuiList as List,
    MuiListItem as ListItem,
    MuiListItemText as ListItemText,
    styled,
} from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { DotIcon } from '../dot-icon';

const StyledWrapper = styled('div')({
    width: '100%',
    span: {
        textOverflow: 'ellipsis',
        overflow: 'hidden',
    },
    '.item': {
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        whiteSpace: 'nowrap',
        paddingLeft: '12px',
        '&:hover': {
            background: '#f5f7f8',
            borderRadius: '5px',
        },
    },
    '.itemButton': {
        padding: 0,
        height: 32,
    },
    '.itemLeft': {
        color: '#4c6275',
        marginRight: '20px',
        cursor: 'pointer',
        span: {
            fontSize: 14,
        },
    },
    '.itemRight': {
        color: '#B6C7D3',
        flex: 'none',
        span: {
            fontSize: 12,
        },
    },
});

const StyledItemContent = styled('div')({
    width: '100%',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
});

export const Activities = () => {
    const navigate = useNavigate();
    const { user, currentSpaceId } = useUserAndSpaces();
    const [recentPages, setRecentPages] = useState([]);
    const userId = user?.id;

    /* show recently edit documents */
    const getRecentEditPages = useCallback(async () => {
        if (!userId || !currentSpaceId) {
            return;
        }

        const recentEditPages =
            (await services.api.userConfig.getRecentEditedPages(
                currentSpaceId
            )) || [];

        setRecentPages(recentEditPages);
    }, [currentSpaceId, userId]);

    useEffect(() => {
        (async () => {
            await getRecentEditPages();
        })();
    }, [getRecentEditPages]);

    useEffect(() => {
        let unobserve: () => void;
        const observe = async () => {
            unobserve = await services.api.userConfig.observe(
                { workspace: currentSpaceId },
                getRecentEditPages
            );
        };
        observe();

        return () => {
            unobserve?.();
        };
    }, [currentSpaceId, getRecentEditPages]);

    return (
        <StyledWrapper>
            <List style={{ padding: '0px' }}>
                {recentPages.map(item => {
                    const { id, title, updated } = item;
                    return (
                        <ListItem className="item" key={id}>
                            <DotIcon />

                            <StyledItemContent
                                onClick={() => {
                                    navigate(`/${currentSpaceId}/${id}`);
                                }}
                            >
                                <ListItemText
                                    className="itemLeft"
                                    primary={title}
                                />
                                <ListItemText
                                    className="itemRight"
                                    primary={formatDistanceToNow(updated, {
                                        includeSeconds: true,
                                    })}
                                />
                            </StyledItemContent>
                        </ListItem>
                    );
                })}
            </List>
        </StyledWrapper>
    );
};
