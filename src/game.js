import {
  HACK_DURATION_MS,
  NODE_LABELS,
  applyPlayerDamage,
  applyShieldedBossDamage,
  createInitialHackState,
  createRandomHackBoard,
  mapFlightInput,
  mapHackInput,
  moveHackCursor,
  randomBoostMultiplier,
  resolveHackBreakDuration,
  shouldAdvancePromptFromKey,
  updateHackTimer,
} from "./gameLogic.js";
import {
  RUN_BASE_SPEED,
  applyRunReward,
  applyRunShot,
  createRunState,
  updateRunState,
} from "./runLogic.js";

const canvas = document.querySelector("#spaceCanvas");
const ctx = canvas.getContext("2d");
const shipImage = new Image();
shipImage.src = new URL("../public/assets/ship-player.png", import.meta.url).href;
const bossImage = new Image();
bossImage.src = new URL("../public/assets/boss-mothership.png", import.meta.url).href;
const hpBar = document.querySelector("#hpBar");
const ammoBar = document.querySelector("#ammoBar");
const distanceReadout = document.querySelector("#distanceReadout");
const bossBar = document.querySelector("#bossBar");
const bossShieldBar = document.querySelector("#bossShieldBar");
const damageReadout = document.querySelector("#damageReadout");
const feverPanel = document.querySelector("#feverPanel");
const feverValue = document.querySelector("#feverValue");
const startOverlay = document.querySelector("#startOverlay");
const chronoRunButton = document.querySelector("#chronoRunButton");
const chronoBossButton = document.querySelector("#chronoBossButton");
const timerPanel = document.querySelector("#timerPanel");
const timerValue = document.querySelector("#timerValue");
const runHud = document.querySelector("#runHud");
const runObjective = document.querySelector("#runObjective");
const runStatusText = document.querySelector("#runStatusText");
const runSpeedValue = document.querySelector("#runSpeedValue");
const runDistanceValue = document.querySelector("#runDistanceValue");
const runAmmoValue = document.querySelector("#runAmmoValue");
const hackPanel = document.querySelector("#hackPanel");
const hackGrid = document.querySelector("#hackGrid");
const hackStatus = document.querySelector("#hackStatus");
const routeStats = document.querySelector("#routeStats");
const boostCounter = document.querySelector("#boostCounter");
const moveLeftButton = document.querySelector("#moveLeftButton");
const moveRightButton = document.querySelector("#moveRightButton");
const fireButton = document.querySelector("#fireButton");
const hackButton = document.querySelector("#hackButton");
const touchMoveLeftZone = document.querySelector("#touchMoveLeftZone");
const touchMoveRightZone = document.querySelector("#touchMoveRightZone");
const touchFireZone = document.querySelector("#touchFireZone");
const touchHackZone = document.querySelector("#touchHackZone");
const touchWeaponZone = document.querySelector("#touchWeaponZone");
const weaponDock = document.querySelector(".weapon-dock");
const weaponButtons = Array.from(document.querySelectorAll("[data-weapon]"));
const restartOverlay = document.querySelector("#restartOverlay");
const promptTitle = restartOverlay.querySelector("strong");
const promptSubtitle = restartOverlay.querySelector("span");
const livesIcons = document.querySelector("#livesIcons");
const livesText = document.querySelector("#livesText");
const pauseButton = document.querySelector("#pauseButton");
const pauseOverlay = document.querySelector("#pauseOverlay");
const resumeButton = document.querySelector("#resumeButton");
const pauseRunButton = document.querySelector("#pauseRunButton");
const pauseBossButton = document.querySelector("#pauseBossButton");
const toast = document.querySelector("#toast");
const gameShell = document.querySelector(".game-shell");

const lanes = [-0.38, 0, 0.38];
const stars = Array.from({ length: 150 }, () => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z: Math.random() * 0.95 + 0.05,
}));
const tunnelRibs = Array.from({ length: 15 }, (_, index) => index / 15);
const hazards = Array.from({ length: 18 }, (_, index) => ({
  lane: index % 3,
  z: 0.12 + Math.random() * 0.9,
  phase: Math.random() * Math.PI * 2,
}));
const shots = [];
const blasts = [];
const shieldImpacts = [];
const hackDrag = {
  active: false,
  pointerId: null,
};

const BOSS_MAX_HP = 180;
const BOSS_MAX_SHIELD = 90;
const BOSS_SHIELD_RESTORE_DELAY_MS = 6000;
const BOSS_SHIELD_RESTORE_AMOUNT = BOSS_MAX_SHIELD;
const PLAYER_MAX_HP = 100;
const PLAYER_MAX_LIVES = 3;
const HACK_FAIL_DAMAGE = 12;
const BOSS_BEAM_DAMAGE = 18;
const SHIP_INTRO_DURATION_MS = 1350;
const SHIP_DEATH_PROMPT_DELAY_MS = 1250;
const SHIP_LANE_SPRING = 32;
const SHIP_LANE_DAMPING = 7.6;
const SHIP_LANE_REST_THRESHOLD = 0.002;
const SHIP_BANK_MAX_ROTATION = 0.17;
const BOSS_DEFEAT_SEQUENCE_MS = 4300;
const BOSS_VICTORY_PROMPT_DELAY_MS = 1700;
const HACK_MIN_BOARD_SIZE = 4;
const HACK_MAX_BOARD_SIZE = 7;
const DISTANCE_LY_PER_SECOND = 0.42;
const FEVER_MAX = 100;
const FEVER_DURATION_MS = 7000;
const FEVER_GAINS = {
  hit: 0.45,
  hullHit: 0.9,
  shieldBreak: 4,
  hackSuccess: 8,
  weaponReward: 3,
};
const weaponOrder = ["machine", "spread", "laser"];
const weaponConfigs = {
  machine: {
    name: "MACHINE",
    short: "MG",
    ammoCost: 3,
    cooldown: 90,
    damage: 1,
    readout: "MACHINE HIT",
  },
  spread: {
    name: "SPREAD",
    short: "SP",
    ammoCost: 9,
    cooldown: 260,
    damage: 6,
    readout: "SPREAD HIT",
  },
  laser: {
    name: "LASER",
    short: "LZ",
    ammoCost: 24,
    cooldown: 780,
    damage: 16,
    readout: "LASER BEAM",
  },
};

const bossTimings = {
  normal: 8500,
  charging: 5000,
  beam: 1600,
  cooldown: 4600,
};
const chronoRunStage = {
  id: "chrono-run-v1",
  objective: "distance",
  targetDistance: 1200,
  difficulty: 1,
};
const runRewardOrder = ["speedBoost", "screenBomb", "temporaryInvincible"];

