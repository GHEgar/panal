import type Feature from 'ol/Feature.js';
import type { Coordinate } from 'ol/coordinate.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { unByKey } from 'ol/Observable.js';
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

export interface CellClickOptions {
    toggle?: boolean;
}

export const bindCellClick = (hexbin: Selectable, map: OlMap, options: CellClickOptions = {}): (() => void) => {
    const toggle = options.toggle ?? true;
    const key = map.on('singleclick', (event: MapBrowserEvent) => {
        const cell = hexbin.cellAt(event.coordinate);
        const selected = hexbin.getSnapshot().selection?.h3Index ?? null;
        if (!cell || (toggle && cell.h3Index === selected)) {
            hexbin.select(null);
            return;
        }
        hexbin.select(cell.h3Index);
    });
    return () => unByKey(key);
};
