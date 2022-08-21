import { HTMLContainer, Utils } from '@tldraw/core';
import {
    GHOSTED_OPACITY,
    ImageShape,
    TDImageAsset,
    TDMeta,
    TDShapeType,
} from '@toeverything/components/board-types';
import { styled } from '@toeverything/components/ui';
import * as React from 'react';
import {
    defaultStyle,
    getBoundsRectangle,
    transformRectangle,
    transformSingleRectangle,
} from '../shared';
import { TDShapeUtil } from '../TDShapeUtil';

type T = ImageShape;
type E = HTMLDivElement;

export class ImageUtil extends TDShapeUtil<T, E> {
    type = TDShapeType.Image as const;

    override canBind = true;

    override canClone = true;

    override isAspectRatioLocked = true;

    override showCloneHandles = true;

    getShape = (props: Partial<T>): T => {
        return Utils.deepMerge<T>(
            {
                id: 'image',
                type: TDShapeType.Image,
                name: 'Image',
                parentId: 'page',
                childIndex: 1,
                point: [0, 0],
                size: [1, 1],
                rotation: 0,
                style: { ...defaultStyle, isFilled: true },
                assetId: 'assetId',
                workspace: props.workspace,
            },
            props
        );
    };

    Component = TDShapeUtil.Component<T, E, TDMeta>(
        (
            {
                shape,
                asset = { src: '' },
                isBinding,
                isGhost,
                meta,
                events,
                onShapeChange,
            },
            ref
        ) => {
            const { size, style } = shape;

            const rImage = React.useRef<HTMLImageElement>(null);
            const rWrapper = React.useRef<HTMLDivElement>(null);

            React.useLayoutEffect(() => {
                const wrapper = rWrapper.current;
                if (!wrapper) return;
                const [width, height] = size;
                wrapper.style.width = `${width}px`;
                wrapper.style.height = `${height}px`;
            }, [size]);

            return (
                <HTMLContainer ref={ref} {...events}>
                    {isBinding && (
                        <div
                            className="tl-binding-indicator"
                            style={{
                                position: 'absolute',
                                top: `calc(${-this
                                    .bindingDistance}px * var(--tl-zoom))`,
                                left: `calc(${-this
                                    .bindingDistance}px * var(--tl-zoom))`,
                                width: `calc(100% + ${
                                    this.bindingDistance * 2
                                }px * var(--tl-zoom))`,
                                height: `calc(100% + ${
                                    this.bindingDistance * 2
                                }px * var(--tl-zoom))`,
                                backgroundColor: 'var(--tl-selectFill)',
                            }}
                        />
                    )}
                    <Wrapper
                        ref={rWrapper}
                        isDarkMode={meta.isDarkMode} //
                        isFilled={style.isFilled}
                        isGhost={isGhost}
                    >
                        <ImageElement
                            id={shape.id + '_image'}
                            ref={rImage}
                            src={(asset as TDImageAsset).src}
                            alt="tl_image_asset"
                            draggable={false}
                            // onLoad={onImageLoad}
                        />
                    </Wrapper>
                </HTMLContainer>
            );
        }
    );

    Indicator = TDShapeUtil.Indicator<T>(({ shape }) => {
        const {
            size: [width, height],
        } = shape;

        return (
            <rect
                x={0}
                y={0}
                rx={2}
                ry={2}
                width={Math.max(1, width)}
                height={Math.max(1, height)}
            />
        );
    });

    getBounds = (shape: T) => {
        return getBoundsRectangle(shape, this.boundsCache);
    };

    override shouldRender = (prev: T, next: T) => {
        return next.size !== prev.size || next.style !== prev.style;
    };

    override transform = transformRectangle;

    override transformSingle = transformSingleRectangle;

    override getSvgElement = (shape: ImageShape) => {
        const bounds = this.getBounds(shape);
        const elm = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'image'
        );
        elm.setAttribute('width', `${bounds.width}`);
        elm.setAttribute('height', `${bounds.height}`);
        elm.setAttribute('xmlns:xlink', `http://www.w3.org/1999/xlink`);
        return elm;
    };
}

const Wrapper = styled('div')<{
    isDarkMode: boolean;
    isFilled: boolean;
    isGhost: boolean;
}>({
    pointerEvents: 'all',
    position: 'relative',
    fontFamily: 'sans-serif',
    fontSize: '2em',
    height: '100%',
    width: '100%',
    borderRadius: '3px',
    perspective: '800px',
    overflow: 'hidden',
    p: {
        userSelect: 'none',
    },
    img: {
        userSelect: 'none',
    },
    variants: {
        isGhost: {
            false: { opacity: 1 },
            true: { transition: 'opacity .2s', opacity: GHOSTED_OPACITY },
        },
        isFilled: {
            true: {},
            false: {},
        },
        isDarkMode: {
            true: {},
            false: {},
        },
    },
    compoundVariants: [
        {
            isFilled: true,
            isDarkMode: true,
            css: {
                boxShadow:
                    '2px 3px 12px -2px rgba(0,0,0,.3), 1px 1px 4px rgba(0,0,0,.3), 1px 1px 2px rgba(0,0,0,.3)',
            },
        },
        {
            isFilled: true,
            isDarkMode: false,
            css: {
                boxShadow:
                    '2px 3px 12px -2px rgba(0,0,0,.2), 1px 1px 4px rgba(0,0,0,.16),  1px 1px 2px rgba(0,0,0,.16)',
            },
        },
    ],
});

const ImageElement = styled('img')({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    minWidth: '100%',
    pointerEvents: 'none',
    objectFit: 'cover',
    userSelect: 'none',
    borderRadius: 2,
});
