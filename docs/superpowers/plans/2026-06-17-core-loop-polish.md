# Core Loop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current prototype into a clear vertical slice where the player understands the hack-to-break-to-burst loop, `CHRONO RUN` has a complete objective loop, and the first screen communicates the game fantasy.

**Architecture:** Keep the current vanilla ESM structure and avoid a broad refactor. Put rule changes in `src/runLogic.js` / `src/gameLogic.js` first, then wire orchestration and presentation in `src/game.js`, `index.html`, and `src/styles.css`. Preserve the existing `node:test` plus Playwright verification style.

**Tech Stack:** HTML, CSS, Canvas 2D, vanilla JavaScript ESM, Node `node:test`, Playwright, `http-server`.

---

## Requirements Summary

- Prioritize `CHRONO BOSS` as the strongest playable demo loop.
- Make the player understand: normal shooting is inefficient, hacking opens a shield break window, break window is the time to fire aggressively.
- Give `CHRONO RUN` a real completion condition using the existing `targetDistance`.
- Improve title and pause/help copy so the game premise is clear before play.
- Keep changes small, testable, and compatible with existing desktop and mobile controls.

## Acceptance Criteria

- `npm test` passes with the existing 38 tests plus the new tests in this plan.
- `CHRONO RUN` reaches a `success` state when `distance >= stage.targetDistance`.
- Browser flow shows a completion prompt when a run succeeds.
- Boss mode gives clear onboarding/readout messages for shield inefficiency, hacking, break window, and burst damage.
- Title screen no longer uses `==TRS Game==`; it presents a concrete game name or premise.
- Pause/help text explains both `CHRONO RUN` and `CHRONO BOSS` without relying only on control labels.
- Mobile viewport still keeps core controls reachable and does not obscure the ship or hack button.

## File Structure

- Modify: `src/runLogic.js`
  - Add complete-run status handling based on `stage.targetDistance`.
- Modify: `src/game.js`
  - Handle `run.status === "success"`.
  - Add first-run Boss guidance using existing `damageReadout`, `toast`, and prompt overlay.
  - Strengthen shield-break feedback without changing combat math.
- Modify: `index.html`
  - Replace prototype title copy and improve help text.
- Modify: `src/styles.css`
  - Tune title screen and any new feedback classes.
- Modify: `tests/runLogic.test.js`
  - Add pure tests for Run completion.
- Modify: `tests/controlOptimization.test.js`
  - Add Playwright tests for title copy and Run/Boss flow cues.
- Modify: `tests/pauseHelp.test.js`
  - Update copy assertions if help text changes.

---

## Phase 1: Lock the Run Completion Rule

### Task 1: Add `CHRONO RUN` success status in pure logic

**Files:**
- Modify: `tests/runLogic.test.js`
- Modify: `src/runLogic.js`

- [ ] **Step 1: Write the failing test**

Add this test near the other `runLogic` objective/status tests in `tests/runLogic.test.js`:

```js
test("run succeeds when the target distance is reached", () => {
  const state = createRunState({
    stage: { targetDistance: 10 },
    distance: 9.8,
    entities: [],
    spawnTimerMs: 100000,
  });

  const next = updateRunState(state, {}, 1000);

  assert.equal(next.status, "success");
  assert.ok(next.distance >= 10);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
node --test tests/runLogic.test.js
```

Expected before implementation: the new test fails because status remains `"running"`.

- [ ] **Step 3: Implement the minimal rule**

In `src/runLogic.js`, update `updateRunState()` after distance is calculated. Preserve existing failure and minigame behavior. The final return should compute `nextDistance`, then set success only when still running:

```js
const nextDistance = next.distance + safeDelta * 0.001 * 24 * speedForDistance;
const nextScore = Math.floor(next.score + safeDelta * 0.001 * 8 * speedForDistance);
const reachedTarget =
  next.status === "running" &&
  next.stage?.objective === "distance" &&
  nextDistance >= next.stage.targetDistance;

return {
  ...next,
  distance: nextDistance,
  score: nextScore,
  status: reachedTarget ? "success" : next.status,
};
```

- [ ] **Step 4: Run logic tests**

Run:

```bash
node --test tests/runLogic.test.js
```

Expected: all `runLogic` tests pass.

- [ ] **Step 5: Commit**

Use Lore protocol:

```bash
git add src/runLogic.js tests/runLogic.test.js
git commit -m "Complete chrono run when target distance is reached

Constraint: Preserve existing run movement, collision, reward, and failure rules.
Confidence: high
Scope-risk: narrow
Tested: node --test tests/runLogic.test.js"
```

