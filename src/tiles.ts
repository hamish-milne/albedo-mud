import { vec2 } from "gl-matrix";
import type { Vec2 } from "./types.js";
import { Color, Style, type Terminal } from "./terminal.js";

export function drawMap(map: MapSegment, los: vec2, t: Terminal) {
  for (let y = 0; y < map.data.length / map.width; y++) {
    for (let x = 0; x < map.width; x++) {
      const p: vec2 = [y, x];
      if (vec2.exactEquals(p, los)) {
        t.fg(Color.red).bg(Color.black).write("&");
        continue;
      }
      const { char, fg, bg } = tileAt(map, p);
      const { concealment } = linecast(map, los, p, LinecastOptions.None);

      t.bg(bg).fg(fg);
      if (concealment < 4) {
        t.styles(Style.fgLight);
      } else {
        t.styles(Style.none);
      }
      t.write(String.fromCharCode(char));
    }
    t.reset().write("\n");
  }
}

export interface TileInfo {
  name: string;
  cover: 0 | 1 | 2 | 3 | 4;
  concealment: 0 | 1 | 2 | 3 | 4;
  solid?: boolean;
  char: number;
  fg: Color;
  bg: Color;
}

export const Tiles: TileInfo[] = [
  {
    name: "Dry dirt",
    cover: 0,
    concealment: 0,
    char: ".".charCodeAt(0),
    fg: Color.yellow,
    bg: Color.black,
  },
  {
    name: "Wall",
    cover: 4,
    concealment: 4,
    solid: true,
    char: "#".charCodeAt(0),
    fg: Color.black,
    bg: Color.white,
  },
  {
    name: "Grass",
    cover: 0,
    concealment: 0,
    char: "w".charCodeAt(0),
    fg: Color.green,
    bg: Color.black,
  },
  {
    name: "Brush",
    cover: 1,
    concealment: 2,
    char: 0x2ac,
    fg: Color.green,
    bg: Color.black,
  },
  {
    name: "Rubble",
    cover: 1,
    concealment: 1,
    char: ";".charCodeAt(0),
    fg: Color.white,
    bg: Color.black,
  },
];

export interface MapSegment {
  data: Uint8Array;
  width: number;
}

function tileAt(map: MapSegment, pos: vec2): TileInfo {
  return Tiles[map.data[pos[0] * map.width + pos[1]]];
}

export type LinecastInfo = Pick<TileInfo, "cover" | "concealment" | "solid">;

enum LinecastOptions {
  None = 0,
  IncludeStart = 1 << 0,
  IncludeEnd = 1 << 1,
  IncludeBoth = IncludeStart | IncludeEnd,
}

export function linecast(
  map: MapSegment,
  from: vec2,
  to: vec2,
  options = LinecastOptions.None,
) {
  const result: LinecastInfo = {
    cover: 0,
    concealment: 0,
    solid: undefined,
  };

  function append(p: vec2) {
    const tile = tileAt(map, p);
    if (!tile) {
      return;
    }
    result.cover = Math.max(result.cover, tile.cover) as TileInfo["cover"];
    result.concealment = Math.max(
      result.concealment,
      tile.concealment,
    ) as TileInfo["concealment"];
    result.solid ||= tile.solid;
  }

  if ((options & LinecastOptions.IncludeStart) !== 0) {
    append(from);
  }

  const current = vec2.clone(from);
  const d = vec2.sub([0, 0], to, from);
  const cy: Vec2 = [0, 0];
  const cx: Vec2 = [0, 0];

  const dy: Vec2 = [Math.sign(d[0]), 0];
  const dx: Vec2 = [0, Math.sign(d[1])];
  const doffset = to[0] * from[1] - to[1] * from[0];

  function candidateDistance(c: vec2) {
    if (vec2.exactEquals(c, to)) {
      return -1;
    }
    return Math.abs(d[1] * c[0] - d[0] * c[1] + doffset);
  }

  while (!vec2.exactEquals(current, to)) {
    const ay = candidateDistance(vec2.add(cy, dy, current));
    const ax = candidateDistance(vec2.add(cx, dx, current));
    if (ay === ax) {
      // exact 45-degree angle
      vec2.add(current, vec2.add(current, current, dy), dx);
    } else {
      vec2.copy(current, ay < ax ? cy : cx);
    }
    if (!vec2.exactEquals(current, to)) {
      append(current);
    }
    if (result.concealment >= 4 || result.cover >= 4) {
      return result;
    }
  }
  if ((options & LinecastOptions.IncludeEnd) !== 0) {
    append(current);
  }

  return result;
}
