import type { KanbanCard } from '@toeverything/components/editor-core';
import { RenderBlock, useKanban } from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';

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

export const CardItem = ({
    id,
    block,
}: {
    id: KanbanCard['id'];
    block: KanbanCard['block'];
}) => {
    const { addSubItem } = useKanban();
    const onAddItem = async () => {
        await addSubItem(block);
    };

    return (
        <CardContainer>
            <CardContent>
                <RenderBlock blockId={id} />
            </CardContent>
            <CardActions onClick={onAddItem}>
                <PlusIcon />
                <span>Add item</span>
            </CardActions>
        </CardContainer>
    );
};
