import {
  HACK_DURATION_MS,
  NODE_LABELS,
  createInitialHackState,
  createLaserDamage,
  createRandomHackBoard,
  mapFlightInput,
  mapHackInput,
  moveHackCursor,
  randomBoostMultiplier,
  resolveHackDamage,
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
const damageReadout = document.querySelector("#damageReadout");
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
  mode: "flight",
  lane: 1,
  laneTarget: 1,
  hp: 100,
  ammo: 100,
  bossHp: 180,
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
  bossPose: { x: 0.5, y: 0.34 },
  lastTime: performance.now(),
};

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function enterHack(now = performance.now()) {
  if (game.mode === "hack") {
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
    !weapon ||
    game.ammo < weapon.ammoCost ||
    now - game.lastShotAt < weapon.cooldown
  ) {
    return;
  }

  const baseDamage = weapon.damage;
  const damage = applyBossDamage(baseDamage);
  game.lastShotAt = now;
  game.ammo = Math.max(0, game.ammo - weapon.ammoCost);
  shots.push({
    born: now,
    type: game.selectedWeapon,
    damage,
    lane: game.lane,
    laneTarget: game.laneTarget,
    seed: Math.random() * Math.PI * 2,
  });
  blasts.push({ born: now, damage, small: game.selectedWeapon !== "laser", type: game.selectedWeapon });
  damageReadout.textContent =
    game.bossMode === "cooldown"
      ? `WEAK POINT HIT ${damage}`
      : `${weapon.readout} ${damage}`;
  maybeResetBoss();
}

function resolveHack(status) {
  if (!game.hack) {
    return;
  }

  if (status === "success") {
    const baseDamage = createLaserDamage();
    const chargedBaseDamage = resolveHackDamage({
      baseDamage,
      boostsCollected: game.hack.boostsCollected,
      random: Math.random,
    });
    const damage = applyBossDamage(chargedBaseDamage);
    game.ammo = Math.min(100, game.ammo + 26);
    blasts.push({ born: performance.now(), damage });
    damageReadout.textContent = `CHARGED OUTPUT ${damage}`;
    setToast(`HACK SUCCESS / DAMAGE ${damage}`, 1400);
  } else {
    game.hp = Math.max(0, game.hp - 40);
    damageReadout.textContent = "HEAVY DAMAGE";
    setToast("HACK FAILED / HEAVY DAMAGE", 1400);
  }

  game.mode = "flight";
  game.hack = null;
  maybeResetBoss();
  renderHackGrid();
}

function maybeResetBoss() {
  if (game.bossHp > 0) {
    return;
  }

  game.bossHp = 180;
  game.hp = Math.min(100, game.hp + 8);
  game.bossMode = "normal";
  game.bossModeStartedAt = performance.now();
  game.bossBeamHitAt = 0;
  setToast("MONSTER KNOCKBACK / NEXT TARGET", 1300);
}

function applyBossDamage(baseDamage) {
  const multiplier = game.bossMode === "cooldown" ? 3 : 1;
  const damage = baseDamage * multiplier;
  game.bossHp = Math.max(0, game.bossHp - damage);
  if (multiplier > 1) {
    game.speedPulse = 1;
  }
  return damage;
}

