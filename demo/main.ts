import type { ClassificationMethod } from '@ghegar/panal/classify';
import type { BuiltInReducer } from '@ghegar/panal';
import { createHexbinLayer, fromVectorSource } from '@ghegar/panal/ol';
import TileLayer from 'ol/layer/Tile.js';
import OlMap from 'ol/Map.js';
import { fromLonLat } from 'ol/proj.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import 'ol/ol.css';
import { syntheticPoints } from './data.js';

const RAMP = ['#fff4d6', '#ffd98a', '#f7a94b', '#e2702d', '#b8401f', '#82231a', '#4d130f'];
const OUTLINE = new Stroke({ color: 'rgba(40, 24, 10, 0.35)', width: 0.8 });
const NO_CLASS = new Style({ fill: new Fill({ color: 'rgba(120, 120, 120, 0.3)' }), stroke: OUTLINE });

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const reducerInput = element<HTMLSelectElement>('reducer');
const methodInput = element<HTMLSelectElement>('method');
const classesInput = element<HTMLInputElement>('classes');
const status = element<HTMLParagraphElement>('status');
const legendList = element<HTMLOListElement>('legend');

const map = new OlMap({
    target: 'map',
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({ center: fromLonLat([-100.5, 21.5]), zoom: 5.5 }),
});

const points = new VectorSource({ features: syntheticPoints(20_000) });
let actual = 5;

const color = (classIndex: number): string => {
    const step = actual <= 1 ? 0 : Math.round((classIndex * (RAMP.length - 1)) / (actual - 1));
    return RAMP[step] as string;
};

const styles = new Map<string, Style>();
const styleFor = (classIndex: number): Style => {
    if (classIndex < 0) return NO_CLASS;
    const fill = color(classIndex);
    let style = styles.get(fill);
    if (!style) {
        style = new Style({ fill: new Fill({ color: `${fill}cc` }), stroke: OUTLINE });
        styles.set(fill, style);
    }
    return style;
};

const hexbin = createHexbinLayer({
    map,
    source: fromVectorSource(points),
    style: (_, { classIndex }) => styleFor(classIndex),
    classification: { method: 'quantile', classes: 5 },
    resolution: { hysteresis: 0.3 },
});

const format = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

const render = () => {
    const { resolution, cellCount, classification, legend } = hexbin.getSnapshot();
    actual = classification?.actual ?? 0;
    const collapsed = classification && classification.actual < classification.requested ? ' (clases fundidas)' : '';
    status.textContent = `r${resolution ?? '–'} · ${format.format(cellCount)} celdas${collapsed}`;
    legendList.replaceChildren(...legend.map((entry) => {
        const item = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = color(entry.classIndex);
        const close = entry.closed === 'both' ? ']' : ')';
        item.append(swatch, `[${format.format(entry.min)}, ${format.format(entry.max)}${close} · ${entry.count}`);
        return item;
    }));
    hexbin.layer.changed();
};

hexbin.subscribe(render);
render();

reducerInput.addEventListener('change', () => {
    const choice = reducerInput.value;
    if (choice === 'range') {
        hexbin.setReducer(values => (values.length ? Math.max(...values) - Math.min(...values) : NaN), 'magnitude');
        return;
    }
    hexbin.setReducer(choice as BuiltInReducer, 'magnitude');
});

methodInput.addEventListener('change', () => {
    classesInput.disabled = methodInput.value === 'stdDev';
    hexbin.setClassification({ method: methodInput.value as ClassificationMethod });
});

classesInput.addEventListener('input', () => {
    hexbin.setClassification({ classes: Number(classesInput.value) });
});
