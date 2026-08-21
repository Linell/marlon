import { Inngest } from "inngest";
import { scoreMiddleware } from "inngest/experimental";
import { RealtimePublishMiddleware } from "./realtimeMiddleware";

/* `scoreMiddleware` provides `step.score()` for the llm-categorize agreement
   metrics — without it the writes silently no-op. */
export const inngest = new Inngest({
	id: "marlon",
	middleware: [RealtimePublishMiddleware, scoreMiddleware()],
});
