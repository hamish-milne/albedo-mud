import Aseprite from "ase-parser";
import { readFileSync } from "node:fs";
import { DB } from "./db.js";
import { drawMap } from "./tiles.js";
import { default as tkit } from "terminal-kit";
import { glMatrix, vec2 } from "gl-matrix";
import { stdin } from "node:process";
const { terminal, createTerminal } = tkit;

// const db = new DB();

const aseFile = new Aseprite(
  readFileSync("./data/Sprite-0001.aseprite"),
  "Sprite-0001.aseprite",
);
aseFile.parse();
const cel = aseFile.frames[0].cels[0];
// db.insertMap(1);
// db.insertMapSegment(1, [0, 0], {
//   width: cel.w,
//   data: cel.rawCelData,
// });

// terminal.color(1)("test!\n");

glMatrix.setMatrixArrayType(Array);

const pos: vec2 = [12, 11];

function paint() {
  terminal.reset();
  drawMap(
    {
      width: cel.w,
      data: cel.rawCelData,
    },
    pos,
    terminal,
  );
}

stdin.setRawMode(true);
while (true) {
  const key = stdin.read(1);
  if (key) {
    stdin.read(1000);
    switch (String.fromCharCode(key[0])) {
      case "w":
        vec2.add(pos, pos, [-1, 0]);
        break;
      case "a":
        vec2.add(pos, pos, [0, -1]);
        break;
      case "s":
        vec2.add(pos, pos, [1, 0]);
        break;
      case "d":
        vec2.add(pos, pos, [0, 1]);
        break;
    }
    paint();
  }
  await new Promise((r) => setTimeout(r, 100));
  // break;
}

// const init = `
// CREATE TABLE IF NOT EXISTS Event(
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     etype TEXT NOT NULL,
//     payload BLOB
// ) STRICT;

// CREATE TABLE IF NOT EXISTS Map(
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     payload BLOB
// ) STRICT;

// CREATE TABLE IF NOT EXISTS Tile(
//     tid INTEGER PRIMARY KEY,
//     map INTEGER GENERATED ALWAYS AS (tid >> 32) VIRTUAL REFERENCES Map ON DELETE CASCADE,
//     y INTEGER GENERATED ALWAYS AS ((tid >> 16) & 0xFFFF) VIRTUAL,
//     x INTEGER GENERATED ALWAYS AS (tid & 0xFFFF) VIRTUAL,
//     ttype INTEGER,
//     payload BLOB
// ) STRICT;

// CREATE INDEX IF NOT EXISTS TileIndex ON Tile (map, y, x);

// CREATE TABLE IF NOT EXISTS Entity(
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     parent INTEGER REFERENCES Entity ON DELETE CASCADE,
//     tile INTEGER REFERENCES Tile ON DELETE RESTRICT,
//     etype TEXT NOT NULL,
//     epos INTEGER,
//     payload BLOB,
//     map INTEGER GENERATED ALWAYS AS (tile >> 32) VIRTUAL REFERENCES Map ON DELETE CASCADE,
//     y INTEGER GENERATED ALWAYS AS ((tile >> 16) & 0xFFFF) VIRTUAL,
//     x INTEGER GENERATED ALWAYS AS (tile & 0xFFFF) VIRTUAL,
//     CONSTRAINT Parents CHECK ((parent IS NULL AND tile IS NOT NULL) OR (parent IS NOT NULL and tile IS NULL))
// ) STRICT;

// CREATE INDEX IF NOT EXISTS EntityTileIndex ON Entity (map, y, x);
// `;

// const db = new Database("./data.db");
// for (const p of [
// 	"encoding = 'UTF-8'",
// 	"journal_mode = WAL",
// 	"foreign_keys = 1",
// ]) {
// 	db.pragma(p);
// }
// db.exec(init);

// // load map
// const tileCount = db.prepare("select count(*) from Tile").get();
// if (tileCount === 0) {
// 	db.prepare("INSERT INTO Map (id) VALUES (?)").run(1);
// 	const aseFile = new Aseprite(
// 		readFileSync("./data/Sprite-0001.aseprite"),
// 		"Sprite-0001.aseprite",
// 	);
// 	aseFile.parse();
// 	const cel = aseFile.frames[0].cels[0];

// 	const stmt = db.prepare(
// 		`INSERT INTO Tile (tid,ttype) VALUES ${"(?,?),".repeat(cel.w - 1)}(?,?)`,
// 	);
// 	const arr = new Array(cel.w * 2);
// 	const map = BigInt(1);
// 	db.transaction(() => {
// 		for (let y = 0; y < cel.h; y++) {
// 			const prefix = (map << BigInt(32)) | (BigInt(y) << BigInt(16));
// 			for (let x = 0; x < cel.w; x++) {
// 				arr[x * 2] = prefix | BigInt(x);
// 				arr[x * 2 + 1] = cel.rawCelData[y * cel.w + x];
// 			}
// 			console.log(stmt.run(...arr));
// 		}
// 	});
// }

// // draw map
// const getMap = db.prepare(
// 	"SELECT x,y,ttype FROM Tile WHERE map=? AND y>=? AND y<? AND x>=? AND x<?",
// );

// const rows = getMap.raw(true).all(1, 0, 20, 0, 20) as number[][];

// const grid: number[][] = new Array(20);
// for (let i = 0; i < grid.length; i++) {
// 	grid[i] = new Array(20);
// 	for (let j = 0; j < grid[i].length; j++) {
// 		grid[i][j] = 0x20;
// 	}
// }
// for (const [x, y, ttype] of rows) {
// 	grid[y][x] = ttype > 0 ? 0x2588 : 0x20;
// }

// // add entities
// const getEntities = db.prepare(
// 	"SELECT x,y,etype FROM Entity WHERE map=? AND y>=? AND y<? AND x>=? AND x<?",
// );
// const entities = getEntities.raw(true).all(1, 0, 20, 0, 20) as number[][];

// for (const [x, y, etype] of entities) {
// 	grid[y][x] = "&".charCodeAt(0);
// }

// console.log(grid.map((x) => String.fromCodePoint(...x)).join("\n"));
