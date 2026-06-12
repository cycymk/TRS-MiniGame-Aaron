import test from "node:test";
import assert from "node:assert/strict";
import {
  RUN_BASE_SPEED,
  applyRunReward,
  applyRunShot,
  createRunState,
  resolveRunCollision,
  spawnRunEntity,
  updateRunState,
} from "../src/runLogic.js";

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
        type: "heavyRammer",
        lane: 1,
        z: 0.04,
        hp: 6,
        damage: 18,
      },
    ],
  });

  const next = updateRunState(state, {}, 16);

  assert.equal(next.hp, 82);
  assert.ok(next.speed < RUN_BASE_SPEED);
  assert.equal(next.entities.length, 0);
});

test("temporary invincibility prevents collision damage and slowdown", () => {
  const state = createRunState({
    effects: { invincibleMs: 1200 },
    entities: [
      {
        id: "heavy-1",
        kind: "enemy",
        type: "heavyRammer",
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
      { id: "far", kind: "enemy", type: "fastShooter", lane: 1, z: 0.82, hp: 2 },
      { id: "near", kind: "enemy", type: "fastShooter", lane: 1, z: 0.36, hp: 2 },
      { id: "other", kind: "enemy", type: "fastShooter", lane: 2, z: 0.2, hp: 2 },
    ],
  });

  const next = applyRunShot(state);

  assert.equal(next.entities.find((entity) => entity.id === "near"), undefined);
  assert.equal(next.entities.find((entity) => entity.id === "far").hp, 2);
  assert.equal(next.entities.find((entity) => entity.id === "other").hp, 2);
  assert.equal(next.score, 120);
});

test("heavy rammers survive one shot while fast shooters can be destroyed", () => {
  const heavyState = createRunState({
    entities: [{ id: "heavy", kind: "enemy", type: "heavyRammer", lane: 1, z: 0.3, hp: 6 }],
  });
  const heavyHit = applyRunShot(heavyState);
  assert.equal(heavyHit.entities.find((entity) => entity.id === "heavy").hp, 4);

  const fastState = createRunState({
    entities: [{ id: "fast", kind: "enemy", type: "fastShooter", lane: 1, z: 0.3, hp: 2 }],
  });
  const fastHit = applyRunShot(fastState);
  assert.equal(fastHit.entities.find((entity) => entity.id === "fast"), undefined);
});

test("shooting enemies create bullets over time", () => {
  const state = createRunState({
    entities: [
      {
        id: "turret-1",
        kind: "enemy",
        type: "turret",
        lane: 0,
        z: 0.7,
        hp: 3,
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
      { id: "enemy", kind: "enemy", type: "fastShooter", lane: 1, z: 0.4, hp: 2 },
      { id: "bullet", kind: "enemyBullet", lane: 1, z: 0.3, damage: 8 },
      { id: "item", kind: "item", type: "minigameTrigger", lane: 1, z: 0.5 },
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

test("minigame trigger items pause the run for a reward minigame", () => {
  const state = createRunState({
    lane: 1,
    entities: [{ id: "item", kind: "item", type: "minigameTrigger", lane: 1, z: 0.04 }],
  });

  const next = updateRunState(state, {}, 16);

  assert.equal(next.status, "minigame");
  assert.equal(next.pendingReward, "minigame");
  assert.equal(next.entities.length, 0);
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
  assert.equal(state.nextEntityId, 4);
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
