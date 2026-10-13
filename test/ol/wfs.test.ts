import { describe, expect, it, vi } from 'vitest';
import { fromWfs } from '../../src/ol/index.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const collection = (start: number, count: number, matched: number | null) => ({
    type: 'FeatureCollection',
    ...(matched === null ? {} : { numberMatched: matched }),
    features: Array.from({ length: count }, (_, i) => ({
        type: 'Feature',
        id: `p.${start + i}`,
        properties: { n: start + i },
        geometry: { type: 'Point', coordinates: [start + i, 0] },
    })),
});

const fakeServer = (total: number, options: { matched?: boolean } = {}) => {
    const calls: URLSearchParams[] = [];
    const fetch = vi.fn(async (url: string) => {
        const params = new URL(url).searchParams;
        calls.push(params);
        const start = Number(params.get('startIndex'));
        const count = Number(params.get('count') ?? params.get('maxFeatures'));
        const size = Math.max(0, Math.min(count, total - start));
        const body = collection(start, size, options.matched === false ? null : total);
        return new Response(JSON.stringify(body), { status: 200 });
    });
    return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
};

describe('fromWfs', () => {
    it('does not request anything until read', () => {
        const server = fakeServer(3);
        const source = fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch: server.fetch });
        expect(server.calls).toHaveLength(0);
        expect(source.getState().status).toBe('idle');
    });

    it('pages with startIndex and count in the requested projection', async () => {
        const server = fakeServer(12);
        const source = fromWfs({
            url: 'https://x/wfs', typeName: 'ws:p', pageSize: 5, cql: "kind = 'a'", propertyNames: ['geom', 'n'], fetch: server.fetch,
        });
        const listener = vi.fn();
        source.subscribe(listener);
        expect(source.read('EPSG:3857')).toEqual([]);
        await settle();
        expect(server.calls.map(params => params.get('startIndex'))).toEqual(['0', '5', '10']);
        const first = server.calls[0];
        expect(first?.get('typeNames')).toBe('ws:p');
        expect(first?.get('srsName')).toBe('EPSG:3857');
        expect(first?.get('CQL_FILTER')).toBe("kind = 'a'");
        expect(first?.get('propertyName')).toBe('geom,n');
        expect(source.getState()).toMatchObject({ status: 'ready', loaded: 12, truncated: false });
        expect(source.read('EPSG:3857')).toHaveLength(12);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stops at maxFeatures and flags truncation', async () => {
        const server = fakeServer(50);
        const source = fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', pageSize: 10, maxFeatures: 25, fetch: server.fetch });
        source.read('EPSG:3857');
        await settle();
        expect(server.calls.map(params => params.get('count'))).toEqual(['10', '10', '5']);
        expect(source.getState()).toMatchObject({ status: 'ready', loaded: 25, truncated: true });
    });

    it('stops on a short page when the server does not report a total', async () => {
        const server = fakeServer(7, { matched: false });
        const source = fromWfs({ url: 'https://x/wfs?map=a', typeName: 'ws:p', version: '1.1.0', pageSize: 5, fetch: server.fetch });
        source.read('EPSG:3857');
        await settle();
        expect(server.calls).toHaveLength(2);
        expect(server.calls[0]?.get('typeName')).toBe('ws:p');
        expect(server.calls[0]?.get('maxFeatures')).toBe('5');
        expect(server.calls[0]?.get('map')).toBe('a');
        expect(source.getState().loaded).toBe(7);
    });

    it('reports HTTP errors and non JSON answers', async () => {
        const failing = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
        const source = fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch: failing });
        source.read('EPSG:3857');
        await settle();
        expect(source.getState().status).toBe('error');
        expect(source.getState().error?.message).toContain('500');
        const xml = vi.fn(async () => new Response('<ows:ExceptionReport/>', { status: 200 })) as unknown as typeof fetch;
        const other = fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch: xml });
        other.read('EPSG:3857');
        await settle();
        expect(other.getState().error?.message).toContain('JSON');
    });

    it('reloads and aborts', async () => {
        const server = fakeServer(3);
        const source = fromWfs({ url: 'https://x/wfs', typeName: 'ws:p', fetch: server.fetch });
        source.read('EPSG:3857');
        await settle();
        source.reload();
        await settle();
        expect(server.calls).toHaveLength(2);
        source.read('EPSG:4326');
        source.abort();
        await settle();
        expect(source.getState().status).toBe('idle');
    });
});