---

## Phase 2: Wire Run Completion Into the Browser Game

### Task 2: Show a Run completion prompt

**Files:**
- Modify: `src/game.js`
- Modify: `tests/controlOptimization.test.js`

- [ ] **Step 1: Write a Playwright test for the completion UI**

Because the default `targetDistance` is long for an e2e test, expose a test-only stage override through URL search params. Add this browser test:

```js
test("chrono run shows a completion prompt when the target distance is reached", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${url}?runTargetDistance=8`);
  await page.locator("#startOverlay").click();
  await page.waitForSelector("#runHud:not(.hidden)");
  await page.waitForSelector("#restartOverlay:not(.hidden)", { timeout: 5000 });

  assert.match(await page.locator("#restartOverlay").textContent(), /RUN COMPLETE|突破成功/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/controlOptimization.test.js
```

Expected before implementation: timeout waiting for `#restartOverlay`.

- [ ] **Step 3: Add test-only target distance parsing**

In `src/game.js`, near `chronoRunStage`, add a helper:

```js
function getRunTargetDistanceOverride() {
  const value = Number(new URLSearchParams(window.location.search).get("runTargetDistance"));
  return Number.isFinite(value) && value > 0 ? value : null;
}
```

In `startChronoRun()`, pass the override into `createRunState()`:

```js
const targetDistanceOverride = getRunTargetDistanceOverride();
game.run = createRunState({
  stage: {
    ...chronoRunStage,
    targetDistance: targetDistanceOverride ?? chronoRunStage.targetDistance,
  },
  now,
  entities: [
    { id: "intro-fast", kind: "enemy", type: "fastShooter", lane: 1, z: 0.58, hp: 2 },
    { id: "intro-heavy", kind: "enemy", type: "heavyRammer", lane: 0, z: 0.88, hp: 6 },
    { id: "intro-cache", kind: "item", type: "minigameTrigger", lane: 2, z: 0.96 },
  ],
  spawnTimerMs: 1900,
});
```

- [ ] **Step 4: Handle `game.run.status === "success"`**

In the `update()` branch for `game.mode === "chronoRun"`, add success handling after the minigame and failure checks:

```js
if (game.run.status === "minigame") {
  enterRunMinigame(now);
} else if (game.run.status === "failed") {
  beginRunCrash(now);
} else if (game.run.status === "success") {
  game.mode = "runComplete";
  game.speedPulse = 1;
  showPrompt("RUN COMPLETE", "突破成功 / 點擊返回任務選擇", "returnToTitle");
}
```

Update mode helpers to treat `runComplete` as a run visual mode:

```js
function isRunVisualMode() {
  return ["chronoRunIntro", "chronoRun", "runCrashed", "runComplete"].includes(game.mode);
}
```

Update `activatePromptAction()` so `"returnToTitle"` calls `returnToStartScreen()`.

- [ ] **Step 5: Run browser tests**

Run:

```bash
node --test tests/controlOptimization.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game.js tests/controlOptimization.test.js
git commit -m "Give chrono run a completion prompt

Constraint: Keep the default stage length unchanged for normal play.
Rejected: Shortening the production target distance | would make the test change gameplay tuning.
Confidence: high
Scope-risk: moderate
Tested: node --test tests/controlOptimization.test.js"
```

---

## Phase 3: Clarify the Boss Hack Loop

### Task 3: Add first-session Boss guidance and stronger break feedback

**Files:**
- Modify: `src/game.js`
- Modify: `tests/controlOptimization.test.js`

- [ ] **Step 1: Write a Playwright test for Boss guidance**

Add:

```js
test("chrono boss communicates the hack-to-break loop", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.locator("#chronoBossButton").click();
  await page.locator("#startOverlay").waitFor({ state: "hidden" });
  await page.waitForTimeout(1500);

  assert.match(await page.locator("#damageReadout").textContent(), /HACK|破解|護盾/);

  await page.locator("#spaceCanvas").click({ button: "right" });
  await page.waitForSelector("#hackPanel:not(.hidden)");
  assert.match(await page.locator("#hackStatus").textContent(), /ROUTE ACTIVE|CORE/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
node --test tests/controlOptimization.test.js
```

Expected before implementation: initial `#damageReadout` does not mention hack/shield guidance.

- [ ] **Step 3: Add lightweight guidance state**

In the `game` object in `src/game.js`, add:

```js
tutorialFlags: {
  bossIntroShown: false,
  firstShieldHitShown: false,
  firstBreakShown: false,
},
```

Reset it in `resetGame()`:

```js
game.tutorialFlags = {
  bossIntroShown: false,
  firstShieldHitShown: false,
  firstBreakShown: false,
};
```

- [ ] **Step 4: Show Boss objective after intro**

In `updateIntro()`, when switching to `flight`, set:

```js
if (!game.tutorialFlags.bossIntroShown) {
  game.tutorialFlags.bossIntroShown = true;
  damageReadout.textContent = "HACK SHIELD / THEN BURST";
  setToast("破解護盾後集中火力", 1800);
}
```

- [ ] **Step 5: Show shield inefficiency after first shielded hit**

In `fireWeapon()`, after `recordShieldImpact(...)`, add:

```js
if (hit.shieldActive && !isBossBreakActive() && !game.tutorialFlags.firstShieldHitShown) {
  game.tutorialFlags.firstShieldHitShown = true;
  damageReadout.textContent = "SHIELD ABSORBS FIRE";
  setToast("直接攻擊效率低：先駭入破盾", 1600);
}
```

Keep existing weapon readouts for later shots.

- [ ] **Step 6: Strengthen successful hack feedback**

In `resolveHack("success")`, after setting `game.bossBreakUntil`, add:

```js
if (!game.tutorialFlags.firstBreakShown) {
  game.tutorialFlags.firstBreakShown = true;
  setToast("破盾窗口開啟：立刻開火", 1800);
}
```

Preserve existing `damageReadout.textContent = \`SHIELD BREAK ...\``.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/game.js tests/controlOptimization.test.js
git commit -m "Teach the boss hack break loop in play

Constraint: Use existing HUD/toast surfaces instead of adding a tutorial modal.
Rejected: Blocking tutorial popups | they would interrupt the prototype's action rhythm.
Confidence: medium
Scope-risk: moderate
Tested: npm test"
```

---

## Phase 4: Improve First-Screen Packaging and Help Copy

### Task 4: Replace prototype title copy and update help text

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `tests/pauseHelp.test.js`
- Modify: `tests/controlOptimization.test.js`

- [ ] **Step 1: Write copy tests**

In `tests/controlOptimization.test.js`, add:

```js
test("title screen presents the game premise instead of prototype placeholder copy", async (t) => {
  const { server, url } = await startStaticServer();
  t.after(() => server.close());

  const browser = await launchBrowser();
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);

  const titleText = await page.locator("#startOverlay").textContent();
  assert.doesNotMatch(titleText, /==TRS Game==/);
  assert.match(titleText, /HACK|駭|破解|MOTHERSHIP|母艦/);
  assert.match(titleText, /CHRONO RUN/);
  assert.match(titleText, /CHRONO BOSS/);
});
```

- [ ] **Step 2: Update `index.html` title screen**

Replace:

```html
<strong>==TRS Game==</strong>
<span>TAP to Start</span>
```

With:

```html
<strong>CHRONO BREACH</strong>
<span>駭入母艦護盾，抓住破盾窗口反擊</span>
```

Keep the two existing mode buttons.

- [ ] **Step 3: Update pause/help copy**

Revise `data-testid="game-help-summary"` to:

```html
在 CHRONO BOSS 中先破解護盾，再趁破盾窗口集中火力；在 CHRONO RUN 中穿越三軌時空航道，收集快取節點取得獎勵。
```

Update the operation list only if needed. Keep the current keyboard mappings: move `4 / 6`, fire `0`, switch weapon `Delete / .`, hack `+`, hack grid `8 / 2 / 4 / 6`.

- [ ] **Step 4: Adjust tests that assert help copy**

In `tests/pauseHelp.test.js`, replace outdated copy assertions with:

```js
assert.match(await overlay.textContent(), /遊戲說明/);
assert.match(await overlay.textContent(), /操作說明/);
assert.match(await overlay.textContent(), /CHRONO BOSS/);
assert.match(await overlay.textContent(), /CHRONO RUN/);
assert.match(await overlay.textContent(), /破解護盾|破盾窗口/);
```

- [ ] **Step 5: Tune title styling only if text overflows**

If the new title/subtitle wraps poorly, adjust `.start-overlay strong` and `.start-overlay span` in `src/styles.css` by reducing the max title size:

```css
.start-overlay strong {
  font-size: clamp(2rem, 5.4vw, 4.7rem);
}

