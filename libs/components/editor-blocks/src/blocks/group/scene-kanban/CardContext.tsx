import { useCallback } from 'react';
import { CardItem } from './CardItem';
import { styled } from '@toeverything/components/ui';
import { useKanban } from '@toeverything/components/editor-core';
import { CardItemPanelWrapper } from './dndable/wrapper/CardItemPanelWrapper';
import type {
    KanbanCard,
    KanbanGroup,
} from '@toeverything/components/editor-core';

const AddCardWrapper = styled('div')({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: '5px',
    width: '100%',
    color: '#B7C5D1',
    border: '1px solid #F5F7F8',
    fontSize: '12px',
    padding: '3px 15px',
    cursor: 'pointer',
});

const AddCard = ({ group }: { group: KanbanGroup }) => {
    const { addCard } = useKanban();
    const handleClick = useCallback(async () => {
        await addCard(group);
    }, [addCard, group]);
    return <AddCardWrapper onClick={handleClick}>+</AddCardWrapper>;
};

interface Props {
    group: KanbanGroup;
    items: KanbanCard[];
    activeId?: string;
}

export const CardContext = (props: Props) => {
    const { items, group, activeId } = props;
    return (
        <>
            {items.map(item => {
                const { id, block } = item;

                return (
                    <StyledCardContainer key={id}>
                        <CardItemPanelWrapper
                            item={item}
                            active={activeId === id}
                        >
                            <CardItem id={id} block={block} />
                        </CardItemPanelWrapper>
                    </StyledCardContainer>
                );
            })}
            <AddCard group={group} />
        </>
    );
};

const StyledCardContainer = styled('div')`
    cursor: pointer;
    &:focus-within {
        z-index: 1;
    }
`;
