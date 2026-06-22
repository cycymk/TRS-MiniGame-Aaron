import test from "node:test";
import assert from "node:assert/strict";
import {
  RUN_BASE_SPEED,
  RUN_ENEMY_TABLE,
  applyRunReward,
  applyRunShot,
  createRunState,
  getRunCollisionZ,
  resolveRunCollision,
  spawnRunEntity,
  updateRunState,
} from "../src/runLogic.js";

test("run enemy table defines three tunable archetypes", () => {
  assert.deepEqual(Object.keys(RUN_ENEMY_TABLE), ["enemyA", "enemyB", "enemyC"]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(RUN_ENEMY_TABLE).map(([type, config]) => [
        type,
        {
          hp: config.hp,
          size: config.size,
          approachSpeed: config.approachSpeed,
          shootEveryMs: config.shootEveryMs,
        },
      ]),
    ),
    {
      enemyA: { hp: 6, size: 1.5, approachSpeed: 0.34, shootEveryMs: 0 },
      enemyB: { hp: 4, size: 1, approachSpeed: 0.56, shootEveryMs: 1200 },
      enemyC: { hp: 2, size: 0.8, approachSpeed: 0.82, shootEveryMs: 0 },
    },
  );
});

test("stage tuning and debug overrides adjust enemy table values", () => {
  const state = createRunState({
    stage: {
      enemyTuning: {
        hpMultiplier: 2,
        approachSpeedMultiplier: 1.25,
        shotFrequencyMultiplier: 2,
        sizeMultiplier: 1.1,
      },
      enemyOverrides: {
        enemyC: { hp: 5, size: 1.2 },
      },
    },
    entities: [
      { id: "b", kind: "enemy", type: "enemyB", lane: 1 },
      { id: "c", kind: "enemy", type: "enemyC", lane: 1 },
    ],
  });

  const enemyB = state.entities.find((entity) => entity.id === "b");
  const enemyC = state.entities.find((entity) => entity.id === "c");

  assert.equal(enemyB.hp, 8);
  assert.equal(enemyB.approachSpeed, 0.7);
  assert.equal(enemyB.shootEveryMs, 600);
  assert.equal(enemyB.size, 1.1);
  assert.equal(enemyC.hp, 10);
  assert.equal(enemyC.size, 1.32);
});

test("run movement stays inside the three lanes", () => {
  let state = createRunState();

  state = updateRunState(state, { move: "left" }, 16);
  state = updateRunState(state, { move: "left" }, 16);
  assert.equal(state.lane, 0);

  state = updateRunState(state, { move: "right" }, 16);
  state = updateRunState(state, { move: "right" }, 16);
  state = updateRunState(state, { move: "right" }, 16);
  assert.equal(state.lane, 2);
});

test("colliding with an enemy damages the player and slows forward speed", () => {
  const state = createRunState({
    entities: [
      {
        id: "heavy-1",
        kind: "enemy",
        type: "enemyA",
        lane: 1,
        z: 0.04,
        hp: 6,
      },
    ],
  });

  const next = updateRunState(state, {}, 16);

  assert.equal(next.hp, 90);
  assert.ok(next.speed < RUN_BASE_SPEED);
  assert.ok(next.speed > 0.7);
  assert.equal(next.entities.length, 0);
});

test("temporary invincibility prevents collision damage and slowdown", () => {
  const state = createRunState({
    effects: { invincibleMs: 1200 },
    entities: [
      {
        id: "heavy-1",
        kind: "enemy",
        type: "enemyA",
        lane: 1,
        z: 0.04,
        hp: 6,
        damage: 18,
      },
    ],
  });

  const next = updateRunState(state, {}, 16);

  assert.equal(next.hp, 100);
  assert.equal(next.speed, RUN_BASE_SPEED);
  assert.equal(next.entities.length, 0);
});

test("fire hits the nearest enemy in the player lane", () => {
  const state = createRunState({
    lane: 1,
    entities: [
      { id: "far", kind: "enemy", type: "enemyC", lane: 1, z: 0.82, hp: 2 },
      { id: "near", kind: "enemy", type: "enemyC", lane: 1, z: 0.36, hp: 2 },
      { id: "other", kind: "enemy", type: "enemyC", lane: 2, z: 0.2, hp: 2 },
    ],
  });

  const next = applyRunShot(state);

  assert.equal(next.entities.find((entity) => entity.id === "near"), undefined);
  assert.equal(next.entities.find((entity) => entity.id === "far").hp, 2);
  assert.equal(next.entities.find((entity) => entity.id === "other").hp, 2);
  assert.equal(next.score, 120);
  assert.deepEqual(next.events, [
    { type: "enemyHit", entityId: "near", enemyType: "enemyC", lane: 1, z: 0.36, destroyed: true },
  ]);
});

test("enemy A survives one shot while enemy C can be destroyed", () => {
  const heavyState = createRunState({
    entities: [{ id: "heavy", kind: "enemy", type: "enemyA", lane: 1, z: 0.3, hp: 6 }],
  });
  const heavyHit = applyRunShot(heavyState);
  assert.equal(heavyHit.entities.find((entity) => entity.id === "heavy").hp, 4);
  assert.equal(heavyHit.events[0].destroyed, false);

  const fastState = createRunState({
    entities: [{ id: "fast", kind: "enemy", type: "enemyC", lane: 1, z: 0.3, hp: 2 }],
  });
  const fastHit = applyRunShot(fastState);
  assert.equal(fastHit.entities.find((entity) => entity.id === "fast"), undefined);
  assert.equal(fastHit.events[0].destroyed, true);
});

