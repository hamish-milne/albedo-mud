import { register } from "../app";
import { pushExplosion } from "./explosion";

const GrenadeModels = {
	edf: {
		base: 10,
		pen: 10,
		radius: 5,
	},
};

declare global {
	interface EventPayloads {
		tick: number;
	}
	interface EntityPayloads {
		grenade: {
			model: keyof typeof GrenadeModels;
			targetTime: number;
		};
	}
}

register(["tick"], ["grenade"], (event, entity, context) => {
	if (event.payload >= entity.payload.targetTime) {
		context.deleteEntity(entity.id);
		if (entity.position) {
			pushExplosion(
				context,
				entity.position,
				GrenadeModels[entity.payload.model],
			);
		}
	}
});
