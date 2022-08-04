import { services } from '@toeverything/datasource/db-service';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { useCallback, useEffect, useState } from 'react';
import { styled } from '@toeverything/components/ui';
import {
    MuiList as List,
    MuiListItem as ListItem,
    MuiListItemText as ListItemText,
    MuiListItemButton as ListItemButton,
} from '@toeverything/components/ui';
import { useNavigate } from 'react-router';
import { formatDistanceToNow } from 'date-fns';

const StyledWrapper = styled('div')({
    paddingLeft: '12px',
    span: {
        textOverflow: 'ellipsis',
        overflow: 'hidden',
    },
    '.item': {
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: '20px',
        whiteSpace: 'nowrap',
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

        const RecentEditPages =
            (await services.api.userConfig.getRecentEditedPages(
                currentSpaceId
            )) || [];

        setRecentPages(RecentEditPages);
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
