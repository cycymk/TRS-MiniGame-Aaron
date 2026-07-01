export const RUN_LANE_COUNT = 3;
export const RUN_BASE_SPEED = 1;
export const RUN_MIN_SPEED = 0.72;
export const RUN_MAX_SPEED = 1.9;
export const RUN_SHOT_DAMAGE = 2;
export const RUN_COLLISION_Z = 0.07;

const DEFAULT_ENEMY_TUNING = {
  hpMultiplier: 1,
  approachSpeedMultiplier: 1,
  shotFrequencyMultiplier: 1,
  sizeMultiplier: 1,
};

const DEFAULT_STAGE = {
  id: "chrono-run-1",
  objective: "distance",
  targetDistance: 1800,
  difficulty: 1,
  enemyTuning: DEFAULT_ENEMY_TUNING,
  enemyOverrides: {},
};

export const RUN_ENEMY_TABLE = {
  enemyA: {
    label: "A",
    hp: 6,
    damage: 10,
    approachSpeed: 0.34,
    size: 1.5,
    collisionScale: 1.18,
    score: 260,
    shootEveryMs: 0,
  },
  enemyB: {
    label: "B",
    hp: 4,
    damage: 7,
    approachSpeed: 0.56,
    size: 1,
    collisionScale: 1,
    score: 170,
    shootEveryMs: 1200,
  },
  enemyC: {
    label: "C",
    hp: 2,
    damage: 6,
    approachSpeed: 0.82,
    size: 0.8,
    collisionScale: 0.88,
    score: 120,
    shootEveryMs: 0,
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
  kills = 0,
  elapsedMs = 0,
  entities = [],
  effects = {},
  events = [],
  status = "running",
  pendingReward = null,
  nextEntityId = 1,
  spawnTimerMs = 100000,
} = {}) {
  return normalizeState({
    stage: normalizeStage(stage),
    startedAt: now,
    lane: clamp(Math.round(lane), 0, RUN_LANE_COUNT - 1),
    speed: clamp(speed, RUN_MIN_SPEED, RUN_MAX_SPEED),
    hp: clamp(hp, 0, 100),
    ammo: clamp(ammo, 0, 100),
    distance: Math.max(0, distance),
    score: Math.max(0, score),
    kills: Math.max(0, kills),
    elapsedMs: Math.max(0, elapsedMs),
    entities: entities.map((entity) => normalizeEntity(entity, normalizeStage(stage))),
    effects: normalizeEffects(effects),
    events,
    status,
    pendingReward,
    nextEntityId,
    spawnTimerMs: Math.max(0, spawnTimerMs),
  });
}

