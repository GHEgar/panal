export interface WfsRequestOptions {
    url: string;
    typeName: string;
    version?: '2.0.0' | '1.1.0';
    cql?: string;
    sortBy?: string;
    propertyNames?: readonly string[];
    pageSize?: number;
    maxFeatures?: number;
}

export const DEFAULT_WFS_PAGE_SIZE = 5000;
export const DEFAULT_WFS_MAX_FEATURES = 100_000;

export const wfsPageUrl = (options: WfsRequestOptions, srsName: string, startIndex: number, count: number): string => {
    const version = options.version ?? '2.0.0';
    const modern = version === '2.0.0';
    const params = new URLSearchParams({
        service: 'WFS',
        version,
        request: 'GetFeature',
        [modern ? 'typeNames' : 'typeName']: options.typeName,
        outputFormat: 'application/json',
        srsName,
        startIndex: String(startIndex),
        [modern ? 'count' : 'maxFeatures']: String(count),
    });
    if (options.cql) params.set('CQL_FILTER', options.cql);
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.propertyNames?.length) params.set('propertyName', options.propertyNames.join(','));
    const separator = options.url.includes('?') ? '&' : '?';
    return `${options.url}${separator}${params.toString()}`;
};

export interface WfsPageText {
    text: string;
    ok: boolean;
    status: number;
}

export interface WfsCollection {
    features?: { id?: string | number; geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[];
    numberMatched?: unknown;
    totalFeatures?: unknown;
}

export const parseWfsPage = (page: WfsPageText): { data: WfsCollection; received: number; matched: number | null } => {
    if (!page.ok) throw new Error(`WFS ${page.status}: ${page.text.slice(0, 200)}`);
    let data: WfsCollection;
    try {
        data = JSON.parse(page.text) as WfsCollection;
    } catch {
        throw new Error(`WFS did not answer JSON: ${page.text.slice(0, 200)}`);
    }
    const matched = Number(data.numberMatched ?? data.totalFeatures);
    return { data, received: data.features?.length ?? 0, matched: Number.isFinite(matched) ? matched : null };
};

export interface WfsPagingState {
    collected: number;
    truncated: boolean;
}

export const fetchWfsPages = async (
    options: WfsRequestOptions,
    srsName: string,
    run: typeof fetch,
    signal: AbortSignal,
    onPage: (data: WfsCollection) => number,
): Promise<WfsPagingState> => {
    const pageSize = options.pageSize ?? DEFAULT_WFS_PAGE_SIZE;
    const maxFeatures = options.maxFeatures ?? DEFAULT_WFS_MAX_FEATURES;
    let collected = 0;
    let truncated = false;
    for (let start = 0; collected < maxFeatures; start += pageSize) {
        const count = Math.min(pageSize, maxFeatures - collected);
        const response = await run(wfsPageUrl(options, srsName, start, count), { signal });
        const page = parseWfsPage({ text: await response.text(), ok: response.ok, status: response.status });
        collected += onPage(page.data);
        if (page.received < count) break;
        if (page.matched !== null && start + page.received >= page.matched) break;
        if (collected >= maxFeatures) truncated = page.matched === null || page.matched > collected;
    }
    return { collected, truncated };
};
