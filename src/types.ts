declare global {
  interface EventPayloads {}
  interface EntityPayloads {}
}

export type EventType = keyof EventPayloads;
export type EntityType = keyof EntityPayloads;

export type EntityId = number;
export type EventId = number;
export type CellId = number;
export type MapId = number;

export type Vec2 = readonly [number, number];

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface Connection {
  message(msg: string): void;
}
