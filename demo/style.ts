import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import { colorFor } from './ramp.js';

export { colorFor };

const OUTLINE = new Stroke({ color: 'rgba(40, 24, 10, 0.35)', width: 0.8 });
const NO_CLASS = new Style({ fill: new Fill({ color: 'rgba(120, 120, 120, 0.3)' }), stroke: OUTLINE });
const cache = new Map<string, Style>();
const SELECTED = new Stroke({ color: '#1d4ed8', width: 3 });

export const styleFor = (classIndex: number, classes: number, selected = false): Style => {
    if (classIndex < 0) return NO_CLASS;
    const fill = colorFor(classIndex, classes);
    const key = `${fill}${selected ? '!' : ''}`;
    let style = cache.get(key);
    if (!style) {
        style = new Style({ fill: new Fill({ color: `${fill}cc` }), stroke: selected ? SELECTED : OUTLINE, zIndex: selected ? 1 : 0 });
        cache.set(key, style);
    }
    return style;
};