const game = {
  mode: "title",
  lane: 1,
  laneTarget: 1,
  laneVelocity: 0,
  hp: PLAYER_MAX_HP,
  lives: PLAYER_MAX_LIVES,
  ammo: 100,
  fever: 0,
  feverActiveUntil: 0,
  bossHp: BOSS_MAX_HP,
  bossShieldHp: BOSS_MAX_SHIELD,
  hack: null,
  hackReturnMode: null,
  run: null,
  runRewardIndex: 0,
  boostMultiplierPreview: 1,
  distanceLy: 0,
  travel: 0,
  speedPulse: 0,
  messageUntil: 0,
  lastShotAt: 0,
  selectedWeapon: "machine",
  weaponUnlocks: {
    machine: true,
    spread: false,
    laser: false,
  },
  weaponLevels: {
    machine: 1,
    spread: 1,
    laser: 1,
  },
  hackLevel: 0,
  bossMode: "normal",
  bossModeStartedAt: performance.now(),
  bossBeamHitAt: 0,
  bossShieldBrokenAt: 0,
  bossBreakUntil: 0,
  bossDefeated: false,
  bossDefeatedAt: 0,
  victoryShownAt: 0,
  bossPose: { x: 0.5, y: 0.34 },
  introStartedAt: 0,
  playerDeathStartedAt: 0,
  playerDeathOutcome: null,
  promptAction: null,
  lastTime: performance.now(),
  paused: false,
  pausedAt: 0,
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function enterHack(now = performance.now()) {
  if (game.mode !== "flight" || game.bossDefeated) {
    return;
  }

  game.hackReturnMode = "flight";
  game.mode = "hack";
  game.hack = createInitialHackState({
    board: createRandomHackBoard({ size: getHackBoardSize() }),
    now,
  });
  game.boostMultiplierPreview = 1;
  renderHackGrid();
  setToast("BULLET TIME LINK OPEN", 900);
}

function enterRunMinigame(now = performance.now()) {
  if (!game.run) {
    return;
  }

  game.hackReturnMode = "chronoRun";
  game.mode = "hack";
  game.hack = createInitialHackState({
    board: createRandomHackBoard({ size: HACK_MIN_BOARD_SIZE }),
    now,
  });
  game.boostMultiplierPreview = 1;
  renderHackGrid();
  setToast("BULLET TIME / CHRONO CACHE", 1200);
}

function cancelHack() {
  if (game.mode !== "hack") {
    return;
  }

  if (game.hackReturnMode === "chronoRun" && game.run) {
    game.run = applyRunReward(game.run, null);
  }
  game.mode = game.hackReturnMode === "chronoRun" ? "chronoRun" : "flight";
  game.hackReturnMode = null;
  game.hack = null;
  renderHackGrid();
  setToast("HACK CANCELLED", 650);
}

function getHackBoardSize() {
  return Math.min(HACK_MAX_BOARD_SIZE, HACK_MIN_BOARD_SIZE + game.hackLevel);
}

function fireWeapon(now = performance.now()) {
  const weapon = weaponConfigs[game.selectedWeapon];
  const feverActive = isFeverActive(now);
  if (
    game.mode !== "flight" ||
    game.bossDefeated ||
    !weapon ||
    (!feverActive && game.ammo < weapon.ammoCost) ||
    now - game.lastShotAt < weapon.cooldown
  ) {
    return;
  }

  const hit = applyBossDamage(getWeaponDamage(game.selectedWeapon), isBossBreakActive() ? "break" : "normal");
  game.lastShotAt = now;
  if (feverActive) {
    game.ammo = 100;
  } else {
    game.ammo = Math.max(0, game.ammo - weapon.ammoCost);
  }
  gainFever(getFeverGainForHit(hit), now);
  recordShieldImpact(hit, now, game.selectedWeapon);
  shots.push({
    born: now,
    type: game.selectedWeapon,
    damage: hit.displayDamage,
    lane: game.lane,
    laneTarget: game.laneTarget,
    laneVelocity: game.laneVelocity,
    seed: Math.random() * Math.PI * 2,
    shielded: hit.shieldDamage > 0,
  });
  blasts.push({
    born: now,
    damage: hit.displayDamage,
    small: game.selectedWeapon !== "laser",
    type: game.selectedWeapon,
    lane: game.lane,
    laneTarget: game.laneTarget,
    laneVelocity: game.laneVelocity,
    shielded: hit.shieldDamage > 0,
  });
  damageReadout.textContent = formatWeaponReadout(weapon, hit);
  maybeResetBoss();
}

function fireRunWeapon() {
  if (game.mode !== "chronoRun" || !game.run) {
    return;
  }

  const beforeScore = game.run.score;
  const beforeEnemyCount = game.run.entities.filter((entity) => entity.kind === "enemy").length;
  game.run = applyRunShot(game.run);
  syncRunStateToGame();
  shots.push({
    born: performance.now(),
    type: "machine",
    damage: game.run.score > beforeScore ? game.run.score - beforeScore : 0,
    lane: game.lane,
    laneTarget: game.laneTarget,
    laneVelocity: game.laneVelocity,
    seed: Math.random() * Math.PI * 2,
    shielded: false,
  });
  const afterEnemyCount = game.run.entities.filter((entity) => entity.kind === "enemy").length;
  damageReadout.textContent = afterEnemyCount < beforeEnemyCount ? "RUN TARGET DOWN" : "RUN FIRE";
}

function resolveHack(status) {
  if (!game.hack) {
    return;
  }

  if (game.hackReturnMode === "chronoRun") {
    if (status === "success") {
      const reward = getNextRunReward();
      game.run = applyRunReward(game.run, reward);
      game.runRewardIndex += 1;
      game.speedPulse = reward === "speedBoost" ? 1 : game.speedPulse;
      damageReadout.textContent = `CHRONO ${formatRunReward(reward)}`;
      setToast(`MINIGAME CLEAR / ${formatRunReward(reward)}`, 1400);
    } else {
      if (game.run) {
        game.run = applyRunReward(game.run, null);
      }
      damageReadout.textContent = "MINIGAME FAILED";
      setToast("MINIGAME FAILED / RUN RESUMED", 1100);
    }

    game.mode = "chronoRun";
    game.hack = null;
    game.hackReturnMode = null;
    renderHackGrid();
    return;
  }

  if (status === "success") {
    const now = performance.now();
    const breakDuration = resolveHackBreakDuration({
      boostsCollected: game.hack.boostsCollected,
    });
    const weaponPickups = getSuccessfulHackWeaponPickups(game.hack);
    game.bossBreakUntil = Math.max(game.bossBreakUntil, now + breakDuration);
    game.ammo = Math.min(100, game.ammo + 26);
    game.hackLevel = Math.min(game.hackLevel + 1, HACK_MAX_BOARD_SIZE - HACK_MIN_BOARD_SIZE);
    applyHackWeaponRewards(weaponPickups);
    gainFever(FEVER_GAINS.hackSuccess + weaponPickups.length * FEVER_GAINS.weaponReward, now);
    damageReadout.textContent = `SHIELD BREAK ${formatTimeSeconds(breakDuration)}`;
    setToast(`HACK SUCCESS / BREAK ${formatTimeSeconds(breakDuration)}`, 1400);
  } else {
    applyDamageToPlayer(HACK_FAIL_DAMAGE, {
      readout: "HACK FAILED - LIGHT DAMAGE",
      toast: "HACK FAILED / LIGHT DAMAGE",
    });
  }

  if (game.mode === "hack") {
    game.mode = "flight";
  }
  game.hack = null;
  maybeResetBoss();
  renderHackGrid();
}

function applyDamageToPlayer(damage, { readout = "HULL DAMAGE", toast: toastMessage = "HULL DAMAGE" } = {}) {
  if (!canDamagePlayer()) {
    return { outcome: "ignored", hp: game.hp, lives: game.lives };
  }

  const result = applyPlayerDamage({
    hp: game.hp,
    lives: game.lives,
    damage,
  });

  game.hp = result.hp;
  game.lives = result.lives;
  damageReadout.textContent = readout;
  setToast(toastMessage, 1200);

  if (result.outcome !== "alive") {
    beginPlayerDestroyed(result.outcome);
  }

  return result;
}

function canDamagePlayer() {
  return game.mode === "flight" || game.mode === "hack" || game.mode === "chronoRun";
}

function getNextRunReward() {
  return runRewardOrder[game.runRewardIndex % runRewardOrder.length];
}

function formatRunReward(reward) {
  if (reward === "speedBoost") {
    return "SPEED BOOST";
  }
  if (reward === "screenBomb") {
    return "SCREEN BOMB";
  }
  if (reward === "temporaryInvincible") {
    return "INVINCIBLE";
  }
  return "RUN RESUMED";
}

function getSuccessfulHackWeaponPickups(hackState) {
  const uniquePickups = [];
  const seen = new Set();

  hackState.path.forEach((point) => {
    const key = `${point.row},${point.col}`;
    if (seen.has(key) || hackState.board[point.row]?.[point.col] !== "weapon") {
      return;
    }
    seen.add(key);
    uniquePickups.push(point);
  });

  return uniquePickups;
}

function applyHackWeaponRewards(pickups) {
  pickups.forEach((point) => {
    const reward = grantWeaponReward();
    showHackRewardPopup(point, reward.message);
    setToast(reward.message, 900);
  });
  updateWeaponUi();
}

function grantWeaponReward(random = Math.random) {
  if (!game.weaponUnlocks.spread) {
    game.weaponUnlocks.spread = true;
    return { type: "unlock", weapon: "spread", message: "SPREAD Get!" };
  }

  if (!game.weaponUnlocks.laser) {
    game.weaponUnlocks.laser = true;
    return { type: "unlock", weapon: "laser", message: "LZ Get!" };
  }

  const unlockedWeapons = weaponOrder.filter((type) => game.weaponUnlocks[type]);
  const weapon = unlockedWeapons[Math.floor(random() * unlockedWeapons.length)];
  game.weaponLevels[weapon] += 1;
  return {
    type: "level",
    weapon,
    message: `${weaponConfigs[weapon].short} Level UP!`,
  };
}

function showHackRewardPopup(point, message) {
  const cell = hackGrid.querySelector(`[data-row="${point.row}"][data-col="${point.col}"]`);
  if (!cell || !gameShell) {
    return;
  }

  const cellRect = cell.getBoundingClientRect();
  const shellRect = gameShell.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.className = "reward-popup";
  popup.textContent = message;
  popup.style.left = `${cellRect.left + cellRect.width / 2 - shellRect.left}px`;
  popup.style.top = `${cellRect.top - shellRect.top}px`;
  gameShell.append(popup);
  window.setTimeout(() => popup.remove(), 1200);
}

function maybeResetBoss() {
  if (game.bossHp > 0) {
    return;
  }

  defeatBoss();
}

function applyBossDamage(baseDamage, damageProfile = "normal") {
  if (game.bossDefeated) {
    return {
      displayDamage: 0,
      hullDamage: 0,
      shieldDamage: 0,
      shieldBefore: game.bossShieldHp,
      canceledDamage: 0,
      shieldActive: false,
      shieldBroken: false,
    };
  }

  const hit = applyShieldedBossDamage({
    bossHp: game.bossHp,
    bossShieldHp: game.bossShieldHp,
    baseDamage,
    damageProfile,
  });

  game.bossHp = hit.bossHp;
  game.bossShieldHp = hit.bossShieldHp;

  if (hit.shieldBroken) {
    game.bossShieldBrokenAt = performance.now();
  }

  if (game.bossMode === "cooldown" && game.bossShieldHp <= 0 && hit.hullDamage > 0) {
    game.speedPulse = 1;
  }

  return hit;
}

function isBossBreakActive(now = performance.now()) {
  return !game.bossDefeated && game.bossBreakUntil > now;
}

function recordShieldImpact(hit, now = performance.now(), type = "machine") {
  if (hit.shieldDamage <= 0) {
    return;
  }

  shieldImpacts.push({
    born: now,
    type,
    damage: hit.shieldDamage,
    seed: Math.random() * Math.PI * 2,
    broken: hit.shieldBroken,
  });
}

function formatWeaponReadout(weapon, hit) {
  const prefix = isBossBreakActive() ? "BREAK HIT" : weapon.readout;

  if (hit.shieldDamage > 0 && hit.hullDamage <= 0) {
    return hit.shieldBroken
      ? `SHIELD BREAK ${formatDamage(hit.shieldDamage)}`
      : `SHIELD ABSORB ${formatDamage(hit.shieldDamage)} / LEAK ${formatDamage(hit.hullDamage)}`;
  }

  if (hit.shieldDamage > 0 && hit.hullDamage > 0) {
    return hit.shieldBroken
      ? `SHIELD BREAK / ${weapon.readout} ${formatDamage(hit.hullDamage)}`
      : `SHIELD ABSORB ${formatDamage(hit.shieldDamage)} / LEAK ${formatDamage(hit.hullDamage)}`;
  }

  return game.bossMode === "cooldown"
    ? `WEAK POINT HIT ${formatDamage(hit.hullDamage)}`
    : `${prefix} ${formatDamage(hit.hullDamage)}`;
}

function formatDamage(value) {
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    return value.toFixed(2);
  }
  return value.toFixed(1);
}

function formatTimeSeconds(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function defeatBoss(now = performance.now()) {
  if (game.bossDefeated || !isGameplayActive()) {
    return;
  }

  game.bossDefeated = true;
  game.bossDefeatedAt = now;
  game.victoryShownAt = 0;
  game.bossMode = "defeated";
  game.mode = "bossDying";
  game.hack = null;
  game.bossBreakUntil = 0;
  game.promptAction = null;
  game.bossShieldHp = 0;
  game.speedPulse = 1;
  shots.length = 0;
  shieldImpacts.length = 0;
  renderHackGrid();
  hidePrompt();
  damageReadout.textContent = "BOSS CRITICAL";
  setToast("CORE COLLAPSE", 1400);
}

function resetGame(now = performance.now(), { startMode = "intro" } = {}) {
  game.mode = startMode === "title" ? "title" : "intro";
  game.lane = 1;
  game.laneTarget = 1;
  game.laneVelocity = 0;
  game.hp = PLAYER_MAX_HP;
  game.lives = PLAYER_MAX_LIVES;
  game.ammo = 100;
  game.fever = 0;
  game.feverActiveUntil = 0;
  game.bossHp = BOSS_MAX_HP;
  game.bossShieldHp = BOSS_MAX_SHIELD;
  game.hack = null;
  game.hackReturnMode = null;
  game.run = null;
  game.runRewardIndex = 0;
  game.boostMultiplierPreview = 1;
  game.distanceLy = 0;
  game.travel = 0;
  game.speedPulse = 0;
  game.lastShotAt = 0;
  game.selectedWeapon = "machine";
  game.weaponUnlocks = {
    machine: true,
    spread: false,
    laser: false,
  };
  game.weaponLevels = {
    machine: 1,
    spread: 1,
    laser: 1,
  };
  game.hackLevel = 0;
  game.bossMode = "normal";
  game.bossModeStartedAt = now;
  game.bossBeamHitAt = 0;
  game.bossShieldBrokenAt = 0;
  game.bossBreakUntil = 0;
  game.bossDefeated = false;
  game.bossDefeatedAt = 0;
  game.victoryShownAt = 0;
  game.bossPose = { x: 0.5, y: 0.34 };
  game.introStartedAt = startMode === "title" ? 0 : now;
  game.playerDeathStartedAt = 0;
  game.playerDeathOutcome = null;
  game.promptAction = null;
  game.lastTime = now;
  game.paused = false;
  game.pausedAt = 0;

  shots.length = 0;
  blasts.length = 0;
  shieldImpacts.length = 0;
  resetHazards();
  renderHackGrid();
  updateWeaponUi();
  syncPauseUi();
  hidePrompt();
  startOverlay.classList.toggle("hidden", startMode !== "title");
  damageReadout.textContent = "DAMAGE READY";
  if (startMode === "title") {
    toast.classList.add("hidden");
  } else {
    setToast("LAUNCH", 800);
  }
}

function startIntro(now = performance.now(), { resetWorld = false } = {}) {
  if (resetWorld) {
    resetGame(now, { startMode: "intro" });
    return;
  }

  game.mode = "intro";
  game.introStartedAt = now;
  game.playerDeathStartedAt = 0;
  game.playerDeathOutcome = null;
  game.promptAction = null;
  game.hp = PLAYER_MAX_HP;
  if (isFeverActive(now)) {
    game.ammo = 100;
  }
  game.lane = 1;
  game.laneTarget = 1;
  game.laneVelocity = 0;
  game.hack = null;
  game.hackReturnMode = null;
  game.run = null;
  game.paused = false;
  game.lastTime = now;
  hidePrompt();
  startOverlay.classList.add("hidden");
  syncPauseUi();
  renderHackGrid();
  setToast("LAUNCH", 800);
}

function startChronoRun(now = performance.now()) {
  game.mode = "chronoRun";
  game.lane = 1;
  game.laneTarget = 1;
  game.laneVelocity = 0;
  game.hp = PLAYER_MAX_HP;
  game.ammo = 100;
  game.hack = null;
  game.hackReturnMode = null;
  game.runRewardIndex = 0;
  game.run = createRunState({
    stage: chronoRunStage,
    now,
    entities: [
      { id: "intro-fast", kind: "enemy", type: "fastShooter", lane: 1, z: 0.58, hp: 2 },
      { id: "intro-heavy", kind: "enemy", type: "heavyRammer", lane: 0, z: 0.88, hp: 6 },
      { id: "intro-cache", kind: "item", type: "minigameTrigger", lane: 2, z: 0.96 },
    ],
    spawnTimerMs: 1500,
  });
  game.distanceLy = 0;
  game.travel = 0;
  game.speedPulse = 0.7;
  game.lastShotAt = now;
  game.paused = false;
  game.lastTime = now;
  game.promptAction = null;
  startOverlay.classList.add("hidden");
  hidePrompt();
  syncPauseUi();
  renderHackGrid();
  damageReadout.textContent = "CHRONO RUN";
  setToast("CHRONO RUN / BREACH THE TIMELINE", 1200);
}

function restartChronoRun(now = performance.now()) {
  resetGame(now, { startMode: "title" });
  startChronoRun(now);
}

function restartChronoBoss(now = performance.now()) {
  resetGame(now, { startMode: "intro" });
}

function returnToStartScreen(now = performance.now()) {
  resetGame(now, { startMode: "title" });
}

function isMobileFullscreenCandidate() {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches === true
  );
}

