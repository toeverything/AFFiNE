import { useCallback, type MouseEvent } from 'react';
import {
    styled,
    Tooltip,
    IconButton,
    type SvgIconProps,
} from '@toeverything/components/ui';
import {
    EmbedIcon,
    ImageIcon,
    ReactionIcon,
    CollaboratorIcon,
} from '@toeverything/components/icons';
import { WithEditorSelectionType } from '../menu/inline-menu/types';
import { getEditorMarkForCommentId } from '@toeverything/components/common';

const getCommentQuickActionsData = () => {
    return [
        {
            id: 'attachment',
            icon: EmbedIcon,
            tooltip: 'Add attachment file',
        },
        {
            id: 'mention',
            icon: CollaboratorIcon,
            tooltip: 'Mention someone',
        },
        {
            id: 'image',
            icon: ImageIcon,
            tooltip: 'Add image',
        },
        {
            id: 'emoji',
            icon: ReactionIcon,
            tooltip: 'Add emoji',
        },
    ];
};

type AddCommentActionsProps = {
    createComment: () => Promise<{ commentsId: string } | undefined>;
    handleSubmitCurrentComment: () => Promise<void>;
} & WithEditorSelectionType;

export const AddCommentActions = ({
    createComment,
    handleSubmitCurrentComment,
    editor,
    selectionInfo,
    setShow,
}: AddCommentActionsProps) => {
    return (
        <StyledContainerForAddCommentActions>
            <StyledContainerForActionsButtons>
                {getCommentQuickActionsData().map(action => {
                    const { id, icon, tooltip } = action;
                    return (
                        <IconButtonWithTooltip
                            icon={icon}
                            tooltip={tooltip}
                            key={id}
                        />
                    );
                })}
                <IconButton />
            </StyledContainerForActionsButtons>
            <StyledContainerForActionsButtons>
                <StyledCancelButton
                    onClick={() => {
                        setShow(false);
                    }}
                >
                    Cancel
                </StyledCancelButton>
                <StyledSendButton onClick={handleSubmitCurrentComment}>
                    Send
                </StyledSendButton>
            </StyledContainerForActionsButtons>
        </StyledContainerForAddCommentActions>
    );
};

type IconButtonWithTooltipProps = {
    icon: (prop: SvgIconProps) => JSX.Element;
    tooltip?: string;
};

const IconButtonWithTooltip = ({
    icon: Icon,
    tooltip,
}: IconButtonWithTooltipProps) => {
    return (
        <Tooltip content={tooltip} placement="bottom" trigger="hover">
            <IconButton aria-label={tooltip}>
                <Icon />
            </IconButton>
        </Tooltip>
    );
};

const StyledContainerForAddCommentActions = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    };
});

const StyledContainerForActionsButtons = styled('div')(({ theme }) => {
    return {
        display: 'flex',
    };
});

const StyledActionBaseButton = styled('button')(({ theme }) => {
    return {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: 50,
        height: 20,
        borderRadius: 5,
        fontSize: 12,
    };
});

const StyledCancelButton = styled(StyledActionBaseButton)(({ theme }) => {
    return {
        border: `1px solid ${theme.affine.palette.tagHover}`,
        marginRight: theme.affine.spacing.smSpacing,
    };
});

const StyledSendButton = styled(StyledActionBaseButton)(({ theme }) => {
    return {
        border: `none`,
        backgroundColor: theme.affine.palette.primary,
        color: theme.affine.palette.white,
    };
});
