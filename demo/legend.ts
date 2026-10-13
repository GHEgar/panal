import type { HexbinSnapshot } from '@ghegar/panal/ol';
import { colorFor } from './style.js';

const format = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

export const renderLegend = (status: HTMLElement, list: HTMLElement, snapshot: HexbinSnapshot, source: string): void => {
    const { resolution, cellCount, classification, legend } = snapshot;
    const actual = classification?.actual ?? 0;
    const collapsed = classification && classification.actual < classification.requested ? ' · clases fundidas' : '';
    const state = snapshot.status === 'loading' ? ' · cargando…' : snapshot.status === 'error' ? ` · ${snapshot.error?.message ?? 'error'}` : '';
    status.textContent = `${source} · r${resolution ?? '–'} · ${format.format(cellCount)} celdas${collapsed}${state}`;
    list.replaceChildren(...legend.map((entry) => {
        const item = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = colorFor(entry.classIndex, actual);
        const close = entry.closed === 'both' ? ']' : ')';
        item.append(swatch, `[${format.format(entry.min)}, ${format.format(entry.max)}${close} · ${entry.count}`);
        return item;
    }));
};
