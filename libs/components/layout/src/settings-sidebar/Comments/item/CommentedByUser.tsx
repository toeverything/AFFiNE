import { MuiAvatar as Avatar, styled } from '@toeverything/components/ui';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { getUserDisplayName } from '@toeverything/utils';
import { useMemo } from 'react';

type CommentedByUserProps = {
    username: string;
    updateTime: number;
};

export const CommentedByUser = ({
    username,
    updateTime: updatedTime,
}: CommentedByUserProps) => {
    const updateDatetime = useMemo(() => new Date(updatedTime), [updatedTime]);
    //TODO temp
    const { user } = useUserAndSpaces();

    return (
        <StyledContainerForCommentedByUser>
            <Avatar sx={{ bgcolor: '#9176FF' }} src={user?.photo || ''}>
                {/* {username ? username.slice(0, 2).toLocaleUpperCase() : ''} */}
                {getUserDisplayName(user)}
            </Avatar>
            <StyledCommentUserInfo>
                <div> {getUserDisplayName(user)}</div>
                <StyledCommentTime>
                    {updateDatetime.toTimeString().slice(0, 5)}{' '}
                    {updateDatetime.toDateString().slice(4, 10)}
                </StyledCommentTime>
            </StyledCommentUserInfo>
        </StyledContainerForCommentedByUser>
    );
};

const StyledContainerForCommentedByUser = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        alignItems: 'center',
        marginBottom: 6,
    };
});

const StyledCommentUserInfo = styled('div')(({ theme }) => {
    return {
        marginLeft: theme.affine.spacing.smSpacing,
    };
});

const StyledCommentTime = styled('div')(({ theme }) => {
    return {
        color: theme.affine.palette.icons,
    };
});
