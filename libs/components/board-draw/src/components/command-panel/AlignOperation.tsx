import type { TldrawApp } from '@toeverything/components/board-state';
import { DistributeType, TDShape } from '@toeverything/components/board-types';
import {
    AlignIcon,
    ShapesAlignBottomIcon,
    ShapesAlignHorizontalCenterIcon,
    ShapesAlignLeftIcon,
    ShapesAlignRightIcon,
    ShapesAlignTopIcon,
    ShapesAlignVerticalCenterIcon,
    ShapesDistributeHorizontalIcon,
    ShapesDistributeVerticalIcon,
} from '@toeverything/components/icons';
import { IconButton, Popover, Tooltip } from '@toeverything/components/ui';
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
        name: 'left',
        title: 'Align left',
        icon: <ShapesAlignLeftIcon></ShapesAlignLeftIcon>,
    },
    {
        name: 'centerVertical',
        title: 'Align Center Vertical',
        icon: <ShapesAlignVerticalCenterIcon></ShapesAlignVerticalCenterIcon>,
    },
    {
        name: 'right',
        title: 'Align right',
        icon: <ShapesAlignRightIcon></ShapesAlignRightIcon>,
    },
    {
        name: 'top',
        title: 'Align top',
        icon: <ShapesAlignTopIcon></ShapesAlignTopIcon>,
    },
    {
        name: 'bottom',
        title: 'Align bottom',
        icon: <ShapesAlignBottomIcon></ShapesAlignBottomIcon>,
    },

    {
        name: 'centerHorizontal',
        title: 'Align centerHorizontal',
        icon: (
            <ShapesAlignHorizontalCenterIcon></ShapesAlignHorizontalCenterIcon>
        ),
    },
    {
        name: 'distributeCenterHorizontal',
        title: 'Align distribute center horizontal',
        icon: <ShapesDistributeHorizontalIcon></ShapesDistributeHorizontalIcon>,
    },
    {
        name: 'distributeCenterVertical',
        title: 'Align distribute center horizontal',
        icon: <ShapesDistributeVerticalIcon></ShapesDistributeVerticalIcon>,
    },
];
export const AlignOperation = ({ app, shapes }: BorderColorConfigProps) => {
    const setAlign = (alginType: string) => {
        switch (alginType) {
            case 'distributeCenterHorizontal':
                app.distribute(DistributeType.Horizontal);
                break;
            case 'distributeCenterVertical':
                app.distribute(DistributeType.Vertical);
                break;
            default:
                app.align(alginType as AlignType);
                break;
        }
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
            <Tooltip content="Align" placement="top-start">
                <IconButton>
                    <AlignIcon />
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
