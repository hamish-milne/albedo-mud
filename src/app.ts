import type { DB, ReadEntity, ReadEvent, ReadRootEntity } from "./db.js";
import type { Connection, Context, EntityType, EventType } from "./types.js";

type Handler = (
  this: DB,
  event: ReadEvent,
  entity: ReadEntity,
  root: ReadRootEntity,
) => void;
const eventHandlers = new Map<EventType, Map<EntityType, Handler[]>>();

export function listen<TEvent extends EventType, TEntity extends EntityType>(
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: DB,
    event: ReadEvent<TEvent>,
    entity: ReadEntity<TEntity>,
    root: ReadRootEntity,
  ) => void,
) {
  for (const event of events) {
    let entityMap = eventHandlers.get(event);
    if (!entityMap) {
      entityMap = new Map();
      eventHandlers.set(event, entityMap);
    }
    for (const entity of entities) {
      const arr = entityMap.get(entity);
      if (arr) {
        arr.push(handler as Handler);
      } else {
        entityMap.set(entity, [handler as Handler]);
      }
    }
  }
}

export function playerListen<
  TEvent extends EventType,
  TEntity extends EntityType,
>(
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: DB,
    event: ReadEvent<TEvent>,
    entity: ReadEntity<TEntity>,
    root: ReadRootEntity,
    conn: Connection,
  ) => void,
) {}

function tick(db: DB) {}

function mainLoop(db: DB, context: Context, map: number) {
  const next = db.getNextEvent(map);
  if (!next) {
    return false;
  }
  const [event, entities] = next;
  const entityMap = eventHandlers.get(event.type);
  if (entityMap) {
    for (const entity of entities) {
      const handlers = entityMap.get(entity.type);
      if (!handlers) {
        continue;
      }
      for (const handler of handlers) {
        try {
          handler(event, entity, context);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
  db.setMapQueuePosition(map, event.id);
}
