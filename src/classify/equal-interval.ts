export const equalIntervalBreaks = (min: number, max: number, classes: number): number[] => {
    const breaks: number[] = [];
    const step = (max - min) / classes;
    for (let i = 0; i < classes; i += 1) breaks.push(min + step * i);
    breaks.push(max);
    return breaks;
};
