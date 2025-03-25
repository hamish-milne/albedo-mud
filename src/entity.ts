import type { ReadonlyVec2 } from "gl-matrix";
import type {
  DeepPartial,
  EntityId,
  EntityType,
  EventType,
  MapId,
  Vec2,
} from "./types.js";
import type {
  BaseEntity,
  BaseEvent,
  DB,
  ReadChildEntity,
  ReadEntity,
  ReadRootEntity,
  WriteChildEntity,
} from "./db.js";

type Const<T> = T extends string | number | boolean | null | undefined | bigint
  ? T
  : T extends [...infer U]
    ? readonly [...U]
    : {
        readonly [P in keyof T]: Const<T[P]>;
      };

export abstract class Entity<T extends EntityType = EntityType> {
  declare readonly id: EntityId;
  declare readonly payload: Const<EntityPayloads[T]>;
  protected declare readonly _context: Context;

  protected db() {
    return this._context._db;
  }

  setParent(parent: EntityId) {
    this.db().setEntityParent(this.id, parent);
    return this;
  }
  setPayload(payload: EntityPayloads[T]) {
    this.db().setEntityPayload(this.id, payload);
    return this;
  }
  patch(payload: DeepPartial<EntityPayloads[T]>) {
    this.db().patchEntityPayload(this.id, payload);
    return this;
  }
  children<T extends EntityType>(type: T): ChildEntity<T>[] {
    return this.db()
      .children(this.id, type)
      .map((x) => this._context.wrapChild(x));
  }

  abstract getRoot(): RootEntity;

  post<T extends EventType>(type: T, payload: EventPayloads[T]) {
    this.db().insertTargetEvent<T>({
      type,
      payload,
      target: this.id,
    });
    return this;
  }

  create<T extends EntityType>(type: T, payload: EntityPayloads[T]) {
    const child: WriteChildEntity<T> = { type, payload, parent: this.id };
    const id = this.db().insertChildEntity(child);
    return this._context.wrapChild(Object.assign(child, { id }));
  }

  destroy() {
    // todo
  }
}

export class RootEntity<T extends EntityType = EntityType> extends Entity<T> {
  declare readonly position: Vec2;
  declare readonly map: number;
  declare readonly cell: number | null;

  ping<T extends EventType>(range: number, event: BaseEvent<T>) {
    this.db().insertAreaEvent<T>(
      Object.assign(event, { range, map: this.map, center: this.position }),
    );
    return this;
  }

  override getRoot() {
    return this;
  }
}

export class ChildEntity<T extends EntityType = EntityType> extends Entity<T> {
  declare readonly parent: number;

  getParent() {
    return this._context.wrap(this.db().getEntity(this.parent));
  }

  override getRoot(): RootEntity {
    return this._context.wrapRoot(this.db().getRootById(this.parent));
  }
}

export class Context {
  private readonly _rootProto: object;
  private readonly _childProto: object;

  constructor(
    public readonly _db: DB,
    public readonly map: MapId,
  ) {
    this._rootProto = Object.setPrototypeOf(
      {
        _context: this,
      },
      RootEntity.prototype,
    );
    this._childProto = Object.setPrototypeOf(
      {
        _context: this,
      },
      ChildEntity.prototype,
    );
  }

  wrap<T extends EntityType>(entity: ReadEntity<T>): Entity<T> {
    if (entity.parent) {
      return this.wrapChild(entity);
    }
    if (entity.position) {
      return this.wrapRoot<T>(entity);
    }
    throw Error("Invalid entity");
  }

  wrapRoot<T extends EntityType>(entity: ReadRootEntity<T>): RootEntity<T> {
    return Object.setPrototypeOf(entity, this._rootProto);
  }

  wrapChild<T extends EntityType>(entity: ReadChildEntity<T>): ChildEntity<T> {
    return Object.setPrototypeOf(entity, this._childProto);
  }

  getMapSegment(from: ReadonlyVec2, to: ReadonlyVec2) {
    return this._db.getMapSegment(this.map, from, to);
  }

  create<T extends EntityType>(
    entity: BaseEntity<T> & { position: Vec2 },
  ): Entity<T> {
    const id = this._db.insertRootEntity<T>(
      Object.assign(entity, { map: this.map }),
    );
    return this.wrap<T>(Object.assign(entity, { id }) as ReadEntity<T>);
  }

  ping<T extends EventType>(center: Vec2, range: number, event: BaseEvent<T>) {
    this._db.insertAreaEvent<T>(
      Object.assign(event, { center, range, map: this.map }),
    );
    return this;
  }

  byId(id: EntityId) {
    return this.wrap(this._db.getEntity(id));
  }
}
