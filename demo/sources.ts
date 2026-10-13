import { aggregate } from '@ghegar/panal';
import type { HexbinSource, CellSource } from '@ghegar/panal/ol';
import { fromCellProvider, fromVectorSource, fromWfs, toInputs } from '@ghegar/panal/ol';
import VectorSource from 'ol/source/Vector.js';
import { syntheticPoints } from './data.js';

export type SourceKind = 'synthetic' | 'wfs' | 'server';

export interface DemoSource {
    source: HexbinSource | CellSource;
    center: [number, number];
    zoom: number;
    value: string;
    describe: () => string;
}

const points = syntheticPoints(20_000);
const MEXICO: [number, number] = [-100.5, 21.5];

const synthetic = (): DemoSource => ({
    source: fromVectorSource(new VectorSource({ features: points })),
    center: MEXICO,
    zoom: 5.5,
    value: 'magnitude',
    describe: () => '20 000 puntos',
});

const wfs = (): DemoSource => {
    const source = fromWfs({
        url: 'https://gs-stable.geosolutionsgroup.com/geoserver/wfs',
        typeName: 'sf:bugsites',
        pageSize: 25,
    });
    return {
        source,
        center: [-103.6, 44.4],
        zoom: 9.5,
        value: 'cat',
        describe: () => {
            const { status, loaded, error } = source.getState();
            return status === 'error' ? `WFS: ${error?.message ?? 'error'}` : `WFS ${status}: ${loaded} puntos`;
        },
    };
};

const server = (): DemoSource => {
    const inputs = toInputs(points, 'EPSG:3857', 'magnitude');
    return {
        source: fromCellProvider({
            resolutions: [3, 4, 5, 6, 7],
            load: async ({ resolution, signal }) => {
                await new Promise(resolve => setTimeout(resolve, 400));
                signal.throwIfAborted();
                return [...aggregate(inputs, { resolution, reducer: 'sum' }).values()]
                    .map(cell => ({ h3Index: cell.h3Index, value: cell.value, count: cell.count }));
            },
        }),
        center: MEXICO,
        zoom: 5.5,
        value: 'magnitude',
        describe: () => 'servidor simulado: suma de magnitud, 400 ms',
    };
};

export const demoSource = (kind: SourceKind): DemoSource =>
    kind === 'wfs' ? wfs() : kind === 'server' ? server() : synthetic();
