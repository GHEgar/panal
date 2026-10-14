import { aggregate } from '@ghegar/panal';
import type { HexbinSource, CellSource } from '@ghegar/panal/ol';
import { createWorkerWfsSource, fromCellProvider, fromVectorSource, fromWfs, toInputs } from '@ghegar/panal/ol';
import VectorSource from 'ol/source/Vector.js';
import { syntheticPoints } from './data.js';
import { sharedWorker } from './worker.js';

export type SourceKind = 'synthetic' | 'wfs' | 'wfs-worker' | 'server';

export interface DemoSource {
    source: HexbinSource | CellSource;
    center: [number, number];
    zoom: number;
    value: string;
    describe: () => string;
    release?: () => void;
}

const points = syntheticPoints(20_000);
const MEXICO: [number, number] = [-100.5, 21.5];

const synthetic = (): DemoSource => ({
    source: fromVectorSource(new VectorSource({ features: points })),
    center: MEXICO,
    zoom: 5.5,
    value: 'magnitude',
    describe: () => '20,000 points',
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
            return status === 'error' ? `WFS: ${error?.message ?? 'error'}` : `WFS ${status}: ${loaded} points`;
        },
    };
};

const wfsWorker = (): DemoSource => {
    const source = createWorkerWfsSource(sharedWorker(), {
        url: 'https://gs-stable.geosolutionsgroup.com/geoserver/wfs',
        typeName: 'sf:bugsites',
        pageSize: 25,
        value: 'cat',
    });
    return {
        source,
        center: [-103.6, 44.4],
        zoom: 9.5,
        value: 'cat',
        describe: () => {
            const { status, loaded, error } = source.getState();
            return status === 'error' ? `WFS: ${error?.message ?? 'error'}` : `WFS in worker ${status}: ${loaded} points`;
        },
        release: () => source.release(),
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
        describe: () => 'simulated server: sum of magnitude, 400 ms',
    };
};

export const demoSource = (kind: SourceKind): DemoSource =>
    kind === 'wfs' ? wfs() : kind === 'wfs-worker' ? wfsWorker() : kind === 'server' ? server() : synthetic();
