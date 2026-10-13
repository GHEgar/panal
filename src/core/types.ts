export type LonLat = readonly [number, number];

export interface AggregateInput<M> {
    coordinates: readonly LonLat[];
    member: M;
    value?: number | null | undefined;
}

export type BuiltInReducer = 'count' | 'sum' | 'mean' | 'min' | 'max';

export type CustomReducer<M> = (values: readonly number[], members: readonly M[]) => number;

export type Reducer<M> = BuiltInReducer | CustomReducer<M>;

export interface AggregateOptions<M> {
    resolution: number;
    reducer?: Reducer<M>;
}

export interface Cell<M> {
    h3Index: string;
    count: number;
    valueCount: number;
    sum: number;
    min: number;
    max: number;
    value: number;
    members: M[];
}

export interface ResolutionStep {
    maxZoom: number;
    resolution: number;
}
