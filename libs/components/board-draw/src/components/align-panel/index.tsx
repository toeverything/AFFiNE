import { styled, Tooltip } from '@toeverything/components/ui';
import { AlignType } from '../command-panel/AlignOperation';

interface AlignObject {
    name?: string;
    /**
     * color: none means no color
     */
    title: string;
    icon?: JSX.Element;
}
/**
 * ColorValue : none means no color
 */
interface AlignProps {
    alignOptions: AlignObject[];
    selected?: string;
    onSelect?: (alginType: AlignType) => void;
}

export const AlignPanel = ({
    alignOptions,
    selected,
    onSelect,
}: AlignProps) => {
    return (
        <Container>
            {alignOptions.map(alignOption => {
                const option = alignOption.name as AlignType;
                // const selected = color;
                return (
                    <Tooltip key={option} content={alignOption.title}>
                        <SelectableContainer
                            onClick={() => {
                                onSelect?.(option);
                            }}
                        >
                            {alignOption.icon}
                        </SelectableContainer>
                    </Tooltip>
                );
            })}
        </Container>
    );
};

const Container = styled('div')({
    width: '170px',
    display: 'flex',
    flexWrap: 'wrap',
});

const SelectableContainer = styled('div')<{ selected?: boolean }>(
    ({ selected, theme }) => ({
        color: theme.affine.palette.icons,
        borderRadius: '5px',
        overflow: 'hidden',
        margin: '5px',
        width: '24px',
        height: '24px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        '&:hover': {
            backgroundColor: theme.affine.palette.hover,
        },
    })
);
