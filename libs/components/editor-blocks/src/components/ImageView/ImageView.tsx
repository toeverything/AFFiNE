import { AsyncBlock } from '@toeverything/framework/virgo';
import { FC } from 'react';
import { ResizableBox } from 'react-resizable';
import { styled } from '@toeverything/components/ui';

export interface Props {
    block: AsyncBlock;
    link: string;
    viewStyle: {
        width: number;
        maxWidth: number;
        minWidth: number;
        ratio: number;
    };
    isSelected: boolean;
    resize?: boolean;
}
const ImageContainer = styled('div')<{ isSelected: boolean }>(
    ({ theme, isSelected }) => {
        return {
            position: 'relative',
            fontSize: 0,
            width: '100%',
            height: '100%',
            border: `2px solid ${
                isSelected ? theme.affine.palette.primary : '#fff'
            }`,
            img: {
                width: '100%',
                maxWidth: '100%',
                // height: '100%',
            },
        };
    }
);
export const Image: FC<Props> = props => {
    const { link, viewStyle, isSelected, block } = props;
    const on_resize_end = (e: any, data: any) => {
        block.setProperty('image_style', data.size);
    };
    return (
        <div
            onMouseDown={e => {
                e.preventDefault();
            }}
        >
            <ResizableBox
                className="box"
                width={viewStyle.width}
                height={viewStyle.width / viewStyle.ratio}
                minConstraints={[
                    viewStyle.minWidth,
                    viewStyle.minWidth / viewStyle.ratio,
                ]}
                lockAspectRatio={true}
                resizeHandles={isSelected ? ['sw', 'nw', 'se', 'ne'] : []}
                onResizeStop={on_resize_end}
            >
                <ImageContainer isSelected={isSelected}>
                    <img src={link} alt={link} />
                </ImageContainer>
            </ResizableBox>
        </div>
    );
};
