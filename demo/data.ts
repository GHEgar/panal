import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { fromLonLat } from 'ol/proj.js';
import { syntheticLonLat } from './points.js';

export const syntheticPoints = (count: number): Feature[] => syntheticLonLat(count).map(([lon, lat, magnitude]) =>
    new Feature({ geometry: new Point(fromLonLat([lon, lat])), magnitude }));
