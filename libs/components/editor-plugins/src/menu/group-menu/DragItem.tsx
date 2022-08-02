import { Button } from '@toeverything/components/common';
import { AsyncBlock, Virgo } from '@toeverything/components/editor-core';
import { HandleParentIcon } from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';
import { Point } from '@toeverything/utils';

export const ICON_WIDTH = 16;

type DragItemProps = {
    isShow: boolean;
    groupBlock: AsyncBlock;
    editor: Virgo;
    item: React.MutableRefObject<HTMLDivElement>;
    onPositionChange?: (position: Point) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const DragItem = function ({
    isShow,
    editor,
    groupBlock,
    item,
    ...divProps
}: DragItemProps) {
    return (
        <StyledDiv {...divProps} ref={item}>
            <StyledButton>
                <HandleParentIcon />
            </StyledButton>
        </StyledDiv>
    );
};

const StyledDiv = styled('div')(theme => ({
    padding: '0',
    display: 'inline-flex',
    width: `${ICON_WIDTH}px`,
    height: '20px',
    cursor: 'grab',
    '& svg': {
        fontSize: '20px',
        marginLeft: '-2px',
    },
    ':hover': {
        backgroundColor: '#F5F7F8',
        borderRadius: '3.75px',
    },
}));

const StyledButton = styled('div')({
    padding: '0',
    display: 'inlineFlex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
});
