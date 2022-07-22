import { styled } from '@toeverything/components/ui';
import type { Transform } from '../type';

interface ItemStyleProps {
    dragOverlay?: boolean;
    transition?: string;
    fadeIn?: boolean;
    transform?: Transform;
    index?: number;
}

/* dnd-kit has built-in animation function, rewrite the form of classname to css-in-js here, please do not use it in the business layer */ const ItemStyle =
    styled('div')((props: ItemStyleProps) => {
        const { dragOverlay, transition, fadeIn, transform, index } = props;

        const translateX = transform
            ? `${Math.round(transform.x)}px`
            : undefined;
        const translateY = transform
            ? `${Math.round(transform.y)}px`
            : undefined;
        const scaleAroundX = transform?.scaleX
            ? `${transform.scaleX}`
            : undefined;
        const scaleAroundY = transform?.scaleY
            ? `${transform.scaleY}`
            : undefined;

        return {
            transform: `translate3d(${translateX || 0}, ${
                translateY || 0
            }, 0) scaleX(${scaleAroundX || 1}) scaleY(${scaleAroundY || 1})`,
            transformOrigin: '0 0',
            touchAction: 'manipulation',
            transition: `${[transition].filter(Boolean).join(', ')}`,
            '--translate-x': translateX,
            '--translate-y': translateY,
            '--scale-x': scaleAroundX,
            '--scale-y': scaleAroundY,
            '--index': index,
            ...(dragOverlay && {
                '--scale': 1.05,
                'z-index': 999,
            }),
            ...(fadeIn && {
                animation: 'fadeIn 500ms ease',
            }),
        };
    });

export { ItemStyle };
