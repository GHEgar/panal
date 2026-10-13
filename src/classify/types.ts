export type ClassificationMethod = 'quantile' | 'jenks' | 'equalInterval' | 'stdDev' | 'manual';

export interface StdDevOptions {
    interval?: 1 | 0.5;
}

export interface ClassifyOptions {
    method: ClassificationMethod;
    classes?: number;
    breaks?: readonly number[];
    stdDev?: StdDevOptions;
}

export interface ValueStats {
    n: number;
    min: number;
    max: number;
    mean: number;
    stdDev: number;
}

export interface Classification {
    method: ClassificationMethod;
    breaks: number[];
    requested: number;
    actual: number;
    stats: ValueStats;
}

export interface LegendEntry {
    classIndex: number;
    min: number;
    max: number;
    count: number;
    closed: 'left' | 'both';
}
