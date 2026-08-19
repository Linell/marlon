import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * DB CLIENT
 * -----------------------------------------------------------------------------
 * One libsql connection for every environment. Locally the URL is a `file:`
 * path; pointing at Turso in production is *only* an env change:
 *
 *   DATABASE_URL=libsql://<db>.turso.io  DATABASE_AUTH_TOKEN=<token>
 *
 * No code path branches on which one is in use — that's the whole reason this
 * uses the libsql driver instead of better-sqlite3.
 *
 * Server-only: import this from server functions, server routes, and Inngest
 * handlers. Never from a component.
 */

export const db = drizzle({
	connection: {
		url: process.env.DATABASE_URL ?? "file:.data/marlon.db",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
	schema,
});
