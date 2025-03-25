import { expect, test } from "vitest";
import { DB } from "./db.js";
import { Context } from "./entity.js";

function setup() {
  const db = new DB();
  db.insertMap(1);
  return db;
}

test("create context", () => {
  const db = setup();
  const context = new Context(db, 1);

  const ammo = context
    .create({
      type: "actor",
      position: [1, 2],
      payload: {
        Body: { base: 0, fatigue: 0, damage: 0 },
        Clout: { base: 0, fatigue: 0, damage: 0 },
        Drive: { base: 0, fatigue: 0, damage: 0 },
      },
    })
    .create("firearm", { model: "edf_mp" })
    .create("ammo", { caliber: "10mm", count: 30 });

  expect(ammo.getRoot().payload).toMatchObject({
    Body: { base: 0, fatigue: 0, damage: 0 },
    Clout: { base: 0, fatigue: 0, damage: 0 },
    Drive: { base: 0, fatigue: 0, damage: 0 },
  });
});
