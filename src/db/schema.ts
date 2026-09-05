import { bigint, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const scores = pgTable("speedrun_scores", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  playerName: varchar("player_name", { length: 16 }).notNull(),
  timeMs: integer("time_ms").notNull(),
  inputType: varchar("input_type", { length: 16 }).notNull().default("keyboard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("speedrun_scores_time_idx").on(table.timeMs, table.createdAt)]);
