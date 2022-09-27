import {
    KanbanBlockRender,
    KanbanCard,
    useEditor,
    useKanban,
} from '@toeverything/components/editor-core';
import { PenIcon } from '@toeverything/components/icons';
import {
    IconButton,
    MuiClickAwayListener,
    styled,
} from '@toeverything/components/ui';
import { useState, type MouseEvent } from 'react';
import { useRefPage } from './RefPage';

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

export const CardItem = ({ block }: { block: KanbanCard['block'] }) => {
    const { addSubItem } = useKanban();
    const { openSubPage } = useRefPage();
    const [editableBlock, setEditableBlock] = useState<string | null>(null);
    const { editor } = useEditor();

    const onAddItem = async () => {
        const newItem = await addSubItem(block);
        setEditableBlock(newItem.id);
    };

    const onClickCard = async () => {
        openSubPage(block.id);
    };

    const onClickPen = (e: MouseEvent<Element>) => {
        e.stopPropagation();
        setEditableBlock(block.id);
        editor.selectionManager.activeNodeByNodeId(block.id);
    };

    return (
        <MuiClickAwayListener onClickAway={() => setEditableBlock(null)}>
            <CardContainer>
                <CardContent>
                    <KanbanBlockRender
                        blockId={block.id}
                        activeBlock={editableBlock}
                    />
                </CardContent>
                {!editableBlock && (
                    <Overlay onClick={onClickCard}>
                        <IconButton backgroundColor="#fff" onClick={onClickPen}>
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
