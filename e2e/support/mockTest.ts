import { test as base } from '@playwright/test';

/** Unload live documents while their routes still exist, before Playwright closes the context. */
export const test = base.extend<{ mockDocuments: void }>({
  mockDocuments: [async ({ context }, use, info) => {
    await use();
    for (const [index, page] of context.pages().entries()) {
      if (page.isClosed()) continue;
      // Context-close screenshots would otherwise show about:blank after this cleanup.
      if (info.status !== info.expectedStatus) {
        try {
          await info.attach(`before-mock-unload-${index}`, {
            body: await page.screenshot({ timeout: 5_000 }), contentType: 'image/png',
          });
        } catch (error) {
          await info.attach(`before-mock-unload-${index}-error`, {
            body: String(error), contentType: 'text/plain',
          });
        }
      }
      await page.goto('about:blank', { waitUntil: 'load', timeout: 10_000 });
    }
  }, { auto: true }],
});
