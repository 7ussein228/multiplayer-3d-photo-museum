import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const galleries = pgTable("galleries", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  title: text("title").notNull(),
  curator: text("curator").notNull(),
  dedication: text("dedication").notNull(),
  filmPlaying: boolean("film_playing").notNull().default(false),
  filmStartedAt: timestamp("film_started_at", { withTimezone: true }),
  filmOffset: doublePrecision("film_offset").notNull().default(0),
  filmRevision: integer("film_revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 12 }).notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data"),
  externalUrl: text("external_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visitors = pgTable("visitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 24 }).notNull(),
  color: varchar("color", { length: 16 }).notNull(),
  x: doublePrecision("x").notNull().default(0),
  y: doublePrecision("y").notNull().default(0),
  z: doublePrecision("z").notNull().default(19),
  yaw: doublePrecision("yaw").notNull().default(0),
  seated: boolean("seated").notNull().default(false),
  seatId: varchar("seat_id", { length: 30 }),
  visited: jsonb("visited").$type<string[]>().notNull().default([]),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }),
  visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "set null" }),
  name: varchar("name", { length: 24 }).notNull(),
  body: varchar("body", { length: 180 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const galleriesRelations = relations(galleries, ({ many }) => ({
  assets: many(assets),
  visitors: many(visitors),
  messages: many(messages),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  gallery: one(galleries, { fields: [assets.galleryId], references: [galleries.id] }),
}));

export const visitorsRelations = relations(visitors, ({ one }) => ({
  gallery: one(galleries, { fields: [visitors.galleryId], references: [galleries.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  gallery: one(galleries, { fields: [messages.galleryId], references: [galleries.id] }),
  visitor: one(visitors, { fields: [messages.visitorId], references: [visitors.id] }),
}));
