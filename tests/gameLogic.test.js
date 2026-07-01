import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  MIN_BOARD_SIZE,
  applyShieldedBossDamage,
  applyPlayerDamage,
  calculateSonicBoomWaveGeometry,
  createInitialHackState,
  createRandomHackBoard,
  formatHackBreakBonus,
  getBossHackBoardConfig,
  getRunHackReward,
  mapFlightInput,
  mapHackInput,
  resolveBossHackOutcome,
  shouldDrawBossBeam,
  shouldAdvancePromptFromKey,
  moveHackCursor,
  resolveHackBreakDuration,
  updateHackTimer,
} from "../src/gameLogic.js";

test("sonic boom waves expand backward from the ship nose", () => {
  const early = calculateSonicBoomWaveGeometry({
    shipWidth: 220,
    shipHeight: 150,
    progress: 0,
    index: 0,
  });
  const late = calculateSonicBoomWaveGeometry({
    shipWidth: 220,
    shipHeight: 150,
    progress: 0.82,
    index: 0,
  });

  assert.ok(early.y < 0);
  assert.ok(late.y > early.y);
  assert.ok(late.y > 0);
  assert.ok(late.width > early.width);
});

test("boss beam only draws during boss combat modes", () => {
  assert.equal(shouldDrawBossBeam({ mode: "flight", bossMode: "beam" }), true);
  assert.equal(shouldDrawBossBeam({ mode: "hack", bossMode: "beam" }), true);
  assert.equal(shouldDrawBossBeam({ mode: "chronoRun", bossMode: "beam" }), false);
  assert.equal(shouldDrawBossBeam({ mode: "chronoRunIntro", bossMode: "beam" }), false);
  assert.equal(shouldDrawBossBeam({ mode: "motherShipEncounter", bossMode: "beam" }), false);
  assert.equal(shouldDrawBossBeam({ mode: "flight", bossMode: "normal" }), false);
});

test("hack board is a 6x6 grid with cursor starting on START", () => {
  const state = createInitialHackState();

  assert.equal(state.board.length, BOARD_SIZE);
  assert.equal(state.board.every((row) => row.length === BOARD_SIZE), true);
  assert.deepEqual(state.cursor, state.start);
  assert.equal(state.status, "running");
});

test("cursor moves one orthogonal cell and cannot enter blocks or leave the board", () => {
  let state = createInitialHackState({
    board: [
      ["start", "empty", "block", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "core"],
    ],
  });

  state = moveHackCursor(state, "left");
  assert.deepEqual(state.cursor, { row: 0, col: 0 });

  state = moveHackCursor(state, "right");
  assert.deepEqual(state.cursor, { row: 0, col: 1 });

  state = moveHackCursor(state, "right");
  assert.deepEqual(state.cursor, { row: 0, col: 1 });
});

