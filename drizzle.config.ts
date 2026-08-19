import { defineConfig } from "drizzle-kit";

/**
 * The `turso` dialect speaks libsql, which covers both the local `file:` DB
 * and a hosted Turso instance — same env contract as `src/db/client.ts`.
 */
export default defineConfig({
	dialect: "turso",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "file:.data/marlon.db",
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
});
