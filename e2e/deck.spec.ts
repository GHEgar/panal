import { expect, test } from './fixtures.js';

test('deck.gl page draws columns, a histogram and selects on click', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/tile\.openstreetmap\.org/, route => route.abort());
    await page.goto('/deck.html');
    await expect(page.locator('#status')).toContainText('cells');
    await expect(page.locator('#histogram li')).toHaveCount(5);
    await page.waitForTimeout(500);
    const target = await page.evaluate(() => {
        const { map, cells } = window.panalDeck;
        const top = [...cells().values()].sort((a, b) => b.count - a.count)[0];
        if (!top) return null;
        map.jumpTo({ pitch: 0, bearing: 0 });
        return top.h3Index;
    });
    expect(target).not.toBeNull();
    await page.locator('#style').selectOption('flat');
    await page.waitForTimeout(500);
    const pixel = await page.evaluate(h3Index => window.panalDeck.pixelOf(h3Index as string), target);
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click((box?.x ?? 0) + (pixel[0] as number), (box?.y ?? 0) + (pixel[1] as number));
    await expect(page.locator('#selection')).toContainText(target as string);
    await page.locator('#style').selectOption('dots');
    await expect(page.locator('#histogram li')).toHaveCount(5);
    expect(errors).toEqual([]);
});
