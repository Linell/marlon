import { realtime, staticSchema } from "inngest";

export const activityTopics = [
	"import.started",
	"import.progress",
	"match.found",
	"import.completed",
] as const;

export const activityRealtime = realtime.channel({
	name: "activity",
	topics: {
		"import.started": {
			schema: staticSchema<{ source: string }>(),
		},
		"import.progress": {
			schema: staticSchema<{
				source: string;
				itemsChecked: number;
				matchCount: number;
				titles: string[];
			}>(),
		},
		"match.found": {
			schema: staticSchema<{ keyword: string; title: string }>(),
		},
		"import.completed": {
			schema: staticSchema<{
				source: string;
				totalChecked: number;
				totalMatches: number;
			}>(),
		},
	},
});