function requestGameFullscreen() {
  if (!isMobileFullscreenCandidate() || document.fullscreenElement) {
    return;
  }

  const target = gameShell;
  const request =
    target.requestFullscreen ??
    target.webkitRequestFullscreen ??
    document.documentElement.requestFullscreen ??
    document.documentElement.webkitRequestFullscreen;
  const result = request?.call(target);
  result?.catch?.(() => {});
}

function beginPlayerDestroyed(outcome, now = performance.now()) {
  game.mode = "playerDestroyed";
  game.hack = null;
  game.playerDeathStartedAt = now;
  game.playerDeathOutcome = outcome;
  game.bossBreakUntil = 0;
  game.laneVelocity = 0;
  game.speedPulse = 1;
  shots.length = 0;
  renderHackGrid();
  damageReadout.textContent = outcome === "gameover" ? "SHIP LOST" : "SHIP DOWN";
  setToast(outcome === "gameover" ? "FINAL SHIP LOST" : "SHIP LOST", 1100);
}

function continuePlayer(now = performance.now()) {
  game.hp = PLAYER_MAX_HP;
  game.ammo = isFeverActive(now) ? 100 : Math.min(100, Math.max(game.ammo, 70));
  game.lane = 1;
  game.laneTarget = 1;
  game.laneVelocity = 0;
  game.playerDeathStartedAt = 0;
  game.playerDeathOutcome = null;
  game.promptAction = null;
  game.mode = "intro";
  game.introStartedAt = now;
  game.lastTime = now;
  hidePrompt();
  damageReadout.textContent = "CONTINUE";
  setToast("SHIP RE-ENTRY", 900);
}

function showPrompt(title, subtitle, action) {
  promptTitle.textContent = title;
  promptSubtitle.textContent = subtitle;
  game.promptAction = action;
  restartOverlay.classList.remove("hidden");
}

function hidePrompt() {
  game.promptAction = null;
  restartOverlay.classList.add("hidden");
}

function activatePromptAction(now = performance.now()) {
  if (game.promptAction === "continue") {
    continuePlayer(now);
    return true;
  }
  if (game.promptAction === "gameover") {
    resetGame(now, { startMode: "title" });
    return true;
  }
  if (game.promptAction === "bossRestart") {
    resetGame(now, { startMode: "intro" });
    return true;
  }
  return false;
}

function tryRestartAfterBossVictory() {
  if (!game.bossDefeated) {
    return false;
  }
  if (game.promptAction === "bossRestart") {
    resetGame();
  }
  return true;
}

function resetHazards() {
  hazards.forEach((hazard, index) => {
    hazard.lane = index % 3;
    hazard.z = 0.12 + Math.random() * 0.9;
    hazard.phase = Math.random() * Math.PI * 2;
  });
}

function setPaused(paused, now = performance.now()) {
  if ((game.bossDefeated || (!isGameplayActive() && game.mode !== "chronoRun")) && paused) {
    return;
  }
  if (game.paused === paused) {
    return;
  }

  if (paused) {
    game.paused = true;
    game.pausedAt = now;
    syncPauseUi();
    resumeButton.focus({ preventScroll: true });
    return;
  }

  const pausedDuration = Math.max(0, now - game.pausedAt);
  game.paused = false;
  game.pausedAt = 0;
  game.lastTime = now;
  game.bossModeStartedAt += pausedDuration;
  game.lastShotAt += pausedDuration;
  game.messageUntil += pausedDuration;

  if (game.hack) {
    game.hack = {
      ...game.hack,
      expiresAt: game.hack.expiresAt + pausedDuration,
    };
  }
  if (game.bossShieldBrokenAt > 0) {
    game.bossShieldBrokenAt += pausedDuration;
  }
  if (game.bossBreakUntil > 0) {
    game.bossBreakUntil += pausedDuration;
  }
  if (game.feverActiveUntil > 0) {
    game.feverActiveUntil += pausedDuration;
  }

  shots.forEach((shot) => {
    shot.born += pausedDuration;
  });
  blasts.forEach((blast) => {
    blast.born += pausedDuration;
  });
  shieldImpacts.forEach((impact) => {
    impact.born += pausedDuration;
  });

  syncPauseUi();
  pauseButton.focus({ preventScroll: true });
}

function syncPauseUi() {
  pauseOverlay.classList.toggle("hidden", !game.paused);
  pauseButton.setAttribute("aria-pressed", String(game.paused));
}

function updateBoss(now, delta) {
  if (game.bossDefeated || !isGameplayActive()) {
    return;
  }

  updateBossShieldRestore(now);

  const elapsed = now - game.bossModeStartedAt;
  if (game.bossMode === "normal" && elapsed > bossTimings.normal) {
    setBossMode("charging", now);
  } else if (game.bossMode === "charging" && elapsed > bossTimings.charging) {
    setBossMode("beam", now);
  } else if (game.bossMode === "beam" && elapsed > bossTimings.beam) {
    setBossMode("cooldown", now);
  } else if (game.bossMode === "cooldown" && elapsed > bossTimings.cooldown) {
    setBossMode("normal", now);
  }

  if (game.bossMode === "beam" && game.bossBeamHitAt === 0) {
    applyDamageToPlayer(BOSS_BEAM_DAMAGE, {
      readout: "BEAM DAMAGE",
      toast: "BOSS BEAM HIT",
    });
    game.bossBeamHitAt = now;
  }

  const target = getBossTargetPose(now);
  const rate =
    game.bossMode === "charging" || game.bossMode === "beam"
      ? 0.062
      : game.bossMode === "cooldown"
        ? 0.016
        : 0.024;
  const blend = 1 - Math.pow(1 - rate, delta / 16.67);
  game.bossPose.x += (target.x - game.bossPose.x) * blend;
  game.bossPose.y += (target.y - game.bossPose.y) * blend;
}

function isGameplayActive() {
  return game.mode === "flight" || game.mode === "hack";
}

function isDistanceCountingMode() {
  return ["intro", "flight", "hack", "bossDying", "victory", "playerDestroyed"].includes(game.mode);
}

function updateBossShieldRestore(now) {
  if (
    game.bossShieldHp > 0 ||
    game.bossShieldBrokenAt === 0 ||
    now - game.bossShieldBrokenAt < BOSS_SHIELD_RESTORE_DELAY_MS
  ) {
    return;
  }

  game.bossShieldHp = Math.min(BOSS_MAX_SHIELD, BOSS_SHIELD_RESTORE_AMOUNT);
  game.bossShieldBrokenAt = 0;
  damageReadout.textContent = "SHIELD RESTORED";
  setToast("BOSS SHIELD RESTORED", 1000);
}

function getBossTargetPose(now) {
  if (game.bossMode === "charging" || game.bossMode === "beam") {
    return { x: 0.5, y: 0.34 };
  }

  if (game.bossMode === "cooldown") {
    return {
      x: 0.5 + Math.sin(now * 0.00024) * 0.055,
      y: 0.36 + Math.sin(now * 0.00032) * 0.018,
    };
  }

  return {
    x: 0.5 + Math.sin(now * 0.00046) * 0.15,
    y: 0.34,
  };
}

function setBossMode(mode, now = performance.now()) {
  game.bossMode = mode;
  game.bossModeStartedAt = now;

  if (mode === "charging") {
    game.bossBeamHitAt = 0;
    damageReadout.textContent = "BOSS CHARGE 5.0";
    setToast("RED CORE CHARGING", 1200);
  } else if (mode === "beam") {
    game.bossBeamHitAt = 0;
    game.speedPulse = 1;
    damageReadout.textContent = "BEAM FIRING";
    setToast("ELECTROMAGNETIC BEAM FIRE", 1200);
  } else if (mode === "cooldown") {
    damageReadout.textContent = "BOSS COOLDOWN x3";
    setToast("BOSS WEAK POINT EXPOSED", 1500);
  }
}

function renderHackGrid() {
  hackPanel.classList.toggle("hidden", game.mode !== "hack");
  timerPanel.classList.toggle("hidden", game.mode !== "hack");
  hackGrid.textContent = "";

  if (!game.hack) {
    return;
  }

  hackGrid.style.gridTemplateColumns = `repeat(${game.hack.board[0].length}, 1fr)`;
  const visited = new Set(game.hack.path.map((point) => `${point.row},${point.col}`));
  game.hack.board.forEach((row, rowIndex) => {
    row.forEach((node, colIndex) => {
      const cell = document.createElement("div");
      cell.className = `cell ${node}`;
      cell.dataset.node = node;
      cell.dataset.coord = `${rowIndex + 1}-${colIndex + 1}`;
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(colIndex);
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;

      const label = document.createElement("span");
      label.className = "cell-label";
      label.textContent = NODE_LABELS[node];
      cell.append(label);

      if (visited.has(`${rowIndex},${colIndex}`)) {
        cell.classList.add("path");
      }
      if (game.hack.cursor.row === rowIndex && game.hack.cursor.col === colIndex) {
        cell.classList.add("cursor");
      }
      hackGrid.append(cell);
    });
  });

  const multiplierText =
    game.hack.boostsCollected > 0 ? `x${game.boostMultiplierPreview}` : "x1";
  boostCounter.textContent = multiplierText;
  routeStats.textContent = `${game.hack.board.length}x${game.hack.board.length} / ${game.hack.weaponsCollected} WPN`;
  hackStatus.textContent =
    game.hack.status === "success"
      ? "CORE BREACHED"
      : game.hack.status === "failed"
        ? "ROUTE BROKEN"
        : "ROUTE ACTIVE";
}

function moveHack(direction) {
  if (!game.hack || game.mode !== "hack") {
    return;
  }

  const beforeBoosts = game.hack.boostsCollected;
  game.hack = moveHackCursor(game.hack, direction);
  if (game.hack.boostsCollected > beforeBoosts) {
    game.boostMultiplierPreview *= randomBoostMultiplier(Math.random);
    setToast(`BOOST LINK x${game.boostMultiplierPreview}`, 650);
  }

  renderHackGrid();
  if (game.hack.status !== "running") {
    const resolvedStatus = game.hack.status;
    window.setTimeout(() => resolveHack(resolvedStatus), 180);
  }
}

