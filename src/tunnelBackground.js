const TWO_PI = Math.PI * 2;
const HEX_SIDES = 6;
const STAR_COUNT = 82;
const LIGHT_BAR_COUNT = 26;
const HEX_RING_COUNT = 9;
const GLINT_COUNT = 14;

const LIGHT_COLORS = [
  { r: 86, g: 238, b: 255 },
  { r: 244, g: 52, b: 255 },
  { r: 142, g: 85, b: 255 },
  { r: 255, g: 80, b: 184 },
];

export function createNeonTunnel({ random = Math.random } = {}) {
  const state = {
    random,
    travel: 0,
    visualSpeed: 1,
    nextTurnAt: 0,
    camera: {
      yaw: 0,
      pitch: 0,
      roll: 0,
      targetYaw: 0,
      targetPitch: 0,
      targetRoll: 0,
      tiltX: 0,
      tiltY: 0,
    },
    stars: Array.from({ length: STAR_COUNT }, () => createStar(random)),
    lightBars: Array.from({ length: LIGHT_BAR_COUNT }, () => createLightBar(random)),
    hexRings: Array.from({ length: HEX_RING_COUNT }, (_, index) =>
      createHexRing(index / HEX_RING_COUNT, random),
    ),
    glints: Array.from({ length: GLINT_COUNT }, () => createGlint(random)),
  };

  return {
    update(options = {}) {
      updateTunnel(state, options);
    },
    draw(ctx, width, height, now = 0, options = {}) {
      drawTunnel(state, ctx, width, height, now, options);
    },
    getVanishPoint(width, height) {
      return getVanishPoint(state, width, height);
    },
    getCameraPose() {
      return getCameraPose(state);
    },
  };
}

function updateTunnel(
  state,
  { now = 0, delta = 16, speed = 1, boost = 0, tilt = { x: 0, y: 0 } } = {},
) {
  const safeDelta = clamp(delta, 0, 64);
  const deltaRatio = safeDelta / 16.67;
  const targetSpeed = clamp(speed * (0.82 + boost * 0.32), 0.12, 3.4);
  state.visualSpeed = approach(state.visualSpeed, targetSpeed, 0.11, deltaRatio);
  state.travel = (state.travel + safeDelta * 0.00034 * state.visualSpeed) % 1000;

  if (now >= state.nextTurnAt) {
    randomizeCameraTurn(state, now);
  }

  state.camera.yaw = approach(state.camera.yaw, state.camera.targetYaw, 0.035, deltaRatio);
  state.camera.pitch = approach(state.camera.pitch, state.camera.targetPitch, 0.032, deltaRatio);
  state.camera.roll = approach(state.camera.roll, state.camera.targetRoll, 0.028, deltaRatio);
  state.camera.tiltX = approach(state.camera.tiltX, clamp(tilt.x ?? 0, -1, 1), 0.08, deltaRatio);
  state.camera.tiltY = approach(state.camera.tiltY, clamp(tilt.y ?? 0, -1, 1), 0.08, deltaRatio);
}

function randomizeCameraTurn(state, now) {
  const direction = state.random() < 0.5 ? -1 : 1;
  state.camera.targetYaw = direction * (0.08 + state.random() * 0.17);
  state.camera.targetPitch = (state.random() - 0.5) * 0.13;
  state.camera.targetRoll = 0;
  state.nextTurnAt = now + 2200 + state.random() * 3600;
}

function drawTunnel(state, ctx, width, height, now, { boost = 0, mode = "flight" } = {}) {
  const pose = getCameraPose(state);
  const vanish = getVanishPoint(state, width, height);
  const speedGlow = clamp(state.visualSpeed / 2.4, 0, 1);
  const boostGlow = clamp(boost, 0, 1.4);
  const hackDim = mode === "hack" ? 0.58 : 1;

  ctx.save();
  drawTunnelBase(ctx, width, height, vanish, speedGlow, hackDim);
  drawHexRings(state, ctx, width, height, now, pose, vanish, speedGlow, hackDim);
  drawLightBars(state, ctx, width, height, pose, vanish, speedGlow, boostGlow, hackDim);
  drawGlints(state, ctx, width, height, pose, vanish, speedGlow, hackDim);
  drawStars(state, ctx, width, height, pose, vanish, speedGlow, hackDim);
  drawSpeedVignette(ctx, width, height, vanish, speedGlow, boostGlow, hackDim);
  ctx.restore();
}

