import { TldrawApp } from '@toeverything/components/board-state';
import { TDShapeType, TDToolType } from '@toeverything/components/board-types';
import {
    HighlighterDuotoneIcon,
    LaserPenDuotoneIcon,
    PencilDuotoneIcon,
} from '@toeverything/components/icons';
import {
    IconButton,
    MuiDivider as Divider,
    Popover,
    styled,
    Tooltip,
} from '@toeverything/components/ui';
import { useState, type CSSProperties, type ReactElement } from 'react';
import { Palette } from '../../palette';
import { Pen } from './Pen';

type PenType = TDShapeType.Pencil | TDShapeType.Highlight | TDShapeType.Laser;

interface PencilConfig {
    key: PenType;
    title: string;
    icon: ReactElement<any, any>;
    colors: string[];
    getColorVars: (
        primaryColor: string,
        secondaryColor: string
    ) => { '--color-0': string; '--color-1': string };
}

const PENCIL_CONFIGS: PencilConfig[] = [
    {
        key: TDShapeType.Pencil,
        title: 'Pencil',
        icon: <PencilDuotoneIcon />,
        colors: [
            '#F1675E',
            '#FF7F22',
            '#FFCB45',
            '#40DF9B',
            '#13D9E3',
            '#3E6FDB',
            '#7352F1',
            '#3A4C5C',
            '#FFFFFF',
        ],
        getColorVars: (primaryColor: string, secondaryColor: string) => {
            return {
                '--color-0': secondaryColor,
                '--color-1': primaryColor,
            };
        },
    },
    {
        key: TDShapeType.Highlight,
        title: 'Highlighter',
        icon: <HighlighterDuotoneIcon />,
        colors: [
            'rgba(255, 133, 137, 0.5)',
            'rgba(255, 159, 101, 0.5)',
            'rgba(255, 251, 69, 0.5)',
            'rgba(64, 255, 138, 0.5)',
            'rgba(26, 252, 255, 0.5)',
            'rgba(198, 156, 255, 0.5)',
            'rgba(255, 143, 224, 0.5)',
            'rgba(152, 172, 189, 0.5)',
            'rgba(216, 226, 248, 0.5)',
        ],
        getColorVars: (primaryColor: string, secondaryColor: string) => {
            return {
                '--color-0': secondaryColor,
                '--color-1': primaryColor,
            };
        },
    },
    {
        key: TDShapeType.Laser,
        title: 'Laser',
        icon: <LaserPenDuotoneIcon />,
        colors: [
            '#DB3E3E',
            '#FF5F1A',
            '#FFA800',
            '#13D9E3',
            '#00ADCE',
            '#3E6FDB',
            '#2F5DC2',
            '#153C7A',
        ],
        getColorVars: (primaryColor: string, secondaryColor: string) => {
            return {
                '--color-0': primaryColor,
                '--color-1': secondaryColor,
            };
        },
    },
];

const PENCIL_CONFIGS_MAP = PENCIL_CONFIGS.reduce<
    Record<TDToolType, PencilConfig>
>((acc, cur) => {
    acc[cur.key] = cur;
    return acc;
}, {} as Record<TDToolType, PencilConfig>);

export const PenTools = ({ app }: { app: TldrawApp }) => {
    const appCurrentTool = app.useStore(state => state.appState.activeTool);
    const [visible, setVisible] = useState(false);
    const chosenPen =
        PENCIL_CONFIGS.find(config => config.key === appCurrentTool) ||
        PENCIL_CONFIGS[0];
    const chosenPenKey = chosenPen.key;
    const currentColor = app.useStore(
        state => state.appState.currentStyle.stroke
    );
    const chosenColor = chosenPen.colors.includes(currentColor)
        ? currentColor
        : chosenPen.colors[0];
    const isActiveTool = appCurrentTool === chosenPenKey;

    const setPen = (pen: PenType) => {
        app.selectTool(pen);
        const penConfig = PENCIL_CONFIGS_MAP[pen];
        if (!penConfig.colors.includes(currentColor)) {
            setPenColor(penConfig.colors[0]);
        }
    };

    const setPenColor = (color: string) => {
        app.style({
            stroke: color,
        });
    };

    return (
        <Popover
            visible={visible}
            placement="right-start"
            onClick={() => setVisible(prev => !prev)}
            onClickAway={() => setVisible(false)}
            content={
                <Container>
                    <PensContainer>
                        {PENCIL_CONFIGS.map(
                            ({ title, icon, key, getColorVars }) => {
                                const active = chosenPenKey === key;
                                const color_vars = getColorVars(
                                    active ? '#3A4C5C' : '#98ACBD',
                                    active ? chosenColor : '#D8E2F8'
                                );
                                return (
                                    <Pen
                                        key={key}
                                        icon={icon}
                                        name={title}
                                        primaryColor={color_vars['--color-0']}
                                        secondaryColor={color_vars['--color-1']}
                                        onClick={() => {
                                            setVisible(false);
                                            setPen(key);
                                        }}
                                    />
                                );
                            }
                        )}
                    </PensContainer>
                    <Divider sx={{ marginBottom: '8px' }} />
                    <Palette
                        selected={chosenColor}
                        colors={PENCIL_CONFIGS_MAP[chosenPenKey].colors}
                        onSelect={color => {
                            setVisible(false);
                            setPenColor(color);
                        }}
                    />
                    <div />
                </Container>
            }
        >
            <Tooltip content="Pencil" placement="right">
                <IconButton
                    aria-label="Pencil"
                    onClick={() => {
                        setPen(chosenPen.key);
                    }}
                    style={{
                        ...(chosenPen.getColorVars(
                            isActiveTool ? '#3A4C5C' : '#98ACBD',
                            isActiveTool ? chosenColor : '#D8E2F8'
                        ) as CSSProperties),
                    }}
                >
                    {chosenPen.icon}
                </IconButton>
            </Tooltip>
        </Popover>
    );
};

const Container = styled('div')({
    padding: 0,
});

const PensContainer = styled('div')({
    display: 'flex',
    justifyContent: 'space-between',
});
