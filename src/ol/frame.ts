export const scheduleFrame = (callback: () => void): (() => void) => {
    if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => callback());
        return () => cancelAnimationFrame(id);
    }
    const id = setTimeout(callback, 0);
    return () => clearTimeout(id);
};
