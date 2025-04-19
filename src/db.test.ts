import { expect, test } from "vitest";
import { DB, type WriteChildEntity, type WriteRootEntity } from "./db.js";

const firearm = {
  type: "firearm",
  payload: {
    model: "edf_dmr",
  },
} as const;

const actor = {
  type: "actor",
  payload: {
    Body: { base: 0, fatigue: 0, damage: 0 },
    Clout: { base: 0, fatigue: 0, damage: 0 },
    Drive: { base: 0, fatigue: 0, damage: 0 },
  },
} as const;

const ammo = {
  type: "ammo",
  payload: {
    caliber: "10mm",
    count: 123,
  },
} as const;

const position = {
  map: 1,
  position: [2, 3],
  cell: null,
} as const;

function setup() {
  const db = new DB();
  db.insertMap(1);
  return db;
}

test("read/write root entity", () => {
  const db = setup();

  const entity: WriteRootEntity = {
    ...position,
    ...firearm,
  };

  const newId = db.insertRootEntity(entity);
  const read = db.getEntity(newId);

  expect(read).toMatchObject(entity);
});

test("read/write child entity", () => {
  const db = setup();

  const parent = db.insertRootEntity({
    ...position,
    ...actor,
  });

  const entity: WriteChildEntity = {
    parent,
    ...firearm,
  };
  const child = db.insertChildEntity(entity);
  const read = db.getEntity(child);

  expect(read).toMatchObject(entity);
});

test("get root entity", () => {
  const db = setup();

  const entity: WriteRootEntity = {
    ...position,
    ...actor,
  };
  const parent = db.insertRootEntity(entity);
  const child = db.insertChildEntity({
    parent,
    ...firearm,
  });

  const read = db.getRootById(child);

  expect(read).toMatchObject(entity);
});

test("get parent of type", () => {
  const db = setup();
  const e1: WriteRootEntity = {
    ...position,
    ...actor,
  };
  const i1 = db.insertRootEntity(e1);
  const e2: WriteChildEntity = {
    ...firearm,
    parent: i1,
  };
  const i2 = db.insertChildEntity(e2);
  const e3: WriteChildEntity = {
    ...ammo,
    parent: i2,
  };
  const i3 = db.insertChildEntity(e3);
  expect(db.getParentOfType(i3, "firearm")).toMatchObject(e2);
  expect(db.getParentOfType(i3, "actor")).toMatchObject(e1);
});

test("write/read events", () => {
  const db = setup();
  db.insertMap(2);

  const actor1 = {
    ...actor,
    ...position,
  } as const;
  const id = db.insertRootEntity(actor1);
  // entity out of range of the event:
  db.insertRootEntity({
    ...actor,
    map: 1,
    position: [10, 20],
  });
  // entity in the wrong map:
  db.insertRootEntity({
    ...actor,
    map: 2,
    position: [2, 3],
  });
  const areaEvent = {
    type: "explosion",
    payload: {
      base: 1,
      pen: 2,
      radius: 3,
    },
    map: 1,
    center: [3, 4],
    range: 1,
  } as const;
  db.insertAreaEvent(areaEvent);
  const singleEvent = {
    type: "weapon_attack",
    payload: {
      rollType: "rote",
      target: 7,
    },
    target: id,
  } as const;
  db.insertTargetEvent(singleEvent);

  const t1 = db.getNextEvent(1);
  if (!t1) {
    throw Error();
  }
  expect(t1).toMatchObject({
    event: areaEvent,
    targets: [actor1],
  });
  db.setMapQueuePosition(1, t1.event.id);

  const t2 = db.getNextEvent(1);
  if (!t2) {
    throw Error();
  }
  expect(t2).toMatchObject({
    event: singleEvent,
    targets: [actor1],
  });
});

test("modify entity", () => {
  const db = setup();
  const e1 = db.insertRootEntity({
    ...actor,
    ...position,
  });
  const e2 = db.insertRootEntity({
    ...actor,
    ...position,
  });
  const e3 = db.insertChildEntity({
    ...firearm,
    parent: e1,
  });

  db.setEntityPosition(e1, 1, [10, 20]);
  db.setEntityPayload<"firearm">(e3, {
    model: "edf_pistol",
  });
  db.patchEntityPayload<"actor">(e1, {
    Body: {
      base: 123,
    },
  });
  db.setEntityParent(e2, e1);
});

test("entity hierarchy", () => {
  const db = setup();
  const e1 = db.insertRootEntity({
    ...actor,
    ...position,
  });
  const e2 = db.insertChildEntity({
    ...firearm,
    parent: e1,
  });
  const e3 = db.insertChildEntity({
    ...ammo,
    parent: e2,
  });
  const e4 = db.insertChildEntity({
    ...ammo,
    parent: e1,
  });

  expect(db.getHierarchy(e1)).toMatchObject([
    {
      ...firearm,
      parent: e1,
      children: [
        {
          ...ammo,
          parent: e2,
        },
      ],
    },
    {
      ...ammo,
      parent: e1,
    },
  ]);
  expect(db.children(e1, "firearm")).toMatchObject([
    {
      ...firearm,
      parent: e1,
    },
  ]);
});

test("map segment", () => {
  const db = setup();

  db.insertMapSegment(1, [10, 10], {
    width: 3,
    data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  });

  expect(db.getMapSegment(1, [10, 10], [11, 11])).toMatchObject({
    width: 2,
    data: new Uint8Array([1, 2, 4, 5]),
  });
});
