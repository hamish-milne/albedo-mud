import { vec2 } from "gl-matrix";
import type { Vec2 } from "./types.js";
import type { Terminal } from "terminal-kit";

export enum TerminalColor {
  Black = 0,
  Red = 1,
  Green = 2,
  Yellow = 3,
  Blue = 4,
  Magenta = 5,
  Cyan = 6,
  LightGray = 7,
  Gray = 8,
  LightRed = 9,
  LightGreen = 10,
  LightYellow = 11,
  LightBlue = 12,
  LightMagenta = 13,
  LightCyan = 14,
  White = 15,
}

export function lighten(color: TerminalColor): TerminalColor {
  switch (color) {
    case TerminalColor.Black:
      return color;
    case TerminalColor.Gray:
      return TerminalColor.LightGray;
    case TerminalColor.LightGray:
      return TerminalColor.White;
    default:
      if (color >= 8) {
        return color;
      }
      return color + 8;
  }
}

export function darken(color: TerminalColor) {
  switch (color) {
    case TerminalColor.LightGray:
      return TerminalColor.Gray;
    case TerminalColor.Gray:
      return color;
    default:
      if (color < 8) {
        return color;
      }
      return color - 8;
  }
}

export function drawMap(map: MapSegment, los: vec2, terminal: Terminal) {
  for (let y = 0; y < map.data.length / map.width; y++) {
    for (let x = 0; x < map.width; x++) {
      if (vec2.exactEquals([y, x], los)) {
        terminal.red("&");
        continue;
      }
      const { char, fg, bg } = tileAt(map, [y, x]);
      const { concealment } = linecast(
        map,
        los,
        [y, x],
        LinecastOptions.IncludeEnd,
      );
      if (concealment < 4) {
        terminal.color(lighten(fg)).bgColor(lighten(bg))(
          String.fromCodePoint(char),
        );
      } else {
        terminal.color(fg).bgColor(bg)(String.fromCodePoint(char));
      }
    }
    terminal.styleReset("\n");
  }
}

export interface TileInfo {
  name: string;
  cover: 0 | 1 | 2 | 3 | 4;
  concealment: 0 | 1 | 2 | 3 | 4;
  solid?: boolean;
  char: number;
  fg: TerminalColor;
  bg: TerminalColor;
}

export const Tiles: TileInfo[] = [
  {
    name: "Dry dirt",
    cover: 0,
    concealment: 0,
    char: ".".charCodeAt(0),
    fg: TerminalColor.Yellow,
    bg: TerminalColor.Black,
  },
  {
    name: "Wall",
    cover: 4,
    concealment: 4,
    solid: true,
    char: "#".charCodeAt(0),
    fg: TerminalColor.Black,
    bg: TerminalColor.Gray,
  },
  {
    name: "Grass",
    cover: 0,
    concealment: 0,
    char: "w".charCodeAt(0),
    fg: TerminalColor.Green,
    bg: TerminalColor.Black,
  },
  {
    name: "Brush",
    cover: 1,
    concealment: 2,
    char: 0x2ac,
    fg: TerminalColor.Green,
    bg: TerminalColor.Black,
  },
  {
    name: "Rubble",
    cover: 1,
    concealment: 1,
    char: ";".charCodeAt(0),
    fg: TerminalColor.Gray,
    bg: TerminalColor.Black,
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
  // console.log(`LINECAST TO ${vec2.str(to)}`);
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
    // console.log(vec2.str(current));
    const ay = candidateDistance(vec2.add(cy, dy, current));
    const ax = candidateDistance(vec2.add(cx, dx, current));
    if (vec2.exactEquals(cy, to) || vec2.exactEquals(cx, to)) {
      break;
    }
    if (ay === ax) {
      // exact 45-degree angle
      append(cy);
      append(cx);
      vec2.add(current, vec2.add(current, current, dy), dx);
    } else {
      vec2.copy(current, ay < ax ? cy : cx);
      append(current);
    }
  }
  if ((options & LinecastOptions.IncludeEnd) !== 0) {
    append(current);
  }

  return result;
}
