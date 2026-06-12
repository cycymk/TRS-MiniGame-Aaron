export const RUN_LANE_COUNT = 3;
export const RUN_BASE_SPEED = 1;
export const RUN_MIN_SPEED = 0.42;
export const RUN_MAX_SPEED = 1.9;
export const RUN_SHOT_DAMAGE = 2;
export const RUN_COLLISION_Z = 0.08;

const DEFAULT_STAGE = {
  id: "chrono-run-1",
  objective: "distance",
  targetDistance: 1200,
  difficulty: 1,
};

const ENEMY_PRESETS = {
  heavyRammer: {
    hp: 6,
    damage: 18,
    approachSpeed: 0.42,
    score: 260,
  },
  fastShooter: {
    hp: 2,
    damage: 10,
    approachSpeed: 0.9,
    score: 120,
    shootEveryMs: 850,
  },
  weavingScout: {
    hp: 3,
    damage: 12,
    approachSpeed: 0.68,
    score: 170,
    weaveEveryMs: 700,
  },
  turret: {
    hp: 3,
    damage: 12,
    approachSpeed: 0.18,
    score: 190,
    shootEveryMs: 650,
  },
};

export function createRunState({
  stage = DEFAULT_STAGE,
  now = 0,
  random = Math.random,
  lane = 1,
  speed = RUN_BASE_SPEED,
  hp = 100,
  ammo = 100,
  distance = 0,
  score = 0,
  entities = [],
  effects = {},
  status = "running",
  pendingReward = null,
  nextEntityId = 1,
  spawnTimerMs = 100000,
} = {}) {
  return normalizeState({
    stage: { ...DEFAULT_STAGE, ...stage },
    startedAt: now,
    lane: clamp(Math.round(lane), 0, RUN_LANE_COUNT - 1),
    speed: clamp(speed, RUN_MIN_SPEED, RUN_MAX_SPEED),
    hp: clamp(hp, 0, 100),
    ammo: clamp(ammo, 0, 100),
    distance: Math.max(0, distance),
    score: Math.max(0, score),
    entities: entities.map(normalizeEntity),
    effects: normalizeEffects(effects),
    status,
    pendingReward,
    nextEntityId,
    spawnTimerMs: Math.max(0, spawnTimerMs),
  });
}

export function updateRunState(state, input = {}, deltaMs = 16, random = Math.random) {
  const safeDelta = Math.max(0, deltaMs);
  let next = normalizeState(state);
  if (next.status !== "running") {
    return next;
  }

  next = applyRunMovement(next, input);
  if (input.fire) {
    next = applyRunShot(next);
  }

  next = tickEffects(next, safeDelta);
  next = {
    ...next,
    speed: calculateSpeed(next),
    ammo: Math.min(100, next.ammo + safeDelta * 0.012),
  };
  next = advanceRunEntities(next, safeDelta, random);

  const speedForDistance = next.status === "running" ? next.speed : 0;
  return {
    ...next,
    distance: next.distance + safeDelta * 0.001 * 24 * speedForDistance,
    score: Math.floor(next.score + safeDelta * 0.001 * 8 * speedForDistance),
  };
}

export function applyRunShot(state) {
  const current = normalizeState(state);
  if (current.status !== "running" || current.ammo < 6) {
    return current;
  }

  const target = current.entities
    .filter((entity) => entity.kind === "enemy" && entity.lane === current.lane)
    .sort((a, b) => a.z - b.z)[0];

  if (!target) {
    return {
      ...current,
      ammo: Math.max(0, current.ammo - 6),
    };
  }

  let defeatedScore = 0;
  const entities = current.entities.flatMap((entity) => {
    if (entity.id !== target.id) {
      return [entity];
    }
    const hp = entity.hp - RUN_SHOT_DAMAGE;
    if (hp > 0) {
      return [{ ...entity, hp }];
    }
    defeatedScore += entity.score ?? ENEMY_PRESETS[entity.type]?.score ?? 100;
    return [];
  });

  return {
    ...current,
    ammo: Math.max(0, current.ammo - 6),
    entities,
    score: current.score + defeatedScore,
  };
}