function drawTunnelBase(ctx, width, height, vanish, speedGlow, hackDim) {
  ctx.fillStyle = "rgb(2, 3, 13)";
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    vanish.x,
    vanish.y,
    0,
    vanish.x,
    vanish.y,
    Math.max(width, height) * 0.86,
  );
  glow.addColorStop(0, `rgba(98, 238, 255, ${0.14 * hackDim + speedGlow * 0.05})`);
  glow.addColorStop(0.28, `rgba(70, 35, 155, ${0.12 * hackDim})`);
  glow.addColorStop(0.58, "rgba(10, 8, 28, 0.72)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0.96)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawHexRings(state, ctx, width, height, now, pose, vanish, speedGlow, hackDim) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const ring of state.hexRings) {
    const z = wrapDepth(ring.z - state.travel * ring.speed);
    if (z < 0.025 || z > 0.98) {
      continue;
    }

    const near = 1 - z;
    const alpha = clamp((0.07 + near * 0.58) * ring.alpha * hackDim, 0, 0.62);
    const color = ring.color;
    const lineWidth = (0.9 + near * 6.6 + speedGlow * 1.7) * ring.width;
    const vertices = [];

    for (let side = 0; side < HEX_SIDES; side += 1) {
      const angle =
        ring.angle +
        side * (TWO_PI / HEX_SIDES) +
        pose.roll * (1.6 - z) +
        Math.sin(now * 0.00035 + ring.seed + side) * 0.035;
      vertices.push(projectTunnelPoint(state, width, height, vanish, angle, ring.radius, z));
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    vertices.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    if (ring.cross) {
      ctx.strokeStyle = rgba(color, alpha * 0.36);
      ctx.lineWidth = Math.max(0.7, lineWidth * 0.28);
      ctx.beginPath();
      for (let side = 0; side < HEX_SIDES; side += 2) {
        const start = vertices[side];
        const end = vertices[(side + 2) % HEX_SIDES];
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLightBars(state, ctx, width, height, pose, vanish, speedGlow, boostGlow, hackDim) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (const bar of state.lightBars) {
    const z = wrapDepth(bar.z - state.travel * bar.speed);
    const tailZ = z + bar.length;
    if (z < 0.04 || tailZ > 1) {
      continue;
    }

    const head = projectTunnelPoint(state, width, height, vanish, bar.angle, bar.radius, z);
    const tail = projectTunnelPoint(state, width, height, vanish, bar.angle + bar.twist, bar.radius, tailZ);
    const near = 1 - z;
    const alpha = clamp((0.08 + near * 0.72) * bar.alpha * (0.78 + speedGlow * 0.48) * hackDim, 0, 0.72);
    const lineWidth = (bar.width + near * bar.width * 3.9) * (1 + boostGlow * 0.28);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(bar.color, alpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(245, 255, 255, ${alpha * 0.38})`;
    ctx.lineWidth = Math.max(0.8, lineWidth * 0.22);
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlints(state, ctx, width, height, pose, vanish, speedGlow, hackDim) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const glint of state.glints) {
    const z = wrapDepth(glint.z - state.travel * glint.speed);
    if (z < 0.035 || z > 0.96) {
      continue;
    }
    const point = projectTunnelPoint(state, width, height, vanish, glint.angle, glint.radius, z);
    const near = 1 - z;
    const pulse = 0.72 + Math.sin(glint.seed + state.travel * 18) * 0.28;
    const radius = (1.4 + near * 8.5) * glint.size;
    const alpha = clamp((0.12 + near * 0.72) * pulse * hackDim, 0, 0.82);

    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(glint.color, alpha);
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, radius * 0.72, radius * 1.8, pose.roll + glint.angle, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawStars(state, ctx, width, height, pose, vanish, speedGlow, hackDim) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (const star of state.stars) {
    const z = wrapDepth(star.z - state.travel * star.speed);
    if (z < 0.02 || z > 0.98) {
      continue;
    }
    const head = projectTunnelPoint(state, width, height, vanish, star.angle, star.radius, z);
    const tail = projectTunnelPoint(
      state,
      width,
      height,
      vanish,
      star.angle,
      star.radius,
      Math.min(0.99, z + 0.055 + speedGlow * 0.045),
    );
    const near = 1 - z;
    const alpha = clamp((0.08 + near * 0.82) * star.alpha * hackDim, 0, 0.86);

    ctx.strokeStyle = `rgba(208, 246, 255, ${alpha})`;
    ctx.lineWidth = Math.max(0.7, star.size + near * 2.1);
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedVignette(ctx, width, height, vanish, speedGlow, boostGlow, hackDim) {
  const tunnelCore = ctx.createRadialGradient(
    vanish.x,
    vanish.y,
    0,
    vanish.x,
    vanish.y,
    Math.max(width, height) * 0.5,
  );
  tunnelCore.addColorStop(0, `rgba(2, 3, 14, ${0.18 * hackDim})`);
  tunnelCore.addColorStop(0.18, "rgba(5, 3, 18, 0.08)");
  tunnelCore.addColorStop(0.52, "rgba(0, 0, 0, 0)");
  tunnelCore.addColorStop(1, `rgba(0, 0, 0, ${0.32 + speedGlow * 0.12})`);
  ctx.fillStyle = tunnelCore;
  ctx.fillRect(0, 0, width, height);

  const flash = Math.min(0.16, boostGlow * 0.08);
  if (flash > 0) {
    ctx.fillStyle = `rgba(115, 240, 255, ${flash})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function projectTunnelPoint(state, width, height, vanish, angle, radius, z) {
  const pose = getCameraPose(state);
  const depth = 1 - z;
  const perspective = 1 / (0.16 + z * 0.92);
  const curve = depth * depth;
  const turnX = (pose.yaw * 0.34 + pose.tiltX * 0.08) * curve;
  const turnY = (pose.pitch * 0.23 + pose.tiltY * 0.07) * curve;
  const twist =
    state.travel * 0.72 +
    pose.roll * (1.7 - z) +
    Math.sin(state.travel * 0.64 + z * 5.3) * pose.yaw * 0.7;
  const projectedAngle = angle + twist;

  return {
    x: vanish.x + (Math.cos(projectedAngle) * radius + turnX) * width * 0.23 * perspective,
    y: vanish.y + (Math.sin(projectedAngle) * radius * 0.64 + turnY) * height * 0.27 * perspective,
    scale: perspective,
  };
}

function getVanishPoint(state, width, height) {
  const pose = getCameraPose(state);
  return {
    x: width * (0.5 + pose.yaw * 0.12 + pose.tiltX * 0.034),
    y: height * (0.34 + pose.pitch * 0.1 + pose.tiltY * 0.032),
  };
}

function getCameraPose(state) {
  return {
    yaw: state.camera.yaw,
    pitch: state.camera.pitch,
    roll: state.camera.roll + state.camera.tiltX * 0.055,
    tiltX: state.camera.tiltX,
    tiltY: state.camera.tiltY,
  };
}

function createStar(random) {
  return {
    angle: random() * TWO_PI,
    radius: 0.08 + random() * 1.25,
    z: random(),
    speed: 0.34 + random() * 0.72,
    size: 0.55 + random() * 1.25,
    alpha: 0.38 + random() * 0.62,
  };
}

function createLightBar(random) {
  return {
    angle: random() * TWO_PI,
    radius: 0.54 + random() * 0.62,
    z: random(),
    length: 0.055 + random() * 0.17,
    speed: 0.48 + random() * 0.9,
    width: 0.9 + random() * 2.4,
    alpha: 0.18 + random() * 0.52,
    twist: (random() - 0.5) * 0.12,
    color: pickColor(random),
  };
}

function createHexRing(z, random) {
  return {
    z,
    angle: random() * TWO_PI,
    radius: 0.76 + random() * 0.28,
    speed: 0.3 + random() * 0.16,
    width: 0.7 + random() * 1.08,
    alpha: 0.24 + random() * 0.44,
    cross: random() < 0.58,
    seed: random() * TWO_PI,
    color: random() < 0.58 ? LIGHT_COLORS[1] : LIGHT_COLORS[2],
  };
}

function createGlint(random) {
  return {
    angle: random() * TWO_PI,
    radius: 0.2 + random() * 1.1,
    z: random(),
    speed: 0.38 + random() * 0.84,
    size: 0.55 + random() * 1.45,
    seed: random() * TWO_PI,
    color: pickColor(random),
  };
}

function pickColor(random) {
  return LIGHT_COLORS[Math.floor(random() * LIGHT_COLORS.length)] ?? LIGHT_COLORS[0];
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

function wrapDepth(value) {
  return ((value % 1) + 1) % 1;
}

function approach(current, target, rate, deltaRatio) {
  const blend = 1 - Math.pow(1 - rate, deltaRatio);
  return current + (target - current) * blend;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
