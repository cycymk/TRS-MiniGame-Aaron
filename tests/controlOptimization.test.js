import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

test("dragging across hack cells advances the route without separate clicks", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);
  await page.locator("#hackButton").click();
  await page.waitForSelector("#hackPanel:not(.hidden)");

  const target = await page.evaluate(() => {
    const cursor = document.querySelector(".cell.cursor");
    const cursorRow = Number(cursor.dataset.row);
    const cursorCol = Number(cursor.dataset.col);
    const candidates = [
      { row: cursorRow, col: cursorCol + 1 },
      { row: cursorRow + 1, col: cursorCol },
      { row: cursorRow - 1, col: cursorCol },
    ];
    for (const candidate of candidates) {
      const cell = document.querySelector(
        `.cell[data-row="${candidate.row}"][data-col="${candidate.col}"]`,
      );
      if (cell && !cell.classList.contains("block") && !cell.classList.contains("trap")) {
        const cursorRect = cursor.getBoundingClientRect();
        const targetRect = cell.getBoundingClientRect();
        return {
          row: candidate.row,
          col: candidate.col,
          startX: cursorRect.left + cursorRect.width / 2,
          startY: cursorRect.top + cursorRect.height / 2,
          endX: targetRect.left + targetRect.width / 2,
          endY: targetRect.top + targetRect.height / 2,
        };
      }
    }
    return null;
  });

  assert.notEqual(target, null);
  await page.mouse.move(target.startX, target.startY);
  await page.mouse.down();
  await page.mouse.move(target.endX, target.endY, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(
    ({ row, col }) =>
      document.querySelector(".cell.cursor")?.dataset.row === String(row) &&
      document.querySelector(".cell.cursor")?.dataset.col === String(col),
    { row: target.row, col: target.col },
  );
});

test("mobile touch zones match the drawn movement and fire regions", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url);
  await page.locator("#startOverlay").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });

  const hits = await page.evaluate(() => {
    const shell = document.querySelector(".game-shell").getBoundingClientRect();
    const hit = (xRatio, yRatio) => {
      const element = document.elementFromPoint(
        shell.left + shell.width * xRatio,
        shell.top + shell.height * yRatio,
      );
      return element?.id || null;
    };
    return {
      leftUpper: hit(0.18, 0.58),
      leftLower: hit(0.36, 0.78),
      fireUpperLeft: hit(0.36, 0.55),
      fireUpperCenter: hit(0.50, 0.58),
      fireUpperRight: hit(0.64, 0.55),
      fireLower: hit(0.50, 0.84),
      rightLower: hit(0.64, 0.78),
      rightUpper: hit(0.82, 0.58),
      weaponButton: hit(0.15, 0.86),
      hackButton: hit(0.93, 0.80),
    };
  });

  assert.equal(hits.leftUpper, "touchMoveLeftZone");
  assert.equal(hits.leftLower, "touchMoveLeftZone");
  assert.equal(hits.fireUpperLeft, "touchFireZone");
  assert.equal(hits.fireUpperCenter, "touchFireZone");
  assert.equal(hits.fireUpperRight, "touchFireZone");
  assert.equal(hits.fireLower, "touchFireZone");
  assert.equal(hits.rightLower, "touchMoveRightZone");
  assert.equal(hits.rightUpper, "touchMoveRightZone");
  assert.ok(["touchWeaponZone", null].includes(hits.weaponButton));
  assert.ok(["touchHackZone", "hackButton"].includes(hits.hackButton));
});

