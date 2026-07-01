export const DEFAULT_BOARD_SIZE = 6;
export const BOARD_SIZE = DEFAULT_BOARD_SIZE;
export const MIN_BOARD_SIZE = 4;
export const MAX_BOARD_SIZE = 7;
export const HACK_DURATION_MS = 5000;

export const NODE_LABELS = {
  start: "S",
  core: "CORE",
  boost: "+",
  weapon: "W",
  trap: "!",
  block: "X",
  empty: "",
};

export const DEFAULT_BOARD = [
  ["start", "empty", "empty", "empty", "trap", "empty"],
  ["empty", "empty", "boost", "empty", "empty", "empty"],
  ["empty", "empty", "empty", "empty", "boost", "empty"],
  ["empty", "boost", "empty", "core", "empty", "empty"],
  ["empty", "empty", "empty", "empty", "trap", "empty"],
  ["block", "empty", "boost", "empty", "empty", "empty"],
];

const DIRECTIONS = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function cloneBoard(board = DEFAULT_BOARD) {
  return board.map((row) => [...row]);
}

export function createInitialHackState({ board = DEFAULT_BOARD, now = 0 } = {}) {
  const clonedBoard = cloneBoard(board);
  const start = findNode(clonedBoard, "start");
  const core = findNode(clonedBoard, "core");

  return {
    board: clonedBoard,
    start,
    core,
    cursor: { ...start },
    path: [{ ...start }],
    boostsCollected: 0,
    weaponsCollected: 0,
    status: "running",
    startedAt: now,
    expiresAt: now + HACK_DURATION_MS,
  };
}

export function createRandomHackBoard({
  random = Math.random,
  size = DEFAULT_BOARD_SIZE,
  trapMode = "auto",
  routeBoostLimit = 2,
  extraOffRouteBoosts = 0,
  weaponCount = 1,
} = {}) {
  const boardSize = clamp(Math.round(size), MIN_BOARD_SIZE, MAX_BOARD_SIZE);
  const board = Array.from({ length: boardSize }, () =>
    Array.from({ length: boardSize }, () => "empty"),
  );
  const start = { row: randomInt(random, 0, boardSize - 1), col: 0 };
  const core = { row: randomInt(random, 0, boardSize - 1), col: boardSize - 1 };
  const route = buildRoute(start, core, random);
  const routeKeys = new Set(route.map(pointKey));

  board[start.row][start.col] = "start";
  board[core.row][core.col] = "core";

  const routeRewardCells = route
    .slice(1, -1)
    .filter((point) => board[point.row][point.col] === "empty");
  const shuffledRewardCells = shuffle(routeRewardCells, random);
  for (let index = 0; index < Math.max(0, weaponCount); index += 1) {
    const weaponCell = shuffledRewardCells.shift();
    if (!weaponCell) {
      break;
    }
    board[weaponCell.row][weaponCell.col] = "weapon";
  }
  shuffledRewardCells
    .slice(0, Math.min(Math.max(0, routeBoostLimit), shuffledRewardCells.length))
    .forEach((point) => {
      board[point.row][point.col] = "boost";
    });

  const offRouteCells = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      const point = { row, col };
      if (!routeKeys.has(pointKey(point))) {
        offRouteCells.push(point);
      }
    }
  }

  shuffle(offRouteCells, random);
  const difficulty = Math.max(0, boardSize - MIN_BOARD_SIZE);
  placeNodes(board, offRouteCells, "block", 1 + difficulty + randomInt(random, 0, 1));
  if (trapMode !== "none" && boardSize > MIN_BOARD_SIZE) {
    placeNodes(board, offRouteCells, "trap", difficulty + randomInt(random, 0, 1));
  }
  placeNodes(
    board,
    offRouteCells,
    "boost",
    1 + difficulty + randomInt(random, 0, 1) + Math.max(0, extraOffRouteBoosts),
  );

  return board;
}

export function findNode(board, nodeType) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] === nodeType) {
        return { row, col };
      }
    }
  }
  throw new Error(`Board is missing ${nodeType}`);
}

