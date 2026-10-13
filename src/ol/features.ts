import Feature from 'ol/Feature.js';
import type { Geometry } from 'ol/geom.js';
import Polygon from 'ol/geom/Polygon.js';
import type { ProjectionLike } from 'ol/proj.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { cellRing } from '../core/cells.js';
import type { AggregateInput, Cell, LonLat } from '../core/types.js';

export type ValueAccessor = string | ((feature: Feature) => number | null | undefined);

export const CELL_PROPERTIES = ['h3Index', 'value', 'count', 'classIndex', 'members'] as const;

const readValue = (feature: Feature, accessor: ValueAccessor | undefined): number | null | undefined => {
    if (accessor === undefined) return undefined;
    if (typeof accessor === 'function') return accessor(feature);
    const raw: unknown = feature.get(accessor);
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
    return undefined;
};

const pointsOf = (geometry: Geometry | undefined, projection: ProjectionLike): LonLat[] => {
    if (!geometry) return [];
    const type = geometry.getType();
    const flat = geometry as unknown as { getCoordinates: () => unknown };
    if (type === 'Point') return [toLonLat(flat.getCoordinates() as number[], projection) as unknown as LonLat];
    if (type === 'MultiPoint') {
        return (flat.getCoordinates() as number[][]).map(coordinate => toLonLat(coordinate, projection) as unknown as LonLat);
    }
    return [];
};

export const toInputs = (
    features: readonly Feature[],
    projection: ProjectionLike,
    accessor?: ValueAccessor,
): AggregateInput<Feature>[] => {
    const inputs: AggregateInput<Feature>[] = [];
    for (const feature of features) {
        const coordinates = pointsOf(feature.getGeometry(), projection);
        if (coordinates.length === 0) continue;
        inputs.push({ coordinates, member: feature, value: readValue(feature, accessor) });
    }
    return inputs;
};

export const cellToFeature = (cell: Cell<Feature>, projection: ProjectionLike, classIndex: number): Feature => {
    const ring = cellRing(cell.h3Index).map(point => fromLonLat([point[0], point[1]], projection));
    const feature = new Feature({ geometry: new Polygon([ring]) });
    feature.setId(cell.h3Index);
    feature.setProperties({
        h3Index: cell.h3Index,
        value: cell.value,
        count: cell.count,
        classIndex,
        members: cell.members,
    }, true);
    return feature;
};