test("weapon node label is centered and sized to fill most of its cell", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);
  await page.locator("#hackButton").click();
  await page.waitForSelector(".cell.weapon .cell-label");

  const metrics = await page.locator(".cell.weapon").evaluate((cell) => {
    const cellRect = cell.getBoundingClientRect();
    const labelRect = cell.querySelector(".cell-label").getBoundingClientRect();
    return {
      heightRatio: labelRect.height / cellRect.height,
      widthRatio: labelRect.width / cellRect.width,
      centerOffsetX: Math.abs(
        labelRect.left + labelRect.width / 2 - (cellRect.left + cellRect.width / 2),
      ) / cellRect.width,
      centerOffsetY: Math.abs(
        labelRect.top + labelRect.height / 2 - (cellRect.top + cellRect.height / 2),
      ) / cellRect.height,
      overflowBottom: Math.max(0, labelRect.bottom - cellRect.bottom) / cellRect.height,
    };
  });

  assert.ok(metrics.heightRatio >= 0.45 && metrics.heightRatio <= 0.68);
  assert.ok(metrics.widthRatio <= 0.82);
  assert.ok(metrics.centerOffsetX < 0.03);
  assert.ok(metrics.centerOffsetY < 0.03);
  assert.ok(metrics.overflowBottom === 0);
});

test("holding the mobile fire zone keeps firing instead of sending one shot", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(url);
  await startGame(page);

  await page.dispatchEvent("#touchFireZone", "pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
  });
  const ammoWidth = await page
    .waitForFunction(
      () => {
        const width = parseFloat(document.querySelector("#ammoBar")?.style.width ?? "100");
        return width < 96 ? width : false;
      },
      undefined,
      { timeout: 2400 },
    )
    .then((handle) => handle.jsonValue());
  await page.dispatchEvent("#touchFireZone", "pointerup", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 0,
  });

  assert.ok(ammoWidth < 96);
});

test("minus key toggles the pause overlay during combat", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);

  await page.keyboard.press("-");
  await page.waitForSelector("#pauseOverlay:not(.hidden)");
  assert.equal(await page.locator("#pauseButton").getAttribute("aria-pressed"), "true");

  await page.keyboard.press("-");
  await page.locator("#pauseOverlay").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#pauseButton").getAttribute("aria-pressed"), "false");
});

test("holding fire for two seconds toggles auto fire on and off", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);

  const fireBox = await page.locator("#fireButton").boundingBox();
  assert.notEqual(fireBox, null);
  const fireX = fireBox.x + fireBox.width / 2;
  const fireY = fireBox.y + fireBox.height / 2;

  await page.mouse.move(fireX, fireY);
  await page.mouse.down();
  await page.waitForFunction(
    () => document.querySelector("#fireButton")?.classList.contains("auto-fire"),
    undefined,
    { timeout: 2600 },
  );
  await page.mouse.up();
  assert.equal(await page.locator("#fireButton").evaluate((button) => button.classList.contains("auto-fire")), true);

  await page.mouse.down();
  await page.waitForFunction(
    () => !document.querySelector("#fireButton")?.classList.contains("auto-fire"),
    undefined,
    { timeout: 2600 },
  );
  await page.mouse.up();
  assert.equal(await page.locator("#fireButton").evaluate((button) => button.classList.contains("auto-fire")), false);

  await page.keyboard.down("0");
  await page.waitForFunction(
    () => document.querySelector("#fireButton")?.classList.contains("auto-fire"),
    undefined,
    { timeout: 2600 },
  );
  await page.keyboard.up("0");
  assert.equal(await page.locator("#fireButton").evaluate((button) => button.classList.contains("auto-fire")), true);

  await page.keyboard.down("0");
  await page.waitForFunction(
    () => !document.querySelector("#fireButton")?.classList.contains("auto-fire"),
    undefined,
    { timeout: 2600 },
  );
  await page.keyboard.up("0");
  assert.equal(await page.locator("#fireButton").evaluate((button) => button.classList.contains("auto-fire")), false);
});

test("starting on mobile requests fullscreen for the game shell", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.addInitScript(() => {
    window.__fullscreenRequests = 0;
    HTMLElement.prototype.requestFullscreen = function requestFullscreen() {
      if (this.classList.contains("game-shell")) {
        window.__fullscreenRequests += 1;
      }
      return Promise.resolve();
    };
  });
  await page.goto(url);

  await page.locator("#startOverlay").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });

  assert.equal(await page.evaluate(() => window.__fullscreenRequests), 1);
});

