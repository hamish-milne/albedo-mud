import { playerListen } from "../app.js";
import { EventMask, type BaseEvent, type Context } from "../types.js";

export interface ExplosionInfo {
  base: number;
  pen: number;
  radius: number;
}

declare global {
  interface EventPayloads {
    explosion: ExplosionInfo;
  }
}

export function explosion(event: BaseEvent<"explosion">) {
  // TODO: explosion calculations
}

export function pushExplosion(
  context: Context,
  center: [number, number],
  payload: ExplosionInfo,
) {
  context.pushEvent({
    type: "explosion_notify",
    mask: EventMask.See | EventMask.Listen,
    center,
    range: payload.radius * 100,
    payload,
  });
  context.pushEvent({
    type: "explosion",
    mask: EventMask.Damage,
    center,
    range: payload.radius * 5,
    payload,
  });
}

playerListen(
  ["explosion_notify"],
  ["actor"],
  (event, entity, context, conn) => {
    const distance = 0; // TODO
    if (distance < 10) {
      conn.message(
        "BOOM!!!\nThere's an explosion right next to you! Your ears ring, and your head swims...",
      );
    } else if (distance < 20) {
      conn.message("You hear an explosion close by!");
    } else if (distance < 50) {
      conn.message("You hear an explosion a short distance away!");
    } else {
      conn.message("You hear a distant explosion.");
    }
  },
);
