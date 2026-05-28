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

function fireLaser(now = performance.now()) {
  if (game.mode !== "flight" || game.ammo < 8 || now - game.lastShotAt < 140) {
    return;
  }

  const damage = createLaserDamage();
  game.lastShotAt = now;
  game.ammo = Math.max(0, game.ammo - 8);
  game.bossHp = Math.max(0, game.bossHp - damage);
  shots.push({ born: now, damage, charged: false });
  blasts.push({ born: now, damage, small: true });
  damageReadout.textContent = `LASER HIT ${damage}`;
  maybeResetBoss();
}

function resolveHack(status) {
  if (!game.hack) {
    return;
  }

  if (status === "success") {
    const baseDamage = createLaserDamage();
    const damage = resolveHackDamage({
      baseDamage,
      boostsCollected: game.hack.boostsCollected,
      random: Math.random,
    });
    game.bossHp = Math.max(0, game.bossHp - damage);
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
  setToast("MONSTER KNOCKBACK / NEXT TARGET", 1300);
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
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#091729");
  gradient.addColorStop(0.5, "#060f1d");
  gradient.addColorStop(1, "#0b1622");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.42;
  ctx.strokeStyle = "rgba(120, 227, 255, 0.72)";
  ctx.fillStyle = "rgba(120, 227, 255, 0.95)";
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

    ctx.globalAlpha = Math.min(1, 0.16 + perspective * 0.13);
    ctx.lineWidth = Math.min(3.5, 0.7 + perspective * 0.12);
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
  ctx.strokeStyle = "rgba(67, 201, 255, 0.28)";
  ctx.lineWidth = 1.4;

  for (const base of tunnelRibs) {
    const t = (base + game.travel * 0.92) % 1;
    const depth = t * t;
    const y = horizon + depth * height * 0.62;
    const half = (width * (0.05 + depth * 0.62)) * pulse;
    const alpha = Math.min(0.5, 0.05 + depth * 0.42);
    ctx.strokeStyle = `rgba(77, 214, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(center - half, y);
    ctx.lineTo(center + half, y);
    ctx.stroke();
  }

  for (const angle of [-0.82, -0.52, -0.24, 0, 0.24, 0.52, 0.82]) {
    ctx.strokeStyle = "rgba(77, 214, 255, 0.22)";
    ctx.beginPath();
    ctx.moveTo(center, horizon);
    ctx.lineTo(center + angle * width * 0.78, height * 1.04);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 209, 64, 0.22)";
  ctx.lineWidth = 2;
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
  ctx.strokeStyle = "rgba(73, 183, 244, 0.45)";
  ctx.lineWidth = 2;

  for (const lane of [-0.42, 0, 0.42]) {
    ctx.beginPath();
    ctx.moveTo(center + lane * width * 0.13, horizon);
    ctx.lineTo(center + lane * width * 0.64, height * 1.02);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(73, 183, 244, 0.3)";
  ctx.lineWidth = 4;
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

    ctx.strokeStyle = "rgba(255, 84, 95, 0.7)";
    ctx.fillStyle = "rgba(255, 84, 95, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(laneX + wobble, y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawBoss(width, height, now) {
  const centerX = width * 0.5;
  const centerY = height * 0.34;
  const pulse = Math.sin(now * 0.004) * 0.08 + 1;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = "rgba(255, 81, 89, 0.82)";
  ctx.fillStyle = "rgba(255, 81, 89, 0.22)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    ctx.rotate(Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(0, -26 * pulse);
    ctx.lineTo(12, -78 * pulse);
    ctx.lineTo(-12, -78 * pulse);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 54 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 240, 245, 0.94)";
  ctx.beginPath();
  ctx.arc(0, 0, 11 + Math.sin(now * 0.012) * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShip(width, height, now) {
  const x = width * (0.5 + lanes[Math.round(game.lane)] * 0.34);
  const targetX = width * (0.5 + lanes[game.laneTarget] * 0.34);
  const shipX = x + (targetX - x) * 0.45;
  const shipY = height * 0.78;

  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.fillStyle = "#d9f7ff";
  ctx.strokeStyle = "rgba(89, 223, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(42, 34);
  ctx.lineTo(12, 22);
  ctx.lineTo(0, 45);
  ctx.lineTo(-12, 22);
  ctx.lineTo(-42, 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(73, 183, 244, ${0.45 + Math.sin(now * 0.02) * 0.2})`;
  ctx.beginPath();
  ctx.ellipse(-18, 42, 8, 24, 0, 0, Math.PI * 2);
  ctx.ellipse(18, 42, 8, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShots(width, height, now) {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const age = now - shots[i].born;
    if (age > 180) {
      shots.splice(i, 1);
      continue;
    }
    const alpha = 1 - age / 180;
    ctx.strokeStyle = `rgba(90, 224, 255, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.74);
    ctx.lineTo(width * 0.5, height * 0.35);
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
    ctx.lineTo(width * 0.5, height * 0.33);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawBulletTimeOverlay(width, height) {
  ctx.fillStyle = "rgba(15, 45, 72, 0.24)";
  ctx.fillRect(0, 0, width, height);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  const flightAction = mapFlightInput(event);
  const hackAction = mapHackInput(event);
  if (flightAction || hackAction) {
    event.preventDefault();
  }

  if (game.mode === "hack") {
    if (hackAction) {
      moveHack(hackAction);
    }
    return;
  }

  if (flightAction === "moveLeft") {
    game.laneTarget = Math.max(0, game.laneTarget - 1);
    game.speedPulse = 1;
  } else if (flightAction === "moveRight") {
    game.laneTarget = Math.min(2, game.laneTarget + 1);
    game.speedPulse = 1;
  } else if (flightAction === "fire") {
    fireLaser();
  } else if (flightAction === "hack") {
    enterHack();
  }
});

resizeCanvas();
updateHud();
requestAnimationFrame(update);