export function moveHackCursor(state, direction) {
  if (state.status !== "running") {
    return state;
  }

  const delta = DIRECTIONS[direction];
  if (!delta) {
    return state;
  }

  const next = {
    row: state.cursor.row + delta.row,
    col: state.cursor.col + delta.col,
  };

  if (!isInsideBoard(next, state.board) || getNode(state.board, next) === "block") {
    return state;
  }

  const nextNode = getNode(state.board, next);
  const hasVisitedBoost = state.path.some(
    (point) => point.row === next.row && point.col === next.col,
  );
  const boostsCollected =
    nextNode === "boost" && !hasVisitedBoost
      ? state.boostsCollected + 1
      : state.boostsCollected;
  const hasVisitedWeapon = state.path.some(
    (point) => point.row === next.row && point.col === next.col,
  );
  const weaponsCollected =
    nextNode === "weapon" && !hasVisitedWeapon
      ? state.weaponsCollected + 1
      : state.weaponsCollected;
  const status =
    nextNode === "trap" ? "failed" : nextNode === "core" ? "success" : "running";

  return {
    ...state,
    cursor: next,
    path: [...state.path, next],
    boostsCollected,
    weaponsCollected,
    status,
  };
}

export function updateHackTimer(state, now) {
  if (state.status !== "running" || now < state.expiresAt) {
    return state;
  }

  return {
    ...state,
    status: "failed",
  };
}

export function resolveHackBreakDuration({ boostsCollected = 0 } = {}) {
  return Math.min(12000, 8000 + Math.max(0, boostsCollected) * 1000);
}

export function formatHackBreakBonus(boostsCollected = 0) {
  return `+${Math.max(0, boostsCollected).toFixed(1)}s BREAK`;
}

export function getRunHackReward() {
  return "speedBoost";
}

export function getBossHackBoardConfig({
  bossMode = "normal",
  hackLevel = 0,
  minSize = MIN_BOARD_SIZE,
  maxSize = MAX_BOARD_SIZE,
} = {}) {
  const baseSize = clamp(minSize + Math.max(0, hackLevel), minSize, maxSize);
  if (bossMode === "charging" || bossMode === "beam") {
    return {
      variant: "interrupt",
      size: Math.min(baseSize, minSize + 1),
      trapMode: "none",
      routeBoostLimit: 1,
      extraOffRouteBoosts: 0,
      weaponCount: 0,
    };
  }
  if (bossMode === "cooldown") {
    return {
      variant: "exploit",
      size: baseSize,
      trapMode: "auto",
      routeBoostLimit: 3,
      extraOffRouteBoosts: 2,
      weaponCount: 2,
    };
  }
  return {
    variant: "break",
    size: baseSize,
    trapMode: "auto",
    routeBoostLimit: 2,
    extraOffRouteBoosts: 0,
    weaponCount: 1,
  };
}

export function resolveBossHackOutcome({
  bossMode = "normal",
  now = 0,
  baseBreakDuration = 0,
  currentBreakUntil = 0,
} = {}) {
  const duration = Math.max(0, baseBreakDuration);
  if (bossMode === "charging" || bossMode === "beam") {
    return {
      nextBossMode: "cooldown",
      resetBossModeTimer: true,
      breakUntil: now + duration,
      interruptedAttack: true,
      extendedCooldownBreak: false,
    };
  }
  if (bossMode === "cooldown") {
    return {
      nextBossMode: "cooldown",
      resetBossModeTimer: false,
      breakUntil: Math.max(now, currentBreakUntil) + duration,
      interruptedAttack: false,
      extendedCooldownBreak: true,
    };
  }
  return {
    nextBossMode: bossMode,
    resetBossModeTimer: false,
    breakUntil: Math.max(currentBreakUntil, now + duration),
    interruptedAttack: false,
    extendedCooldownBreak: false,
  };
}

export function applyPlayerDamage({ hp = 100, lives = 3, damage = 0 } = {}) {
  const nextHp = Math.max(0, hp - Math.max(0, damage));
  if (nextHp > 0) {
    return {
      hp: nextHp,
      lives,
      outcome: "alive",
    };
  }

  const nextLives = Math.max(0, lives - 1);
  return {
    hp: 0,
    lives: nextLives,
    outcome: nextLives > 0 ? "continue" : "gameover",
  };
}

export function applyShieldedBossDamage({
  bossHp = 180,
  bossShieldHp = 0,
  baseDamage = 0,
  damageProfile = "normal",
} = {}) {
  const incomingDamage = Math.max(0, baseDamage);
  const shieldBefore = Math.max(0, bossShieldHp);
  const profile =
    damageProfile === "break" || damageProfile === "hack"
      ? { shield: 0.65, hull: 0.35, cancel: 0 }
      : { shield: 0.45, hull: 0.08, cancel: 0.47 };
  const shieldActive = shieldBefore > 0;
  const rawShieldDamage = shieldActive ? incomingDamage * profile.shield : 0;
  const shieldDamage = Math.min(shieldBefore, rawShieldDamage);
  const nextBossShieldHp = Math.max(0, shieldBefore - shieldDamage);
  const hullDamage = shieldActive ? incomingDamage * profile.hull : incomingDamage;
  const canceledDamage = shieldActive ? incomingDamage * profile.cancel : 0;

  return {
    bossHp: Math.max(0, bossHp - hullDamage),
    bossShieldHp: nextBossShieldHp,
    displayDamage: hullDamage > 0 ? hullDamage : shieldDamage,
    hullDamage,
    shieldDamage,
    shieldBefore,
    canceledDamage,
    shieldActive,
    shieldBroken: shieldBefore > 0 && nextBossShieldHp <= 0,
  };
}

