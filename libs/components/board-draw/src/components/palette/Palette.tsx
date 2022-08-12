import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import { styled, Tooltip } from '@toeverything/components/ui';
import { ShapeColorNoneIcon } from '@toeverything/components/icons';

interface ColorObject {
    name?: string;
    /**
     * color: none means no color
     */
    color: string;
}
/**
 * ColorValue : none means no color
 */
type ColorValue = string | ColorObject;
interface PaletteProps {
    colors: ColorValue[];
    selected?: string;
    onSelect?: (color: string) => void;
}

const formatColors = (colors: ColorValue[]): ColorObject[] => {
    return colors.map(color => {
        return typeof color === 'string' ? { color } : color;
    });
};

export const Palette = ({
    colors: propColors,
    selected,
    onSelect,
}: PaletteProps) => {
    const colorObjects = useMemo(() => formatColors(propColors), [propColors]);
    return (
        <Container>
            {colorObjects.map(colorObject => {
                const color = colorObject.color;
                const selectedThisColor = selected === color;
                return (
                    <Tooltip key={color} content={colorObject.name}>
                        <SelectableContainer
                            selected={selectedThisColor}
                            onClick={() => {
                                onSelect?.(color);
                            }}
                        >
                            {color === 'none' ? (
                                <StyledShapeColorNoneIcon />
                            ) : (
                                <Color style={{ backgroundColor: color }} />
                            )}
                        </SelectableContainer>
                    </Tooltip>
                );
            })}
        </Container>
    );
};

const Container = styled('div')({
    width: '120px',
    display: 'flex',
    flexWrap: 'wrap',
});

const SelectableContainer = styled('div')<{ selected?: boolean }>(
    ({ selected, theme }) => ({
        width: '20px',
        height: '20px',
        border: `1px solid ${
            selected ? theme.affine.palette.primary : 'rgba(0,0,0,0)'
        }`,
        borderRadius: '5px',
        overflow: 'hidden',
        margin: '10px',
        padding: '1px',
        cursor: 'pointer',
        boxSizing: 'border-box',
    })
);

const Color = styled('div')({
    width: '16px',
    height: '16px',
    borderRadius: '5px',
    boxShadow: '0px 0px 2px rgba(0, 0, 0, 0.25)',
});

const StyledShapeColorNoneIcon = styled(ShapeColorNoneIcon)(({ theme }) => ({
    position: 'relative',
    left: '-4px',
    top: '-4px',
    color: theme.affine.palette.icons,
}));
