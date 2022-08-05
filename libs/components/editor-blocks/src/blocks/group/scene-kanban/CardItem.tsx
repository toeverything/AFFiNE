import type { KanbanCard } from '@toeverything/components/editor-core';
import {
    RenderBlock,
    useKanban,
    useRefPage,
} from '@toeverything/components/editor-core';
import { PenIcon } from '@toeverything/components/icons';
import {
    IconButton,
    MuiClickAwayListener,
    styled,
} from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';
import { useState } from 'react';

const CardContent = styled('div')({
    margin: '20px',
});

const CardActions = styled('div')({
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '29px',
    borderRadius: '0px 0px 5px 5px',
    padding: '6px 0 6px 19px',
    fontSize: '12px',
    fontWeight: '300',
    color: '#98ACBD',
    transition: 'all ease-in 0.2s',
    zIndex: 1,

    ':hover': {
        background: '#F5F7F8',
    },
});

const PlusIcon = styled('div')({
    marginRight: '9px',
    fontWeight: '500',
    lineHeight: 0,
    '::before': {
        content: '"+"',
    },
});

const CardContainer = styled('div')({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
    border: '1px solid #E2E7ED',
    borderRadius: '5px',
    overflow: 'hidden',

    [CardActions.toString()]: {
        opacity: '0',
    },
    ':hover': {
        [CardActions.toString()]: {
            opacity: '1',
        },
    },
});

const Overlay = styled('div')({
    position: 'absolute',
    width: '100%',
    height: '100%',
    background: 'transparent',

    '& > *': {
        visibility: 'hidden',
        position: 'absolute',
        right: '24px',
        top: '16px',
    },
    '&:hover > *': {
        visibility: 'visible',
    },
});

export const CardItem = ({
    id,
    block,
}: {
    id: KanbanCard['id'];
    block: KanbanCard['block'];
}) => {
    const { addSubItem } = useKanban();
    const { openSubPage } = useRefPage();
    const [editable, setEditable] = useState(false);
    const showKanbanRefPageFlag = useFlag('ShowKanbanRefPage', false);

    const onAddItem = async () => {
        setEditable(true);
        await addSubItem(block);
    };

    const onClickCard = async () => {
        showKanbanRefPageFlag && openSubPage(id);
    };

    return (
        <MuiClickAwayListener onClickAway={() => setEditable(false)}>
            <CardContainer>
                <CardContent>
                    <RenderBlock blockId={id} />
                </CardContent>
                {!editable && (
                    <Overlay onClick={onClickCard}>
                        <IconButton
                            onClick={e => {
                                e.stopPropagation();
                                setEditable(true);
                            }}
                        >
                            <PenIcon />
                        </IconButton>
                    </Overlay>
                )}
                <CardActions onClick={onAddItem}>
                    <PlusIcon />
                    <span>Add a sub-block</span>
                </CardActions>
            </CardContainer>
        </MuiClickAwayListener>
    );
};