function moveHackToCell(row, col) {
  if (!game.hack || game.mode !== "hack") {
    return;
  }

  const deltaRow = row - game.hack.cursor.row;
  const deltaCol = col - game.hack.cursor.col;
  const direction =
    deltaRow === -1 && deltaCol === 0
      ? "up"
      : deltaRow === 1 && deltaCol === 0
        ? "down"
        : deltaRow === 0 && deltaCol === -1
          ? "left"
          : deltaRow === 0 && deltaCol === 1
            ? "right"
            : null;

  if (direction) {
    moveHack(direction);
  }
}

function moveHackTowardCell(row, col) {
  if (!game.hack || game.mode !== "hack") {
    return;
  }

  let safety = game.hack.board.length * game.hack.board[0].length;
  while (
    safety > 0 &&
    game.hack &&
    game.hack.status === "running" &&
    (game.hack.cursor.row !== row || game.hack.cursor.col !== col)
  ) {
    safety -= 1;
    const before = `${game.hack.cursor.row},${game.hack.cursor.col}`;
    const rowDelta = row - game.hack.cursor.row;
    const colDelta = col - game.hack.cursor.col;
    const horizontal = colDelta < 0 ? "left" : colDelta > 0 ? "right" : null;
    const vertical = rowDelta < 0 ? "up" : rowDelta > 0 ? "down" : null;
    const directions =
      Math.abs(colDelta) >= Math.abs(rowDelta)
        ? [horizontal, vertical]
        : [vertical, horizontal];

    let moved = false;
    for (const direction of directions) {
      if (!direction || !game.hack || game.hack.status !== "running") {
        continue;
      }
      moveHack(direction);
      const after = game.hack ? `${game.hack.cursor.row},${game.hack.cursor.col}` : before;
      if (after !== before) {
        moved = true;
        break;
      }
    }

    if (!moved) {
      break;
    }
  }
}

function getHackCellFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest?.(".cell");
  if (!cell || !hackGrid.contains(cell)) {
    return null;
  }

  return {
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
  };
}

function moveHackAtPoint(clientX, clientY) {
  const cell = getHackCellFromPoint(clientX, clientY);
  if (!cell) {
    return;
  }
  moveHackTowardCell(cell.row, cell.col);
}

function moveFlight(direction) {
  if (game.mode === "chronoRun" && game.run) {
    const move = direction === "moveLeft" ? "left" : direction === "moveRight" ? "right" : null;
    if (!move) {
      return;
    }
    const previousLane = game.run.lane;
    game.run = updateRunState(game.run, { move }, 0);
    syncRunStateToGame();
    if (game.run.lane !== previousLane) {
      game.speedPulse = 1;
    }
    return;
  }

  if (game.mode !== "flight") {
    return;
  }

  const previousTarget = game.laneTarget;
  if (direction === "moveLeft") {
    game.laneTarget = Math.max(0, game.laneTarget - 1);
  } else if (direction === "moveRight") {
    game.laneTarget = Math.min(2, game.laneTarget + 1);
  }

  if (game.laneTarget !== previousTarget) {
    game.speedPulse = 1;
  }
}

function updateShipMovement(delta) {
  const dt = delta / 1000;
  const pull = (game.laneTarget - game.lane) * SHIP_LANE_SPRING;
  const damping = game.laneVelocity * SHIP_LANE_DAMPING;
  game.laneVelocity += (pull - damping) * dt;
  game.lane += game.laneVelocity * dt;

  if (game.lane < 0 || game.lane > 2) {
    game.lane = Math.max(0, Math.min(2, game.lane));
    game.laneVelocity = 0;
  }

  if (
    Math.abs(game.laneTarget - game.lane) < SHIP_LANE_REST_THRESHOLD &&
    Math.abs(game.laneVelocity) < SHIP_LANE_REST_THRESHOLD
  ) {
    game.lane = game.laneTarget;
    game.laneVelocity = 0;
  }
}

function setWeapon(type, { announce = true } = {}) {
  if (!weaponConfigs[type] || !game.weaponUnlocks[type]) {
    return;
  }

  game.selectedWeapon = type;
  updateWeaponUi();
  if (announce) {
    setToast(`${weaponConfigs[type].name} SELECTED`, 620);
  }
}

function cycleWeapon() {
  const unlockedWeapons = weaponOrder.filter((type) => game.weaponUnlocks[type]);
  const index = unlockedWeapons.indexOf(game.selectedWeapon);
  const next = unlockedWeapons[(index + 1) % unlockedWeapons.length] ?? "machine";
  setWeapon(next);
}

function getWeaponDamage(type) {
  const level = Math.max(1, game.weaponLevels[type] ?? 1);
  return weaponConfigs[type].damage * (1 + (level - 1) * 0.28);
}

function isFeverActive(now = performance.now()) {
  return game.feverActiveUntil > now;
}

function getFeverGainForHit(hit) {
  if (!hit || game.bossDefeated || isFeverActive()) {
    return 0;
  }

  let gain = FEVER_GAINS.hit;
  if (hit.hullDamage > 0) {
    gain += FEVER_GAINS.hullHit;
  }
  if (hit.shieldBroken) {
    gain += FEVER_GAINS.shieldBreak;
  }
  return gain;
}

function gainFever(amount, now = performance.now()) {
  if (amount <= 0 || game.bossDefeated || isFeverActive(now)) {
    return;
  }

  game.fever = Math.min(FEVER_MAX, game.fever + amount);
  if (game.fever >= FEVER_MAX) {
    activateFever(now);
  }
}

function activateFever(now = performance.now()) {
  game.fever = FEVER_MAX;
  game.feverActiveUntil = now + FEVER_DURATION_MS;
  game.ammo = 100;
  damageReadout.textContent = "FEVER BURST";
  setToast("FEVER START / 無限彈藥", 1300);
}

function updateFever(now) {
  if (!game.feverActiveUntil) {
    return;
  }

  if (isFeverActive(now)) {
    game.ammo = 100;
    return;
  }

  game.feverActiveUntil = 0;
  game.fever = 0;
  if (!game.bossDefeated && isGameplayActive()) {
    damageReadout.textContent = "DAMAGE READY";
    setToast("FEVER END", 900);
  }
}

function updateWeaponUi() {
  weaponButtons.forEach((button) => {
    const weaponType = button.dataset.weapon;
    const isUnlocked = game.weaponUnlocks[weaponType];
    const isActive = isUnlocked && weaponType === game.selectedWeapon;
    button.classList.toggle("active", isActive);
    button.classList.toggle("locked", !isUnlocked);
    button.disabled = !isUnlocked;
    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("aria-disabled", String(!isUnlocked));
    button.querySelector("small").textContent = isUnlocked
      ? `${weaponConfigs[weaponType].short} Lv${game.weaponLevels[weaponType]}`
      : "LOCK";
  });

  const weapon = weaponConfigs[game.selectedWeapon];
  fireButton.querySelector("small").textContent = `0 ${weapon.short} Lv${game.weaponLevels[game.selectedWeapon]}`;
}

function setToast(message, duration) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  game.messageUntil = performance.now() + duration;
}

function flashControl(element, duration = 180) {
  if (!element) {
    return;
  }

  element.classList.add("control-flash");
  window.setTimeout(() => element.classList.remove("control-flash"), duration);
}

function update(now) {
  if (game.paused) {
    game.lastTime = now;
    requestAnimationFrame(update);
    return;
  }

  const delta = Math.min(48, now - game.lastTime);
  game.lastTime = now;
  const speed = game.mode === "hack" ? 0.35 : game.mode === "chronoRun" && game.run ? game.run.speed : 1;
  if (isDistanceCountingMode()) {
    game.distanceLy += delta * 0.001 * DISTANCE_LY_PER_SECOND * speed;
  }
  game.travel += delta * 0.0018 * speed;
  game.speedPulse = Math.max(0, game.speedPulse - delta * 0.0025);
  updateIntro(now, delta);
  updatePlayerDestroyed(now);
  updateBossVictory(now);
  updateBossBreak(now);
  updateBoss(now, delta);
  updateFever(now);

  if (game.mode === "flight") {
    if (isFeverActive(now)) {
      game.ammo = 100;
    } else {
      game.ammo = Math.min(100, game.ammo + delta * 0.012);
    }
    updateShipMovement(delta);
  } else if (game.mode === "chronoRun" && game.run) {
    game.run = updateRunState(game.run, {}, delta);
    syncRunStateToGame();
    updateShipMovement(delta);
    if (game.run.status === "minigame") {
      enterRunMinigame(now);
    } else if (game.run.status === "failed") {
      returnToStartScreen(now);
    }
  } else if (game.hack) {
    game.hack = updateHackTimer(game.hack, now);
    const remaining = Math.max(0, game.hack.expiresAt - now);
    timerValue.textContent = `${(remaining / 1000).toFixed(1).padStart(4, "0")}s`;
    if (game.hack.status === "failed") {
      renderHackGrid();
      resolveHack("failed");
    }
  }

  if (game.messageUntil < now) {
    toast.classList.add("hidden");
  }

  draw(now);
  updateHud();
  requestAnimationFrame(update);
}

function syncRunStateToGame() {
  if (!game.run) {
    return;
  }

  game.laneTarget = game.run.lane;
  game.hp = game.run.hp;
  game.ammo = game.run.ammo;
  game.distanceLy = game.run.distance;
  game.speedPulse = Math.max(0, Math.min(1.2, game.run.speed - RUN_BASE_SPEED + 0.24));
}

function updateIntro(now, delta = 16) {
  if (game.mode !== "intro") {
    return;
  }

  const progress = Math.min(1, (now - game.introStartedAt) / SHIP_INTRO_DURATION_MS);
  updateShipMovement(delta);
  if (progress >= 1) {
    game.mode = "flight";
    game.bossModeStartedAt = now;
    damageReadout.textContent = "DAMAGE READY";
  }
}

function updatePlayerDestroyed(now) {
  if (game.mode !== "playerDestroyed") {
    return;
  }

  if (now - game.playerDeathStartedAt < SHIP_DEATH_PROMPT_DELAY_MS) {
    return;
  }

  returnToStartScreen(now);
}

function updateBossVictory(now) {
  if (!game.bossDefeated) {
    return;
  }

  const elapsed = now - game.bossDefeatedAt;
  if (game.mode === "bossDying" && elapsed >= BOSS_DEFEAT_SEQUENCE_MS) {
    game.mode = "victory";
    game.victoryShownAt = now;
    damageReadout.textContent = "YOU WIN!";
    setToast("YOU WIN! / 挑戰過關", BOSS_VICTORY_PROMPT_DELAY_MS);
    return;
  }

  if (
    game.mode === "victory" &&
    game.victoryShownAt > 0 &&
    now - game.victoryShownAt >= BOSS_VICTORY_PROMPT_DELAY_MS
  ) {
    game.mode = "victoryPrompt";
    showPrompt("再玩一次?", "YOU WIN! / 挑戰過關", "bossRestart");
  }
}

function updateBossBreak(now) {
  if (game.bossBreakUntil > 0 && game.bossBreakUntil <= now) {
    game.bossBreakUntil = 0;
    if (!game.bossDefeated && damageReadout.textContent.startsWith("BREAK")) {
      damageReadout.textContent = "DAMAGE READY";
    }
  }
}

