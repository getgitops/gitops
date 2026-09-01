import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

async function gotoWithResponse(page: Page, path: string): Promise<Response | null> {
  const response = await page.goto(path);
  if (response) return response;
  return page.goto(path);
}

export async function expectDenied(page: Page, path: string) {
  const response = await gotoWithResponse(page, path);
  const requestedPath = new URL(path, page.url()).pathname;
  const finalPath = new URL(page.url()).pathname;
  const status = response?.status() ?? 0;
  expect(finalPath !== requestedPath || status === 403, `expected ${path} to be denied`).toBe(
    true,
  );
}

export async function expectAllowed(page: Page, path: string) {
  const response = await gotoWithResponse(page, path);
  const requestedPath = new URL(path, page.url()).pathname;
  const finalPath = new URL(page.url()).pathname;
  expect(finalPath, `expected ${path} not to redirect away`).toBe(requestedPath);
  expect(response?.status(), `expected ${path} to load successfully`).toBeLessThan(400);
}
