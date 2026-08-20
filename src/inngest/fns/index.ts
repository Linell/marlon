import { enrichMention } from "./enrichMention";
import { importSource } from "./importSource";
import { scheduleImports } from "./scheduleImports";

/**
 * THE IMPORT PIPELINE
 * -----------------------------------------------------------------------------
 * cron ─▶ schedule-imports ─▶ import.requested ─▶ import-source ─▶
 * mention.created ─▶ enrich-mention
 */
export const functions = [scheduleImports, importSource, enrichMention];

export { enrichMention, importSource, scheduleImports };
