export const classOf = (value: number | null | undefined, breaks: readonly number[]): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || breaks.length < 2) return -1;
    const last = breaks.length - 1;
    if (value < (breaks[0] as number) || value > (breaks[last] as number)) return -1;
    for (let i = 0; i < last - 1; i += 1) {
        if (value < (breaks[i + 1] as number)) return i;
    }
    return last - 1;
};