test("right click opens the hacking minigame during flight", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await startGame(page);

  await page.locator("#spaceCanvas").click({ button: "right" });

  await page.waitForSelector("#hackPanel:not(.hidden)");
  assert.equal(await page.locator("#timerPanel").isVisible(), true);
});

test("tap to start enters chrono run by default and fire consumes run ammo", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.locator("#startOverlay").click();
  await page.waitForSelector("#runHud:not(.hidden)");

  assert.equal(await page.locator("#runObjective").textContent(), "CHRONO RUN");
  const ammoBefore = Number(await page.locator("#runAmmoValue").textContent());
  await page.locator("#fireButton").click();
  await page.waitForFunction(
    (before) => Number(document.querySelector("#runAmmoValue")?.textContent ?? "0") < before,
    ammoBefore,
  );
  assert.equal(await page.locator("#bossBar").isVisible(), false);
});

test("chrono run hud stays above the hp and ammo meters", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.locator("#startOverlay").click();
  await page.waitForSelector("#runHud:not(.hidden)");

  const layout = await page.evaluate(() => {
    const runHud = document.querySelector("#runHud").getBoundingClientRect();
    const hpMeter = document.querySelector("#hpBar").closest(".meter-row").getBoundingClientRect();
    const ammoMeter = document.querySelector("#ammoBar").closest(".meter-row").getBoundingClientRect();
    return {
      runBottom: runHud.bottom,
      hpTop: hpMeter.top,
      ammoTop: ammoMeter.top,
      runLeft: runHud.left,
      distanceRight: document.querySelector("#distanceReadout").getBoundingClientRect().right,
    };
  });

  assert.ok(layout.runBottom < layout.hpTop - 4);
  assert.ok(layout.runBottom < layout.ammoTop - 4);
  assert.ok(layout.runLeft > layout.distanceRight + 8);
});

test("chrono run hack input does not open the hacking minigame", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.locator("#startOverlay").click();
  await page.waitForSelector("#runHud:not(.hidden)");

  await page.locator("#hackButton").click();
  await page.waitForTimeout(350);

  assert.equal(await page.locator("#hackPanel").isVisible(), false);
  assert.equal(await page.locator("#timerPanel").isVisible(), false);
});

test("chrono run target distance triggers a mothership encounter before boss mode", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${url}?runTargetDistance=12`);
  await page.locator("#startOverlay").click();
  await page.waitForSelector("#runHud:not(.hidden)");

  await page.waitForFunction(
    () => document.querySelector("#damageReadout")?.textContent?.includes("BOSS APPROACH"),
    undefined,
    { timeout: 5000 },
  );
  assert.equal(await page.locator("#runHud").isVisible(), true);

  await page.waitForFunction(
    () =>
      document.querySelector("#runHud")?.classList.contains("hidden") &&
      !document.querySelector("#bossBar")?.parentElement?.classList.contains("hidden"),
    undefined,
    { timeout: 6000 },
  );
  assert.equal(await page.locator("#runHud").isVisible(), false);
  assert.equal(await page.locator("#bossBar").isVisible(), true);
});

test("chrono boss button starts the boss combat intro", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.locator("#chronoBossButton").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });

  assert.equal(await page.locator("#runHud").isVisible(), false);
  assert.equal(await page.locator("#bossBar").isVisible(), true);
  await page.waitForTimeout(1500);
  await page.locator("#spaceCanvas").click({ button: "right" });
  await page.waitForSelector("#hackPanel:not(.hidden)");
});

async function startGame(page) {
  await page.locator("#chronoBossButton").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });
  await page.waitForTimeout(1500);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const executablePath = findSystemBrowser();
    if (!executablePath) {
      throw error;
    }
    return chromium.launch({ executablePath });
  }
}

function findSystemBrowser() {
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((browserPath) => existsSync(browserPath));
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