export function resolveRunCollision(state, entityId) {
  const current = normalizeState(state);
  const entity = current.entities.find((candidate) => candidate.id === entityId);
  if (!entity) {
    return current;
  }

  const entities = current.entities.filter((candidate) => candidate.id !== entityId);
  if (current.effects.invincibleMs > 0) {
    return {
      ...current,
      entities,
    };
  }

  const damage = Math.max(0, entity.damage ?? 12);
  return {
    ...current,
    hp: Math.max(0, current.hp - damage),
    speed: Math.max(RUN_MIN_SPEED, current.speed - 0.22),
    effects: {
      ...current.effects,
      slowMs: Math.max(current.effects.slowMs, 1400),
    },
    entities,
    status: current.hp - damage <= 0 ? "failed" : current.status,
  };
}

export function applyRunReward(state, rewardType) {
  const current = normalizeState(state);
  if (rewardType === "speedBoost") {
    return {
      ...current,
      status: "running",
      pendingReward: null,
      effects: {
        ...current.effects,
        speedBoostMs: 4200,
        slowMs: 0,
      },
      speed: RUN_MAX_SPEED,
    };
  }

  if (rewardType === "screenBomb") {
    const cleared = current.entities.filter(
      (entity) => entity.kind === "enemy" || entity.kind === "enemyBullet",
    ).length;
    return {
      ...current,
      status: "running",
      pendingReward: null,
      entities: current.entities.filter(
        (entity) => entity.kind !== "enemy" && entity.kind !== "enemyBullet",
      ),
      score: current.score + cleared * 100,
    };
  }

  if (rewardType === "temporaryInvincible") {
    return {
      ...current,
      status: "running",
      pendingReward: null,
      effects: {
        ...current.effects,
        invincibleMs: 3600,
      },
    };
  }

  return {
    ...current,
    status: "running",
    pendingReward: null,
  };
}

export function spawnRunEntity(state, random = Math.random) {
  const current = normalizeState(state);
  const roll = random();
  const lane = randomLane(random);
  const id = `run-${current.nextEntityId}`;
  let entity;

  if (roll < 0.22) {
    entity = createEnemyEntity(id, "heavyRammer", lane);
  } else if (roll < 0.44) {
    entity = createEnemyEntity(id, "fastShooter", lane);
  } else if (roll < 0.66) {
    entity = createEnemyEntity(id, "weavingScout", lane);
  } else if (roll < 0.84) {
    entity = createEnemyEntity(id, "turret", lane);
  } else if (roll < 0.94) {
    entity = {
      id,
      kind: "item",
      type: "minigameTrigger",
      lane,
      z: 1.08,
      approachSpeed: 0.5,
    };
  } else {
    entity = {
      id,
      kind: "obstacle",
      type: "barrier",
      lane,
      z: 1.08,
      damage: 14,
      approachSpeed: 0.55,
    };
  }

  return {
    ...current,
    nextEntityId: current.nextEntityId + 1,
    entities: [...current.entities, entity],
  };
}

function applyRunMovement(state, input) {
  if (input.move === "left") {
    return {
      ...state,
      lane: Math.max(0, state.lane - 1),
    };
  }
  if (input.move === "right") {
    return {
      ...state,
      lane: Math.min(RUN_LANE_COUNT - 1, state.lane + 1),
    };
  }
  return state;
}

function tickEffects(state, deltaMs) {
  return {
    ...state,
    effects: {
      speedBoostMs: Math.max(0, state.effects.speedBoostMs - deltaMs),
      invincibleMs: Math.max(0, state.effects.invincibleMs - deltaMs),
      slowMs: Math.max(0, state.effects.slowMs - deltaMs),
    },
  };
}

function calculateSpeed(state) {
  if (state.effects.speedBoostMs > 0) {
    return RUN_MAX_SPEED;
  }
  if (state.effects.slowMs > 0) {
    return RUN_MIN_SPEED;
  }
  return RUN_BASE_SPEED;
}