.start-overlay span {
  max-width: min(34rem, 78vw);
  line-height: 1.35;
}
```

- [ ] **Step 6: Run copy/browser tests**

Run:

```bash
node --test tests/pauseHelp.test.js tests/controlOptimization.test.js
```

Expected: title and help tests pass on desktop and mobile.

- [ ] **Step 7: Commit**

```bash
git add index.html src/styles.css tests/pauseHelp.test.js tests/controlOptimization.test.js
git commit -m "Replace prototype copy with the game premise

Constraint: Keep the existing two-mode title flow.
Rejected: Adding a lore-heavy intro screen | too much interruption for the current prototype.
Confidence: high
Scope-risk: narrow
Tested: node --test tests/pauseHelp.test.js tests/controlOptimization.test.js"
```

---

## Phase 5: Visual and Mobile Verification Pass

### Task 5: Verify the polished vertical slice

**Files:**
- Modify only if verification finds layout bugs: `src/styles.css` or `src/game.js`

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
```

Expected:

```text
pass 40+ tests
fail 0
```

- [ ] **Step 2: Start the local server**

Run:

```bash
npm start
```

Expected:

```text
Starting up http-server, serving .
Available on:
  http://127.0.0.1:4173
```

- [ ] **Step 3: Desktop smoke check**

