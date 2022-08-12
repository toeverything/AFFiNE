import { DashStyle, StrokeWidth } from '@toeverything/components/board-types';
import {
    BrushIcon,
    DashLineIcon,
    LineNoneIcon,
    SolidLineIcon,
} from '@toeverything/components/icons';
import {
    IconButton,
    Slider,
    styled,
    Tooltip,
} from '@toeverything/components/ui';

export const lineStyles = [
    {
        name: 'None',
        value: DashStyle.None,
        icon: <LineNoneIcon />,
    },
    {
        name: 'Draw',
        value: DashStyle.Draw,
        icon: <BrushIcon />,
    },
    {
        name: 'Solid',
        value: DashStyle.Solid,
        icon: <SolidLineIcon />,
    },
    {
        name: 'Dash',
        value: DashStyle.Dashed,
        icon: <DashLineIcon />,
    },
];

interface LineStyleProps {
    strokeStyle: DashStyle;
    onStrokeStyleChange: (style: DashStyle) => void;

    strokeWidth: StrokeWidth;
    onStrokeWidthChange: (width: StrokeWidth) => void;
}

export const LineStyle = ({
    strokeStyle,
    onStrokeStyleChange,
    strokeWidth,
    onStrokeWidthChange,
}: LineStyleProps) => {
    return (
        <Container>
            <Title>Stroke Style</Title>
            <StrokeStyleContainer>
                {lineStyles.map(lineStyle => {
                    const active = lineStyle.value === strokeStyle;
                    return (
                        <Tooltip key={lineStyle.value} content={lineStyle.name}>
                            <IconButton
                                className={active ? 'hover' : ''}
                                onClick={() => {
                                    onStrokeStyleChange(lineStyle.value);
                                }}
                            >
                                {lineStyle.icon}
                            </IconButton>
                        </Tooltip>
                    );
                })}
            </StrokeStyleContainer>
            <Title>Thickness</Title>
            <SliderContainer>
                <Slider
                    value={strokeWidth}
                    marks
                    min={StrokeWidth.s1}
                    max={StrokeWidth.s6}
                    step={2}
                    onChange={(event, value) => {
                        onStrokeWidthChange(value as StrokeWidth);
                    }}
                />
            </SliderContainer>
        </Container>
    );
};

const Container = styled('div')({
    width: '132px',
    margin: '0 10px',
});

const Title = styled('div')(({ theme }) => ({
    fontSize: '12px',
    lineHeight: '14px',
    color: theme.affine.palette.menu,
    margin: '6px 0',
}));

const StrokeStyleContainer = styled('div')({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
});

const SliderContainer = styled('div')({
    padding: '0 6px',
});
