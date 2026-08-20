import { hackernews } from "./hackernews";
import type { SourceAdapter } from "./types";

/**
 * Registered adapters, keyed by their `Source` registry key. The cron fan-out
 * sends one import event per entry; `import-source` looks its adapter up here.
 * New source = one adapter file + one line below.
 */
export const adapters = {
	hackernews,
} as const satisfies Record<string, SourceAdapter>;

export function getAdapter(source: string): SourceAdapter | undefined {
	return adapters[source as keyof typeof adapters];
}
