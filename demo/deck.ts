import { MapLibreOverlay } from '@deck.gl/maplibre';
import type { BuiltInReducer, Cell } from '@npmegar/panal';
import { aggregate, createResolutionPicker } from '@npmegar/panal';
import type { ClassificationMethod } from '@npmegar/panal/classify';
import { classify, legend } from '@npmegar/panal/classify';
import type { HexbinDeckCell, HexbinDeckStyle } from '@npmegar/panal/deckgl';
import { classCounts, createHexbinDeckLayer } from '@npmegar/panal/deckgl';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cellToLatLng } from 'h3-js';
import 'rotulo';
import { renderDeckSelection, renderHistogram } from './deck-legend.js';
import { syntheticLonLat } from './points.js';
import { rgbFor } from './ramp.js';

setWorkerUrl(maplibreWorkerUrl);

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const styleInput = element<HTMLSelectElement>('style');
const reducerInput = element<HTMLSelectElement>('reducer');
const methodInput = element<HTMLSelectElement>('method');
const classesInput = element<HTMLInputElement>('classes');
const status = element<HTMLParagraphElement>('status');
const histogram = element<HTMLOListElement>('histogram');
const selectionBox = element<HTMLElement>('selection');

const inputs = syntheticLonLat(20_000).map(([lon, lat, magnitude], index) => ({ coordinates: [[lon, lat] as const], member: index, value: magnitude }));
const picker = createResolutionPicker({ hysteresis: 0.3 });
const format = new Intl.NumberFormat('en-US');

const map = new MapLibreMap({
    container: 'map',
    style: {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
            },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [-100.5, 21.5],
    zoom: 4.5,
    pitch: 50,
    bearing: -15,
});

let cells: Map<string, Cell<number>> = new Map();
let resolution: number | null = null;
let selected: HexbinDeckCell | null = null;

const overlay = new MapLibreOverlay({
    interleaved: true,
    layers: [],
    onClick: (info) => {
        if (!info.object) select(null);
    },
});

function select(cell: HexbinDeckCell | null): void {
    selected = cell;
    render();
}

const regroup = (force = false): void => {
    const next = picker.pick(map.getZoom() + 1, map.getCenter().lat);
    if (next === resolution && !force) return;
    resolution = next;
    cells = aggregate(inputs, { resolution: next, reducer: reducerInput.value as BuiltInReducer });
    if (selected && !cells.has(selected.h3Index)) selected = null;
    render();
};

function render(): void {
    const values = [...cells.values()].map(cell => cell.value);
    const classification = classify(values, { method: methodInput.value as ClassificationMethod, classes: Number(classesInput.value) });
    overlay.setProps({
        layers: [createHexbinDeckLayer({
            id: 'hexbin',
            cells,
            classification,
            colors: (classIndex, classes) => rgbFor(classIndex, classes),
            style: styleInput.value as HexbinDeckStyle,
            selected: selected?.h3Index ?? null,
            selectedColor: [29, 78, 216, 255],
            onSelect: select,
        })],
    });
    status.textContent = `20,000 points · r${resolution ?? '–'} · ${format.format(cells.size)} cells`;
    renderHistogram(histogram, legend(classification), classCounts(cells, classification));
    renderDeckSelection(selectionBox, selected);
}

map.addControl(overlay);
map.on('load', () => regroup(true));
map.on('moveend', () => regroup());
styleInput.addEventListener('change', render);
methodInput.addEventListener('change', render);
classesInput.addEventListener('input', render);
reducerInput.addEventListener('change', () => regroup(true));

declare global {
    interface Window {
        panalDeck: { map: MapLibreMap; cells: () => Map<string, Cell<number>>; pixelOf: (h3Index: string) => [number, number] };
    }
}

window.panalDeck = {
    map,
    cells: () => cells,
    pixelOf: (h3Index) => {
        const [lat, lon] = cellToLatLng(h3Index);
        const point = map.project([lon, lat]);
        return [point.x, point.y];
    },
};