function updateBoss(now, delta) {
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
    game.hp = Math.max(0, game.hp - 18);
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
    window.setTimeout(() => resolveHack(game.hack.status), 180);
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
  const delta = Math.min(48, now - game.lastTime);
  game.lastTime = now;
  const speed = game.mode === "hack" ? 0.35 : 1;
  game.travel += delta * 0.0018 * speed;
  game.speedPulse = Math.max(0, game.speedPulse - delta * 0.0025);
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

function updateHud() {
  hpBar.style.width = `${game.hp}%`;
  ammoBar.style.width = `${game.ammo}%`;
  bossBar.style.width = `${(game.bossHp / 180) * 100}%`;
}

function draw(now) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  drawSpace(width, height, now);
  drawWarpTunnel(width, height, now);
  drawFlightPath(width, height, now);
  drawBoss(width, height, now);
  drawShip(width, height, now);
  drawShots(width, height, now);

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
  const chargeProgress =
    game.bossMode === "charging"
      ? Math.min(1, (now - game.bossModeStartedAt) / bossTimings.charging)
      : 0;
  const cooldown = game.bossMode === "cooldown";
  const attack = game.bossMode === "charging" || game.bossMode === "beam";
  const alpha = cooldown ? 0.48 : 0.92;
  const ringSpeed = cooldown ? 0.00024 : attack ? 0.0024 + chargeProgress * 0.0027 : 0.00076;
  const ringRotation = now * ringSpeed;
  const bossSize = Math.min(width * 0.3, height * 0.48);
  const shake = attack ? Math.pow(chargeProgress, 1.5) * (2 + Math.sin(now * 0.06) * 2.4) : 0;
  const drawX = pose.x + (attack ? Math.sin(now * (0.018 + chargeProgress * 0.04)) * shake : 0);
  const drawY = pose.y + (attack ? Math.cos(now * (0.023 + chargeProgress * 0.05)) * shake : 0);

  if (game.bossMode === "beam") {
    drawBossBeam(width, height, drawX, drawY, bossSize, now);
  }

  ctx.save();
  ctx.translate(drawX, drawY);
  drawBossRings(bossSize, ringRotation, chargeProgress, cooldown);

  ctx.globalAlpha = alpha;
  ctx.shadowColor = cooldown ? "rgba(80, 20, 30, 0.24)" : "rgba(255, 44, 52, 0.45)";
  ctx.shadowBlur = cooldown ? 10 : 26 + chargeProgress * 34;
  if (bossImage.complete && bossImage.naturalWidth > 0) {
    ctx.drawImage(bossImage, -bossSize / 2, -bossSize / 2, bossSize, bossSize);
  } else {
    drawFallbackBoss(bossSize);
  }

  ctx.globalAlpha = 1;
  drawBossCore(bossSize, now, chargeProgress, cooldown);
  if (game.bossMode === "charging") {
    drawCoreParticles(bossSize, now, chargeProgress);
    drawChargeCountdown(bossSize, chargeProgress);
  }
  ctx.restore();
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

function drawBossBeam(width, height, centerX, centerY, bossSize, now) {
  const age = now - game.bossModeStartedAt;
  const pulse = 0.85 + Math.sin(now * 0.055) * 0.16;
  const targetX = width * (0.5 + lanes[Math.round(game.lane)] * 0.11);
  const targetY = height * 0.82;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const topWidth = bossSize * 0.035;
  const bottomWidth = bossSize * (0.24 + pulse * 0.07);
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
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = "rgba(255, 23, 43, 0.95)";
  ctx.shadowBlur = 38;

  drawBeamCone(centerX, centerY, targetX, targetY, nx, ny, topWidth * 2.2, bottomWidth * 1.42, outerGradient, shimmer);
  ctx.shadowBlur = 18;
  drawBeamCone(centerX, centerY, targetX, targetY, nx, ny, topWidth * 0.95, bottomWidth * 0.42, coreGradient, -shimmer * 0.5);

  ctx.strokeStyle = `rgba(255, 217, 206, ${0.58 + Math.sin(age * 0.03) * 0.18})`;
  ctx.lineWidth = Math.max(1.5, bossSize * 0.012);
  ctx.beginPath();
  ctx.moveTo(centerX + nx * topWidth, centerY + ny * topWidth);
  ctx.lineTo(targetX + nx * bottomWidth, targetY + ny * bottomWidth);
  ctx.moveTo(centerX - nx * topWidth, centerY - ny * topWidth);
  ctx.lineTo(targetX - nx * bottomWidth, targetY - ny * bottomWidth);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 46, 56, 0.28)";
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
  const pose = getShipPose(width, height);
  const shipX = pose.x;
  const shipY = pose.y;
  const drift = pose.drift;
  const shipWidth = Math.min(width * 0.22, 250);
  const shipHeight = shipWidth * 0.68;
  const flamePulse = 0.82 + Math.sin(now * 0.026) * 0.16 + Math.sin(now * 0.051) * 0.08;
  const boost = 1 + game.speedPulse * 0.45;
  const sway = Math.max(-1, Math.min(1, drift / 120));

  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(sway * 0.045);

  drawEngineFlame(-shipWidth * 0.18, shipHeight * 0.24, shipWidth, flamePulse, boost, now, -1);
  drawEngineFlame(shipWidth * 0.18, shipHeight * 0.24, shipWidth, flamePulse, boost, now, 1);

  if (shipImage.complete && shipImage.naturalWidth > 0) {
    ctx.globalAlpha = 0.97;
    ctx.shadowColor = "rgba(61, 213, 255, 0.36)";
    ctx.shadowBlur = 18;
    ctx.drawImage(shipImage, -shipWidth / 2, -shipHeight * 0.58, shipWidth, shipHeight);
  } else {
    drawFallbackShip(now);
  }
  ctx.restore();
}

function getShipPose(width, height, lane = game.lane, laneTarget = game.laneTarget) {
  const x = width * (0.5 + lanes[Math.round(lane)] * 0.34);
  const targetX = width * (0.5 + lanes[laneTarget] * 0.34);
  return {
    x: x + (targetX - x) * 0.45,
    y: height * 0.79,
    drift: targetX - x,
  };
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
  const bossPose = getBossPose(width, height, now);
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const age = now - shots[i].born;
    if (age > 180) {
      shots.splice(i, 1);
      continue;
    }
    const alpha = 1 - age / 180;
    ctx.strokeStyle = `rgba(90, 224, 255, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.74);
    ctx.lineTo(bossPose.x, bossPose.y);
    ctx.stroke();
  }

  for (let i = blasts.length - 1; i >= 0; i -= 1) {
    const age = now - blasts[i].born;
    const lifetime = blasts[i].small ? 240 : 720;
    if (age > lifetime) {
      blasts.splice(i, 1);
      continue;
    }
    const alpha = 1 - age / lifetime;
    ctx.strokeStyle = `rgba(125, 241, 255, ${alpha})`;
    ctx.lineWidth = blasts[i].small ? 5 * alpha + 2 : 16 * alpha + 8;
    ctx.beginPath();
    const offset = blasts[i].small ? Math.sin(age * 0.04) * width * 0.02 : 0;
    ctx.moveTo(width * 0.5 + offset, height * 0.76);
    ctx.lineTo(bossPose.x, bossPose.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
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
    if (game.mode !== "flight") {
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
  fireLaser();
});

hackButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (game.mode === "hack") {
    cancelHack();
  } else {
    enterHack();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (game.mode !== "hack") {
    return;
  }
  if (hackPanel.contains(event.target) || hackButton.contains(event.target)) {
    return;
  }
  cancelHack();
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
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
    fireLaser();
  } else if (flightAction === "hack") {
    enterHack();
  }
});

resizeCanvas();
updateHud();
requestAnimationFrame(update);
