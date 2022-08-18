import type { TldrawApp } from '@toeverything/components/board-state';
import { DistributeType, TDShape } from '@toeverything/components/board-types';
import {
    AlignHorizontalCenterIcon,
    AlignIcon,
    AlignToBottomIcon,
    AlignToLeftIcon,
    AlignToRightIcon,
    AlignToTopIcon,
    AlignVerticalCenterIcon,
    DistributeHorizontalIcon,
    DistributeVerticalIcon,
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
        icon: <AlignToLeftIcon></AlignToLeftIcon>,
    },
    {
        name: 'centerVertical',
        title: 'Align Center Vertical',
        icon: <AlignVerticalCenterIcon></AlignVerticalCenterIcon>,
    },
    {
        name: 'right',
        title: 'Align right',
        icon: <AlignToRightIcon></AlignToRightIcon>,
    },
    {
        name: 'top',
        title: 'Align top',
        icon: <AlignToTopIcon></AlignToTopIcon>,
    },
    {
        name: 'bottom',
        title: 'Align bottom',
        icon: <AlignToBottomIcon></AlignToBottomIcon>,
    },

    {
        name: 'centerHorizontal',
        title: 'Align centerHorizontal',
        icon: <AlignHorizontalCenterIcon></AlignHorizontalCenterIcon>,
    },
    {
        name: 'distributeCenterHorizontal',
        title: 'Align distribute center horizontal',
        icon: <DistributeHorizontalIcon></DistributeHorizontalIcon>,
    },
    {
        name: 'distributeCenterVertical',
        title: 'Align distribute center horizontal',
        icon: <DistributeVerticalIcon></DistributeVerticalIcon>,
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
