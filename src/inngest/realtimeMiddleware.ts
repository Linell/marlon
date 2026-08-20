import { Middleware } from "inngest";

type PublishMessage<TData = unknown> = {
	channel: string;
	topic: string;
	data: TData;
};

type ClientWithPublishApi = {
	inngestApi: {
		publish: (
			opts: { channel: string; topics: string[]; runId?: string },
			data: unknown,
		) => Promise<{ ok: boolean; error?: { error?: string } }>;
	};
};

/**
 * Realtime middleware that injects `ctx.publish(message)` into Inngest
 * functions. Messages are pushed directly through the client's realtime API.
 */
export class RealtimePublishMiddleware extends Middleware.BaseMiddleware {
	readonly id = "marlon:realtime-publish";

	transformFunctionInput(arg: Middleware.TransformFunctionInputArgs) {
		const publish = async <TData>(
			input: Promise<PublishMessage<TData>> | PublishMessage<TData>,
		): Promise<TData> => {
			const message = await input;
			const api = (this.client as unknown as ClientWithPublishApi).inngestApi;
			const result = await api.publish(
				{
					channel: message.channel,
					topics: [message.topic],
					runId: arg.ctx.runId,
				},
				message.data,
			);

			if (!result.ok) {
				throw new Error(
					`Realtime publish failed: ${result.error?.error ?? "unknown error"}`,
				);
			}

			return message.data;
		};

		return {
			...arg,
			ctx: {
				...arg.ctx,
				publish,
			},
		};
	}
}
