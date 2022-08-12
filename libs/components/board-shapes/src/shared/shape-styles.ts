import { Utils } from '@tldraw/core';
import {
    AlignStyle,
    ColorStyle,
    DashStyle,
    FontSizeStyle,
    FontStyle,
    ShapeStyles,
    StrokeWidth,
    Theme,
} from '@toeverything/components/board-types';

const canvasLight = '#fafafa';

const canvasDark = '#343d45';

export const commonColors = {
    black: '#3A4C5C',
    white: '#FFFFFF',
};

export const strokes: Record<Theme, Record<ColorStyle, string>> = {
    light: {
        ...commonColors,
        white: '#1d1d1d',
    },
    dark: {
        ...(Object.fromEntries(
            Object.entries(commonColors).map(([k, v]) => [
                k,
                Utils.lerpColor(v, canvasDark, 0.1),
            ])
        ) as Record<ColorStyle, string>),
        white: '#cecece',
        black: '#cecece',
    },
};

export const fills: Record<Theme, Record<ColorStyle, string>> = {
    light: {
        ...(Object.fromEntries(
            Object.entries(commonColors).map(([k, v]) => [
                k,
                Utils.lerpColor(v, canvasLight, 0.82),
            ])
        ) as Record<ColorStyle, string>),
        white: '#fefefe',
    },
    dark: {
        ...(Object.fromEntries(
            Object.entries(commonColors).map(([k, v]) => [
                k,
                Utils.lerpColor(v, canvasDark, 0.82),
            ])
        ) as Record<ColorStyle, string>),
        white: 'rgb(30,33,37)',
        black: '#1e1e1f',
    },
};

const fontFaces = {
    [FontStyle.Script]: '"Caveat Brush"',
    [FontStyle.Sans]: '"Source Sans Pro"',
    [FontStyle.Serif]: '"Crimson Pro"',
    [FontStyle.Mono]: '"Source Code Pro"',
};

const fontSizeModifiers = {
    [FontStyle.Script]: 1,
    [FontStyle.Sans]: 1,
    [FontStyle.Serif]: 1,
    [FontStyle.Mono]: 1,
};

const _lineHeights = {
    [FontSizeStyle.h1]: 40,
    [FontSizeStyle.h2]: 34,
    [FontSizeStyle.h3]: 28,
    [FontSizeStyle.body]: 22,
};

export function getFontSize(
    size: FontSizeStyle,
    fontStyle: FontStyle = FontStyle.Script
): number {
    return size * fontSizeModifiers[fontStyle];
}

function getLineHeight(size: FontSizeStyle): number {
    return _lineHeights[size];
}

export function getFontFace(font: FontStyle = FontStyle.Script): string {
    return fontFaces[font];
}

export function getStickyFontSize(size: FontSizeStyle): number {
    return size;
}

export function getFontStyle(style: ShapeStyles): string {
    const fontSize = getFontSize(style.fontSize, style.font);
    const fontFace = getFontFace(style.font);
    const lineHeight = getLineHeight(style.fontSize);
    const { scale = 1 } = style;

    return `${fontSize * scale}px/${lineHeight}px ${fontFace}`;
}

export function getStickyFontStyle(style: ShapeStyles): string {
    const fontSize = getStickyFontSize(style.fontSize);
    const fontFace = getFontFace(style.font);
    const { scale = 1 } = style;

    return `${fontSize * scale}px/1 ${fontFace}`;
}

export function getShapeStyle(
    style: ShapeStyles,
    isDarkMode?: boolean
): {
    stroke: string;
    fill: string;
    strokeWidth: number;
} {
    const { stroke, strokeWidth, fill, isFilled, dash } = style;

    return {
        stroke: dash === DashStyle.None ? 'none' : stroke,
        fill: isFilled ? fill : 'none',
        strokeWidth,
    };
}

export const defaultStyle: ShapeStyles = {
    stroke: commonColors.black,
    strokeWidth: StrokeWidth.s1,
    fill: 'none',
    fontSize: FontSizeStyle.body,
    isFilled: false,
    dash: DashStyle.Draw,
    scale: 1,
};

export const defaultTextStyle: ShapeStyles = {
    ...defaultStyle,
    font: FontStyle.Script,
    textAlign: AlignStyle.Middle,
};
