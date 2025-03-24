import { vec2, type ReadonlyVec2 } from "gl-matrix";
import { getConnection, listen } from "../app.js";
import type { DB, ReadEvent, ReadRootEntity, WriteEvent } from "../db.js";
import type { EntityId, Vec2 } from "../types.js";
import { linecast, LinecastOptions } from "../tiles.js";
import { RootEntity } from "../entity.js";

const RangeNames = ["C", "S", "M", "L", "X"] as const;
type Range = (typeof RangeNames)[number];
type Ranges = { [K in Range]?: number };

interface FirearmModel {
  name: string;
  skill: "Longarm" | "Pistol" | "Heavy";
  shotgun?: true;
  action: "Single" | "Semi" | "Full";
  ranges: Ranges;
  baseDamage: number;
  penDamage: number;
  caliber: Caliber;
}

type Caliber =
  | "8x56 Magazine"
  | "8x56 Belt"
  | "32mm"
  | "8x64 Belt"
  | "10x56"
  | "8x24 Magazine"
  | "8x24 Hi-cap"
  | "20x70"
  | "20x80"
  | "6x40"
  | "6x30"
  | "8mm"
  | "10mm"
  | "15x250"
  | "11x65";

const FirearmModels = {
  edf_dmr: {
    name: "CKW Precision",
    caliber: "8x56 Magazine",
    skill: "Longarm",
    action: "Semi",
    ranges: {
      S: 15,
      M: 70,
      L: 560,
      X: 4600,
    },
    baseDamage: 10,
    penDamage: 10,
  },
  edf_sniper: {
    name: "LRCKW",
    caliber: "10x56",
    skill: "Longarm",
    action: "Semi",
    ranges: {
      S: 15,
      M: 50,
      L: 330,
      X: 2300,
    },
    baseDamage: 24,
    penDamage: 12,
  },
  edf_rifle: {
    name: "LAKW 1-56",
    caliber: "8x56 Magazine",
    skill: "Longarm",
    action: "Full",
    ranges: {
      S: 15,
      M: 60,
      L: 470,
      X: 3700,
    },
    baseDamage: 10,
    penDamage: 10,
  },
  edf_carbine: {
    name: "LAKW 1-30",
    caliber: "8x56 Magazine",
    skill: "Longarm",
    action: "Full",
    ranges: {
      C: 5,
      S: 15,
      M: 50,
      L: 330,
      X: 1100,
    },
    baseDamage: 10,
    penDamage: 9,
  },
  edf_pistol: {
    name: "PAKW 4-12",
    caliber: "8x24 Magazine",
    skill: "Pistol",
    action: "Semi",
    ranges: {
      C: 5,
      S: 10,
      M: 40,
      L: 230,
      X: 1400,
    },
    baseDamage: 8,
    penDamage: 7,
  },
  edf_mp: {
    name: "MAKW 2-18",
    caliber: "8x24 Hi-cap",
    skill: "Pistol",
    action: "Full",
    ranges: {
      C: 5,
      S: 10,
      M: 30,
      L: 190,
      X: 1100,
    },
    baseDamage: 8,
    penDamage: 7,
  },
  edf_shotgun: {
    name: "SBKW 10",
    caliber: "10mm",
    skill: "Longarm",
    shotgun: true,
    action: "Single",
    ranges: {
      C: 5,
      S: 10,
      M: 20,
      L: 40,
      X: 60,
    },
    baseDamage: 5,
    penDamage: 5,
  },
} satisfies Record<string, FirearmModel>;

declare global {
  interface EntityPayloads {
    firearm: {
      model: keyof typeof FirearmModels;
    };
    ammo: {
      caliber: Caliber;
      count: number;
    };
  }
  interface EventPayloads {
    weapon_attack: {
      target: EntityId;
      score: number;
    };
    action_cancel: {
      event: WriteEvent;
      reason: "ammo" | "invalid" | "range" | "los";
    };
    notify: {
      event: WriteEvent;
      root: EntityId;
    };
  }
}

function getTargetRange(
  source: ReadonlyVec2,
  weapon: FirearmModel,
  target: ReadonlyVec2,
): Range | undefined {
  const dist = vec2.dist(source, target);
  const { ranges } = weapon;
  for (const r of RangeNames) {
    if (ranges[r] && dist <= ranges[r]) {
      return r;
    }
  }
}

function cancel(
  event: ReadEvent,
  root: RootEntity,
  reason: EventPayloads["action_cancel"]["reason"],
) {
  root.post({
    type: "action_cancel",
    payload: { event, reason },
  });
}

function notify(
  db: DB,
  event: ReadEvent,
  root: ReadRootEntity,
  range: number,
  center?: Vec2,
) {
  db.insertAreaEvent({
    type: "notify",
    payload: {
      event,
      root: root.id,
    },
    map: root.map,
    center: center || root.position,
    range,
  });
}

function doWeaponAttack(
  range: Range,
  cover: 0 | 1 | 2 | 3,
  concealment: 0 | 1 | 2 | 3 | 4,
) {}

listen(["weapon_attack"], ["firearm"], function (event, entity) {
  const root = entity.getRoot();
  const model = FirearmModels[entity.payload.model];
  const attackTarget = this.byId(event.payload.target);
  if (!model || !(attackTarget instanceof RootEntity)) {
    return cancel(event, root, "invalid");
  }
  const mag = entity.children("ammo")[0];
  if (!mag || mag.payload.count < 1) {
    return cancel(event, root, "ammo");
  }
  const range = getTargetRange(root.position, model, attackTarget.position);
  if (!range) {
    return cancel(event, root, "range");
  }
  const segment = this.getMapSegment(
    vec2.min(vec2.create(), root.position, attackTarget.position),
    vec2.max(vec2.create(), root.position, attackTarget.position),
  );
  const result = linecast(
    segment,
    root.position,
    attackTarget.position,
    LinecastOptions.IncludeEnd,
  );
  if (result.cover >= 4) {
    return cancel(event, root, "los");
  }
  mag.patch({ count: mag.payload.count - 1 });
  root.ping(model.ranges.X, {
    type: "notify",
    payload: { event, root: root.id },
  });
});

listen(["notify"], ["player_ctrl"], function (event, entity) {
  const root = entity.getRoot();
  const { event: sourceEvent, root: sourceRoot } = event.payload;
  if (sourceRoot === root.id) {
    return; // Event came from this actor; ignore it.
  }
  if (!event.center) {
    return; // 'notify' should always be an area event (?)
  }
  const conn = getConnection(entity.id);
  if (!conn) {
    return;
  }
  const distance = vec2.dist(event.center, root.position);
  const relDistance = distance / event.range;
  switch (sourceEvent.type) {
    case "weapon_attack":
      if (relDistance < 0.1) {
        conn.message("You hear gunfire very close by!");
      } else if (relDistance < 0.2) {
        conn.message("You hear gunfire nearby.");
      } else if (relDistance < 0.5) {
        conn.message("You hear gunfire a short distance away.");
      } else {
        conn.message("You hear gunfire in the distance.");
      }
      break;
  }
});
