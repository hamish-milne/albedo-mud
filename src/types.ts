declare global {
	interface EventPayloads {}
	interface EntityPayloads {}
}

export type EventType = keyof EventPayloads;
export type EntityType = keyof EntityPayloads;

export interface BaseEntity<T extends EntityType = EntityType> {
	type: T;
	parent?: number;
	position?: [number, number];
	payload: EntityPayloads[T];
}

export interface ReadEntity<T extends EntityType = EntityType>
	extends BaseEntity<T> {
	id: number;
}

export interface BaseEvent<TEvent extends EventType = EventType> {
	type: TEvent;
	payload: EventPayloads[TEvent];
	center: [number, number];
	range: number;
}

export interface ReadEvent<TEvent extends EventType = EventType>
	extends BaseEvent<TEvent> {
	id: number;
}

export enum EventMask {
	Tick = 1 << 0,
	Damage = 1 << 1,
	Listen = 1 << 2,
	See = 1 << 3,
}

export interface WriteEvent<TEvent extends EventType = EventType>
	extends BaseEvent<TEvent> {
	mask?: EventMask;
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
