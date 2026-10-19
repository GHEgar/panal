import type Feature from 'ol/Feature.js';
import type { Coordinate } from 'ol/coordinate.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat } from 'ol/proj.js';
import type { Cell } from '../core/types.js';

export interface Selection {
    h3Index: string;
    cell: Cell<Feature>;
    members: Feature[];
    status: 'ready' | 'loading' | 'error';
    error: Error | null;
}

export interface Selectable {
    cellAt: (coordinate: Coordinate) => Cell<Feature> | null;
    select: (h3Index: string | null) => void;
    getSnapshot: () => { selection: Selection | null };
}

export interface ArbiterPointer {
    coordinate: readonly [number, number];
}

export interface ClickArbiter {
    claim(tool: string, handlers: { click?(e: ArbiterPointer): void; escape?(): void }): () => void;
}

export interface CellClickOptions {
    toggle?: boolean;
    arbiter?: ClickArbiter | undefined;
    tool?: string | undefined;
}

export const bindCellClick = (hexbin: Selectable, map: OlMap, options: CellClickOptions = {}): (() => void) => {
    const toggle = options.toggle ?? true;
    const pick = (coordinate: Coordinate) => {
        const cell = hexbin.cellAt(coordinate);
        const selected = hexbin.getSnapshot().selection?.h3Index ?? null;
        if (!cell || (toggle && cell.h3Index === selected)) {
            hexbin.select(null);
            return;
        }
        hexbin.select(cell.h3Index);
    };
    if (options.arbiter) {
        return options.arbiter.claim(options.tool ?? 'hexbin', {
            click: e => pick(fromLonLat([e.coordinate[0], e.coordinate[1]], map.getView().getProjection())),
            escape: () => hexbin.select(null),
        });
    }
    const key = map.on('singleclick', (event: MapBrowserEvent) => pick(event.coordinate));
    return () => unByKey(key);
};
