import { FC, useState } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import { styled } from '@toeverything/components/ui';
import { useOnSelect } from '@toeverything/components/editor-core';

const DividerBlock = styled('div')<{ isSelected: boolean }>(
    ({ isSelected }) => ({
        margin: 0,
        padding: '10px 0',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: isSelected ? 'blue' : 'transparent',
    })
);

const Line = styled('div')({
    height: '1px',
    backgroundColor: '#e2e8f0',
});

export const DividerView = ({ block, editor }: CreateView) => {
    const [isSelected, setIsSelected] = useState(false);

    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelected(isSelect);
    });

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        editor.selectionManager.setSelectedNodesIds([block.id]);
    };

    return (
        <DividerBlock isSelected={isSelected} onClick={handleClick}>
            <Line />
        </DividerBlock>
    );
};
