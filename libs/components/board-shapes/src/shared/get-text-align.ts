import { AlignStyle } from '@toeverything/components/board-types';

const ALIGN_VALUES = {
    [AlignStyle.Start]: 'left',
    [AlignStyle.Middle]: 'center',
    [AlignStyle.End]: 'right',
    [AlignStyle.Justify]: 'justify',
} as const;

export function getTextAlign(alignStyle: AlignStyle = AlignStyle.Start) {
    return ALIGN_VALUES[alignStyle];
}
