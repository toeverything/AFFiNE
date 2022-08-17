import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { ShapeColorNoneIcon } from '@toeverything/components/icons';
import {
    IconButton,
    Popover,
    Tooltip,
    useTheme,
} from '@toeverything/components/ui';
import { AlignPanel } from '../align-panel';

interface BorderColorConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export enum AlignType {
    Top = 'top',
    CenterVertical = 'centerVertical',
    Bottom = 'bottom',
    Left = 'left',
    CenterHorizontal = 'centerHorizontal',
    Right = 'right',
}

let AlignPanelArr = [
    {
        name: 'top',
        title: 'Align top',
    },
    {
        name: 'centerVertical',
        title: 'Align Center Vertical',
    },
    {
        name: 'bottom',
        title: 'Align bottom',
    },
    {
        name: 'left',
        title: 'Align left',
    },
    {
        name: 'centerHorizontal',
        title: 'Align centerHorizontal',
    },
];
export const AlignOperation = ({ app, shapes }: BorderColorConfigProps) => {
    const theme = useTheme();
    const setAlign = (alginType: AlignType) => {
        app.align(alginType);
    };

    return (
        <Popover
            trigger="hover"
            placement="bottom-start"
            content={
                <AlignPanel
                    alignOptions={AlignPanelArr}
                    onSelect={setAlign}
                ></AlignPanel>
            }
        >
            <Tooltip content="Fill Color" placement="top-start">
                <IconButton>
                    <ShapeColorNoneIcon />
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
