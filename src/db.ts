import Database from "better-sqlite3";
import type {
  DeepPartial,
  EntityId,
  EntityType,
  EventMask,
  EventType,
} from "./types.js";
import { vec2 } from "gl-matrix";
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
    object BLOB GENERATED ALWAYS AS json_object(
        'id', id,
        'type', etype,
        'mask', mask,
        'center', if(center IS NULL, NULL, jsonb_array(y,x)),
        'range', range,
        'target', target,
        'cell', cell,
        'payload', payload
    ) VIRTUAL,
    CONSTRAINT Area CHECK ((center IS NULL AND range IS NULL) OR (center IS NOT NULL AND range IS NOT NULL)),
    CONSTRAINT ExactlyOneTarget CHECK (if(center IS NULL, 0, 1) + if(target IS NULL, 0, 1) + if(cell IS NULL, 0, 1)) = 1,
    CONSTRAINT MaskIfNoTarget CHECK ((target IS NULL AND mask IS NOT NULL) OR (target IS NOT NULL AND mask IS NULL))
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
    payload BLOB,
    object BLOB GENERATED ALWAYS AS json
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
    CONSTRAINT ExactlyOneParent CHECK (parent IS NULL AND tile IS NOT NULL) OR (parent IS NOT NULL AND parent<>id AND tile IS NULL),
    CONSTRAINT CellRootOnly CHECK (cell IS NULL OR tile IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS EntityTileIndex ON Entity (map, y, x);
CREATE INDEX IF NOT EXISTS EntityParentIndex ON Entity (parent);
CREATE INDEX IF NOT EXISTS EntityCellIndex ON Entity (cell);

`;

function entityQuery(filter: string) {
  return `SELECT json_group_array(json_object(
	'id', id,
	'type', etype,
	'mask', mask,
	'payload', jsonb(payload),
	'parent', parent,
	'cell', cell,
	'map', map,
	'position', if(tile IS NULL, NULL, jsonb_array(y, x))
)) FROM Entity WHERE ${filter}`;
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
  parent: number;
  map?: undefined;
  position?: undefined;
}

interface Root {
  parent?: undefined;
  map: number;
  position: [number, number];
}

interface Read {
  id: number;
}

interface BaseEntity<T extends EntityType> {
  type: T;
  mask: number;
  payload: EntityPayloads[T];
}

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

interface EntityTree<T extends EntityType = EntityType>
  extends ReadChildEntity<T> {
  readonly children: readonly EntityTree[];
}

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
  target: number;
}

type EventSelector = AreaEvent | CellEvent | TargetEvent;

interface BaseEvent<T extends EventType> {
  type: T;
  payload: EventPayloads[T];
  mask: number;
}

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

export class DB {
  constructor(
    private _db = createDb(),
    private _getEntity = this._db.prepare<[EntityId], [string]>(
      entityQuery("id=?"),
    ),
    private _setEntityPayload = this._db.prepare<[EntityId, string], never>(
      "UPDATE Entity SET payload=jsonb(?2) WHERE id=?1",
    ),
    private _patchEntityPayload = this._db.prepare<[EntityId, string], never>(
      "UPDATE Entity SET payload=jsonb_patch(coalesce(payload, '{}'), ?2) WHERE id=?1",
    ),
    private _setEntityParent = this._db.prepare<[EntityId, number], never>(
      "UPDATE Entity SET parent=?2,tile=NULL WHERE id=?1",
    ),
    private _setEntityPosition = this._db.prepare<
      [number, number, number, number],
      never
    >("UPDATE Entity SET tile=((?2<<32)|(?3<<16)|?4),parent=NULL WHERE id=?1"),
    private _getNextEvent = this._db
      .prepare<[number], [string]>(
        "SELECT object FROM Event JOIN Map ON Map.id=Event.map AND Map.qpos<Event.id AND Map.id=? LIMIT 1",
      )
      .raw(true),
    private _getTilesByPosition = this._db
      .prepare<
        [number, number, number, number, number],
        [number, number, number]
      >(
        "SELECT x,y,ttype FROM Tile WHERE map=?1 AND y>=?2 AND y<?3 AND x>=?4 AND x<?5",
      )
      .raw(true),
    private _getHierarchy = this._db
      .prepare<[number], [string]>(entityHierarchyQuery("parent=?1", null))
      .raw(true),
    private _getAreaEventListeners = this._db
      .prepare<[number, number, number, number, number], [string]>(
        entityHierarchyQuery(
          "map=?1 AND abs(?2-y)<=?4 AND abs(?3-x)<=?4",
          "mask & ?5 <> 0",
        ),
      )
      .raw(true),
    private _getTargetEventListeners = this._db
      .prepare<[number, EventMask], [string]>(
        entityHierarchyQuery("id=?1", "mask & ?2 <> 0"),
      )
      .raw(true),
    private _getCellEventListeners = this._db
      .prepare<[number, EventMask], [string]>(
        entityHierarchyQuery("cell=?1", "mask & ?2 <> 0"),
      )
      .raw(true),
    private _setMapQueuePosition = this._db.prepare<[number, number], never>(
      "UPDATE Map SET qpos=?2 WHERE id=?1",
    ),
    private _insertRootEntity = this._db.prepare<
      [EntityType, EventMask, string | null, number, number, number, number],
      never
    >(
      "INSERT INTO Entity (etype,mask,payload,tile,cell) VALUES (?1,?2,jsonb(?3),(?4<<32)|(?5<<16)|?6,?7)",
    ),
    private _insertChildEntity = this._db.prepare<
      [EntityType, EventMask, string | null, number],
      never
    >(
      "INSERT INTO Entity (etype,mask,payload,parent) VALUES (?1,?2,jsonb(?3),?4)",
    ),
    private _insertAreaEvent = this._db.prepare<
      [EventType, EventMask, string | null, number, number, number, number],
      never
    >(
      "INSERT INTO Event (etype,mask,payload,center,range) VALUES (?,?,jsonb(?),(?<<32)|(?<<16)|?,?)",
    ),
    private _insertCellEvent = this._db.prepare<
      [EventType, EventMask, string | null, number],
      never
    >("INSERT INTO Event (etype,mask,payload,cell) VALUES (?,?,jsonb(?),?)"),
    private _insertTargetEvent = this._db.prepare<
      [EventType, EventMask, string | null, number],
      never
    >("INSERT INTO Event (etype,mask,payload,target) VALUES (?,?,jsonb(?),?)"),
    private _children = this._db.prepare<[EntityId, EntityType], [string]>(
      entityQuery("parent=?1 AND type=?2"),
    ),
    private _insertMap = this._db.prepare<[number], void>(
      "INSERT INTO Map (id) VALUES (?)",
    ),
  ) {}

  setEntityPayload<TEntity extends keyof EntityPayloads>(
    id: number,
    payload: EntityPayloads[TEntity],
  ) {
    this._setEntityPayload.run(id, JSON.stringify(payload));
  }

  patchEntityPayload<TEntity extends EntityType>(
    id: number,
    payload: DeepPartial<EntityPayloads[TEntity]>,
  ) {
    this._patchEntityPayload.run(id, JSON.stringify(payload));
  }

  setEntityParent(id: number, parent: number) {
    this._setEntityParent.run(id, parent);
  }

  setEntityPosition(id: number, map: number, y: number, x: number) {
    this._setEntityPosition.run(id, map, y, x);
  }

  getTilesByPosition(
    map: number,
    fromInclusive: [number, number],
    toExclusive: [number, number],
  ) {
    return this._getTilesByPosition.all(
      map,
      fromInclusive[0],
      toExclusive[0],
      fromInclusive[1],
      toExclusive[1],
    );
  }

  getHierarchy(id: number) {
    const [json] = this._getHierarchy.get(id) || ["[]"];
    const entities: ReadChildEntity[] = JSON.parse(json);
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
    const eventJson = this._getNextEvent.get(map);
    if (!eventJson) {
      return undefined;
    }
    const event: ReadEvent = JSON.parse(eventJson[0]);
    let entitiesJson: [string] | undefined;
    if (event.center) {
      entitiesJson = this._getAreaEventListeners.get(
        map,
        event.center[0],
        event.center[1],
        event.range,
        event.mask,
      );
    } else if (event.cell) {
      entitiesJson = this._getCellEventListeners.get(event.cell, event.mask);
    } else if (event.target) {
      entitiesJson = this._getTargetEventListeners.get(
        event.target,
        event.mask,
      );
    } else {
      return undefined; // invalid event
    }
    const entities: ReadEntity[] = entitiesJson
      ? JSON.parse(entitiesJson[0])
      : [];
    return [event, entities];
  }

  setMapQueuePosition(map: number, qpos: number) {
    this._setMapQueuePosition.run(map, qpos);
  }

  insertAreaEvent(event: WriteAreaEvent) {
    this._insertAreaEvent.run(
      event.type,
      event.mask,
      event.payload == null ? null : JSON.stringify(event.payload),
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
      event.payload == null ? null : JSON.stringify(event.payload),
      event.cell,
    );
  }

  insertTargetEvent(event: WriteTargetEvent) {
    this._insertTargetEvent.run(
      event.type,
      event.mask,
      event.payload == null ? null : JSON.stringify(event.payload),
      event.target,
    );
  }

  children<T extends EntityType>(
    parent: EntityId,
    type: T,
  ): ReadChildEntity<T>[] {
    const json = this._children.get(parent, type);
    if (!json) {
      return [];
    }
    return JSON.parse(json[0]);
  }

  getMapSegment(map: number, from: vec2, to: vec2): MapSegment {
    const [height, width] = vec2.sub([0, 0], to, from);
    const data = new Uint8Array(height * width);
    const rows = this._getTilesByPosition.all(
      map,
      from[0],
      to[0],
      from[1],
      to[1],
    );
    for (const [y, x, tileId] of rows) {
      data[y * width + x] = tileId;
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
        const prefix = (BigInt(map) << BigInt(32)) | (BigInt(y) << BigInt(16));
        for (let x = 0; x < width; x++) {
          rowArgs[x * 2] = prefix | BigInt(x);
          rowArgs[x * 2 + 1] = data[y * width + x];
        }
        insertRow.run(...rowArgs);
      }
    });
  }

  getEntity(id: EntityId) {
    const row = this._getEntity.get(id);
    if (!row) {
      return undefined;
    }
    const found: ReadEntity[] = JSON.parse(row[0]);
    return found[0];
  }
}
