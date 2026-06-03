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
  updateHackTimer,
} from "./gameLogic.js";

const canvas = document.querySelector("#spaceCanvas");
const ctx = canvas.getContext("2d");
const shipImage = new Image();
shipImage.src = new URL("../public/assets/ship-player.png", import.meta.url).href;
const bossImage = new Image();
bossImage.src = new URL("../public/assets/boss-mothership.png", import.meta.url).href;
const hpBar = document.querySelector("#hpBar");
const ammoBar = document.querySelector("#ammoBar");
const bossBar = document.querySelector("#bossBar");
const bossShieldBar = document.querySelector("#bossShieldBar");
const damageReadout = document.querySelector("#damageReadout");
const startOverlay = document.querySelector("#startOverlay");
const timerPanel = document.querySelector("#timerPanel");
const timerValue = document.querySelector("#timerValue");
const hackPanel = document.querySelector("#hackPanel");
const hackGrid = document.querySelector("#hackGrid");
const hackStatus = document.querySelector("#hackStatus");
const routeStats = document.querySelector("#routeStats");
const boostCounter = document.querySelector("#boostCounter");
const moveLeftButton = document.querySelector("#moveLeftButton");
const moveRightButton = document.querySelector("#moveRightButton");
const fireButton = document.querySelector("#fireButton");
const hackButton = document.querySelector("#hackButton");
const weaponButtons = Array.from(document.querySelectorAll("[data-weapon]"));
const restartOverlay = document.querySelector("#restartOverlay");
const promptTitle = restartOverlay.querySelector("strong");
const promptSubtitle = restartOverlay.querySelector("span");
const livesIcons = document.querySelector("#livesIcons");
const livesText = document.querySelector("#livesText");
const pauseButton = document.querySelector("#pauseButton");
const pauseOverlay = document.querySelector("#pauseOverlay");
const resumeButton = document.querySelector("#resumeButton");
const toast = document.querySelector("#toast");

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

const game = {
  mode: "title",
  lane: 1,
  laneTarget: 1,
  hp: PLAYER_MAX_HP,
  lives: PLAYER_MAX_LIVES,
  ammo: 100,
  bossHp: BOSS_MAX_HP,
  bossShieldHp: BOSS_MAX_SHIELD,
  hack: null,
  boostMultiplierPreview: 1,
  travel: 0,
  speedPulse: 0,
  messageUntil: 0,
  lastShotAt: 0,
  selectedWeapon: "machine",
  bossMode: "normal",
  bossModeStartedAt: performance.now(),
  bossBeamHitAt: 0,
  bossShieldBrokenAt: 0,
  bossBreakUntil: 0,
  bossDefeated: false,
  bossDefeatedAt: 0,
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

  game.mode = "hack";
  game.hack = createInitialHackState({ board: createRandomHackBoard(), now });
  game.boostMultiplierPreview = 1;
  renderHackGrid();
  setToast("BULLET TIME LINK OPEN", 900);
}

function cancelHack() {
  if (game.mode !== "hack") {
    return;
  }

  game.mode = "flight";
  game.hack = null;
  renderHackGrid();
  setToast("HACK CANCELLED", 650);
}

function fireWeapon(now = performance.now()) {
  const weapon = weaponConfigs[game.selectedWeapon];
  if (
    game.mode !== "flight" ||
    game.bossDefeated ||
    !weapon ||
    game.ammo < weapon.ammoCost ||
    now - game.lastShotAt < weapon.cooldown
  ) {
    return;
  }

  const hit = applyBossDamage(weapon.damage, isBossBreakActive() ? "break" : "normal");
  game.lastShotAt = now;
  game.ammo = Math.max(0, game.ammo - weapon.ammoCost);
  recordShieldImpact(hit, now, game.selectedWeapon);
  shots.push({
    born: now,
    type: game.selectedWeapon,
    damage: hit.displayDamage,
    lane: game.lane,
    laneTarget: game.laneTarget,
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
    shielded: hit.shieldDamage > 0,
  });
  damageReadout.textContent = formatWeaponReadout(weapon, hit);
  maybeResetBoss();
}

