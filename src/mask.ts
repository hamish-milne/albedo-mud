import type { EntityType, EventType } from "./types.js";

export enum EventMask {
  Tick = 1 << 0,
  Damage = 1 << 1,
  Listen = 1 << 2,
  See = 1 << 3,
  ActionResult = 1 << 4,
  Usable = 1 << 5,
}

export const entityMasks: Record<EntityType, EventMask> = {
  actor: EventMask.Tick,
  player_ctrl: EventMask.Listen | EventMask.See,
  grenade: EventMask.Usable | EventMask.Tick,
  firearm: EventMask.Usable,
  ammo: EventMask.Usable,
};

export const eventMasks: Record<EventType, EventMask> = {
  damage: EventMask.Damage,
  fatigue: EventMask.Damage,
  wound: EventMask.Damage,
  explosion: EventMask.Damage,
  tick: EventMask.Tick,
  weapon_attack: EventMask.Usable,
  action_cancel: EventMask.ActionResult,
  notify: EventMask.Listen | EventMask.See,
};
