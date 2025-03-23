import Database, { type Statement } from "better-sqlite3";
import type {
  CellId,
  DeepPartial,
  EntityId,
  EntityType,
  EventMask,
  EventType,
} from "./types.js";
import { vec2, type ReadonlyVec2 } from "gl-matrix";
import type { MapSegment } from "./tiles.js";

const init = `
CREATE TABLE IF NOT EXISTS Event(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etype TEXT NOT NULL,
    mask INTEGER NOT NULL,
    center INTEGER,
    range INTEGER,
    target INTEGER REFERENCES Entity ON DELETE CASCADE,
    cell INTEGER REFERENCES Cell ON DELETE CASCADE,
    payload BLOB,
    map INTEGER GENERATED ALWAYS AS (center >> 32) VIRTUAL REFERENCES Map ON DELETE CASCADE,
    y INTEGER GENERATED ALWAYS AS ((center >> 16) & 0xFFFF) VIRTUAL,
    x INTEGER GENERATED ALWAYS AS (center & 0xFFFF) VIRTUAL,
    object BLOB GENERATED ALWAYS AS (json_object(
        'id', id,
        'type', etype,
        'mask', mask,
        'map', map,
        'center', if(center IS NULL, NULL, jsonb_array(y,x)),
        'range', range,
        'target', target,
        'cell', cell,
        'payload', payload
    )) VIRTUAL,
    CONSTRAINT Area CHECK ((center IS NULL AND range IS NULL) OR (center IS NOT NULL AND range IS NOT NULL)),
    CONSTRAINT ExactlyOneTarget CHECK ((if(center IS NULL, 0, 1) + if(target IS NULL, 0, 1) + if(cell IS NULL, 0, 1)) = 1)
) STRICT;

CREATE INDEX IF NOT EXISTS EventMapIndex ON Event (map);
CREATE INDEX IF NOT EXISTS EventCellIndex ON Event (cell);
CREATE INDEX IF NOT EXISTS EventTargetIndex ON Event (target);

CREATE TABLE IF NOT EXISTS Map(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qpos INTEGER NOT NULL DEFAULT -1,
    payload BLOB
) STRICT;

CREATE TABLE IF NOT EXISTS Cell(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload BLOB
) STRICT;

CREATE TABLE IF NOT EXISTS Tile(
    tid INTEGER PRIMARY KEY,
    map INTEGER GENERATED ALWAYS AS (tid >> 32) VIRTUAL REFERENCES Map ON DELETE CASCADE,
    y INTEGER GENERATED ALWAYS AS ((tid >> 16) & 0xFFFF) VIRTUAL,
    x INTEGER GENERATED ALWAYS AS (tid & 0xFFFF) VIRTUAL,
    ttype INTEGER NOT NULL DEFAULT 0,
    payload BLOB
) STRICT;

CREATE INDEX IF NOT EXISTS TileIndex ON Tile (map, y, x);

CREATE TABLE IF NOT EXISTS Entity(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etype TEXT NOT NULL,
    mask INTEGER NOT NULL,
    payload BLOB,
    parent INTEGER REFERENCES Entity ON DELETE CASCADE,
    tile INTEGER,
    cell INTEGER REFERENCES Cell ON DELETE SET NULL,
    map INTEGER GENERATED ALWAYS AS (tile >> 32) VIRTUAL REFERENCES Map ON DELETE CASCADE,
    y INTEGER GENERATED ALWAYS AS ((tile >> 16) & 0xFFFF) VIRTUAL,
    x INTEGER GENERATED ALWAYS AS (tile & 0xFFFF) VIRTUAL,
    CONSTRAINT ExactlyOneParent CHECK ((parent IS NULL AND tile IS NOT NULL) OR (parent IS NOT NULL AND parent<>id AND tile IS NULL)),
    CONSTRAINT CellRootOnly CHECK (cell IS NULL OR tile IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS EntityTileIndex ON Entity (map, y, x);
CREATE INDEX IF NOT EXISTS EntityParentIndex ON Entity (parent);
CREATE INDEX IF NOT EXISTS EntityCellIndex ON Entity (cell);

`;

