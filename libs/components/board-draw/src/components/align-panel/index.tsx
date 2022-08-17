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
    width: '120px',
    display: 'flex',
    flexWrap: 'wrap',
});

const SelectableContainer = styled('div')<{ selected?: boolean }>(
    ({ selected, theme }) => ({
        width: '20px',
        height: '20px',
        // border: `1px solid ${
        //     selected ? theme.affine.palette.primary : 'rgba(0,0,0,0)'
        // }`,
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
