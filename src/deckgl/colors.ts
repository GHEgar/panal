import type { Color } from '@deck.gl/core';

export type ClassColors = readonly Color[] | ((classIndex: number, classes: number) => Color);

export const TRANSPARENT: Color = [0, 0, 0, 0];

const spread = (colors: readonly Color[], classIndex: number, classes: number): Color => {
    if (colors.length === 0) return TRANSPARENT;
    if (colors.length === classes || classes <= 1) return colors[Math.min(classIndex, colors.length - 1)] as Color;
    const step = Math.round((classIndex * (colors.length - 1)) / (classes - 1));
    return colors[step] as Color;
};

export const palette = (colors: ClassColors, classes: number): Color[] =>
    Array.from({ length: classes }, (_, classIndex) =>
        typeof colors === 'function' ? colors(classIndex, classes) : spread(colors, classIndex, classes));

export const colorKey = (color: Color | undefined): string =>
    color === undefined ? '' : Array.from(color as ArrayLike<number>).join(',');
