import { listen, getConnection } from "../app.js";
import type { Entity } from "../entity.js";

export type Attribute = "Body" | "Drive" | "Clout";

export enum Rank {
  Cadet = 0,
  Lt3 = 1,
  Lt2 = 2,
  Lt1 = 3,
  LtCmdr = 4,
  Cmdr = 5,
  SnrCmdr = 6,
}

const skillInfo = {
  climb: {
    name: "Climb",
    attribute: "Body",
  },
  gForce: {
    name: "G-Force",
    attribute: "Body",
  },
  melee: {
    name: "Melee",
    attribute: "Body",
  },
  run: {
    name: "Run",
    attribute: "Body",
  },
  sneak: {
    name: "Sneak",
    attribute: "Body",
  },
  throw: {
    name: "Throw",
    attribute: "Body",
  },
  build: {
    name: "Build",
    attribute: "Body",
  },
  heavy: {
    name: "Heavy Weapons",
    attribute: "Body",
  },
  b9y: {
    name: "Bureaucracy",
    attribute: "Clout",
  },
  disguise: {
    name: "Disguise",
    attribute: "Clout",
  },
  lead: {
    name: "Lead",
    attribute: "Clout",
  },
  impress: {
    name: "Impress",
    attribute: "Clout",
  },
  persuade: {
    name: "Persuade",
    attribute: "Clout",
  },
  computers: {
    name: "Computer Sciences",
    attribute: "Drive",
  },
  demolitions: {
    name: "Demolitions",
    attribute: "Drive",
  },
  listen: {
    name: "Listen",
    attribute: "Drive",
  },
  longarms: {
    name: "Longarms",
    attribute: "Drive",
  },
  medicine: {
    name: "Medical Sciences",
    attribute: "Drive",
  },
  navigate: {
    name: "Navigate",
    attribute: "Drive",
  },
  pistols: {
    name: "Pistols",
    attribute: "Drive",
  },
  repair: {
    name: "Repair",
    attribute: "Drive",
  },
  search: {
    name: "Search",
    attribute: "Drive",
  },
  sensors: {
    name: "Sensor Operations",
    attribute: "Drive",
  },
  spot: {
    name: "Spot",
    attribute: "Drive",
  },
  vehicles: {
    name: "Vehicle Operations",
    attribute: "Drive",
  },
  vehicleWeapons: {
    name: "Vehicular Weapons",
    attribute: "Drive",
  },
} satisfies Record<
  string,
  {
    name: string;
    attribute: Attribute;
  }
>;

type Skill = keyof typeof skillInfo;

type SkillValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

declare global {
  interface EntityPayloads {
    actor: Record<
      Attribute,
      {
        base: number;
        fatigue: number;
        damage: number;
      }
    > & {
      [S in Skill]?: SkillValue;
    };
    player_ctrl: null;
  }
  interface EventPayloads {
    damage: {
      attribute: Attribute;
      amount: number;
    };
    fatigue: {
      attribute: Attribute;
      amount: number;
    };
    wound: "None" | "Wounded" | "Crippled" | "Incapacitated" | "Devastated";
  }
}

function pointsToDice(skill: number, count: number) {
  const d = [Math.min(Math.floor(skill), 5) * 2 + 2];
  for (let i = 1; i < count; i++) {
    d[1] = d[0];
  }
  return d;
}

export function resolveCheck(score: number[], dc: number) {
  const max = Math.max(...score);
  if (max > dc) {
    if (!score.some((x) => x <= dc)) {
      return "crit";
    }
    return "pass";
  }
  if (max === dc) {
    return "tie";
  }
  if (!score.some((x) => x > 1)) {
    return "botch";
  }
  return "fail";
}

export function trySkillRoll(
  actor: Entity<"actor">,
  skill: Skill,
  rollType: "rote" | "roll" | "push" | "risk" | "breeze",
  stunt?: boolean,
  passive?: boolean,
) {
  let dice: number[];
  let fatigueCost = 0;
  let skillValue = actor.payload[skill] || 0;
  const { attribute } = skillInfo[skill];
  const { base, damage, fatigue } = actor.payload[attribute];
  if (stunt) {
    const stuntEquiv = Math.max(Math.floor((base - damage) / 2) - 1, 0);
    if (stuntEquiv <= skillValue) {
      return "rollNotNeeded";
    }
    fatigueCost += 2;
    skillValue = stuntEquiv;
  }
  switch (rollType) {
    case "rote":
      if (stunt) {
        return "invalidRollType";
      }
      if (!passive && skillValue < 1) {
        return "skillTooLow";
      }
      dice = [skillValue + 1];
      break;
    case "roll":
      if (skillValue < 1) {
        return "skillTooLow";
      }
      dice = pointsToDice(skillValue, 1);
      break;
    case "push":
      if (skillValue < 1) {
        return "skillTooLow";
      }
      fatigueCost += 1;
      dice = pointsToDice(skillValue, 2);
      break;
    case "risk":
      if (skillValue >= 5) {
        return "rollNotNeeded";
      }
      fatigueCost += 1;
      dice = pointsToDice(skillValue + 1, 1);
      break;
    case "breeze":
      if (skillValue < 2) {
        return "skillTooLow";
      }
      dice = pointsToDice(skillValue / 2, 2);
      break;
  }
  if (fatigueCost) {
    if (fatigueCost > base - damage - fatigue) {
      return "notEnoughFatigue";
    }
    actor.post("fatigue", {
      attribute,
      amount: fatigueCost,
    });
  }
  return dice;
}

listen(["damage"], ["actor"], function (event, entity) {
  const { attribute, amount } = event.payload;
  const { base, damage } = entity.payload[attribute];
  entity.patch({
    [attribute]: {
      damage: Math.min(damage + amount, base),
    },
  });
});

listen(["fatigue"], ["actor"], function (event, entity) {
  const { attribute, amount } = event.payload;
  const { base, damage, fatigue } = entity.payload[attribute];
  entity.patch({
    [attribute]: {
      fatigue: Math.min(fatigue + amount, base - damage),
    },
  });
});

listen(["damage", "fatigue"], ["player_ctrl"], function (event, entity) {
  const conn = getConnection(entity.id);
  if (!conn) {
    return;
  }
  const { attribute, amount } = event.payload;
  conn.message(`You incur ${amount} ${attribute} ${event.type}`);
});
