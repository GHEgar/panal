import type { BuiltInReducer } from '@ghegar/panal';
import type { ClassificationMethod } from '@ghegar/panal/classify';
import type { HexbinLayer, WorkerWfsSource } from '@ghegar/panal/ol';
import { bindCellClick, createHexbinLayer } from '@ghegar/panal/ol';
import type { AggregationWorker } from '@ghegar/panal/worker';
import { createAggregationWorker } from '@ghegar/panal/worker';
import TileLayer from 'ol/layer/Tile.js';
import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import type { Pixel } from 'ol/pixel.js';
import OSM from 'ol/source/OSM.js';
import View from 'ol/View.js';
import 'ol/ol.css';
import 'rotulo';
import { renderLegend, renderSelection } from './legend.js';
import { demoSource } from './sources.js';
import type { DemoSource, SourceKind } from './sources.js';
import { styleFor } from './style.js';
import { sharedWorker } from './worker.js';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const sourceInput = element<HTMLSelectElement>('source');
const workerInput = element<HTMLInputElement>('worker');
const reducerInput = element<HTMLSelectElement>('reducer');
const methodInput = element<HTMLSelectElement>('method');
const classesInput = element<HTMLInputElement>('classes');
const status = element<HTMLParagraphElement>('status');
const legendList = element<HTMLOListElement>('legend');
const selectionBox = element<HTMLElement>('selection');

const map = new OlMap({
    target: 'map',
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({ center: fromLonLat([-100.5, 21.5]), zoom: 5.5 }),
});

let worker: AggregationWorker | null = null;
let hexbin: HexbinLayer | null = null;
let current: DemoSource | null = null;
let unsubscribe: (() => void) | null = null;
let unbindClick: (() => void) | null = null;

const aggregator = () => {
    if (!workerInput.checked) return undefined;
    worker ??= createAggregationWorker(sharedWorker());
    return worker.aggregate;
};

const reducer = (): Parameters<HexbinLayer['setReducer']>[0] => reducerInput.value === 'range'
    ? values => (values.length ? Math.max(...values) - Math.min(...values) : NaN)
    : reducerInput.value as BuiltInReducer;

const render = () => {
    if (!hexbin || !current) return;
    const snapshot = hexbin.getSnapshot();
    renderLegend(status, legendList, snapshot, `${current.describe()}${workerInput.checked && !workerInput.disabled ? ' · worker' : ''}`);
    renderSelection(selectionBox, snapshot);
    hexbin.layer.changed();
};

const build = () => {
    unsubscribe?.();
    unbindClick?.();
    hexbin?.destroy();
    current?.release?.();
    current = demoSource(sourceInput.value as SourceKind);
    map.getView().setCenter(fromLonLat(current.center));
    map.getView().setZoom(current.zoom);
    const server = sourceInput.value === 'server';
    const remote = sourceInput.value === 'wfs-worker';
    reducerInput.disabled = server;
    workerInput.disabled = server || remote;
    hexbin = createHexbinLayer({
        map,
        source: current.source,
        value: current.value,
        reducer: reducer(),
        aggregator: aggregator(),
        style: (_, { classIndex, selected }) => styleFor(classIndex, hexbin?.getSnapshot().classification?.actual ?? 0, selected),
        classification: {
            method: methodInput.value as ClassificationMethod,
            classes: Number(classesInput.value),
        },
        resolution: { hysteresis: 0.3 },
    });
    unsubscribe = hexbin.subscribe(render);
    unbindClick = bindCellClick(hexbin, map);
    render();
};

sourceInput.addEventListener('change', build);
workerInput.addEventListener('change', () => hexbin?.setAggregator(aggregator()));
reducerInput.addEventListener('change', () => {
    const source = current?.source as Partial<WorkerWfsSource> | undefined;
    if (source?.setReducer && reducerInput.value !== 'range') {
        source.setReducer(reducerInput.value as BuiltInReducer, current?.value);
        return;
    }
    hexbin?.setReducer(reducer(), current?.value);
});
methodInput.addEventListener('change', () => {
    classesInput.disabled = methodInput.value === 'stdDev';
    hexbin?.setClassification({ method: methodInput.value as ClassificationMethod });
});
classesInput.addEventListener('input', () => hexbin?.setClassification({ classes: Number(classesInput.value) }));

declare global {
    interface Window {
        panalDemo: { map: OlMap; hexbin: () => HexbinLayer | null; pixelOf: (lon: number, lat: number) => Pixel | null };
    }
}

window.panalDemo = {
    map,
    hexbin: () => hexbin,
    pixelOf: (lon, lat) => map.getPixelFromCoordinate(fromLonLat([lon, lat])),
};

const params = new URLSearchParams(location.search);
sourceInput.value = params.get('source') ?? sourceInput.value;
workerInput.checked = params.get('worker') === '1';
build();
