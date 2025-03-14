import { playerListen, listen } from "../app.js";

export type Attribute = "Body" | "Drive" | "Clout";

export enum Rank {
	Cadet = 0,
	Lt3 = 1,
	Lt2 = 2,
	Lt1 = 3,
	LtCmdr = 4,
	Cmdr = 5,
	SnrCmdr = 6,
}

declare global {
	interface EntityPayloads {
		actor: Record<
			Attribute,
			{
				base: number;
				fatigue: number;
				damage: number;
			}
		> & {};
	}
	interface EventPayloads {
		damage: {
			attribute: Attribute;
			amount: number;
		};
		fatigue: {
			attribute: Attribute;
			amount: number;
		};
		wound: "None" | "Wounded" | "Crippled" | "Incapacitated" | "Devastated";
	}
}

listen(["damage"], ["actor"], (event, entity, context) => {
	const { attribute, amount } = event.payload;
	const { base, damage } = entity.payload[attribute];
	context.patchEntity(entity.id, {
		[attribute]: {
			damage: Math.min(damage + amount, base),
		},
	});
});

listen(["fatigue"], ["actor"], (event, entity, context) => {
	const { attribute, amount } = event.payload;
	const { base, fatigue } = entity.payload[attribute];
	context.patchEntity(entity.id, {
		[attribute]: {
			fatigue: Math.min(fatigue + amount, base),
		},
	});
});

playerListen(
	["damage", "fatigue"],
	["actor"],
	(event, entity, context, conn) => {
		const { attribute, amount } = event.payload;
		conn.message(`You incur ${amount} ${attribute} ${event.type}`);
	},
);