export function randomBoostMultiplier(random = Math.random) {
  return 10 + Math.floor(clamp(random(), 0, 0.999999) * 21);
}

export function calculateSonicBoomWaveGeometry({
  shipWidth,
  shipHeight,
  progress,
  index = 0,
} = {}) {
  const safeWidth = Math.max(0, shipWidth ?? 0);
  const safeHeight = Math.max(0, shipHeight ?? 0);
  const pulse = clamp(progress ?? 0, 0, 1);
  const offsetProgress = clamp(pulse + index * 0.22, 0, 1);
  return {
    progress: offsetProgress,
    y: safeHeight * (-0.62 + offsetProgress * 1.32),
    width: safeWidth * (0.34 + offsetProgress * 0.98),
    height: safeHeight * (0.08 + offsetProgress * 0.18),
  };
}

export function shouldDrawBossBeam({ mode, bossMode } = {}) {
  return bossMode === "beam" && (mode === "flight" || mode === "hack");
}

export function mapFlightInput(eventLike) {
  const key = eventLike?.key;
  const code = eventLike?.code;

  if (key === "ArrowLeft" || code === "Numpad4" || key === "4") {
    return "moveLeft";
  }
  if (key === "ArrowRight" || code === "Numpad6" || key === "6") {
    return "moveRight";
  }
  if (key === "Alt" || code === "Numpad0" || key === "0") {
    return "fire";
  }
  if (
    key === "Delete" ||
    key === "Del" ||
    key === "." ||
    code === "Delete" ||
    code === "Period" ||
    code === "NumpadDecimal"
  ) {
    return "switchWeapon";
  }
  if (key === "Control" || code === "NumpadAdd" || key === "+") {
    return "hack";
  }
  if (key === "-" || code === "Minus" || code === "NumpadSubtract") {
    return "pause";
  }

  return null;
}

export function mapHackInput(eventLike) {
  const key = eventLike?.key;
  const code = eventLike?.code;

  if (key === "ArrowUp" || code === "Numpad8" || key === "8") {
    return "up";
  }
  if (key === "ArrowDown" || code === "Numpad2" || key === "2") {
    return "down";
  }
  if (key === "ArrowLeft" || code === "Numpad4" || key === "4") {
    return "left";
  }
  if (key === "ArrowRight" || code === "Numpad6" || key === "6") {
    return "right";
  }

  return null;
}

export function shouldAdvancePromptFromKey(eventLike) {
  if (!eventLike || eventLike.repeat) {
    return false;
  }

  const key = eventLike.key ?? "";
  const ignoredKeys = new Set(["Escape", "Shift", "Meta", "CapsLock", "Tab"]);
  if (ignoredKeys.has(key)) {
    return false;
  }

  return key.length > 0;
}

function buildRoute(start, core, random) {
  const route = [{ ...start }];
  const current = { ...start };

  while (current.col !== core.col || current.row !== core.row) {
    const canMoveRight = current.col < core.col;
    const needsVertical = current.row !== core.row;
    const shouldMoveRight = canMoveRight && (!needsVertical || random() < 0.62);

    if (shouldMoveRight) {
      current.col += 1;
    } else if (needsVertical) {
      current.row += Math.sign(core.row - current.row);
    } else {
      current.col += 1;
    }
    route.push({ ...current });
  }

  return route;
}

function placeNodes(board, cells, nodeType, count) {
  let placed = 0;
  while (cells.length > 0 && placed < count) {
    const point = cells.shift();
    if (board[point.row][point.col] !== "empty") {
      continue;
    }
    board[point.row][point.col] = nodeType;
    placed += 1;
  }
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(random, 0, index);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function randomInt(random, min, max) {
  return min + Math.floor(clamp(random(), 0, 0.999999) * (max - min + 1));
}

function pointKey(point) {
  return `${point.row},${point.col}`;
}

function getNode(board, point) {
  return board[point.row][point.col];
}

function isInsideBoard(point, board) {
  return (
    point.row >= 0 &&
    point.row < board.length &&
    point.col >= 0 &&
    point.col < board[0].length
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