test("enemy B creates bullets over time", () => {
  const state = createRunState({
    entities: [
      {
        id: "enemy-b-1",
        kind: "enemy",
        type: "enemyB",
        lane: 0,
        z: 0.7,
        hp: 4,
        shootEveryMs: 300,
        shotTimerMs: 20,
      },
    ],
  });

  const next = updateRunState(state, {}, 40);

  assert.equal(next.entities.some((entity) => entity.kind === "enemyBullet"), true);
});

test("screen bomb clears enemies and enemy bullets but keeps items", () => {
  const state = createRunState({
    entities: [
      { id: "enemy", kind: "enemy", type: "enemyC", lane: 1, z: 0.4, hp: 2 },
      { id: "bullet", kind: "enemyBullet", lane: 1, z: 0.3, damage: 8 },
      { id: "item", kind: "item", type: "speedEnergy", lane: 1, z: 0.5 },
    ],
  });

  const next = applyRunReward(state, "screenBomb");

  assert.deepEqual(next.entities.map((entity) => entity.id), ["item"]);
  assert.equal(next.score, 200);
});

test("speed boost temporarily increases speed then returns to base speed", () => {
  let state = applyRunReward(createRunState(), "speedBoost");

  state = updateRunState(state, {}, 1000);
  assert.ok(state.speed > RUN_BASE_SPEED);

  state = updateRunState(state, {}, 4200);
  assert.equal(state.speed, RUN_BASE_SPEED);
});

test("speed energy items slow the run as a positive buff without opening a minigame", () => {
  const state = createRunState({
    lane: 1,
    entities: [{ id: "item", kind: "item", type: "speedEnergy", lane: 1, z: 0.04 }],
  });

  const next = updateRunState(state, {}, 16);

  assert.equal(next.status, "running");
  assert.equal(next.pendingReward, null);
  assert.equal(next.effects.slowMotionMs > 0, true);
  assert.equal(next.speed < RUN_BASE_SPEED, true);
  assert.equal(next.entities.length, 0);
  assert.equal(next.events[0].type, "buff");
  assert.equal(next.events[0].rewardType, "slowMotion");
  assert.equal(next.events[0].lane, 1);
  assert.ok(next.events[0].z <= 0.04);
});

test("reaching target distance starts a mothership encounter", () => {
  const state = createRunState({
    stage: { targetDistance: 12 },
    distance: 11.8,
    entities: [{ id: "enemy", kind: "enemy", type: "enemyC", lane: 1, z: 0.8, hp: 2 }],
    spawnTimerMs: 100000,
  });

  const next = updateRunState(state, {}, 1000);

  assert.equal(next.status, "motherShipEncounter");
  assert.equal(next.entities.length, 0);
  assert.equal(next.distance >= 12, true);
});

test("spawnRunEntity creates deterministic enemies, items, and obstacles", () => {
  let state = createRunState({ nextEntityId: 1 });
  state = spawnRunEntity(state, makeRandom([0.05, 0.2, 0.4]));
  state = spawnRunEntity(state, makeRandom([0.56, 0.8, 0.2]));
  state = spawnRunEntity(state, makeRandom([0.92, 0.5, 0.8]));

  assert.deepEqual(
    state.entities.map((entity) => entity.kind),
    ["enemy", "enemy", "item"],
  );
  assert.deepEqual(
    state.entities.filter((entity) => entity.kind === "enemy").map((entity) => entity.type),
    ["enemyA", "enemyC"],
  );
  assert.equal(state.entities[2].type, "speedEnergy");
  assert.equal(state.nextEntityId, 4);
});

test("collision distance follows visual size for enemies and items", () => {
  const state = createRunState({
    entities: [
      { id: "a", kind: "enemy", type: "enemyA", lane: 1 },
      { id: "b", kind: "enemy", type: "enemyB", lane: 1 },
      { id: "c", kind: "enemy", type: "enemyC", lane: 1 },
      { id: "item", kind: "item", type: "speedEnergy", lane: 1 },
    ],
  });
  const [enemyA, enemyB, enemyC, item] = state.entities;

  assert.ok(getRunCollisionZ(enemyA) > getRunCollisionZ(enemyB));
  assert.ok(getRunCollisionZ(enemyB) > getRunCollisionZ(enemyC));
  assert.ok(getRunCollisionZ(item) >= getRunCollisionZ(enemyB));
});

test("resolveRunCollision can be used directly for targeted collisions", () => {
  const state = createRunState({
    entities: [{ id: "bullet", kind: "enemyBullet", lane: 1, z: 0.1, damage: 9 }],
  });

  const next = resolveRunCollision(state, "bullet");

  assert.equal(next.hp, 91);
  assert.ok(next.speed < RUN_BASE_SPEED);
  assert.equal(next.entities.length, 0);
});

function makeRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}