function entityQuery(filter: string, prefix?: string, table?: string) {
  return `${prefix || ""} SELECT json_group_array(json_object(
	'id', id,
	'type', etype,
	'mask', mask,
	'payload', jsonb(payload),
	'parent', parent,
	'cell', cell,
	'map', map,
	'position', if(tile IS NULL, NULL, jsonb_array(y, x))
)) FROM ${table || "Entity"} ${filter ? "WHERE " : ""}${filter}`;
}

function parentsQuery(filter: string) {
  return entityQuery(
    filter,
    `WITH RECURSIVE
Parents AS (
SELECT * FROM Entity WHERE id=?
UNION ALL
SELECT Entity.* FROM Entity JOIN Parents ON Parents.parent=Entity.id
)`,
    "Parents",
  );
}

function entityHierarchyQuery(
  initialFilter: string,
  finalFilter: string | null,
) {
  return `WITH RECURSIVE
Tree AS (
	SELECT *,id as root FROM Entity WHERE ${initialFilter}
	UNION ALL
	SELECT
		Entity.id,
		Entity.etype,
		Entity.mask,
		Entity.payload,
		Entity.parent,
		Tree.tile,
		Tree.cell,
		Tree.map,
		Tree.y,
		Tree.x,
		Tree.root
	FROM Entity JOIN Tree ON Tree.id=Entity.parent
)
SELECT json_group_array(json_object(
	'id', id,
	'type', etype,
	'mask', mask,
	'payload', jsonb(payload),
	'parent', parent,
	'cell', cell,
	'map', map,
	'position', if(tile IS NULL, NULL, jsonb_array(y, x))
)) FROM Tree ${finalFilter ? "WHERE " : ""}${finalFilter ? finalFilter : ""}`;
}

interface Child {
  parent: EntityId;
  map?: undefined;
  position?: undefined;
  cell?: undefined;
}

interface Root {
  parent?: undefined;
  map: number;
  position: [number, number];
  cell?: CellId | null;
}

interface Read {
  id: number;
}

type BaseEntityMap = {
  [T in EntityType]: {
    type: T;
    payload: EntityPayloads[T];
    mask: EventMask;
  };
};

type BaseEntity<T extends EntityType> = BaseEntityMap[T];

type Const<T> = T extends string | number | boolean | null | undefined | bigint
  ? T
  : T extends [...infer U]
    ? readonly [...U]
    : {
        readonly [P in keyof T]: Const<T[P]>;
      };

export type ReadChildEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & Read & Child
>;

export type ReadRootEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & Read & Root
>;

export type ReadEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & Read & (Root | Child)
>;

export type WriteChildEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & Child
>;

export type WriteRootEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & Root
>;

export type WriteEntity<T extends EntityType = EntityType> = Const<
  BaseEntity<T> & (Root | Child)
>;

export type EntityTree<T extends EntityType = EntityType> =
  ReadChildEntity<T> & {
    readonly children: readonly EntityTree[];
  };

interface AreaEvent {
  map: number;
  center: [number, number];
  range: number;
  cell?: undefined;
  target?: undefined;
}

interface CellEvent {
  map?: undefined;
  center?: undefined;
  range?: undefined;
  cell: number;
  target?: undefined;
}

interface TargetEvent {
  map?: undefined;
  center?: undefined;
  range?: undefined;
  cell?: undefined;
  target: EntityId;
}

type EventSelector = AreaEvent | CellEvent | TargetEvent;

type BaseEventMap = {
  [T in EventType]: {
    type: T;
    payload: EventPayloads[T];
    mask: EventMask;
  };
};

type BaseEvent<T extends EventType> = BaseEventMap[T];

type ReadAreaEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & AreaEvent & Read
>;
type ReadCellEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & CellEvent & Read
>;
type ReadTargetEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & TargetEvent & Read
>;
export type ReadEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & EventSelector & Read
>;

type WriteAreaEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & AreaEvent
>;
type WriteCellEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & CellEvent
>;
type WriteTargetEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & TargetEvent
>;
export type WriteEvent<T extends EventType = EventType> = Const<
  BaseEvent<T> & EventSelector
>;

function createDb() {
  const db = new Database(":memory:");
  for (const p of [
    "encoding = 'UTF-8'",
    "journal_mode = WAL",
    "foreign_keys = 1",
  ]) {
    db.pragma(p);
  }
  db.exec(init);
  return db;
}

function jsonQuery<TReturn, TArgs extends unknown[]>(
  stmt: Statement<TArgs, [string]>,
  ...params: TArgs
): TReturn | undefined {
  const row = stmt.get(...params);
  if (!row) {
    return undefined;
  }
  return JSON.parse(row[0]) as TReturn;
}

function jsonStringOrNull(x: unknown) {
  return x == null ? null : JSON.stringify(x);
}

function insert<TArgs extends unknown[]>(
  stmt: Statement<TArgs, never>,
  ...params: TArgs
) {
  return Number(stmt.run(...params).lastInsertRowid);
}

export class DB {
  constructor(
    private _db = createDb(),
    private _getEntity = _db
      .prepare<[EntityId], [string]>(entityQuery("id=?"))
      .raw(true),
    private _setEntityPayload = _db.prepare<[string | null, EntityId], never>(
      "UPDATE Entity SET payload=jsonb(?) WHERE id=?",
    ),
    private _patchEntityPayload = _db.prepare<[string, EntityId], never>(
      "UPDATE Entity SET payload=jsonb_patch(coalesce(payload, '{}'), ?) WHERE id=?",
    ),
    private _setEntityParent = _db.prepare<[number, EntityId], never>(
      "UPDATE Entity SET parent=?,tile=NULL,cell=NULL WHERE id=?",
    ),
    private _setEntityPosition = _db.prepare<
      { map: number; y: number; x: number; id: EntityId },
      never
    >(
      "UPDATE Entity SET tile=(($map<<32)|($y<<16)|$x),parent=NULL WHERE id=$id",
    ),
    private _getNextEvent = _db
      .prepare<[number], [string]>(
        `WITH
EventsWithMap AS (
  SELECT id,object,map FROM Event WHERE map IS NOT NULL
  UNION ALL
  SELECT Event.id,object,Entity.map FROM Event JOIN Entity ON Entity.id=Event.target
)
SELECT object FROM EventsWithMap JOIN Map ON Map.id=EventsWithMap.map AND Map.qpos<EventsWithMap.id AND Map.id=? LIMIT 1`,
      )
      .raw(true),
    private _getTilesByPosition = _db
      .prepare<
        { map: number; y1: number; y2: number; x1: number; x2: number },
        [number, number, number]
      >(
        "SELECT y,x,ttype FROM Tile WHERE map=$map AND y>=$y1 AND y<=$y2 AND x>=$x1 AND x<=$x2",
      )
      .raw(true),
    private _getHierarchy = _db
      .prepare<[number], [string]>(entityHierarchyQuery("parent=?", null))
      .raw(true),
    private _getParentOfType = _db
      .prepare<[EntityId, EntityType], [string]>(parentsQuery("etype=?"))
      .raw(true),
    private _getRoot = _db
      .prepare<[number], [string]>(parentsQuery("tile IS NOT NULL"))
      .raw(true),
    private _getAreaEventListeners = _db
      .prepare<
        { map: number; y: number; x: number; range: number; mask: EventMask },
        [string]
      >(
        entityHierarchyQuery(
          "map=$map AND abs($y-y)<=$range AND abs($x-x)<=$range",
          "mask & $mask <> 0",
        ),
      )
      .raw(true),
    private _getTargetEventListeners = _db
      .prepare<[number, EventMask], [string]>(
        entityHierarchyQuery("id=?", "mask & ? <> 0"),
      )
      .raw(true),
    private _getCellEventListeners = _db
      .prepare<[number, EventMask], [string]>(
        entityHierarchyQuery("cell=?", "mask & ? <> 0"),
      )
      .raw(true),
    private _setMapQueuePosition = _db.prepare<[number, number], never>(
      "UPDATE Map SET qpos=? WHERE id=?",
    ),
    private _insertRootEntity = _db.prepare<
      [
        EntityType,
        EventMask,
        string | null,
        number,
        number,
        number,
        number | null,
      ],
      never
    >(
      "INSERT INTO Entity (etype,mask,payload,tile,cell) VALUES (?,?,jsonb(?),(?<<32)|(?<<16)|?,?)",
    ),
    private _insertChildEntity = _db.prepare<
      [EntityType, EventMask, string | null, number],
      never
    >("INSERT INTO Entity (etype,mask,payload,parent) VALUES (?,?,jsonb(?),?)"),
    private _insertAreaEvent = _db.prepare<
      [EventType, EventMask, string | null, number, number, number, number],
      never
    >(
      "INSERT INTO Event (etype,mask,payload,center,range) VALUES (?,?,jsonb(?),(?<<32)|(?<<16)|?,?)",
    ),
    private _insertCellEvent = _db.prepare<
      [EventType, EventMask, string | null, number],
      never
    >("INSERT INTO Event (etype,mask,payload,cell) VALUES (?,?,jsonb(?),?)"),
    private _insertTargetEvent = _db.prepare<
      [EventType, EventMask, string | null, number],
      never
    >("INSERT INTO Event (etype,mask,payload,target) VALUES (?,?,jsonb(?),?)"),
    private _children = _db
      .prepare<[EntityId, EntityType], [string]>(
        entityQuery("parent=? AND etype=?"),
      )
      .raw(true),
    private _insertMap = _db.prepare<[number], void>(
      "INSERT INTO Map (id) VALUES (?)",
    ),
  ) {}

