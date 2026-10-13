import type Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { unByKey } from 'ol/Observable.js';
import type { ProjectionLike } from 'ol/proj.js';
import { get as getProjection } from 'ol/proj.js';
import type VectorSource from 'ol/source/Vector.js';

export interface HexbinSource {
    read: (projection: ProjectionLike) => Feature[];
    subscribe: (listener: () => void) => () => void;
}

export const fromVectorSource = (source: VectorSource): HexbinSource => ({
    read: () => source.getFeatures(),
    subscribe: (listener) => {
        const key = source.on('change', listener);
        return () => unByKey(key);
    },
});

export const fromGeoJSON = (data: object | string): HexbinSource => {
    const format = new GeoJSON();
    const cache = new Map<string, Feature[]>();
    return {
        read: (projection) => {
            const code = getProjection(projection)?.getCode() ?? String(projection);
            let features = cache.get(code);
            if (!features) {
                features = format.readFeatures(data, { featureProjection: projection });
                cache.set(code, features);
            }
            return features;
        },
        subscribe: () => () => undefined,
    };
};
