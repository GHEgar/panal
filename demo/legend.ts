import type { HexbinSnapshot } from '@npmegar/panal/ol';
import { colorFor } from './style.js';

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const renderSelection = (box: HTMLElement, snapshot: HexbinSnapshot): void => {
    const { selection } = snapshot;
    box.hidden = !selection;
    if (!selection) return;
    const { cell, members, status } = selection;
    const title = document.createElement('h2');
    title.textContent = `Cell ${selection.h3Index}`;
    const detail = document.createElement('p');
    const shown = status === 'loading' ? 'loading members…' : `${members.length} points`;
    detail.textContent = `value ${format.format(cell.value)} · ${shown}`;
    const list = document.createElement('ul');
    list.append(...members.slice(0, 5).map((member) => {
        const item = document.createElement('li');
        item.textContent = String(member.get('str1') ?? member.get('magnitude') ?? member.getId() ?? '—');
        return item;
    }));
    box.replaceChildren(title, detail, list);
};

export const renderLegend = (status: HTMLElement, list: HTMLElement, snapshot: HexbinSnapshot, source: string): void => {
    const { resolution, cellCount, classification, legend } = snapshot;
    const actual = classification?.actual ?? 0;
    const collapsed = classification && classification.actual < classification.requested ? ' · merged classes' : '';
    const state = snapshot.status === 'loading' ? ' · loading…' : snapshot.status === 'error' ? ` · ${snapshot.error?.message ?? 'error'}` : '';
    status.textContent = `${source} · r${resolution ?? '–'} · ${format.format(cellCount)} cells${collapsed}${state}`;
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
