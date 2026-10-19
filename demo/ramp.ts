export const RAMP = ['#fff4d6', '#ffd98a', '#f7a94b', '#e2702d', '#b8401f', '#82231a', '#4d130f'];

export const colorFor = (classIndex: number, classes: number): string => {
    const step = classes <= 1 ? 0 : Math.round((classIndex * (RAMP.length - 1)) / (classes - 1));
    return RAMP[step] as string;
};

export const rgbFor = (classIndex: number, classes: number): [number, number, number, number] => {
    const hex = colorFor(classIndex, classes);
    return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)).concat(225) as [number, number, number, number];
};
