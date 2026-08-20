import { Inngest } from "inngest";
import { RealtimePublishMiddleware } from "./realtimeMiddleware";

export const inngest = new Inngest({
	id: "marlon",
	middleware: [RealtimePublishMiddleware],
});
