import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import {
    HeadingOneIcon,
    HeadingThreeIcon,
    HeadingTwoIcon,
    LockIcon,
    TextFontIcon,
} from '@toeverything/components/icons';
import {
    IconButton,
    Popover,
    styled,
    Tooltip,
} from '@toeverything/components/ui';

interface FontSizeConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

const _fontSizes = [
    {
        name: 'To Front',
        value: 'tofront',
        icon: <HeadingOneIcon />,
    },
    {
        name: 'Forward',
        value: 'forward',
        icon: <HeadingTwoIcon />,
    },
    {
        name: 'Backward',
        value: 'backward',
        icon: <HeadingThreeIcon />,
    },
    {
        name: 'To Back',
        value: 'toback',
        icon: <TextFontIcon />,
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
                <div>
                    {_fontSizes.map(fontSize => {
                        return (
                            <ListItemContainer
                                key={fontSize.value}
                                onClick={() => moveCoverage(fontSize.value)}
                            >
                                {/* {fontSize.icon} */}
                                <ListItemTitle>{fontSize.name}</ListItemTitle>
                            </ListItemContainer>
                        );
                    })}
                </div>
            }
        >
            <Tooltip content="Font Size" placement="top-start">
                <IconButton>
                    <LockIcon />
                </IconButton>
            </Tooltip>
        </Popover>
    );
};

const ListItemContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    height: '32px',
    padding: '4px 12px',
    color: theme.affine.palette.icons,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    '&:hover': {
        backgroundColor: theme.affine.palette.hover,
    },
}));

const ListItemTitle = styled('span')(({ theme }) => ({
    marginLeft: '12px',
    color: theme.affine.palette.primaryText,
}));
