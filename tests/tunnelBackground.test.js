import test from "node:test";
import assert from "node:assert/strict";
import { createNeonTunnel } from "../src/tunnelBackground.js";

test("tunnel background does not randomly roll clockwise or counterclockwise", () => {
  const tunnel = createNeonTunnel({ random: makeRandom([0.1, 0.9, 0.2, 0.8, 0.3]) });

  for (let frame = 0; frame < 260; frame += 1) {
    tunnel.update({
      now: frame * 100,
      delta: 100,
      speed: 1,
      boost: 0,
      tilt: { x: 0, y: 0 },
    });

    assert.equal(tunnel.getCameraPose().roll, 0);
  }
});

function makeRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}
