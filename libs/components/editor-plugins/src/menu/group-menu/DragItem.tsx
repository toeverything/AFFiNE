import { Button } from '@toeverything/components/common';
import { AsyncBlock, Virgo } from '@toeverything/components/editor-core';
import { HandleParentIcon } from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';
import { Point } from '@toeverything/utils';

export const ICON_WIDTH = 24;

type DragItemProps = {
    isShow: boolean;
    groupBlock: AsyncBlock;
    editor: Virgo;
    onPositionChange?: (position: Point) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const DragItem = function ({
    isShow,
    editor,
    groupBlock,
    ...divProps
}: DragItemProps) {
    return (
        <StyledDiv {...divProps}>
            <StyledButton>
                <HandleParentIcon />
            </StyledButton>
        </StyledDiv>
    );
};

const StyledDiv = styled('div')({
    padding: '0',
    display: 'inlineFlex',
    width: `${ICON_WIDTH}px`,
    height: `${ICON_WIDTH}px`,
    ':hover': {
        backgroundColor: '#edeef0',
        borderRadius: '4px',
    },
});

const StyledButton = styled(Button)({
    padding: '0',
    display: 'inlineFlex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
});
