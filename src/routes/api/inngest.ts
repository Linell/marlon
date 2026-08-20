import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "#/inngest/client";
import {
	enrichMention,
	importSource,
	scheduleImports,
} from "#/inngest/functions";

const handler = serve({
	client: inngest,
	functions: [scheduleImports, importSource, enrichMention],
});

export const Route = createFileRoute("/api/inngest")({
	server: {
		handlers: {
			GET: ({ request }) => handler(request),
			POST: ({ request }) => handler(request),
			PUT: ({ request }) => handler(request),
		},
	},
});
