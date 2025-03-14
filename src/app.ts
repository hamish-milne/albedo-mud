import type { DB } from "./db.js";
import type {
	Connection,
	Context,
	EntityType,
	EventType,
	ReadEntity,
	ReadEvent,
} from "./types.js";

type Handler = (event: ReadEvent, entity: ReadEntity, context: Context) => void;
const eventHandlers = new Map<EventType, Map<EntityType, Handler[]>>();

export function listen<TEvent extends EventType, TEntity extends EntityType>(
	events: TEvent[],
	entities: TEntity[],
	handler: (
		event: ReadEvent<TEvent>,
		entity: ReadEntity<TEntity>,
		context: Context,
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
		event: ReadEvent<TEvent>,
		entity: ReadEntity<TEntity>,
		context: Context,
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