function advanceRunEntities(state, deltaMs, random) {
  const advancedEntities = [];
  for (const entity of state.entities) {
    const advanced = advanceEntity(entity, state, deltaMs, random);
    advancedEntities.push(advanced);
    if (advanced.kind === "enemy" && advanced.shootEveryMs && advanced.shotTimerMs <= 0) {
      advanced.shotTimerMs = advanced.shootEveryMs;
      advancedEntities.push({
        id: `${advanced.id}-shot-${state.nextEntityId}-${Math.round(advanced.z * 1000)}`,
        kind: "enemyBullet",
        type: "bullet",
        lane: advanced.lane,
        z: Math.max(0, advanced.z - 0.08),
        damage: 8,
        approachSpeed: 1.2,
      });
    }
  }

  let next = {
    ...state,
    entities: advancedEntities,
  };

  for (const entity of [...next.entities]) {
    const collides =
      entity.lane === next.lane &&
      entity.z <= RUN_COLLISION_Z &&
      ["enemy", "enemyBullet", "obstacle", "item"].includes(entity.kind);

    if (!collides) {
      continue;
    }

    if (entity.kind === "item" && entity.type === "minigameTrigger") {
      next = {
        ...next,
        status: "minigame",
        pendingReward: "minigame",
        entities: next.entities.filter((candidate) => candidate.id !== entity.id),
      };
      continue;
    }

    next = resolveRunCollision(next, entity.id);
  }

  next = {
    ...next,
    entities: next.entities.filter((entity) => entity.z > -0.14),
  };

  if (next.status !== "running") {
    return next;
  }

  const spawnTimerMs = next.spawnTimerMs - deltaMs;
  if (spawnTimerMs <= 0) {
    const spawned = spawnRunEntity(next, random);
    return {
      ...spawned,
      spawnTimerMs: 640 + Math.floor(random() * 460),
    };
  }

  return {
    ...next,
    spawnTimerMs,
  };
}

function advanceEntity(entity, state, deltaMs, random) {
  const delta = deltaMs * 0.001;
  const approach = (entity.approachSpeed ?? 0.5) * state.speed * delta;
  let next = {
    ...entity,
    z: entity.z - approach,
  };

  if (next.kind === "enemy" && next.type === "weavingScout") {
    const weaveTimerMs = (next.weaveTimerMs ?? next.weaveEveryMs ?? 700) - deltaMs;
    if (weaveTimerMs <= 0) {
      next = {
        ...next,
        lane: clamp(next.lane + (random() < 0.5 ? -1 : 1), 0, RUN_LANE_COUNT - 1),
        weaveTimerMs: next.weaveEveryMs ?? 700,
      };
    } else {
      next.weaveTimerMs = weaveTimerMs;
    }
  }

  if (next.kind === "enemy" && next.shootEveryMs) {
    next.shotTimerMs = (next.shotTimerMs ?? next.shootEveryMs) - deltaMs;
  }

  return next;
}

function normalizeState(state) {
  return {
    ...state,
    lane: clamp(Math.round(state.lane ?? 1), 0, RUN_LANE_COUNT - 1),
    speed: clamp(state.speed ?? RUN_BASE_SPEED, RUN_MIN_SPEED, RUN_MAX_SPEED),
    hp: clamp(state.hp ?? 100, 0, 100),
    ammo: clamp(state.ammo ?? 100, 0, 100),
    distance: Math.max(0, state.distance ?? 0),
    score: Math.max(0, state.score ?? 0),
    entities: (state.entities ?? []).map(normalizeEntity).flatMap((entity) => {
      return [entity];
    }),
    effects: normalizeEffects(state.effects),
    status: state.status ?? "running",
    pendingReward: state.pendingReward ?? null,
    nextEntityId: state.nextEntityId ?? 1,
    spawnTimerMs: state.spawnTimerMs ?? 900,
  };
}

function normalizeEntity(entity) {
  if (entity.kind === "enemy") {
    const preset = ENEMY_PRESETS[entity.type] ?? ENEMY_PRESETS.fastShooter;
    return {
      ...preset,
      ...entity,
      z: entity.z ?? 1.08,
      hp: entity.hp ?? preset.hp,
    };
  }

  return {
    ...entity,
    z: entity.z ?? 1.08,
    approachSpeed: entity.approachSpeed ?? 0.7,
  };
}

function normalizeEffects(effects = {}) {
  return {
    speedBoostMs: Math.max(0, effects.speedBoostMs ?? 0),
    invincibleMs: Math.max(0, effects.invincibleMs ?? 0),
    slowMs: Math.max(0, effects.slowMs ?? 0),
  };
}

function createEnemyEntity(id, type, lane) {
  const preset = ENEMY_PRESETS[type] ?? ENEMY_PRESETS.fastShooter;
  return {
    id,
    kind: "enemy",
    type,
    lane,
    z: 1.08,
    hp: preset.hp,
    damage: preset.damage,
    approachSpeed: preset.approachSpeed,
    score: preset.score,
    shootEveryMs: preset.shootEveryMs,
    shotTimerMs: preset.shootEveryMs,
    weaveEveryMs: preset.weaveEveryMs,
    weaveTimerMs: preset.weaveEveryMs,
  };
}

function randomLane(random) {
  return clamp(Math.floor(clamp(random(), 0, 0.999999) * RUN_LANE_COUNT), 0, RUN_LANE_COUNT - 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
