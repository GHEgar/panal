export interface DeckOverlayLike {
    setProps(props: { layers?: readonly unknown[] }): void;
    getCanvas(): HTMLCanvasElement | null;
}

export interface OverlayMapLike {
    addControl(control: never): unknown;
    removeControl(control: never): unknown;
    on(type: 'styledata', listener: () => void): unknown;
    off(type: 'styledata', listener: () => void): unknown;
    isStyleLoaded(): unknown;
}

export interface HexbinOverlayOptions {
    interleaved?: boolean;
    preserveDrawingBuffer?: boolean;
    props?: Record<string, unknown>;
}

export interface HexbinOverlay<O extends DeckOverlayLike> {
    readonly overlay: O;
    readonly interleaved: boolean;
    setLayers(layers: readonly unknown[]): void;
    redraw(): void;
    canvases(): HTMLCanvasElement[];
    destroy(): void;
}

type OverlayClass<O> = new (props: Record<string, unknown>) => O;

interface StyleState {
    style?: { _loaded?: unknown } | null;
}

interface DeckHandle {
    _deck?: { redraw?: (reason?: string) => void } | null;
}

export const overlayProps = (options: HexbinOverlayOptions = {}): Record<string, unknown> => {
    const interleaved = options.interleaved ?? false;
    const preserve = !interleaved && (options.preserveDrawingBuffer ?? false);
    return {
        interleaved,
        layers: [],
        ...(preserve ? { deviceProps: { webgl: { preserveDrawingBuffer: true } } } : {}),
        ...options.props,
    };
};

const parsed = (map: OverlayMapLike): boolean => (map as StyleState).style?._loaded === true;

const withParsedStyle = (map: OverlayMapLike, run: () => void): void => {
    if (!parsed(map)) {
        run();
        return;
    }
    const target = map as unknown as Record<string, unknown>;
    const own = Object.prototype.hasOwnProperty.call(target, 'isStyleLoaded');
    const previous = target['isStyleLoaded'];
    target['isStyleLoaded'] = () => true;
    try {
        run();
    } finally {
        if (own) target['isStyleLoaded'] = previous;
        else delete target['isStyleLoaded'];
    }
};

export const createHexbinOverlay = <O extends DeckOverlayLike>(
    Overlay: OverlayClass<O>,
    map: OverlayMapLike,
    options: HexbinOverlayOptions = {},
): HexbinOverlay<O> => {
    const interleaved = options.interleaved ?? false;
    const overlay = new Overlay(overlayProps(options));
    let layers: readonly unknown[] = [];
    let alive = true;

    const apply = (): void => {
        if (!alive) return;
        if (interleaved) withParsedStyle(map, () => overlay.setProps({ layers }));
        else overlay.setProps({ layers });
    };
    const onStyle = (): void => {
        if (layers.length > 0) apply();
    };

    map.addControl(overlay as never);
    if (interleaved) map.on('styledata', onStyle);

    const redraw = (): void => {
        if (!interleaved) (overlay as unknown as DeckHandle)._deck?.redraw?.('panal');
    };

    return {
        overlay,
        interleaved,
        setLayers(next) {
            layers = next;
            apply();
        },
        redraw,
        canvases() {
            if (interleaved || layers.length === 0) return [];
            const canvas = overlay.getCanvas();
            if (!canvas) return [];
            redraw();
            return [canvas];
        },
        destroy() {
            if (!alive) return;
            alive = false;
            if (interleaved) map.off('styledata', onStyle);
            map.removeControl(overlay as never);
        },
    };
};