  setEntityPayload<TEntity extends keyof EntityPayloads>(
    id: number,
    payload: EntityPayloads[TEntity],
  ) {
    this._setEntityPayload.run(jsonStringOrNull(payload), id);
  }

  patchEntityPayload<TEntity extends EntityType>(
    id: number,
    payload: DeepPartial<EntityPayloads[TEntity]>,
  ) {
    this._patchEntityPayload.run(JSON.stringify(payload), id);
  }

  setEntityParent(id: number, parent: number) {
    this._setEntityParent.run(id, parent);
  }

  setEntityPosition(id: number, map: number, position: ReadonlyVec2) {
    this._setEntityPosition.run({ id, map, y: position[0], x: position[1] });
  }

  getHierarchy(id: number) {
    const entities: ReadChildEntity[] = jsonQuery(this._getHierarchy, id) || [];
    function makeTree(parent: number) {
      const list: EntityTree[] = [];
      for (const e of entities) {
        if (e.parent === parent) {
          list.push({
            ...e,
            children: makeTree(e.id),
          });
        }
      }
      return list;
    }
    return makeTree(id);
  }

  getNextEvent(map: number): [ReadEvent, ReadEntity[]] | undefined {
    const event: ReadEvent | undefined = jsonQuery(this._getNextEvent, map);
    if (!event) {
      return;
    }
    let entities: ReadEntity[] | undefined = undefined;
    if (event.center) {
      entities = jsonQuery(this._getAreaEventListeners, {
        map,
        y: event.center[0],
        x: event.center[1],
        range: event.range,
        mask: event.mask,
      });
    } else if (event.cell) {
      entities = jsonQuery(this._getCellEventListeners, event.cell, event.mask);
    } else if (event.target) {
      entities = jsonQuery(
        this._getTargetEventListeners,
        event.target,
        event.mask,
      );
    }
    if (!entities) {
      return [event, []];
    }
    return [event, entities];
  }

