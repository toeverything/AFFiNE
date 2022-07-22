import {
    AsyncBlock,
    GroupDirection,
    Virgo,
} from '@toeverything/components/editor-core';
import { Rect } from '@toeverything/utils';
import { styled } from '@toeverything/components/ui';
import { useEffect, useState } from 'react';

type LineProps = {
    groupBlock: AsyncBlock | null;
    editor: Virgo;
    direction: GroupDirection;
};

const LINE_WEIGHT = 2;

export const Line = function ({ direction, editor, groupBlock }: LineProps) {
    const [isShow, setIsShow] = useState<boolean>(false);
    const [rect, setRect] = useState<Rect | null>(null);
    useEffect(() => {
        if (groupBlock && groupBlock.dom && editor.container) {
            setRect(
                Rect.fromLWTH(
                    groupBlock.dom.offsetLeft - editor.container.offsetLeft,
                    groupBlock.dom.offsetWidth,
                    groupBlock.dom.offsetTop - editor.container.offsetTop,
                    groupBlock.dom.offsetHeight
                )
            );
            setIsShow(true);
        } else {
            setIsShow(false);
        }
    }, [groupBlock, editor.container]);

    const computeLineStyle = (): React.CSSProperties => {
        if (!rect) {
            return {};
        }
        return direction === GroupDirection.down
            ? {
                  top: rect.bottom + LINE_WEIGHT,
                  left: rect.left,
                  width: rect.width,
              }
            : {
                  top: rect.top - LINE_WEIGHT,
                  left: rect.left,
                  width: rect.width,
              };
    };

    return isShow ? <LineDiv style={computeLineStyle()} /> : null;
};

// TODO: use absolute position
const LineDiv = styled('div')({
    zIndex: 2,
    position: 'absolute',
    background: '#502EC4',
    height: LINE_WEIGHT,
});