function updateHud() {
  const now = performance.now();
  const feverActive = isFeverActive(now);
  const feverProgress = feverActive
    ? FEVER_MAX
    : Math.max(0, Math.min(FEVER_MAX, game.fever));
  const feverRemaining = feverActive ? Math.max(0, game.feverActiveUntil - now) : 0;
  distanceReadout.textContent = formatDistanceLy(game.distanceLy);
  hpBar.style.width = `${Math.max(0, Math.min(100, game.hp))}%`;
  ammoBar.style.width = `${game.ammo}%`;
  bossBar.style.width = `${(game.bossHp / BOSS_MAX_HP) * 100}%`;
  bossShieldBar.style.width = `${(game.bossShieldHp / BOSS_MAX_SHIELD) * 100}%`;
  bossShieldBar.parentElement.classList.toggle("break", isBossBreakActive());
  feverValue.textContent = feverActive ? `${Math.ceil(feverRemaining / 1000)}s` : `${Math.floor(feverProgress)}%`;
  feverPanel.style.setProperty("--fever-progress", `${feverProgress}%`);
  feverPanel.classList.toggle("active", feverActive);
  ammoBar.parentElement.classList.toggle("fever-active", feverActive);
  gameShell.classList.toggle("fever-active", feverActive);
  gameShell.classList.toggle("run-active", game.mode === "chronoRun");
  runHud.classList.toggle("hidden", game.mode !== "chronoRun");
  if (game.run) {
    runObjective.textContent = "CHRONO RUN";
    runStatusText.textContent =
      game.run.effects.invincibleMs > 0
        ? "INVINCIBLE"
        : game.run.effects.speedBoostMs > 0
          ? "SPEED BOOST"
          : game.run.pendingReward
            ? "BULLET TIME CACHE"
            : "DASH THROUGH TIME";
    runSpeedValue.textContent = game.run.speed.toFixed(2);
    runDistanceValue.textContent = Math.floor(game.run.distance).toString();
    runAmmoValue.textContent = Math.floor(game.run.ammo).toString();
  }
  const weapon = weaponConfigs[game.selectedWeapon];
  fireButton.querySelector("small").textContent = feverActive
    ? `FREE ${weapon.short} Lv${game.weaponLevels[game.selectedWeapon]}`
    : `0 ${weapon.short} Lv${game.weaponLevels[game.selectedWeapon]}`;
  livesText.textContent = `x ${game.lives}`;
  livesIcons.textContent = "";
  for (let index = 0; index < PLAYER_MAX_LIVES; index += 1) {
    const icon = document.createElement("span");
    icon.className = "life-ship";
    icon.classList.toggle("spent", index >= game.lives);
    livesIcons.append(icon);
  }
}

function formatDistanceLy(distance) {
  const safeDistance = Math.max(0, distance);
  if (safeDistance >= 1000) {
    return `${Math.floor(safeDistance).toLocaleString("en-US")} LY`;
  }
  return `${safeDistance.toFixed(1).padStart(5, "0")} LY`;
}

function draw(now) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  drawSpace(width, height, now);
  drawWarpTunnel(width, height, now);
  drawFlightPath(width, height, now);
  if (game.mode === "chronoRun") {
    drawRunEntities(width, height, now);
  }
  if (game.mode !== "title" && game.mode !== "chronoRun") {
    drawBoss(width, height, now);
  }
  drawShip(width, height, now);
  drawShots(width, height, now);
  drawActiveBossBeam(width, height, now);

  if (game.mode === "hack") {
    drawBulletTimeOverlay(width, height);
  }
}

