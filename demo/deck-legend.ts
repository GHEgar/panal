import type { LegendEntry } from '@npmegar/panal/classify';
import type { HexbinDeckCell } from '@npmegar/panal/deckgl';
import { colorFor } from './ramp.js';

const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const renderHistogram = (list: HTMLElement, entries: readonly LegendEntry[], counts: readonly number[]): void => {
    const top = Math.max(1, ...counts);
    list.replaceChildren(...entries.map((entry, index) => {
        const item = document.createElement('li');
        const bar = document.createElement('span');
        bar.className = 'bar';
        bar.style.background = colorFor(entry.classIndex, entries.length);
        bar.style.width = `${Math.max(2, ((counts[index] ?? 0) / top) * 100)}%`;
        const label = document.createElement('span');
        const close = entry.closed === 'both' ? ']' : ')';
        label.textContent = `[${format.format(entry.min)}, ${format.format(entry.max)}${close} · ${counts[index] ?? 0}`;
        item.append(bar, label);
        return item;
    }));
};

export const renderDeckSelection = (box: HTMLElement, cell: HexbinDeckCell | null): void => {
    box.hidden = !cell;
    if (!cell) return;
    const title = document.createElement('h2');
    title.textContent = `Cell ${cell.h3Index}`;
    const detail = document.createElement('p');
    detail.textContent = `value ${format.format(cell.value)} · ${cell.count} points · class ${cell.classIndex + 1}`;
    box.replaceChildren(title, detail);
};