export function updateRunState(state, input = {}, deltaMs = 16, random = Math.random) {
  const safeDelta = Math.max(0, deltaMs);
  let next = {
    ...normalizeState(state),
    events: [],
  };
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
  const distance = next.distance + safeDelta * 0.001 * 24 * speedForDistance;
  const reachedTarget =
    next.status === "running" &&
    next.stage.objective === "distance" &&
    distance >= next.stage.targetDistance;

  return {
    ...next,
    distance,
    score: Math.floor(next.score + safeDelta * 0.001 * 8 * speedForDistance),
    elapsedMs: next.elapsedMs + safeDelta,
    entities: reachedTarget ? [] : next.entities,
    status: reachedTarget ? "motherShipEncounter" : next.status,
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
  let hitEvent = null;
  const entities = current.entities.flatMap((entity) => {
    if (entity.id !== target.id) {
      return [entity];
    }
    const hp = entity.hp - RUN_SHOT_DAMAGE;
    hitEvent = {
      type: "enemyHit",
      entityId: entity.id,
      enemyType: entity.type,
      lane: entity.lane,
      z: entity.z,
      destroyed: hp <= 0,
    };
    if (hp > 0) {
      return [{ ...entity, hp }];
    }
    defeatedScore += entity.score ?? RUN_ENEMY_TABLE[entity.type]?.score ?? 100;
    return [];
  });

  return {
    ...current,
    ammo: Math.max(0, current.ammo - 6),
    entities,
    score: current.score + defeatedScore,
    kills: current.kills + (defeatedScore > 0 ? 1 : 0),
    events: hitEvent ? [...current.events, hitEvent] : current.events,
  };
}

export function resolveRunCollision(state, entityId) {
  const current = normalizeState(state);
  const entity = current.entities.find((candidate) => candidate.id === entityId);
  if (!entity) {
    return current;
  }

  const entities = current.entities.filter((candidate) => candidate.id !== entityId);
  if (entity.kind === "item" && entity.type === "speedEnergy") {
    const rewarded = applyRunReward(
      {
        ...current,
        entities,
      },
      "speedBoost",
    );
    return {
      ...rewarded,
      events: [
        ...current.events,
        {
          type: "buff",
          rewardType: "speedBoost",
          effectType: "pickup",
          entityType: entity.type,
          lane: entity.lane,
          z: entity.z,
        },
      ],
    };
  }

  if (entity.kind === "item" && entity.type === "minigameTrigger") {
    return {
      ...current,
      status: "minigame",
      pendingReward: "minigame",
      entities,
    };
  }

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
    speed: Math.max(RUN_MIN_SPEED, current.speed - 0.11),
    effects: {
      ...current.effects,
      slowMs: Math.max(current.effects.slowMs, 720),
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
        slowMotionMs: 0,
        slowMs: 0,
      },
      speed: RUN_MAX_SPEED,
    };
  }

  if (rewardType === "screenBomb") {
    const clearedEnemies = current.entities.filter((entity) => entity.kind === "enemy").length;
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
      kills: current.kills + clearedEnemies,
    };
  }

  if (rewardType === "slowMotion") {
    return {
      ...current,
      status: "running",
      pendingReward: null,
      effects: {
        ...current.effects,
        speedBoostMs: 0,
        slowMotionMs: 3600,
        slowMs: 0,
      },
      speed: RUN_MIN_SPEED,
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
  const difficulty = getRunDifficulty(current);
  let entity;

  if (roll < difficulty.heavy) {
    entity = createEnemyEntity(id, "enemyA", lane, current.stage);
  } else if (roll < difficulty.fast) {
    entity = createEnemyEntity(id, "enemyC", lane, current.stage);
  } else if (roll < difficulty.scout) {
    entity = createEnemyEntity(id, "enemyB", lane, current.stage);
  } else if (roll < difficulty.turret) {
    entity = createEnemyEntity(id, "enemyB", lane, current.stage);
  } else if (roll < difficulty.item) {
    entity = {
      id,
      kind: "item",
      type: random() < 0.68 ? "speedEnergy" : "minigameTrigger",
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
      damage: 8,
      approachSpeed: 0.46,
    };
  }

  entity = tuneEntityForDifficulty(entity, difficulty);
  return {
    ...current,
    nextEntityId: current.nextEntityId + 1,
    entities: [...current.entities, entity],
  };
}

function getRunDifficulty(state) {
  const distance = state.distance ?? 0;
  const early = (state.elapsedMs ?? 0) < 15000;
  if (early || distance < 300) {
    return {
      heavy: 0.12,
      fast: 0.26,
      scout: 0.42,
      turret: 0.52,
      item: 0.92,
      spawnMin: 1450,
      spawnRange: 780,
      shotMultiplier: 1.55,
    };
  }
  if (distance < 700) {
    return {
      heavy: 0.18,
      fast: 0.38,
      scout: 0.58,
      turret: 0.72,
      item: 0.92,
      spawnMin: 1080,
      spawnRange: 620,
      shotMultiplier: 1.25,
    };
  }
  if (distance < 1200) {
    return {
      heavy: 0.22,
      fast: 0.44,
      scout: 0.66,
      turret: 0.84,
      item: 0.94,
      spawnMin: 820,
      spawnRange: 560,
      shotMultiplier: 1,
    };
  }
  return {
    heavy: 0.26,
    fast: 0.5,
    scout: 0.72,
    turret: 0.9,
    item: 0.96,
    spawnMin: 620,
    spawnRange: 460,
    shotMultiplier: 0.85,
  };
}

function tuneEntityForDifficulty(entity, difficulty) {
  if (entity.kind !== "enemy" || !entity.shootEveryMs) {
    return entity;
  }
  const shootEveryMs = Math.round(entity.shootEveryMs * difficulty.shotMultiplier);
  return {
    ...entity,
    shootEveryMs,
    shotTimerMs: shootEveryMs,
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
      slowMotionMs: Math.max(0, state.effects.slowMotionMs - deltaMs),
      invincibleMs: Math.max(0, state.effects.invincibleMs - deltaMs),
      slowMs: Math.max(0, state.effects.slowMs - deltaMs),
    },
  };
}