  setMapQueuePosition(map: number, qpos: number) {
    this._setMapQueuePosition.run(qpos, map);
  }

  insertAreaEvent(event: WriteAreaEvent) {
    this._insertAreaEvent.run(
      event.type,
      event.mask,
      jsonStringOrNull(event.payload),
      event.map,
      event.center[0],
      event.center[1],
      event.range,
    );
  }

  insertCellEvent(event: WriteCellEvent) {
    this._insertCellEvent.run(
      event.type,
      event.mask,
      jsonStringOrNull(event.payload),
      event.cell,
    );
  }

  insertTargetEvent(event: WriteTargetEvent) {
    this._insertTargetEvent.run(
      event.type,
      event.mask,
      jsonStringOrNull(event.payload),
      event.target,
    );
  }

  children<T extends EntityType>(
    parent: EntityId,
    type: T,
  ): ReadChildEntity<T>[] {
    return jsonQuery(this._children, parent, type) || [];
  }

  getMapSegment(map: number, from: vec2, to: vec2): MapSegment {
    const d = vec2.sub([0, 0], to, from);
    vec2.add(d, d, [1, 1]);
    const [height, width] = d;
    const data = new Uint8Array(height * width);
    const rows = this._getTilesByPosition.all({
      map,
      y1: from[0],
      y2: to[0],
      x1: from[1],
      x2: to[1],
    });
    for (const [y, x, tileId] of rows) {
      data[(y - from[0]) * width + x - from[1]] = tileId;
    }
    return {
      data,
      width,
    };
  }

  insertMap(map: number) {
    this._insertMap.run(map);
  }

  insertMapSegment(map: number, start: vec2, segment: MapSegment) {
    const { data, width } = segment;
    const height = data.length / width;
    const insertRow = this._db.prepare(
      `REPLACE INTO Tile (tid,ttype) VALUES ${"(?,?),".repeat(width - 1)}(?,?)`,
    );
    this._db.transaction(() => {
      const rowArgs = new Array(width * 2);
      for (let y = 0; y < height; y++) {
        const prefix =
          (BigInt(map) << BigInt(32)) | (BigInt(y + start[0]) << BigInt(16));
        for (let x = 0; x < width; x++) {
          rowArgs[x * 2] = prefix | BigInt(x + start[1]);
          rowArgs[x * 2 + 1] = data[y * width + x];
        }
        insertRow.run(...rowArgs);
      }
    })();
  }

  getEntity(id: EntityId) {
    const row = this._getEntity.get(id);
    if (!row) {
      return undefined;
    }
    const found: ReadEntity[] = JSON.parse(row[0]);
    return found[0];
  }

  getRootById(id: EntityId) {
    const found: ReadRootEntity[] = jsonQuery(this._getRoot, id) || [];
    return found[0];
  }

  getRoot(entity: ReadEntity): ReadRootEntity {
    if (entity.position) {
      return entity;
    }
    return this.getRootById(entity.parent);
  }

  getParentOfType<T extends EntityType>(id: EntityId, type: T) {
    const found: ReadEntity<T>[] | undefined = jsonQuery(
      this._getParentOfType,
      id,
      type,
    );
    return found?.[0];
  }

  insertRootEntity(entity: WriteRootEntity) {
    return insert(
      this._insertRootEntity,
      entity.type,
      entity.mask,
      jsonStringOrNull(entity.payload),
      entity.map,
      entity.position[0],
      entity.position[1],
      entity.cell ?? null,
    );
  }

  insertChildEntity(entity: WriteChildEntity) {
    return insert(
      this._insertChildEntity,
      entity.type,
      entity.mask,
      jsonStringOrNull(entity.payload),
      entity.parent,
    );
  }
}
