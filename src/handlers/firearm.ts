import { vec2 } from "gl-matrix";
import { listen } from "../app.js";
import type { ReadRootEntity, WriteEvent } from "../db.js";
import { EventMask, type EventId, type Vec2 } from "../types.js";

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
      target: EventId;
      score: number;
    };
    action_cancel: {
      event: WriteEvent;
      reason: "ammo";
    };
    notify: {
      event: WriteEvent;
    };
  }
}

function getTargetRange(
  source: Vec2,
  weapon: FirearmModel,
  target: ReadRootEntity<"actor">,
): Range | undefined {
  const dist = vec2.dist(source, target.position);
  const { ranges } = weapon;
  for (const r of RangeNames) {
    if (ranges[r] && dist <= ranges[r]) {
      return r;
    }
  }
}

listen(["weapon_attack"], ["firearm"], function (event, entity, root) {
  const mag = this.children(entity.id, "ammo")?.[0];
  if (!mag || mag.payload.count < 1) {
    this.insertTargetEvent({
      type: "action_cancel",
      payload: {
        event: event,
        reason: "ammo",
      },
      mask: EventMask.ActionResult,
      target: root.id,
    });
    return;
  }
  const model = FirearmModels[entity.payload.model];
  this.patchEntityPayload(mag.id, {
    count: mag.payload.count - 1,
  });
  this.insertAreaEvent({
    type: "notify",
    payload: {
      event: event,
    },
    mask: EventMask.Listen | EventMask.See,
    map: root.map,
    center: root.position,
    range: model.ranges.X,
  });
});