test("touching a trap fails the hack and reaching the core succeeds", () => {
  const trapState = createInitialHackState({
    board: [
      ["start", "trap", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "core"],
    ],
  });

  assert.equal(moveHackCursor(trapState, "right").status, "failed");

  let coreState = createInitialHackState({
    board: [
      ["start", "core", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
    ],
  });

  coreState = moveHackCursor(coreState, "right");
  assert.equal(coreState.status, "success");
});

test("boost nodes are counted when routing through the hack board", () => {
  let state = createInitialHackState({
    board: [
      ["start", "boost", "core", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty", "empty", "empty"],
    ],
  });

  state = moveHackCursor(state, "right");
  state = moveHackCursor(state, "right");

  assert.equal(state.boostsCollected, 1);
  assert.equal(state.status, "success");
});

test("weapon nodes are counted once when routing through the hack board", () => {
  let state = createInitialHackState({
    board: [
      ["start", "weapon", "weapon", "core"],
      ["empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty"],
      ["empty", "empty", "empty", "empty"],
    ],
  });

  state = moveHackCursor(state, "right");
  state = moveHackCursor(state, "left");
  state = moveHackCursor(state, "right");
  state = moveHackCursor(state, "right");

  assert.equal(state.weaponsCollected, 2);
  assert.equal(state.status, "running");
});

test("hack success opens a break window that grows by one second per boost", () => {
  assert.equal(resolveHackBreakDuration({ boostsCollected: 0 }), 8000);
  assert.equal(resolveHackBreakDuration({ boostsCollected: 1 }), 9000);
  assert.equal(resolveHackBreakDuration({ boostsCollected: 3 }), 11000);
  assert.equal(resolveHackBreakDuration({ boostsCollected: 8 }), 12000);
  assert.equal(formatHackBreakBonus(0), "+0.0s BREAK");
  assert.equal(formatHackBreakBonus(2), "+2.0s BREAK");
});

test("run hack reward defaults to speed boost only", () => {
  assert.equal(getRunHackReward(), "speedBoost");
  assert.equal(getRunHackReward(99), "speedBoost");
});

test("boss hack outcome changes by boss phase", () => {
  const charging = resolveBossHackOutcome({
    bossMode: "charging",
    now: 1000,
    baseBreakDuration: 8000,
    currentBreakUntil: 0,
  });
  assert.equal(charging.nextBossMode, "cooldown");
  assert.equal(charging.resetBossModeTimer, true);
  assert.equal(charging.breakUntil, 9000);
  assert.equal(charging.interruptedAttack, true);

  const beam = resolveBossHackOutcome({
    bossMode: "beam",
    now: 2000,
    baseBreakDuration: 8000,
    currentBreakUntil: 0,
  });
  assert.equal(beam.nextBossMode, "cooldown");
  assert.equal(beam.interruptedAttack, true);
  assert.equal(beam.breakUntil, 10000);

  const cooldown = resolveBossHackOutcome({
    bossMode: "cooldown",
    now: 1000,
    baseBreakDuration: 8000,
    currentBreakUntil: 5000,
  });
  assert.equal(cooldown.nextBossMode, "cooldown");
  assert.equal(cooldown.resetBossModeTimer, false);
  assert.equal(cooldown.breakUntil, 13000);
  assert.equal(cooldown.extendedCooldownBreak, true);
});

test("boss hack board config varies by boss phase", () => {
  const normal = getBossHackBoardConfig({ bossMode: "normal", hackLevel: 2 });
  const charging = getBossHackBoardConfig({ bossMode: "charging", hackLevel: 2 });
  const cooldown = getBossHackBoardConfig({ bossMode: "cooldown", hackLevel: 2 });

  assert.equal(normal.size, 6);
  assert.equal(normal.weaponCount, 1);
  assert.equal(charging.variant, "interrupt");
  assert.equal(charging.size <= normal.size, true);
  assert.equal(charging.trapMode, "none");
  assert.equal(charging.weaponCount, 0);
  assert.equal(cooldown.variant, "exploit");
  assert.equal(cooldown.weaponCount, 2);
  assert.ok(cooldown.extraOffRouteBoosts > normal.extraOffRouteBoosts);
});

test("random hack board can produce phase-specific node mixes", () => {
  const interruptBoard = createRandomHackBoard({
    size: 5,
    trapMode: "none",
    weaponCount: 0,
    random: makeRandom([0.2, 0.7, 0.1, 0.9, 0.35]),
  });
  const exploitBoard = createRandomHackBoard({
    size: 6,
    weaponCount: 2,
    extraOffRouteBoosts: 2,
    routeBoostLimit: 3,
    random: makeRandom([0.2, 0.7, 0.1, 0.9, 0.35]),
  });

  assert.equal(interruptBoard.flat().filter((node) => node === "trap").length, 0);
  assert.equal(interruptBoard.flat().filter((node) => node === "weapon").length, 0);
  assert.equal(exploitBoard.flat().filter((node) => node === "weapon").length, 2);
  assert.ok(exploitBoard.flat().filter((node) => node === "boost").length >= 4);
});

test("player damage spends one ship only when hp reaches zero", () => {
  const scratched = applyPlayerDamage({ hp: 100, lives: 3, damage: 12 });
  assert.equal(scratched.hp, 88);
  assert.equal(scratched.lives, 3);
  assert.equal(scratched.outcome, "alive");

  const lostShip = applyPlayerDamage({ hp: 10, lives: 3, damage: 18 });
  assert.equal(lostShip.hp, 0);
  assert.equal(lostShip.lives, 2);
  assert.equal(lostShip.outcome, "continue");

  const gameOver = applyPlayerDamage({ hp: 8, lives: 1, damage: 12 });
  assert.equal(gameOver.hp, 0);
  assert.equal(gameOver.lives, 0);
  assert.equal(gameOver.outcome, "gameover");
});

test("boss shield splits normal damage into cancel, shield, and hull portions", () => {
  const shieldedHit = applyShieldedBossDamage({
    bossHp: 180,
    bossShieldHp: 30,
    baseDamage: 100,
  });

  assert.equal(shieldedHit.bossHp, 172);
  assert.equal(shieldedHit.bossShieldHp, 0);
  assert.equal(shieldedHit.canceledDamage, 47);
  assert.equal(shieldedHit.shieldDamage, 30);
  assert.equal(shieldedHit.hullDamage, 8);
  assert.equal(shieldedHit.shieldBroken, true);
});

test("break state damage is less shielded and broken shield exposes full hull damage", () => {
  const breakHit = applyShieldedBossDamage({
    bossHp: 180,
    bossShieldHp: 90,
    baseDamage: 100,
    damageProfile: "break",
  });

  assert.equal(breakHit.bossHp, 145);
  assert.equal(breakHit.bossShieldHp, 25);
  assert.equal(breakHit.canceledDamage, 0);
  assert.equal(breakHit.shieldDamage, 65);
  assert.equal(breakHit.hullDamage, 35);

  const exposedHit = applyShieldedBossDamage({
    bossHp: 170,
    bossShieldHp: 0,
    baseDamage: 100,
  });

  assert.equal(exposedHit.bossHp, 70);
  assert.equal(exposedHit.bossShieldHp, 0);
  assert.equal(exposedHit.canceledDamage, 0);
  assert.equal(exposedHit.shieldDamage, 0);
  assert.equal(exposedHit.hullDamage, 100);
});

test("timer expiry fails an unresolved hack", () => {
  const state = createInitialHackState({ now: 1000 });

  assert.equal(updateHackTimer(state, 5999).status, "running");
  assert.equal(updateHackTimer(state, 6000).status, "failed");
});

test("random hack boards keep one start, one core, boosts, traps, and a valid route", () => {
  const board = createRandomHackBoard({ random: makeRandom([0.2, 0.7, 0.1, 0.9, 0.35]) });
  const cells = board.flat();

  assert.equal(board.length, BOARD_SIZE);
  assert.equal(board.every((row) => row.length === BOARD_SIZE), true);
  assert.equal(cells.filter((node) => node === "start").length, 1);
  assert.equal(cells.filter((node) => node === "core").length, 1);
  assert.equal(cells.filter((node) => node === "weapon").length, 1);
  assert.equal(cells.filter((node) => node === "boost").length >= 2, true);
  assert.equal(cells.filter((node) => node === "trap").length >= 2, true);
  assert.equal(hasPath(board), true);
});

test("early hack board is 4x4 with a weapon node and no traps", () => {
  const board = createRandomHackBoard({
    size: MIN_BOARD_SIZE,
    random: makeRandom([0.2, 0.7, 0.1, 0.9, 0.35]),
  });
  const cells = board.flat();

  assert.equal(board.length, MIN_BOARD_SIZE);
  assert.equal(board.every((row) => row.length === MIN_BOARD_SIZE), true);
  assert.equal(cells.filter((node) => node === "weapon").length, 1);
  assert.equal(cells.filter((node) => node === "trap").length, 0);
  assert.equal(hasPath(board), true);
});

test("random hack board generation produces different layouts from different random streams", () => {
  const first = createRandomHackBoard({ random: makeRandom([0.1, 0.1, 0.1, 0.1, 0.1]) });
  const second = createRandomHackBoard({ random: makeRandom([0.8, 0.6, 0.4, 0.2, 0.9]) });

  assert.notDeepEqual(first, second);
});

test("flight controls support arrows and numpad keys", () => {
  assert.equal(mapFlightInput({ key: "ArrowLeft", code: "ArrowLeft" }), "moveLeft");
  assert.equal(mapFlightInput({ key: "ArrowRight", code: "ArrowRight" }), "moveRight");
  assert.equal(mapFlightInput({ key: "4", code: "Numpad4" }), "moveLeft");
  assert.equal(mapFlightInput({ key: "6", code: "Numpad6" }), "moveRight");
  assert.equal(mapFlightInput({ key: "0", code: "Numpad0" }), "fire");
  assert.equal(mapFlightInput({ key: "Delete", code: "Delete" }), "switchWeapon");
  assert.equal(mapFlightInput({ key: ".", code: "Period" }), "switchWeapon");
  assert.equal(mapFlightInput({ key: ".", code: "NumpadDecimal" }), "switchWeapon");
  assert.equal(mapFlightInput({ key: "+", code: "NumpadAdd" }), "hack");
  assert.equal(mapFlightInput({ key: "-", code: "Minus" }), "pause");
  assert.equal(mapFlightInput({ key: "-", code: "NumpadSubtract" }), "pause");
});

test("prompt keyboard advance accepts gameplay keys but ignores escape and modifiers", () => {
  assert.equal(shouldAdvancePromptFromKey({ key: "ArrowLeft", code: "ArrowLeft" }), true);
  assert.equal(shouldAdvancePromptFromKey({ key: "0", code: "Numpad0" }), true);
  assert.equal(shouldAdvancePromptFromKey({ key: "+", code: "NumpadAdd" }), true);
  assert.equal(shouldAdvancePromptFromKey({ key: "a", code: "KeyA" }), true);
  assert.equal(shouldAdvancePromptFromKey({ key: "Escape", code: "Escape" }), false);
  assert.equal(shouldAdvancePromptFromKey({ key: "Shift", code: "ShiftLeft" }), false);
});

test("hack controls keep arrow-key grid movement", () => {
  assert.equal(mapHackInput({ key: "ArrowUp", code: "ArrowUp" }), "up");
  assert.equal(mapHackInput({ key: "ArrowDown", code: "ArrowDown" }), "down");
  assert.equal(mapHackInput({ key: "ArrowLeft", code: "ArrowLeft" }), "left");
  assert.equal(mapHackInput({ key: "ArrowRight", code: "ArrowRight" }), "right");
  assert.equal(mapHackInput({ key: "8", code: "Numpad8" }), "up");
  assert.equal(mapHackInput({ key: "2", code: "Numpad2" }), "down");
  assert.equal(mapHackInput({ key: "4", code: "Numpad4" }), "left");
  assert.equal(mapHackInput({ key: "6", code: "Numpad6" }), "right");
});

function makeRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function hasPath(board) {
  const start = findCell(board, "start");
  const core = findCell(board, "core");
  const queue = [start];
  const visited = new Set([`${start.row},${start.col}`]);
  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.row === core.row && current.col === core.col) {
      return true;
    }

    for (const direction of directions) {
      const next = {
        row: current.row + direction.row,
        col: current.col + direction.col,
      };
      const key = `${next.row},${next.col}`;
      if (
        next.row < 0 ||
        next.row >= board.length ||
        next.col < 0 ||
        next.col >= board[0].length ||
        visited.has(key) ||
        board[next.row][next.col] === "block" ||
        board[next.row][next.col] === "trap"
      ) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }

  return false;
}

function findCell(board, nodeType) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] === nodeType) {
        return { row, col };
      }
    }
  }
  throw new Error(`Missing ${nodeType}`);
}
