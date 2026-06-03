import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootPath = resolve(fileURLToPath(new URL("../", import.meta.url)));
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
};

test("pause icon opens help modal with game and control instructions", async (t) => {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch();

  t.after(() => server.close());
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);

  await page.locator("#pauseButton").click();

  const overlay = page.locator("#pauseOverlay");
  const summary = page.locator("[data-testid='game-help-summary']");

  assert.equal(await overlay.isVisible(), true);
  assert.equal(await page.locator("#pauseButton").getAttribute("aria-pressed"), "true");
  assert.match(await overlay.textContent(), /遊戲說明/);
  assert.match(await overlay.textContent(), /操作說明/);
  assert.match(await overlay.textContent(), /移動/);
  assert.match(await overlay.textContent(), /開火/);
  assert.ok([...(await summary.textContent())].length <= 100);
});

test("pause modal freezes hack countdown until the game resumes", async (t) => {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch();

  t.after(() => server.close());
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);
  await page.locator("#hackButton").click();
  await page.waitForSelector("#timerPanel:not(.hidden)");
  await page.waitForTimeout(350);

  await page.locator("#pauseButton").click();
  await page.waitForSelector("#pauseOverlay:not(.hidden)");
  const pauseStart = await page.locator("#timerValue").textContent();
  await page.waitForTimeout(1200);
  const pauseEnd = await page.locator("#timerValue").textContent();

  await page.locator("#resumeButton").click();
  await page.waitForTimeout(350);
  const afterResume = await page.locator("#timerValue").textContent();

  assert.equal(pauseEnd, pauseStart);
  assert.notEqual(afterResume, pauseEnd);
});

async function startGame(page) {
  await page.locator("#startOverlay").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });
  await page.waitForTimeout(1500);
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = resolve(rootPath, `.${decodeURIComponent(pathname)}`);

      if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}
