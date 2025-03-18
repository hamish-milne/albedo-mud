import { terminal } from "terminal-kit";
import { DB } from "./db.js";

function main() {
  const db = new DB();

  const map = db.getMapSegment(1, [0, 0], [20, 20]);
}
