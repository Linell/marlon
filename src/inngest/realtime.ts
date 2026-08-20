import { realtime, staticSchema } from "inngest";

export const activityTopics = [
	"import.started",
	"import.progress",
	"match.found",
	"mention.created",
	"mention.categorized",
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
		"mention.created": {
			schema: staticSchema<{ mentionId: string }>(),
		},
		"mention.categorized": {
			schema: staticSchema<{ mentionId: string; category: string }>(),
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
