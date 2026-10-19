const CENTERS: [number, number, number][] = [
    [-99.13, 19.43, 0.35],
    [-103.35, 20.67, 0.25],
    [-100.31, 25.67, 0.2],
    [-98.2, 19.04, 0.15],
    [-86.85, 21.16, 0.1],
];

const seeded = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
};

const gaussian = (random: () => number): number =>
    Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());

export const syntheticLonLat = (count: number): [number, number, number][] => {
    const random = seeded(7);
    return Array.from({ length: count }, () => {
        const [lon, lat, spread] = CENTERS[Math.floor(random() * CENTERS.length)] as [number, number, number];
        return [lon + gaussian(random) * spread, lat + gaussian(random) * spread, Math.round(Math.exp(random() * 5) * 10) / 10];
    });
};