function resolveHack(status) {
  if (!game.hack) {
    return;
  }

  if (status === "success") {
    const now = performance.now();
    const breakDuration = resolveHackBreakDuration({
      boostsCollected: game.hack.boostsCollected,
    });
    game.bossBreakUntil = Math.max(game.bossBreakUntil, now + breakDuration);
    game.ammo = Math.min(100, game.ammo + 26);
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
  return game.mode === "flight" || game.mode === "hack";
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
  game.bossMode = "defeated";
  game.mode = "defeated";
  game.hack = null;
  game.bossBreakUntil = 0;
  game.promptAction = "bossRestart";
  game.bossShieldHp = 0;
  game.speedPulse = 1;
  shots.length = 0;
  shieldImpacts.length = 0;
  renderHackGrid();
  showPrompt("再玩一次?", "CLICK / TAP ANYWHERE", "bossRestart");
  damageReadout.textContent = "BOSS DESTROYED";
  setToast("MOTHERSHIP DOWN", 1800);
}

function resetGame(now = performance.now(), { startMode = "intro" } = {}) {
  game.mode = startMode === "title" ? "title" : "intro";
  game.lane = 1;
  game.laneTarget = 1;
  game.hp = PLAYER_MAX_HP;
  game.lives = PLAYER_MAX_LIVES;
  game.ammo = 100;
  game.bossHp = BOSS_MAX_HP;
  game.bossShieldHp = BOSS_MAX_SHIELD;
  game.hack = null;
  game.boostMultiplierPreview = 1;
  game.speedPulse = 0;
  game.lastShotAt = 0;
  game.selectedWeapon = "machine";
  game.bossMode = "normal";
  game.bossModeStartedAt = now;
  game.bossBeamHitAt = 0;
  game.bossShieldBrokenAt = 0;
  game.bossBreakUntil = 0;
  game.bossDefeated = false;
  game.bossDefeatedAt = 0;
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
  game.lane = 1;
  game.laneTarget = 1;
  game.hack = null;
  game.paused = false;
  game.lastTime = now;
  hidePrompt();
  startOverlay.classList.add("hidden");
  syncPauseUi();
  renderHackGrid();
  setToast("LAUNCH", 800);
}

function beginPlayerDestroyed(outcome, now = performance.now()) {
  game.mode = "playerDestroyed";
  game.hack = null;
  game.playerDeathStartedAt = now;
  game.playerDeathOutcome = outcome;
  game.bossBreakUntil = 0;
  game.speedPulse = 1;
  shots.length = 0;
  renderHackGrid();
  damageReadout.textContent = outcome === "gameover" ? "SHIP LOST" : "SHIP DOWN";
  setToast(outcome === "gameover" ? "FINAL SHIP LOST" : "SHIP LOST", 1100);
}

function continuePlayer(now = performance.now()) {
  game.hp = PLAYER_MAX_HP;
  game.ammo = Math.min(100, Math.max(game.ammo, 70));
  game.lane = 1;
  game.laneTarget = 1;
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

function resetHazards() {
  hazards.forEach((hazard, index) => {
    hazard.lane = index % 3;
    hazard.z = 0.12 + Math.random() * 0.9;
    hazard.phase = Math.random() * Math.PI * 2;
  });
}

function setPaused(paused, now = performance.now()) {
  if ((game.bossDefeated || !isGameplayActive()) && paused) {
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
      cell.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        moveHackToCell(rowIndex, colIndex);
      });
      hackGrid.append(cell);
    });
  });

  const multiplierText =
    game.hack.boostsCollected > 0 ? `x${game.boostMultiplierPreview}` : "x1";
  boostCounter.textContent = multiplierText;
  routeStats.textContent = `${game.hack.boostsCollected} BOOST`;
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

function moveFlight(direction) {
  if (game.mode !== "flight") {
    return;
  }

  if (direction === "moveLeft") {
    game.laneTarget = Math.max(0, game.laneTarget - 1);
    game.speedPulse = 1;
  } else if (direction === "moveRight") {
    game.laneTarget = Math.min(2, game.laneTarget + 1);
    game.speedPulse = 1;
  }
}

function setWeapon(type, { announce = true } = {}) {
  if (!weaponConfigs[type]) {
    return;
  }

  game.selectedWeapon = type;
  updateWeaponUi();
  if (announce) {
    setToast(`${weaponConfigs[type].name} SELECTED`, 620);
  }
}

function cycleWeapon() {
  const index = weaponOrder.indexOf(game.selectedWeapon);
  const next = weaponOrder[(index + 1) % weaponOrder.length];
  setWeapon(next);
}

