import type { DB, ReadEvent } from "./db.js";
import { Context, type Entity } from "./entity.js";
import type { Connection, EntityId, EntityType, EventType } from "./types.js";

type Handler = (this: Context, event: ReadEvent, entity: Entity) => void;
const eventHandlers = new Map<
  EventType,
  Map<
    EntityType,
    {
      act: Handler[];
      notify: Handler[];
    }
  >
>();

function addHandler<TEvent extends EventType, TEntity extends EntityType>(
  mode: "act" | "notify",
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: Context,
    event: ReadEvent<TEvent>,
    entity: Entity<TEntity>,
  ) => void,
) {
  for (const event of events) {
    let entityMap = eventHandlers.get(event);
    if (!entityMap) {
      entityMap = new Map();
      eventHandlers.set(event, entityMap);
    }
    for (const entity of entities) {
      let obj = entityMap.get(entity);
      if (!obj) {
        obj = { act: [], notify: [] };
        entityMap.set(entity, obj);
      }
      obj[mode].push(handler as Handler);
    }
  }
}

export function listen<TEvent extends EventType, TEntity extends EntityType>(
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: Context,
    event: ReadEvent<TEvent>,
    entity: Entity<TEntity>,
  ) => void,
) {
  addHandler("notify", events, entities, handler);
}

export function on<TEvent extends EventType, TEntity extends EntityType>(
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: Context,
    event: ReadEvent<TEvent>,
    entity: Entity<TEntity>,
  ) => void,
) {
  addHandler("act", events, entities, handler);
}

const connections = new Map<EntityId, Connection>();

export function getConnection(id: EntityId) {
  return connections.get(id);
}
export function setConnection(id: EntityId, conn: Connection) {
  connections.set(id, conn);
}

function tick(db: DB) {}

export function mainLoop(db: DB, map: number) {
  const next = db.readEventQueue(map);
  if (!next) {
    return false;
  }
  const context = new Context(db, map);
  const { event, targets, listeners } = next;
  for (const [mode, entities] of [
    ["act", targets],
    ["notify", listeners],
  ] as const) {
    const entityMap = eventHandlers.get(event.type);
    if (entityMap) {
      for (const entity of entities) {
        const handlers = entityMap.get(entity.type);
        if (!handlers) {
          continue;
        }
        for (const handler of handlers[mode]) {
          try {
            handler.call(context, event, context.wrap(entity));
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
  }
  return true;
}
