import { memo, forwardRef } from 'react';
import { ItemStyle } from '../component/ItemStyle';
import type { ReactNode, ForwardedRef, CSSProperties } from 'react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Transform } from '../type';

interface Props {
    index?: number;
    dragOverlay?: boolean;
    dragging?: boolean;
    disabled?: boolean;
    fadeIn?: boolean;
    listeners?: SyntheticListenerMap;
    transition?: string;
    transform?: Transform;
    style?: CSSProperties;
    card: ReactNode;
}

const CardItemWrapper = memo(
    forwardRef(
        (
            {
                dragOverlay,
                dragging,
                disabled,
                fadeIn,
                index,
                listeners,
                transition,
                transform,
                card,
                style,
                ...props
            }: Props,
            ref: ForwardedRef<HTMLDivElement>
        ) => {
            const ItemStyleProps = {
                dragOverlay,
                transition,
                fadeIn,
                transform,
                index,
            };
            return (
                <ItemStyle ref={ref} {...ItemStyleProps} style={style}>
                    <div {...listeners} {...props} tabIndex={0}>
                        {card}
                    </div>
                </ItemStyle>
            );
        }
    )
);

export { CardItemWrapper };