Open:

```text
http://127.0.0.1:4173
```

Verify:

- Title communicates `CHRONO BREACH` premise.
- `CHRONO BOSS` starts into Boss mode.
- First Boss readout tells the player to hack shield / burst.
- Right-click or `HACK` opens the hack board.
- Successful hack shows a break-window message.
- Firing during break visibly damages Boss.

- [ ] **Step 4: Mobile viewport smoke check**

Use Playwright or browser devtools at `390x844`.

Verify:

- Top HUD text does not cover the ship.
- Fire, left/right, weapon, and hack controls are reachable.
- Hack button remains visible.
- New title subtitle does not overflow.

- [ ] **Step 5: Add a final verification note**

Create or update a short note in `docs/verification-core-loop-polish.md`:

```md
# Core Loop Polish Verification

- Date: 2026-06-17
- Automated: `npm test`
- Desktop smoke: title, boss, hack, break, run completion
- Mobile smoke: 390x844 controls and HUD
- Known gaps:
  - Audio feedback not yet implemented.
  - Boss tuning still needs player timing data.
```

- [ ] **Step 6: Commit verification note**

```bash
git add docs/verification-core-loop-polish.md
git commit -m "Record core loop polish verification

Constraint: Verification is manual plus automated because this prototype is highly visual.
Confidence: medium
Scope-risk: narrow
Tested: npm test; desktop smoke; mobile smoke
Not-tested: audio feedback and long-session balance"
```

---

## Risks and Mitigations

- Risk: Tutorial text becomes intrusive.
  - Mitigation: Use existing `toast` and `damageReadout`, not blocking modal tutorials.
- Risk: Run completion test changes production tuning.
  - Mitigation: Keep production `targetDistance: 1200`; use URL param only for e2e acceleration.
- Risk: `game.js` is already large.
  - Mitigation: Avoid broad extraction during this polish pass. If a later pass adds more tutorial states, split copy/state helpers into a focused module.
- Risk: Mobile HUD gets more crowded after copy changes.
  - Mitigation: Verify `390x844`; reduce title subtitle max width and keep HUD copy short.

## Verification Steps

Run in this order:

```bash
node --test tests/runLogic.test.js
node --test tests/controlOptimization.test.js
node --test tests/pauseHelp.test.js
npm test
```

Then run a browser smoke check:

```bash
npm start
```

Use:

```text
http://127.0.0.1:4173
```

## Suggested Execution Order

1. Phase 1 first, because it locks the missing Run completion rule.
2. Phase 2 second, because browser completion depends on Phase 1.
3. Phase 3 third, because Boss loop guidance is the highest-value gameplay clarity improvement.
4. Phase 4 fourth, because copy should reflect the final interaction loop.
5. Phase 5 last, because it validates both automated and visual outcomes.

## Self-Review

- Spec coverage: Covers Boss loop clarity, Run completeness, first-screen packaging, help copy, verification.
- Placeholder scan: No `TBD`, `TODO`, or unspecified test steps remain.
- Type consistency: Uses existing `status`, `stage.targetDistance`, `showPrompt()`, `damageReadout`, `toast`, and Playwright helpers already present in the repo.
