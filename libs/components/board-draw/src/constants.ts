import type { Easing } from '@toeverything/components/board-types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const LETTER_SPACING = '-0.03em';
export const LINE_HEIGHT = 1;
export const GRID_SIZE = 8;
export const SVG_EXPORT_PADDING = 16;
export const BINDING_DISTANCE = 16;
export const CLONING_DISTANCE = 32;
export const FIT_TO_SCREEN_PADDING = 128;
export const SNAP_DISTANCE = 5;
export const EMPTY_ARRAY = [] as any[];
export const SLOW_SPEED = 10;
export const VERY_SLOW_SPEED = 2.5;
export const GHOSTED_OPACITY = 0.3;
export const DEAD_ZONE = 3;
export const LABEL_POINT = [0.5, 0.5];

export const PI2 = Math.PI * 2;

export const EASINGS: Record<Easing, (t: number) => number> = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    easeInCubic: t => t * t * t,
    easeOutCubic: t => --t * t * t + 1,
    easeInOutCubic: t =>
        t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuart: t => t * t * t * t,
    easeOutQuart: t => 1 - --t * t * t * t,
    easeInOutQuart: t =>
        t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
    easeInQuint: t => t * t * t * t * t,
    easeOutQuint: t => 1 + --t * t * t * t * t,
    easeInOutQuint: t =>
        t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,
    easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: t => Math.sin((t * Math.PI) / 2),
    easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    easeInExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: t =>
        t <= 0
            ? 0
            : t >= 1
            ? 1
            : t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2,
};

export const EASING_STRINGS: Record<Easing, string> = {
    linear: `(t) => t`,
    easeInQuad: `(t) => t * t`,
    easeOutQuad: `(t) => t * (2 - t)`,
    easeInOutQuad: `(t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)`,
    easeInCubic: `(t) => t * t * t`,
    easeOutCubic: `(t) => --t * t * t + 1`,
    easeInOutCubic: `(t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1`,
    easeInQuart: `(t) => t * t * t * t`,
    easeOutQuart: `(t) => 1 - --t * t * t * t`,
    easeInOutQuart: `(t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t`,
    easeInQuint: `(t) => t * t * t * t * t`,
    easeOutQuint: `(t) => 1 + --t * t * t * t * t`,
    easeInOutQuint: `(t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t`,
    easeInSine: `(t) => 1 - Math.cos((t * Math.PI) / 2)`,
    easeOutSine: `(t) => Math.sin((t * Math.PI) / 2)`,
    easeInOutSine: `(t) => -(Math.cos(Math.PI * t) - 1) / 2`,
    easeInExpo: `(t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10))`,
    easeOutExpo: `(t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))`,
    easeInOutExpo: `(t) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2`,
};

export const USER_COLORS = [
    '#EC5E41',
    '#F2555A',
    '#F04F88',
    '#E34BA9',
    '#BD54C6',
    '#9D5BD2',
    '#7B66DC',
    '#02B1CC',
    '#11B3A3',
    '#39B178',
    '#55B467',
    '#FF802B',
];

export const isSafari =
    typeof Window === 'undefined'
        ? false
        : /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export const IMAGE_EXTENSIONS = ['.png', '.svg', '.jpg', '.jpeg', '.gif'];

export const VIDEO_EXTENSIONS = isSafari ? [] : ['.mp4', '.webm'];
