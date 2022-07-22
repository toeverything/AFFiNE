import type { FC } from 'react';
import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { FontSizeStyle } from '@toeverything/components/board-types';
import {
    Popover,
    Tooltip,
    IconButton,
    styled,
} from '@toeverything/components/ui';
import {
    TextFontIcon,
    HeadingOneIcon,
    HeadingTwoIcon,
    HeadingThreeIcon,
} from '@toeverything/components/icons';
import { countBy, maxBy } from '@toeverything/utils';
import { getShapeIds } from './utils';

interface FontSizeConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

const _fontSizes = [
    {
        name: 'Heading 1',
        value: FontSizeStyle.h1,
        icon: <HeadingOneIcon />,
    },
    {
        name: 'Heading 2',
        value: FontSizeStyle.h2,
        icon: <HeadingTwoIcon />,
    },
    {
        name: 'Heading 3',
        value: FontSizeStyle.h3,
        icon: <HeadingThreeIcon />,
    },
    {
        name: 'Text',
        value: FontSizeStyle.body,
        icon: <TextFontIcon />,
    },
];

const _getFontSize = (shapes: TDShape[]): FontSizeStyle => {
    const counted = countBy(shapes, shape => shape.style.fill);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return max[0] as unknown as FontSizeStyle;
};

export const FontSizeConfig: FC<FontSizeConfigProps> = ({ app, shapes }) => {
    const setFontSize = (size: FontSizeStyle) => {
        app.style({ fontSize: size }, getShapeIds(shapes));
    };

    const fontSize = _getFontSize(shapes);
    const selected =
        _fontSizes.find(f => f.value === fontSize) || _fontSizes[3];

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
                                onClick={() => setFontSize(fontSize.value)}
                            >
                                {fontSize.icon}
                                <ListItemTitle>{fontSize.name}</ListItemTitle>
                            </ListItemContainer>
                        );
                    })}
                </div>
            }
        >
            <Tooltip content="Font Size" placement="top-start">
                <IconButton>{selected.icon}</IconButton>
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
