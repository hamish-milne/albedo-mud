import { expect, test } from "vitest";
import { DB } from "../db.js";
import { Context } from "../entity.js";
import { resolveCheck, trySkillRoll } from "./actor.js";
import { mainLoop } from "../app.js";

function setup(delta: Partial<EntityPayloads["actor"]>) {
  const db = new DB();
  db.insertMap(1);
  const context = new Context(db, 1);
  const actor = context.create<"actor">({
    type: "actor",
    payload: {
      Body: { base: 11, fatigue: 0, damage: 0 },
      Clout: { base: 0, fatigue: 0, damage: 0 },
      Drive: { base: 5, fatigue: 0, damage: 0 },
      ...delta,
    },
    position: [1, 2],
  });
  return [context, actor] as const;
}

test("skill roll", () => {
  const [context, actor] = setup({
    longarms: 3,
    computers: 8,
    persuade: 4,
  });
  expect(trySkillRoll(actor, "longarms", "rote")).toEqual([4]);
  expect(trySkillRoll(actor, "longarms", "roll")).toEqual([8]);
  expect(trySkillRoll(actor, "longarms", "push")).toEqual([8, 8]);
  expect(trySkillRoll(actor, "longarms", "risk")).toEqual([10]);
  expect(trySkillRoll(actor, "longarms", "breeze")).toEqual([4, 4]);
  expect(trySkillRoll(actor, "computers", "push")).toEqual([12, 12]);
  expect(trySkillRoll(actor, "persuade", "push")).toEqual("notEnoughFatigue");
  expect(trySkillRoll(actor, "climb", "push", true)).toEqual([10, 10]);

  for (let i = 0; i < 3; i++) {
    expect(context._db.readEventQueue(1)?.event).toMatchObject({
      type: "fatigue",
      target: actor.id,
      payload: { attribute: "Drive", amount: 1 },
    });
  }
  expect(context._db.readEventQueue(1)?.event).toMatchObject({
    type: "fatigue",
    target: actor.id,
    payload: { attribute: "Body", amount: 3 },
  });
  expect(context._db.readEventQueue(1)).toEqual(undefined);

  context._db.setMapQueuePosition(1, 0);
  while (mainLoop(context._db, 1)) {}

  expect(context.byId(actor.id).payload).toMatchObject({
    Body: { base: 11, fatigue: 3, damage: 0 },
    Clout: { base: 0, fatigue: 0, damage: 0 },
    Drive: { base: 5, fatigue: 3, damage: 0 },
  });
});

test("check resolve", () => {
  expect(resolveCheck([7], 4)).toBe("pass");
  expect(resolveCheck([2], 8)).toBe("fail");
  expect(resolveCheck([1], 2)).toBe("botch");
  expect(resolveCheck([5], 5)).toBe("tie");
  expect(resolveCheck([1, 4], 12)).toBe("fail");
  expect(resolveCheck([7, 6], 5)).toBe("crit");
  expect(resolveCheck([2, 7], 6)).toBe("pass");
  expect(resolveCheck([1, 1], 3)).toBe("botch");
  expect(resolveCheck([9, 9], 9)).toBe("tie");
});
