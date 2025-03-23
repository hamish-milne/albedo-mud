import type { DB, ReadEntity, ReadEvent, ReadRootEntity } from "./db.js";
import type {
  Connection,
  Context,
  EntityId,
  EntityType,
  EventType,
} from "./types.js";

type Handler = (this: DB, event: ReadEvent, entity: ReadEntity) => void;
const eventHandlers = new Map<EventType, Map<EntityType, Handler[]>>();

export function listen<TEvent extends EventType, TEntity extends EntityType>(
  events: TEvent[],
  entities: TEntity[],
  handler: (
    this: DB,
    event: ReadEvent<TEvent>,
    entity: ReadEntity<TEntity>,
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

const connections = new Map<EntityId, Connection>();

export function getConnection(entity: ReadEntity<"player_ctrl">) {
  return connections.get(entity.id);
}
export function setConnection(id: EntityId, conn: Connection) {
  connections.set(id, conn);
}

function tick(db: DB) {}

function mainLoop(db: DB, map: number) {
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
          handler.call(db, event, entity);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
  db.setMapQueuePosition(map, event.id);
}
