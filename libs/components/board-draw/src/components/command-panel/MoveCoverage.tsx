import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import {
    BringForwardIcon,
    BringToFrontIcon,
    LayersIcon,
    SendBackwardIcon,
    SendToBackIcon,
} from '@toeverything/components/icons';
import { IconButton, Popover, Tooltip } from '@toeverything/components/ui';
import { AlignPanel } from '../align-panel';

interface FontSizeConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

const AlignPanelArr = [
    {
        title: 'To Front',
        name: 'tofront',
        icon: <BringToFrontIcon />,
    },
    {
        title: 'Forward',
        name: 'forward',
        icon: <BringForwardIcon />,
    },
    {
        title: 'Backward',
        name: 'backward',
        icon: <SendBackwardIcon />,
    },
    {
        title: 'To Back',
        name: 'toback',
        icon: <SendToBackIcon />,
    },
];

export const MoveCoverageConfig = ({ app, shapes }: FontSizeConfigProps) => {
    const moveCoverage = (type: string) => {
        switch (type) {
            case 'toback':
                app.moveToBack();
                break;
            case 'backward':
                app.moveBackward();
                break;
            case 'forward':
                app.moveForward();
                break;
            case 'tofront':
                app.moveToFront();
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
                    onSelect={moveCoverage}
                ></AlignPanel>
            }
        >
            <Tooltip content="Layers" placement="top-start">
                <IconButton>
                    <LayersIcon />
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
