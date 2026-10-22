import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  uid: uuid().primaryKey(),
  username: text().notNull().unique(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: text().notNull(),
});

export const authSessionsTable = pgTable("auth_sessions", {
  id: uuid().primaryKey(),
  userUid: uuid()
    .notNull()
    .references(() => usersTable.uid, { onDelete: "cascade" }),
  refreshTokenHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});