function calculateSpeed(state) {
  if (state.effects.speedBoostMs > 0) {
    return RUN_MAX_SPEED;
  }
  if (state.effects.slowMotionMs > 0) {
    return RUN_MIN_SPEED;
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
    if (advanced.kind === "enemy" && advanced.shootEveryMs > 0 && advanced.shotTimerMs <= 0) {
      advanced.shotTimerMs = advanced.shootEveryMs;
      advancedEntities.push({
        id: `${advanced.id}-shot-${state.nextEntityId}-${Math.round(advanced.z * 1000)}`,
        kind: "enemyBullet",
        type: "bullet",
        lane: advanced.lane,
        z: Math.max(0, advanced.z - 0.08),
        damage: 5,
        approachSpeed: 0.94,
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
      entity.z <= getRunCollisionZ(entity) &&
      ["enemy", "enemyBullet", "obstacle", "item"].includes(entity.kind);

    if (!collides) {
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
    const difficulty = getRunDifficulty(next);
    return {
      ...spawned,
      spawnTimerMs: difficulty.spawnMin + Math.floor(random() * difficulty.spawnRange),
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

  if (next.kind === "enemy" && next.shootEveryMs > 0) {
    next.shotTimerMs = (next.shotTimerMs ?? next.shootEveryMs) - deltaMs;
  }

  return next;
}

function normalizeState(state) {
  const stage = normalizeStage(state.stage);
  return {
    ...state,
    stage,
    lane: clamp(Math.round(state.lane ?? 1), 0, RUN_LANE_COUNT - 1),
    speed: clamp(state.speed ?? RUN_BASE_SPEED, RUN_MIN_SPEED, RUN_MAX_SPEED),
    hp: clamp(state.hp ?? 100, 0, 100),
    ammo: clamp(state.ammo ?? 100, 0, 100),
    distance: Math.max(0, state.distance ?? 0),
    score: Math.max(0, state.score ?? 0),
    kills: Math.max(0, state.kills ?? 0),
    elapsedMs: Math.max(0, state.elapsedMs ?? 0),
    entities: (state.entities ?? []).map((entity) => normalizeEntity(entity, stage)).flatMap((entity) => {
      return [entity];
    }),
    effects: normalizeEffects(state.effects),
    events: state.events ?? [],
    status: state.status ?? "running",
    pendingReward: state.pendingReward ?? null,
    nextEntityId: state.nextEntityId ?? 1,
    spawnTimerMs: state.spawnTimerMs ?? 900,
  };
}

function normalizeEntity(entity, stage = DEFAULT_STAGE) {
  if (entity.kind === "enemy") {
    const preset = getEnemyConfig(entity.type, stage);
    return {
      ...preset,
      ...entity,
      z: entity.z ?? 1.08,
      hp: entity.hp ?? preset.hp,
      shotTimerMs: entity.shotTimerMs ?? preset.shotTimerMs,
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
    slowMotionMs: Math.max(0, effects.slowMotionMs ?? 0),
    invincibleMs: Math.max(0, effects.invincibleMs ?? 0),
    slowMs: Math.max(0, effects.slowMs ?? 0),
  };
}

function createEnemyEntity(id, type, lane, stage = DEFAULT_STAGE) {
  const preset = getEnemyConfig(type, stage);
  return {
    id,
    kind: "enemy",
    type,
    lane,
    z: 1.08,
    hp: preset.hp,
    damage: preset.damage,
    approachSpeed: preset.approachSpeed,
    size: preset.size,
    collisionScale: preset.collisionScale,
    score: preset.score,
    shootEveryMs: preset.shootEveryMs,
    shotTimerMs: preset.shootEveryMs,
  };
}

export function getRunCollisionZ(entity) {
  if (entity.kind === "item") {
    return RUN_COLLISION_Z * 1.42;
  }
  if (entity.kind === "enemy") {
    return RUN_COLLISION_Z * (entity.collisionScale ?? entity.size ?? 1);
  }
  if (entity.kind === "enemyBullet") {
    return RUN_COLLISION_Z * 0.78;
  }
  return RUN_COLLISION_Z;
}

function normalizeStage(stage = {}) {
  return {
    ...DEFAULT_STAGE,
    ...stage,
    enemyTuning: {
      ...DEFAULT_ENEMY_TUNING,
      ...(stage.enemyTuning ?? {}),
    },
    enemyOverrides: {
      ...(stage.enemyOverrides ?? {}),
    },
  };
}

function getEnemyConfig(type = "enemyB", stage = DEFAULT_STAGE) {
  const normalizedStage = normalizeStage(stage);
  const tuning = normalizedStage.enemyTuning;
  const base = {
    ...RUN_ENEMY_TABLE.enemyB,
    ...(RUN_ENEMY_TABLE[type] ?? RUN_ENEMY_TABLE.enemyB),
    ...(normalizedStage.enemyOverrides[type] ?? {}),
  };
  const shotFrequencyMultiplier = Math.max(0.1, tuning.shotFrequencyMultiplier);
  const shootEveryMs =
    base.shootEveryMs > 0 ? Math.max(120, Math.round(base.shootEveryMs / shotFrequencyMultiplier)) : 0;

  return {
    ...base,
    hp: Math.max(1, Math.ceil(base.hp * tuning.hpMultiplier)),
    approachSpeed: roundTo(base.approachSpeed * tuning.approachSpeedMultiplier, 3),
    size: roundTo(base.size * tuning.sizeMultiplier, 3),
    collisionScale: roundTo((base.collisionScale ?? base.size) * tuning.sizeMultiplier, 3),
    shootEveryMs,
    shotTimerMs: shootEveryMs,
  };
}

function randomLane(random) {
  return clamp(Math.floor(clamp(random(), 0, 0.999999) * RUN_LANE_COUNT), 0, RUN_LANE_COUNT - 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, precision) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
