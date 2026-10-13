import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

const open = async (page: Page, query: string) => {
    await page.route(/tile\.openstreetmap\.org/, route => route.abort());
    await page.goto(`/?${query}`);
    await expect(page.locator('#status')).toContainText('celdas');
    await expect(page.locator('#status')).not.toContainText('cargando');
};

const legendText = (page: Page) => page.locator('#legend li').allTextContents();

const clickAt = async (page: Page, lon: number, lat: number) => {
    const pixel = await page.evaluate(([x, y]) => window.panalDemo.pixelOf(x as number, y as number), [lon, lat]);
    if (!pixel) throw new Error('map not rendered');
    const box = await page.locator('#map').boundingBox();
    if (!box) throw new Error('map has no box');
    await page.mouse.click(box.x + (pixel[0] as number), box.y + (pixel[1] as number));
};

test('draws the synthetic points with a five class legend', async ({ page }) => {
    await open(page, 'source=synthetic');
    await expect(page.locator('#status')).toContainText('r3 · 20 celdas');
    await expect(page.locator('#legend li')).toHaveCount(5);
    const features = await page.evaluate(() => window.panalDemo.hexbin()?.layer.getSource()?.getFeatures().length);
    expect(features).toBe(20);
});

test('reclassifies from the controls', async ({ page }) => {
    await open(page, 'source=synthetic');
    const quantiles = await legendText(page);
    await page.selectOption('#method', 'jenks');
    await expect.poll(() => legendText(page)).not.toEqual(quantiles);
    await page.locator('#classes').fill('3');
    await expect(page.locator('#legend li')).toHaveCount(3);
    await page.selectOption('#method', 'stdDev');
    await expect(page.locator('#classes')).toBeDisabled();
});

test('selects a cell on click and toggles it off', async ({ page }) => {
    await open(page, 'source=synthetic');
    await clickAt(page, -99.13, 19.43);
    await expect(page.locator('#selection')).toBeVisible();
    await expect(page.locator('#selection p')).toContainText('puntos');
    const selected = await page.evaluate(() => window.panalDemo.hexbin()?.getSnapshot().selection?.cell.count);
    expect(selected).toBeGreaterThan(0);
    await expect(page.locator('#selection p')).toContainText(`${selected} puntos`);
    await clickAt(page, -99.13, 19.43);
    await expect(page.locator('#selection')).toBeHidden();
});

test('zooming in raises the resolution', async ({ page }) => {
    await open(page, 'source=synthetic');
    await page.evaluate(() => window.panalDemo.map.getView().setZoom(9));
    await expect(page.locator('#status')).not.toContainText('r3 ·');
    const resolution = await page.evaluate(() => window.panalDemo.hexbin()?.getSnapshot().resolution);
    expect(resolution).toBeGreaterThanOrEqual(6);
});

test('the worker gives the same legend as local aggregation', async ({ page }) => {
    await open(page, 'source=synthetic');
    const local = await legendText(page);
    await open(page, 'source=synthetic&worker=1');
    await expect(page.locator('#status')).toContainText('worker');
    expect(await legendText(page)).toEqual(local);
    await page.selectOption('#reducer', 'mean');
    await expect(page.locator('#status')).not.toContainText('cargando');
    await expect.poll(() => legendText(page)).not.toEqual(local);
});

test('server mode loads cells asynchronously', async ({ page }) => {
    await page.route(/tile\.openstreetmap\.org/, route => route.abort());
    await page.goto('/?source=server');
    await expect(page.locator('#status')).toContainText('cargando');
    await expect(page.locator('#status')).toContainText('r3 · 20 celdas');
    await expect(page.locator('#reducer')).toBeDisabled();
});
