import { describe, expect, it } from "vitest";
import {
	CATEGORIES,
	category,
	FILTERABLE_CATEGORIES,
} from "#/components/ui/registry";

describe("category", () => {
	it("returns the matching entry for a known category", () => {
		expect(category("question")).toBe(CATEGORIES.question);
	});

	it("falls back to uncategorized for an unknown key without crashing", () => {
		expect(category("garbage")).toBe(CATEGORIES.uncategorized);
	});
});

describe("FILTERABLE_CATEGORIES", () => {
	it("contains every category key except uncategorized", () => {
		const expected = Object.keys(CATEGORIES).filter(
			(key) => key !== "uncategorized",
		);
		expect(FILTERABLE_CATEGORIES.sort()).toEqual(expected.sort());
		expect(FILTERABLE_CATEGORIES).not.toContain("uncategorized");
	});
});
