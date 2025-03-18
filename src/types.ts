import type { WriteEvent } from "./db.js";

declare global {
  interface EventPayloads {}
  interface EntityPayloads {}
}

export type EventType = keyof EventPayloads;
export type EntityType = keyof EntityPayloads;

export type EntityId = number;
export type EventId = number;

export type Vec2 = [number, number];

export enum EventMask {
  Tick = 1 << 0,
  Damage = 1 << 1,
  Listen = 1 << 2,
  See = 1 << 3,
  ActionResult = 1 << 4,
}

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface Context {
  pushEvent(event: WriteEvent): void;
  gameTime: number;

  deleteEntity(id: number): void;
  patchEntity<T extends EntityType>(
    id: number,
    patch: DeepPartial<EntityPayloads[T]>,
  ): void;
}

export interface Connection {
  message(msg: string): void;
}
