import { cron } from "inngest";
import { adapters } from "#/sources";
import { inngest } from "../client";
import { sourceImportRequested } from "../events";

/* --- schedule-imports: cron fan-out, one import.requested per source. ----- */
export const scheduleImports = inngest.createFunction(
	{ id: "schedule-imports", triggers: [cron("*/15 * * * *")] },
	async ({ step }) => {
		const sources = Object.keys(adapters);
		await step.sendEvent(
			"fan-out",
			sources.map((source) => sourceImportRequested.create({ source })),
		);
		return { requested: sources.length };
	},
);