function updateWeaponUi() {
  weaponButtons.forEach((button) => {
    const isActive = button.dataset.weapon === game.selectedWeapon;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const weapon = weaponConfigs[game.selectedWeapon];
  fireButton.querySelector("small").textContent = `0 ${weapon.short}`;
}

function setToast(message, duration) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  game.messageUntil = performance.now() + duration;
}

function update(now) {
  if (game.paused) {
    game.lastTime = now;
    requestAnimationFrame(update);
    return;
  }

  const delta = Math.min(48, now - game.lastTime);
  game.lastTime = now;
  const speed = game.mode === "hack" ? 0.35 : 1;
  game.travel += delta * 0.0018 * speed;
  game.speedPulse = Math.max(0, game.speedPulse - delta * 0.0025);
  updateIntro(now);
  updatePlayerDestroyed(now);
  updateBossBreak(now);
  updateBoss(now, delta);

  if (game.mode === "flight") {
    game.ammo = Math.min(100, game.ammo + delta * 0.012);
    game.lane += (game.laneTarget - game.lane) * 0.16;
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

function updateIntro(now) {
  if (game.mode !== "intro") {
    return;
  }

  const progress = Math.min(1, (now - game.introStartedAt) / SHIP_INTRO_DURATION_MS);
  game.lane += (game.laneTarget - game.lane) * 0.12;
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

  if (game.playerDeathOutcome === "continue") {
    game.mode = "continue";
    showPrompt("Continue", "TAP TO LAUNCH NEXT SHIP", "continue");
  } else {
    game.mode = "gameover";
    showPrompt("Game Over", "TAP TO RESTART", "gameover");
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
  hpBar.style.width = `${Math.max(0, Math.min(100, game.hp))}%`;
  ammoBar.style.width = `${game.ammo}%`;
  bossBar.style.width = `${(game.bossHp / BOSS_MAX_HP) * 100}%`;
  bossShieldBar.style.width = `${(game.bossShieldHp / BOSS_MAX_SHIELD) * 100}%`;
  bossShieldBar.parentElement.classList.toggle("break", isBossBreakActive());
  livesText.textContent = `x ${game.lives}`;
  livesIcons.textContent = "";
  for (let index = 0; index < PLAYER_MAX_LIVES; index += 1) {
    const icon = document.createElement("span");
    icon.className = "life-ship";
    icon.classList.toggle("spent", index >= game.lives);
    livesIcons.append(icon);
  }
}

function draw(now) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  drawSpace(width, height, now);
  drawWarpTunnel(width, height, now);
  drawFlightPath(width, height, now);
  if (game.mode !== "title") {
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
    const starSpeed = game.mode === "hack" ? 0.004 : 0.019;
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

function drawBoss(width, height, now) {
  const pose = getBossPose(width, height, now);
  const defeatedProgress = game.bossDefeated
    ? Math.min(1, (now - game.bossDefeatedAt) / 2600)
    : 0;
  const chargeProgress =
    game.bossMode === "charging"
      ? Math.min(1, (now - game.bossModeStartedAt) / bossTimings.charging)
      : 0;
  const cooldown = game.bossMode === "cooldown";
  const attack = game.bossMode === "charging" || game.bossMode === "beam";
  const alpha = game.bossDefeated ? Math.max(0, 0.92 * (1 - defeatedProgress)) : cooldown ? 0.48 : 0.92;
  const ringSpeed = cooldown ? 0.00024 : attack ? 0.0024 + chargeProgress * 0.0027 : 0.00076;
  const ringRotation = now * ringSpeed;
  const bossSize = Math.min(width * 0.3, height * 0.48);
  const shake = attack ? Math.pow(chargeProgress, 1.5) * (2 + Math.sin(now * 0.06) * 2.4) : 0;
  const drawX = pose.x + (attack ? Math.sin(now * (0.018 + chargeProgress * 0.04)) * shake : 0);
  const drawY = pose.y + (attack ? Math.cos(now * (0.023 + chargeProgress * 0.05)) * shake : 0);

  ctx.save();
  ctx.translate(drawX, drawY);
  if (!game.bossDefeated) {
    drawBossRings(bossSize, ringRotation, chargeProgress, cooldown);
  }

  ctx.globalAlpha = alpha;
  ctx.shadowColor = cooldown ? "rgba(80, 20, 30, 0.24)" : "rgba(255, 44, 52, 0.45)";
  ctx.shadowBlur = cooldown ? 10 : 26 + chargeProgress * 34;
  if (bossImage.complete && bossImage.naturalWidth > 0) {
    ctx.drawImage(bossImage, -bossSize / 2, -bossSize / 2, bossSize, bossSize);
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
  const smokeAlpha = Math.max(0, 0.46 - progress * 0.38);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 72, 56, 0.95)";
  ctx.shadowBlur = 38;

  for (let i = 0; i < 18; i += 1) {
    const angle = i * 2.399 + Math.sin(now * 0.001 + i) * 0.18;
    const distance = size * (0.05 + progress * (0.12 + (i % 5) * 0.035));
    const radius = size * (0.018 + (i % 4) * 0.006) * (1 - progress * 0.28);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.76;
    const alpha = Math.max(0, 0.82 - progress * 0.72);

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
  ctx.ellipse(0, size * 0.08, size * (0.35 + progress * 0.26), size * (0.22 + progress * 0.18), 0, 0, Math.PI * 2);
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
  const drift = pose.drift;
  const shipWidth = Math.min(width * 0.22, 250);
  const shipHeight = shipWidth * 0.68;
  const deathProgress =
    game.mode === "playerDestroyed" || game.mode === "continue"
      ? Math.min(1, (now - game.playerDeathStartedAt) / SHIP_DEATH_PROMPT_DELAY_MS)
      : 0;
  const flamePulse = 0.82 + Math.sin(now * 0.026) * 0.16 + Math.sin(now * 0.051) * 0.08;
  const boost = 1 + game.speedPulse * 0.45;
  const sway = Math.max(-1, Math.min(1, drift / 120));

  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(sway * 0.045 + deathProgress * 0.32);

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

function getShipPose(width, height, lane = game.lane, laneTarget = game.laneTarget) {
  const x = width * (0.5 + lanes[Math.round(lane)] * 0.34);
  const targetX = width * (0.5 + lanes[laneTarget] * 0.34);
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

  return {
    x: x + (targetX - x) * 0.45,
    y,
    drift: targetX - x,
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
  const pose = getShipPose(width, height, shot.lane ?? game.lane, shot.laneTarget ?? game.laneTarget);
  const shipWidth = Math.min(width * 0.22, 250);
  const shipHeight = shipWidth * 0.68;
  return {
    x: pose.x,
    y: pose.y - shipHeight * 0.54,
  };
}

function getForwardVanishPoint(width, height, shot = {}) {
  const muzzle = getShipMuzzle(width, height, shot);
  const towardCenter = (width * 0.5 - muzzle.x) * 0.36;
  return {
    x: muzzle.x + towardCenter,
    y: height * 0.34,
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
    const radius = blast.type === "spread" ? 16 : blast.type === "machine" ? 10 : 28;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(125, 241, 255, ${alpha})`;
    ctx.lineWidth = blast.small ? 2.5 : 4.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius * (1 + age / lifetime), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = blast.small ? 1 : 2;
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
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(145, 245, 255, ${0.86 * alpha})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.74 * alpha})`;
  ctx.lineWidth = 0.9;
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
    ctx.lineWidth = 2.6 + pulse;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 252, 222, ${0.82 * alpha})`;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 3.4 + pulse * 1.4, 0, Math.PI * 2);
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
    42,
    8,
    `rgba(78, 220, 255, ${0.84 * alpha})`,
    shimmer * 0.4,
  );

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(80, 219, 255, 0.96)";
  ctx.shadowBlur = 36;
  drawBeamCone(muzzle.x, muzzle.y, target.x, target.y, nx, ny, 23, 4.5, outerGradient, shimmer);
  ctx.shadowBlur = 18;
  drawBeamCone(muzzle.x, muzzle.y, target.x, target.y, nx, ny, 8, 1.4, coreGradient, -shimmer * 0.35);

  ctx.strokeStyle = `rgba(238, 255, 255, ${Math.min(1, 0.32 + 0.68 * alpha)})`;
  ctx.lineCap = "round";
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(muzzle.x, muzzle.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = "rgba(135, 238, 255, 0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = `rgba(233, 255, 255, ${Math.min(1, 0.38 + 0.62 * alpha)})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(muzzle.x, muzzle.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(104, 231, 255, ${0.78 * alpha})`;
  ctx.lineWidth = 2.2;
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

  const flare = 12 + Math.sin(age * 0.12 + shot.seed) * 4;
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
    if (game.mode !== "flight") {
      if (game.mode === "hack") {
        cancelHack();
      }
      return;
    }
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("pressed");
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

fireButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
    return;
  }
  fireWeapon();
});

weaponButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (game.paused) {
      return;
    }
    if (game.mode === "hack") {
      cancelHack();
    }
    setWeapon(button.dataset.weapon);
  });
});

hackButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.paused) {
    return;
  }
  if (game.mode === "hack") {
    cancelHack();
  } else {
    enterHack();
  }
});

startOverlay.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.mode === "title") {
    startIntro();
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

  if (game.bossDefeated) {
    event.preventDefault();
    resetGame();
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
  if (game.promptAction === "continue") {
    continuePlayer();
  } else if (game.promptAction === "gameover" || game.promptAction === "bossRestart") {
    resetGame(performance.now(), { startMode: "intro" });
  }
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
    fireWeapon();
  } else if (flightAction === "switchWeapon") {
    cycleWeapon();
  } else if (flightAction === "hack") {
    enterHack();
  }
});

resizeCanvas();
updateWeaponUi();
updateHud();
requestAnimationFrame(update);