function drawSpace(width, height, now) {
  const gradient = ctx.createRadialGradient(
    width * 0.52,
    height * 0.5,
    width * 0.1,
    width * 0.52,
    height * 0.5,
    width * 0.78,
  );
  gradient.addColorStop(0, "rgba(20, 82, 122, 0.02)");
  gradient.addColorStop(0.62, "rgba(3, 12, 22, 0.04)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.2)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.42;
  ctx.strokeStyle = "rgba(170, 238, 255, 0.62)";
  ctx.fillStyle = "rgba(170, 238, 255, 0.92)";
  for (const star of stars) {
    const starSpeed =
      game.mode === "hack"
        ? 0.004
        : game.mode === "chronoRun" && game.run
          ? 0.01 + game.run.speed * 0.013
          : 0.019;
    star.z -= starSpeed * (0.55 + star.z);
    if (star.z <= 0.035) {
      star.x = Math.random() * 2 - 1;
      star.y = Math.random() * 2 - 1;
      star.z = 1;
    }

    const perspective = 1 / star.z;
    const x = centerX + star.x * width * 0.08 * perspective;
    const y = centerY + star.y * height * 0.08 * perspective;
    const tailX = centerX + star.x * width * 0.08 * (perspective - 0.22);
    const tailY = centerY + star.y * height * 0.08 * (perspective - 0.22);

    if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
      star.z = 0.034;
      continue;
    }

    ctx.globalAlpha = Math.min(0.7, 0.08 + perspective * 0.09);
    ctx.lineWidth = Math.min(2.8, 0.45 + perspective * 0.1);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWarpTunnel(width, height, now) {
  const center = width * 0.5 + Math.sin(now * 0.0009) * width * 0.018;
  const horizon = height * 0.43;
  const pulse = 1 + game.speedPulse * 0.35;

  ctx.save();
  ctx.strokeStyle = "rgba(96, 218, 255, 0.18)";
  ctx.lineWidth = 1.1;

  for (const base of tunnelRibs) {
    const t = (base + game.travel * 0.92) % 1;
    const depth = t * t;
    const y = horizon + depth * height * 0.62;
    const half = (width * (0.05 + depth * 0.62)) * pulse;
    const alpha = Math.min(0.5, 0.05 + depth * 0.42);
    ctx.strokeStyle = `rgba(102, 222, 255, ${alpha * 0.58})`;
    ctx.beginPath();
    ctx.moveTo(center - half, y);
    ctx.lineTo(center + half, y);
    ctx.stroke();
  }

  for (const angle of [-0.82, -0.52, -0.24, 0, 0.24, 0.52, 0.82]) {
    ctx.strokeStyle = "rgba(102, 222, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(center, horizon);
    ctx.lineTo(center + angle * width * 0.78, height * 1.04);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 196, 85, 0.18)";
  ctx.lineWidth = 1.5;
  const sweep = ((game.travel * 2.1) % 1) * height;
  ctx.beginPath();
  ctx.moveTo(width * 0.08, sweep);
  ctx.lineTo(width * 0.92, sweep + height * 0.08);
  ctx.stroke();
  ctx.restore();
}

function drawFlightPath(width, height, now) {
  const horizon = height * 0.44;
  const center = width * 0.5;
  ctx.strokeStyle = "rgba(78, 217, 255, 0.23)";
  ctx.lineWidth = 1.4;

  for (const lane of [-0.42, 0, 0.42]) {
    ctx.beginPath();
    ctx.moveTo(center + lane * width * 0.13, horizon);
    ctx.lineTo(center + lane * width * 0.64, height * 1.02);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(87, 224, 255, 0.28)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(center, height * 0.75, width * 0.31, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  if (game.bossDefeated || !isGameplayActive()) {
    return;
  }

  for (const hazard of hazards) {
    hazard.z += game.mode === "hack" ? 0.00025 : 0.0044;
    if (hazard.z > 1.24) {
      hazard.z = 0.12;
      hazard.lane = Math.floor(Math.random() * 3);
    }
    const laneX = center + lanes[hazard.lane] * width * hazard.z;
    const wobble = Math.sin(now * 0.003 + hazard.phase) * width * 0.012 * hazard.z;
    const y = horizon + hazard.z * height * 0.5;
    const radius = 5 + hazard.z * 15;
    const pulse = Math.sin(now * 0.006 + hazard.phase) * 0.24 + 1;

    ctx.strokeStyle = "rgba(255, 104, 116, 0.42)";
    ctx.fillStyle = "rgba(255, 84, 95, 0.08)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(laneX + wobble, y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawRunEntities(width, height, now) {
  if (!game.run) {
    return;
  }

  const horizon = height * 0.42;
  const center = width * 0.5;
  const runSpeedGlow = Math.max(0, game.run.speed - RUN_BASE_SPEED);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (game.run.effects.speedBoostMs > 0) {
    ctx.strokeStyle = `rgba(255, 217, 90, ${0.24 + runSpeedGlow * 0.16})`;
    ctx.lineWidth = 3;
    for (const offset of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(center + offset * width * 0.38, horizon);
      ctx.lineTo(center + offset * width * 0.72, height * 1.05);
      ctx.stroke();
    }
  }
  if (game.run.effects.invincibleMs > 0) {
    const pose = getShipPose(width, height);
    ctx.strokeStyle = "rgba(255, 245, 146, 0.78)";
    ctx.fillStyle = "rgba(255, 225, 89, 0.08)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(pose.x, pose.y - height * 0.025, width * 0.09, height * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  for (const entity of game.run.entities) {
    const point = projectRunPoint(width, height, entity.lane, entity.z);
    const scale = Math.max(0.25, 1.18 - entity.z);
    const radius = Math.max(8, width * 0.018 * scale);

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.globalCompositeOperation = "lighter";
    if (entity.kind === "item") {
      ctx.rotate(now * 0.004);
      ctx.fillStyle = "rgba(255, 224, 89, 0.32)";
      ctx.strokeStyle = "rgba(255, 245, 158, 0.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -radius * 1.35);
      ctx.lineTo(radius * 1.15, 0);
      ctx.lineTo(0, radius * 1.35);
      ctx.lineTo(-radius * 1.15, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (entity.kind === "enemyBullet") {
      ctx.fillStyle = "rgba(255, 82, 96, 0.82)";
      ctx.shadowColor = "rgba(255, 42, 68, 0.9)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
      ctx.fill();
    } else if (entity.kind === "obstacle") {
      ctx.fillStyle = "rgba(130, 160, 174, 0.25)";
      ctx.strokeStyle = "rgba(202, 234, 244, 0.66)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
    } else {
      const heavy = entity.type === "heavyRammer";
      const turret = entity.type === "turret";
      ctx.fillStyle = heavy
        ? "rgba(255, 98, 76, 0.24)"
        : turret
          ? "rgba(184, 102, 255, 0.24)"
          : "rgba(255, 58, 88, 0.22)";
      ctx.strokeStyle = heavy
        ? "rgba(255, 150, 92, 0.86)"
        : turret
          ? "rgba(211, 158, 255, 0.86)"
          : "rgba(255, 98, 128, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * (heavy ? 1.45 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(245, 253, 255, 0.88)";
      ctx.font = `900 ${Math.max(8, radius * 0.72)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.ceil(entity.hp ?? 1)), 0, 0);
    }
    ctx.restore();
  }
}

function projectRunPoint(width, height, lane, z) {
  const horizon = height * 0.42;
  const depth = Math.max(0, Math.min(1.2, 1.2 - z));
  const laneOffset = getLaneOffset(lane);
  return {
    x: width * (0.5 + laneOffset * 0.52 * depth),
    y: horizon + depth * depth * height * 0.5,
  };
}

function drawBoss(width, height, now) {
  const pose = getBossPose(width, height, now);
  const defeatedProgress = game.bossDefeated
    ? Math.min(1, (now - game.bossDefeatedAt) / BOSS_DEFEAT_SEQUENCE_MS)
    : 0;
  const chargeProgress =
    game.bossMode === "charging"
      ? Math.min(1, (now - game.bossModeStartedAt) / bossTimings.charging)
      : 0;
  const cooldown = game.bossMode === "cooldown";
  const attack = game.bossMode === "charging" || game.bossMode === "beam";
  const alpha = game.bossDefeated ? Math.max(0, 0.92 * (1 - defeatedProgress * 0.92)) : cooldown ? 0.48 : 0.92;
  const ringSpeed = cooldown ? 0.00024 : attack ? 0.0024 + chargeProgress * 0.0027 : 0.00076;
  const ringRotation = now * ringSpeed;
  const bossSize = Math.min(width * 0.3, height * 0.48);
  const bossImageSize = getBossImageRenderSize(bossSize);
  const defeatShake = game.bossDefeated ? (1 - defeatedProgress) * (6 + Math.sin(now * 0.07) * 3) : 0;
  const sink = game.bossDefeated ? easeInCubic(defeatedProgress) * height * 0.2 : 0;
  const shake = attack ? Math.pow(chargeProgress, 1.5) * (2 + Math.sin(now * 0.06) * 2.4) : defeatShake;
  const drawX = pose.x + (attack ? Math.sin(now * (0.018 + chargeProgress * 0.04)) * shake : 0);
  const drawY = pose.y + sink + (attack ? Math.cos(now * (0.023 + chargeProgress * 0.05)) * shake : Math.cos(now * 0.052) * shake);

  ctx.save();
  ctx.translate(drawX, drawY);
  if (game.bossDefeated) {
    ctx.rotate(Math.sin(now * 0.008) * defeatedProgress * 0.24);
  }
  if (!game.bossDefeated) {
    drawBossRings(bossSize, ringRotation, chargeProgress, cooldown);
  }

  ctx.globalAlpha = alpha;
  ctx.shadowColor = cooldown ? "rgba(80, 20, 30, 0.24)" : "rgba(255, 44, 52, 0.45)";
  ctx.shadowBlur = cooldown ? 10 : 26 + chargeProgress * 34;
  if (bossImage.complete && bossImage.naturalWidth > 0) {
    ctx.drawImage(
      bossImage,
      -bossImageSize.width / 2,
      -bossImageSize.height / 2,
      bossImageSize.width,
      bossImageSize.height,
    );
  } else {
    drawFallbackBoss(bossSize);
  }

  ctx.globalAlpha = 1;
  if (game.bossDefeated) {
    drawBossExplosion(bossSize, now, defeatedProgress);
  } else {
    drawBossCore(bossSize, now, chargeProgress, cooldown);
    drawBossShield(bossSize, now, chargeProgress, cooldown);
  }
  if (!game.bossDefeated && game.bossMode === "charging") {
    drawCoreParticles(bossSize, now, chargeProgress);
    drawChargeCountdown(bossSize, chargeProgress);
  }
  ctx.restore();
}

function getBossImageRenderSize(size) {
  if (!bossImage.complete || bossImage.naturalWidth <= 0 || bossImage.naturalHeight <= 0) {
    return { width: size, height: size };
  }

  const aspect = bossImage.naturalWidth / bossImage.naturalHeight;
  return {
    width: size * aspect,
    height: size,
  };
}

function drawActiveBossBeam(width, height, now) {
  if (game.bossMode !== "beam") {
    return;
  }

  const pose = getBossPose(width, height, now);
  const bossSize = Math.min(width * 0.3, height * 0.48);
  const shake = 4 + Math.sin(now * 0.07) * 2;
  drawBossBeam(
    width,
    height,
    pose.x + Math.sin(now * 0.045) * shake,
    pose.y + Math.cos(now * 0.052) * shake,
    bossSize,
    now,
  );
}

function getBossPose(width, height) {
  return {
    x: width * game.bossPose.x,
    y: height * game.bossPose.y,
  };
}

function drawBossRings(size, rotation, chargeProgress, cooldown) {
  const radius = size * 0.34;
  ctx.save();
  ctx.rotate(rotation);
  ctx.strokeStyle = cooldown ? "rgba(112, 57, 64, 0.42)" : "rgba(255, 84, 76, 0.65)";
  ctx.lineWidth = Math.max(1.5, size * 0.007);
  for (const scale of [0.58, 0.78, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * scale * (1 + chargeProgress * 0.04), 0, Math.PI * 1.62);
    ctx.stroke();
    ctx.rotate(Math.PI * 0.38);
  }

  ctx.strokeStyle = cooldown ? "rgba(114, 91, 94, 0.2)" : "rgba(255, 222, 210, 0.58)";
  for (let i = 0; i < 12; i += 1) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(radius * 0.18, 0);
    ctx.lineTo(radius * (0.92 + chargeProgress * 0.12), 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBossCore(size, now, chargeProgress, cooldown) {
  const pulse = cooldown ? 0.35 : 0.62 + Math.sin(now * 0.008) * 0.18 + chargeProgress * 0.48;
  const radius = size * (0.035 + chargeProgress * 0.02);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.17);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${cooldown ? 0.35 : 0.92})`);
  gradient.addColorStop(0.18, `rgba(255, 45, 48, ${pulse})`);
  gradient.addColorStop(1, "rgba(255, 0, 0, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cooldown ? "rgba(90, 18, 24, 0.72)" : "rgba(255, 40, 48, 0.96)";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossShield(size, now, chargeProgress, cooldown) {
  const shieldRatio = game.bossShieldHp / BOSS_MAX_SHIELD;
  const hasRecentImpact = shieldImpacts.some((impact) => now - impact.born < 620);
  const breakActive = isBossBreakActive(now);
  if (shieldRatio <= 0 && !hasRecentImpact) {
    return;
  }

  const baseAlpha = shieldRatio > 0 ? 0.18 + shieldRatio * 0.28 : 0.1;
  const pulse =
    0.85 +
    Math.sin(now * (breakActive ? 0.018 : 0.006)) * (breakActive ? 0.2 : 0.12) +
    chargeProgress * 0.12;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = breakActive
    ? `rgba(151, 251, 255, ${baseAlpha * 1.25})`
    : cooldown
      ? `rgba(121, 83, 177, ${baseAlpha * 0.7})`
      : `rgba(190, 101, 255, ${baseAlpha})`;
  ctx.fillStyle = breakActive
    ? `rgba(89, 235, 255, ${baseAlpha * 0.18})`
    : `rgba(123, 62, 255, ${baseAlpha * 0.26})`;
  ctx.shadowColor = breakActive ? "rgba(118, 249, 255, 0.86)" : "rgba(183, 85, 255, 0.74)";
  ctx.shadowBlur = breakActive ? 34 : 22;
  ctx.lineWidth = Math.max(2, size * 0.011);

  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.54 * pulse, size * 0.42 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = breakActive
    ? `rgba(255, 255, 255, ${baseAlpha})`
    : `rgba(124, 245, 255, ${baseAlpha * 0.86})`;
  ctx.lineWidth = Math.max(1.4, size * 0.004);
  ctx.setLineDash([size * 0.032, size * 0.018]);
  ctx.lineDashOffset = -now * (breakActive ? 0.085 : 0.04);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.59 * pulse, size * 0.46 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = shieldImpacts.length - 1; i >= 0; i -= 1) {
    const impact = shieldImpacts[i];
    const age = now - impact.born;
    if (age > 620) {
      shieldImpacts.splice(i, 1);
      continue;
    }

    const alpha = 1 - age / 620;
    const angle = impact.seed;
    const radiusX = size * 0.48;
    const radiusY = size * 0.36;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    const ripple = size * (0.035 + age * 0.00042) * (impact.broken ? 1.8 : 1);

    ctx.strokeStyle = impact.broken
      ? `rgba(255, 236, 255, ${0.9 * alpha})`
      : `rgba(221, 170, 255, ${0.78 * alpha})`;
    ctx.fillStyle = `rgba(166, 88, 255, ${0.22 * alpha})`;
    ctx.lineWidth = Math.max(1.4, size * 0.008 * alpha);
    ctx.shadowBlur = impact.broken ? 36 : 20;
    ctx.beginPath();
    ctx.arc(x, y, ripple, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = `rgba(124, 248, 255, ${0.7 * alpha})`;
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.beginPath();
    ctx.moveTo(x - ripple * 1.4, y);
    ctx.lineTo(x + ripple * 1.4, y);
    ctx.moveTo(x, y - ripple * 1.4);
    ctx.lineTo(x, y + ripple * 1.4);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoreParticles(size, now, chargeProgress) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i += 1) {
    const phase = i * 1.91 + now * 0.0025;
    const orbit = size * (0.23 - chargeProgress * 0.16) * (0.7 + (i % 5) * 0.08);
    const x = Math.cos(phase) * orbit;
    const y = Math.sin(phase * 1.17) * orbit;
    const alpha = 0.22 + chargeProgress * 0.7;
    ctx.fillStyle = `rgba(255, ${70 + i * 4}, 82, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + chargeProgress * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawChargeCountdown(size, chargeProgress) {
  const remaining = Math.max(0, 5 - chargeProgress * 5).toFixed(1);
  ctx.save();
  ctx.font = `700 ${Math.max(12, size * 0.055)}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 210, 210, 0.92)";
  ctx.shadowColor = "rgba(255, 38, 48, 0.95)";
  ctx.shadowBlur = 16;
  ctx.fillText(`${remaining}s`, 0, size * 0.38);
  ctx.restore();
}

function drawBossExplosion(size, now, progress) {
  const corePulse = 1 + Math.sin(now * 0.045) * 0.14;
  const smokeAlpha = Math.max(0, 0.58 - progress * 0.34);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 72, 56, 0.95)";
  ctx.shadowBlur = 46;

  for (let i = 0; i < 32; i += 1) {
    const angle = i * 2.399 + Math.sin(now * 0.001 + i) * 0.18;
    const burst = i % 2 === 0 ? progress : Math.min(1, progress * 1.25);
    const distance = size * (0.04 + burst * (0.18 + (i % 6) * 0.035));
    const radius = size * (0.014 + (i % 5) * 0.006) * (1 - progress * 0.22);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.76;
    const alpha = Math.max(0, 0.9 - progress * 0.68);

    ctx.fillStyle = `rgba(255, ${100 + (i % 4) * 28}, 58, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * (0.28 + progress * 0.26));
  gradient.addColorStop(0, `rgba(255, 255, 245, ${0.92 * (1 - progress)})`);
  gradient.addColorStop(0.22, `rgba(255, 78, 48, ${0.72 * (1 - progress * 0.4)})`);
  gradient.addColorStop(1, "rgba(255, 38, 18, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * (0.32 + progress * 0.35) * corePulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(44, 24, 38, ${smokeAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, size * (0.08 + progress * 0.18), size * (0.38 + progress * 0.34), size * (0.24 + progress * 0.22), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossBeam(width, height, centerX, centerY, bossSize, now) {
  const age = now - game.bossModeStartedAt;
  const pulse = 0.85 + Math.sin(now * 0.055) * 0.16;
  const shipPose = getShipPose(width, height);
  const targetX = shipPose.x + Math.sin(age * 0.014) * width * 0.018;
  const targetY = height * 1.16;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const topWidth = bossSize * 0.026;
  const bottomWidth = bossSize * (0.37 + pulse * 0.11);
  const shimmer = Math.sin(age * 0.045) * bossSize * 0.012;

  const outerGradient = ctx.createLinearGradient(centerX, centerY, targetX, targetY);
  outerGradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  outerGradient.addColorStop(0.16, "rgba(255, 49, 54, 0.72)");
  outerGradient.addColorStop(0.66, "rgba(255, 28, 48, 0.45)");
  outerGradient.addColorStop(1, "rgba(255, 68, 78, 0.2)");

  const coreGradient = ctx.createLinearGradient(centerX, centerY, targetX, targetY);
  coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  coreGradient.addColorStop(0.5, "rgba(255, 235, 224, 0.84)");
  coreGradient.addColorStop(1, "rgba(255, 72, 86, 0.5)");

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255, 22, 48, 0.2)";
  drawBeamCone(centerX, centerY, targetX, targetY, nx, ny, topWidth * 4.8, bottomWidth * 1.7, ctx.fillStyle, shimmer * 1.8);

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 23, 43, 0.95)";
  ctx.shadowBlur = 46;

  drawBeamCone(centerX, centerY, targetX, targetY, nx, ny, topWidth * 2.6, bottomWidth * 1.24, outerGradient, shimmer);
  ctx.shadowBlur = 24;
  drawBeamCone(centerX, centerY, targetX, targetY, nx, ny, topWidth * 1.1, bottomWidth * 0.36, coreGradient, -shimmer * 0.5);

  ctx.fillStyle = `rgba(255, 247, 238, ${0.78 + Math.sin(age * 0.06) * 0.16})`;
  ctx.beginPath();
  ctx.arc(centerX, centerY, bossSize * 0.042, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 217, 206, ${0.58 + Math.sin(age * 0.03) * 0.18})`;
  ctx.lineWidth = Math.max(1.5, bossSize * 0.012);
  ctx.beginPath();
  ctx.moveTo(centerX + nx * topWidth, centerY + ny * topWidth);
  ctx.lineTo(targetX + nx * bottomWidth, targetY + ny * bottomWidth);
  ctx.moveTo(centerX - nx * topWidth, centerY - ny * topWidth);
  ctx.lineTo(targetX - nx * bottomWidth, targetY - ny * bottomWidth);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 46, 56, 0.32)";
  ctx.beginPath();
  ctx.ellipse(targetX, targetY, bottomWidth * 0.72, bottomWidth * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 238, 226, 0.58)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBeamCone(startX, startY, endX, endY, normalX, normalY, startWidth, endWidth, fillStyle, jitter) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(startX + normalX * startWidth, startY + normalY * startWidth);
  ctx.lineTo(endX + normalX * (endWidth + jitter), endY + normalY * (endWidth + jitter));
  ctx.lineTo(endX - normalX * (endWidth - jitter), endY - normalY * (endWidth - jitter));
  ctx.lineTo(startX - normalX * startWidth, startY - normalY * startWidth);
  ctx.closePath();
  ctx.fill();
}

function drawFallbackBoss(size) {
  ctx.fillStyle = "rgba(48, 12, 18, 0.72)";
  ctx.strokeStyle = "rgba(255, 75, 82, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShip(width, height, now) {
  if (game.mode === "title" || game.mode === "gameover") {
    return;
  }

  const pose = getShipPose(width, height);
  const shipX = pose.x;
  const shipY = pose.y;
  const shipWidth = Math.min(width * 0.22, 250);
  const shipHeight = shipWidth * 0.68;
  const deathProgress =
    game.mode === "playerDestroyed" || game.mode === "continue"
      ? Math.min(1, (now - game.playerDeathStartedAt) / SHIP_DEATH_PROMPT_DELAY_MS)
      : 0;
  const flamePulse = 0.82 + Math.sin(now * 0.026) * 0.16 + Math.sin(now * 0.051) * 0.08;
  const boost = 1 + game.speedPulse * 0.45;

  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(pose.rotation + deathProgress * 0.32);

  if (deathProgress < 0.38) {
    drawEngineFlame(-shipWidth * 0.18, shipHeight * 0.24, shipWidth, flamePulse, boost, now, -1);
    drawEngineFlame(shipWidth * 0.18, shipHeight * 0.24, shipWidth, flamePulse, boost, now, 1);
  }

  if (shipImage.complete && shipImage.naturalWidth > 0) {
    ctx.globalAlpha = 0.97 * (1 - deathProgress * 0.82);
    ctx.shadowColor = "rgba(61, 213, 255, 0.36)";
    ctx.shadowBlur = 18;
    ctx.drawImage(shipImage, -shipWidth / 2, -shipHeight * 0.58, shipWidth, shipHeight);
  } else {
    drawFallbackShip(now);
  }
  if (deathProgress > 0) {
    drawPlayerExplosion(shipWidth, now, deathProgress);
  }
  ctx.restore();
}

function getShipPose(
  width,
  height,
  lane = game.lane,
  laneTarget = game.laneTarget,
  laneVelocity = game.laneVelocity,
) {
  const x = width * (0.5 + getLaneOffset(lane) * 0.34);
  const targetX = width * (0.5 + getLaneOffset(laneTarget) * 0.34);
  let y = height * 0.79;

  if (game.mode === "intro") {
    const progress = easeOutCubic(
      Math.min(1, (performance.now() - game.introStartedAt) / SHIP_INTRO_DURATION_MS),
    );
    y = height * (1.22 - 0.43 * progress);
  } else if (game.mode === "playerDestroyed" || game.mode === "continue") {
    const progress = easeInCubic(
      Math.min(1, (performance.now() - game.playerDeathStartedAt) / SHIP_DEATH_PROMPT_DELAY_MS),
    );
    y = height * (0.79 + 0.42 * progress);
  }

  const vanishPoint = getFlightVanishPoint(width, height);
  const aimRotation = Math.atan2(vanishPoint.x - x, y - vanishPoint.y);
  const bankInput = Math.max(-1, Math.min(1, laneVelocity * 0.86 + (laneTarget - lane) * 0.38));
  const bankRotation = bankInput * SHIP_BANK_MAX_ROTATION;

  return {
    x,
    y,
    drift: targetX - x,
    rotation: aimRotation + bankRotation,
  };
}

function getLaneOffset(lanePosition) {
  const clampedLane = Math.max(0, Math.min(2, lanePosition));
  const lowerLane = Math.floor(clampedLane);
  const upperLane = Math.ceil(clampedLane);
  const blend = clampedLane - lowerLane;

  return lanes[lowerLane] + (lanes[upperLane] - lanes[lowerLane]) * blend;
}

function getFlightVanishPoint(width, height) {
  return {
    x: width * 0.5,
    y: height * 0.34,
  };
}

function drawPlayerExplosion(shipWidth, now, progress) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 152, 58, 0.92)";
  ctx.shadowBlur = 26;

  for (let index = 0; index < 12; index += 1) {
    const angle = index * 2.12 + Math.sin(now * 0.003 + index) * 0.22;
    const distance = shipWidth * (0.05 + progress * (0.12 + (index % 4) * 0.035));
    const radius = shipWidth * (0.018 + (index % 3) * 0.007) * (1 - progress * 0.35);
    const alpha = Math.max(0, 0.86 - progress * 0.72);

    ctx.fillStyle = `rgba(255, ${130 + index * 5}, 62, ${alpha})`;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.68, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shipWidth * (0.28 + progress * 0.34));
  gradient.addColorStop(0, `rgba(255, 255, 240, ${0.86 * (1 - progress)})`);
  gradient.addColorStop(0.2, `rgba(255, 94, 52, ${0.76 * (1 - progress * 0.35)})`);
  gradient.addColorStop(1, "rgba(255, 44, 28, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, shipWidth * (0.24 + progress * 0.24), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value) {
  return value * value * value;
}

function getShipMuzzle(width, height, shot = game) {
  const pose = getShipPose(
    width,
    height,
    shot.lane ?? game.lane,
    shot.laneTarget ?? game.laneTarget,
    shot.laneVelocity ?? game.laneVelocity,
  );
  const shipWidth = Math.min(width * 0.22, 250);
  const shipHeight = shipWidth * 0.68;
  return {
    x: pose.x,
    y: pose.y - shipHeight * 0.54,
  };
}

function getForwardVanishPoint(width, height, shot = {}) {
  const muzzle = getShipMuzzle(width, height, shot);
  const vanishPoint = getFlightVanishPoint(width, height);
  const towardCenter = (width * 0.5 - muzzle.x) * 0.36;
  return {
    x: muzzle.x + towardCenter,
    y: vanishPoint.y,
  };
}

function drawEngineFlame(offsetX, offsetY, shipWidth, flamePulse, boost, now, side) {
  const flameLength = shipWidth * (0.2 + flamePulse * 0.16) * boost;
  const flameWidth = shipWidth * (0.046 + Math.sin(now * 0.04 + side) * 0.008);
  const flicker = Math.sin(now * 0.07 + side * 2.4) * 5;
  const gradient = ctx.createLinearGradient(offsetX, offsetY - 4, offsetX, offsetY + flameLength);

  gradient.addColorStop(0, "rgba(234, 255, 255, 0.96)");
  gradient.addColorStop(0.22, "rgba(79, 220, 255, 0.9)");
  gradient.addColorStop(0.62, "rgba(31, 137, 255, 0.46)");
  gradient.addColorStop(1, "rgba(39, 111, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(70, 210, 255, 0.95)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(offsetX - flameWidth, offsetY - 2);
  ctx.bezierCurveTo(
    offsetX - flameWidth * 1.45,
    offsetY + flameLength * 0.25,
    offsetX - flameWidth * 0.85 + flicker * 0.15,
    offsetY + flameLength * 0.78,
    offsetX + flicker * 0.12,
    offsetY + flameLength,
  );
  ctx.bezierCurveTo(
    offsetX + flameWidth * 0.85 + flicker * 0.15,
    offsetY + flameLength * 0.78,
    offsetX + flameWidth * 1.45,
    offsetY + flameLength * 0.25,
    offsetX + flameWidth,
    offsetY - 2,
  );
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(174, 241, 255, 0.85)";
  ctx.lineWidth = Math.max(1, shipWidth * 0.008);
  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY + flameLength * 0.15);
  ctx.lineTo(offsetX + flicker * 0.3, offsetY + flameLength * 0.88);
  ctx.stroke();
  ctx.restore();
}

function drawFallbackShip(now) {
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "rgba(218, 247, 255, 0.36)";
  ctx.strokeStyle = "rgba(123, 232, 255, 0.72)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(30, 24);
  ctx.lineTo(9, 17);
  ctx.lineTo(0, 34);
  ctx.lineTo(-9, 17);
  ctx.lineTo(-30, 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(80, 191, 255, ${0.42 + Math.sin(now * 0.02) * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(-13, 32, 6, 24, 0, 0, Math.PI * 2);
  ctx.ellipse(13, 32, 6, 24, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawShots(width, height, now) {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    const age = now - shot.born;
    const lifetime =
      shot.type === "laser" ? 920 : shot.type === "spread" ? 300 : 170;
    if (age > lifetime) {
      shots.splice(i, 1);
      continue;
    }

    const alpha = 1 - age / lifetime;
    if (shot.type === "laser") {
      drawPlayerLaser(width, height, shot, age, alpha);
    } else if (shot.type === "spread") {
      drawSpreadShot(width, height, shot, age, alpha);
    } else {
      drawMachineTracer(width, height, shot, age, alpha);
    }
  }

  for (let i = blasts.length - 1; i >= 0; i -= 1) {
    const blast = blasts[i];
    const age = now - blast.born;
    const lifetime = blast.small ? 240 : 720;
    if (age > lifetime) {
      blasts.splice(i, 1);
      continue;
    }
    const alpha = 1 - age / lifetime;
    const target = getForwardVanishPoint(width, height, blast);
    const radius = blast.type === "spread" ? 21 : blast.type === "machine" ? 14 : 34;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(125, 241, 255, ${alpha})`;
    ctx.lineWidth = blast.small ? 3.4 : 5.8;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius * (1 + age / lifetime), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = blast.small ? 1.4 : 2.6;
    ctx.stroke();
    ctx.restore();
  }
}

function drawMachineTracer(width, height, shot, age, alpha) {
  const muzzle = getShipMuzzle(width, height, shot);
  const target = getForwardVanishPoint(width, height, shot);
  const progress = Math.min(1, age / 160);
  const tail = Math.max(0, progress - 0.24);
  const start = lerpPoint(muzzle, target, tail);
  const end = lerpPoint(muzzle, target, Math.min(1, progress + 0.12));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(102, 236, 255, 0.92)";
  ctx.shadowBlur = 22;
  ctx.strokeStyle = `rgba(145, 245, 255, ${0.86 * alpha})`;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.74 * alpha})`;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}

function drawSpreadShot(width, height, shot, age, alpha) {
  const muzzle = getShipMuzzle(width, height, shot);
  const target = getForwardVanishPoint(width, height, shot);
  const progress = Math.min(1, age / 260);
  const spreadOffsets = [-0.055, 0, 0.055];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 196, 92, 0.86)";
  ctx.shadowBlur = 16;

  spreadOffsets.forEach((offset, index) => {
    const side = offset * width * (0.25 + progress * 0.85);
    const endTarget = {
      x: target.x + side,
      y: target.y + Math.abs(offset) * height * 0.035,
    };
    const start = lerpPoint(muzzle, endTarget, Math.max(0, progress - 0.12));
    const end = lerpPoint(muzzle, endTarget, progress);
    const pulse = 0.75 + Math.sin(age * 0.08 + shot.seed + index) * 0.25;

    ctx.strokeStyle =
      index === 1
        ? `rgba(129, 239, 255, ${0.72 * alpha})`
        : `rgba(255, 211, 91, ${0.78 * alpha})`;
    ctx.lineWidth = 3.6 + pulse * 1.2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 252, 222, ${0.82 * alpha})`;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 5 + pulse * 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawPlayerLaser(width, height, shot, age, alpha) {
  const muzzle = getShipMuzzle(width, height, shot);
  const target = getForwardVanishPoint(width, height, shot);
  const dx = target.x - muzzle.x;
  const dy = target.y - muzzle.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const shimmer = Math.sin(age * 0.08 + shot.seed) * 2.5;
  const outerGradient = ctx.createLinearGradient(muzzle.x, muzzle.y, target.x, target.y);
  const coreGradient = ctx.createLinearGradient(muzzle.x, muzzle.y, target.x, target.y);

  outerGradient.addColorStop(0, `rgba(62, 221, 255, ${0.68 * alpha})`);
  outerGradient.addColorStop(0.42, `rgba(86, 166, 255, ${0.62 * alpha})`);
  outerGradient.addColorStop(1, `rgba(121, 240, 255, ${0.18 * alpha})`);
  coreGradient.addColorStop(0, `rgba(246, 255, 255, ${alpha})`);
  coreGradient.addColorStop(0.55, `rgba(117, 235, 255, ${0.88 * alpha})`);
  coreGradient.addColorStop(1, `rgba(184, 251, 255, ${0.42 * alpha})`);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(92, 229, 255, 0.72)";
  ctx.shadowBlur = 22;
  drawBeamCone(
    muzzle.x,
    muzzle.y,
    target.x,
    target.y,
    nx,
    ny,
    52,
    11,
    `rgba(78, 220, 255, ${0.84 * alpha})`,
    shimmer * 0.4,
  );

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(80, 219, 255, 0.96)";
  ctx.shadowBlur = 36;
  drawBeamCone(muzzle.x, muzzle.y, target.x, target.y, nx, ny, 29, 6, outerGradient, shimmer);
  ctx.shadowBlur = 18;
  drawBeamCone(muzzle.x, muzzle.y, target.x, target.y, nx, ny, 10, 2, coreGradient, -shimmer * 0.35);

  ctx.strokeStyle = `rgba(238, 255, 255, ${Math.min(1, 0.32 + 0.68 * alpha)})`;
  ctx.lineCap = "round";
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.moveTo(muzzle.x, muzzle.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(135, 238, 255, 0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = `rgba(233, 255, 255, ${Math.min(1, 0.38 + 0.62 * alpha)})`;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(muzzle.x, muzzle.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(104, 231, 255, ${0.78 * alpha})`;
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  ctx.moveTo(muzzle.x + nx * 28, muzzle.y + ny * 28);
  ctx.quadraticCurveTo(
    (muzzle.x + target.x) * 0.5 + Math.sin(age * 0.06 + shot.seed) * 18,
    (muzzle.y + target.y) * 0.5,
    target.x + nx * 4,
    target.y + ny * 4,
  );
  ctx.moveTo(muzzle.x - nx * 28, muzzle.y - ny * 28);
  ctx.quadraticCurveTo(
    (muzzle.x + target.x) * 0.5 - Math.sin(age * 0.07 + shot.seed) * 14,
    (muzzle.y + target.y) * 0.5,
    target.x - nx * 4,
    target.y - ny * 4,
  );
  ctx.stroke();

  const flare = 16 + Math.sin(age * 0.12 + shot.seed) * 5;
  ctx.fillStyle = `rgba(232, 253, 255, ${0.78 * alpha})`;
  ctx.beginPath();
  ctx.arc(muzzle.x, muzzle.y, flare, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(76, 223, 255, ${0.46 * alpha})`;
  ctx.beginPath();
  ctx.arc(muzzle.x, muzzle.y, flare * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function lerpPoint(start, end, t) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function drawBulletTimeOverlay(width, height) {
  ctx.fillStyle = "rgba(11, 52, 78, 0.18)";
  ctx.fillRect(0, 0, width, height);
}

function capturePointer(element, event) {
  try {
    element.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events used by tests may not have an active browser pointer.
  }
}

function releasePointer(element, event) {
  try {
    element.releasePointerCapture?.(event.pointerId);
  } catch {
    // Matching capture may be absent after synthetic or cancelled pointer flows.
  }
}

function startHackDrag(event) {
  if (!game.hack || game.mode !== "hack" || game.paused) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  hackDrag.active = true;
  hackDrag.pointerId = event.pointerId;
  capturePointer(hackGrid, event);
  moveHackAtPoint(event.clientX, event.clientY);
}

function updateHackDrag(event) {
  if (!hackDrag.active || event.pointerId !== hackDrag.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  moveHackAtPoint(event.clientX, event.clientY);
}

function stopHackDrag(event) {
  if (!hackDrag.active || event.pointerId !== hackDrag.pointerId) {
    return;
  }

  hackDrag.active = false;
  hackDrag.pointerId = null;
  releasePointer(hackGrid, event);
}

function setupHoldControl(button, action) {
  let repeatId = null;

  const stop = () => {
    if (repeatId !== null) {
      window.clearInterval(repeatId);
      repeatId = null;
    }
    button.classList.remove("pressed");
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (game.paused) {
      return;
    }
    if (tryRestartAfterBossVictory()) {
      return;
    }
    if (!["flight", "chronoRun"].includes(game.mode)) {
      if (game.mode === "hack") {
        cancelHack();
      }
      return;
    }
    capturePointer(button, event);
    button.classList.add("pressed");
    flashControl(button, 260);
    moveFlight(action);
    stop();
    button.classList.add("pressed");
    repeatId = window.setInterval(() => moveFlight(action), 220);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("lostpointercapture", stop);
  button.addEventListener("pointerleave", (event) => {
    if (!event.isPrimary) {
      return;
    }
    stop();
  });
}

setupHoldControl(moveLeftButton, "moveLeft");
setupHoldControl(moveRightButton, "moveRight");
setupHoldControl(touchMoveLeftZone, "moveLeft");
setupHoldControl(touchMoveRightZone, "moveRight");

hackGrid.addEventListener("pointerdown", startHackDrag);
hackGrid.addEventListener("pointermove", updateHackDrag);
hackGrid.addEventListener("pointerup", stopHackDrag);
hackGrid.addEventListener("pointercancel", stopHackDrag);
hackGrid.addEventListener("lostpointercapture", stopHackDrag);

let fireRepeatId = null;

function stopFireRepeat() {
  if (fireRepeatId !== null) {
    window.clearInterval(fireRepeatId);
    fireRepeatId = null;
  }
  fireButton.classList.remove("pressed");
  touchFireZone.classList.remove("pressed");
}

function handleFirePointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (tryRestartAfterBossVictory()) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
    return;
  }
  flashControl(fireButton);
  flashControl(touchFireZone);
  capturePointer(event.currentTarget, event);
  stopFireRepeat();
  fireButton.classList.add("pressed");
  touchFireZone.classList.add("pressed");
  if (game.mode === "chronoRun") {
    fireRunWeapon();
  } else {
    fireWeapon();
  }
  fireRepeatId = window.setInterval(() => {
    if (game.paused || !["flight", "chronoRun"].includes(game.mode) || game.bossDefeated) {
      stopFireRepeat();
      return;
    }
    if (game.mode === "chronoRun") {
      fireRunWeapon();
    } else {
      fireWeapon();
    }
  }, 90);
}

fireButton.addEventListener("pointerdown", handleFirePointerDown);
fireButton.addEventListener("pointerup", stopFireRepeat);
fireButton.addEventListener("pointercancel", stopFireRepeat);
fireButton.addEventListener("lostpointercapture", stopFireRepeat);
touchFireZone.addEventListener("pointerdown", handleFirePointerDown);
touchFireZone.addEventListener("pointerup", stopFireRepeat);
touchFireZone.addEventListener("pointercancel", stopFireRepeat);
touchFireZone.addEventListener("lostpointercapture", stopFireRepeat);

weaponButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (game.paused) {
      return;
    }
    if (tryRestartAfterBossVictory()) {
      return;
    }
    if (game.mode === "hack") {
      cancelHack();
    }
    flashControl(button);
    setWeapon(button.dataset.weapon);
  });
});

weaponDock.addEventListener("pointerdown", (event) => {
  if (event.target !== weaponDock) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (tryRestartAfterBossVictory()) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
  }
  if (game.mode === "flight") {
    flashControl(weaponDock);
    cycleWeapon();
  }
});

function handleHackPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (tryRestartAfterBossVictory()) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
  } else if (game.mode === "chronoRun") {
    flashControl(hackButton);
    flashControl(touchHackZone);
    enterRunMinigame();
  } else {
    flashControl(hackButton);
    flashControl(touchHackZone);
    enterHack();
  }
}

hackButton.addEventListener("pointerdown", handleHackPointerDown);
touchHackZone.addEventListener("pointerdown", handleHackPointerDown);

touchWeaponZone.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (tryRestartAfterBossVictory()) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
  }
  if (game.mode === "flight") {
    flashControl(touchWeaponZone);
    flashControl(weaponDock);
    cycleWeapon();
  }
});

chronoRunButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.mode === "title") {
    requestGameFullscreen();
    startChronoRun();
  }
});

chronoBossButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.mode === "title") {
    requestGameFullscreen();
    restartChronoBoss();
  }
});

startOverlay.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (chronoRunButton.contains(event.target) || chronoBossButton.contains(event.target)) {
    return;
  }
  if (game.mode === "title") {
    requestGameFullscreen();
    startChronoRun();
  }
});

gameShell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (game.paused) {
    return;
  }
  if (tryRestartAfterBossVictory()) {
    return;
  }
  if (game.mode === "flight") {
    flashControl(hackButton);
    flashControl(touchHackZone);
    enterHack();
  }
});

pauseButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setPaused(!game.paused);
});

resumeButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setPaused(false);
});

pauseRunButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  restartChronoRun();
});

pauseBossButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  restartChronoBoss();
});

pauseOverlay.addEventListener("pointerdown", (event) => {
  if (event.target !== pauseOverlay) {
    return;
  }
  event.preventDefault();
  setPaused(false);
});

document.addEventListener("pointerdown", (event) => {
  if (game.paused) {
    return;
  }

  if (tryRestartAfterBossVictory()) {
    event.preventDefault();
    return;
  }

  if (game.mode !== "hack") {
    return;
  }
  if (hackPanel.contains(event.target) || hackButton.contains(event.target)) {
    return;
  }
  cancelHack();
});

restartOverlay.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  activatePromptAction();
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    setPaused(!game.paused);
    return;
  }
  if (game.paused) {
    event.preventDefault();
    return;
  }

  if (game.promptAction && shouldAdvancePromptFromKey(event)) {
    event.preventDefault();
    activatePromptAction();
    return;
  }

  if (
    game.mode === "title" ||
    game.mode === "intro" ||
    game.mode === "playerDestroyed" ||
    game.mode === "continue" ||
    game.mode === "gameover"
  ) {
    return;
  }

  const flightAction = mapFlightInput(event);
  const hackAction = mapHackInput(event);
  if (flightAction || hackAction) {
    event.preventDefault();
  }

  if (game.mode === "hack") {
    if (flightAction === "hack") {
      cancelHack();
    } else if (hackAction) {
      moveHack(hackAction);
    }
    return;
  }

  if (flightAction === "moveLeft") {
    moveFlight("moveLeft");
  } else if (flightAction === "moveRight") {
    moveFlight("moveRight");
  } else if (flightAction === "fire") {
    if (game.mode === "chronoRun") {
      fireRunWeapon();
    } else {
      fireWeapon();
    }
  } else if (flightAction === "switchWeapon") {
    cycleWeapon();
  } else if (flightAction === "hack") {
    if (game.mode === "chronoRun") {
      enterRunMinigame();
    } else {
      enterHack();
    }
  }
});

resizeCanvas();
updateWeaponUi();
updateHud();
requestAnimationFrame(update);
