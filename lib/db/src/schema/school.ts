import { pgTable, text, serial, timestamp, jsonb, integer, boolean, uniqueIndex, index, check, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const schoolUsers = pgTable("school_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("student"),
  enabled: boolean("enabled").notNull().default(true),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("school_user_role", sql`${t.role} in ('admin','staff','teacher','student')`)]);

export const schoolCredentials = pgTable("school_credentials", {
  userId: text("user_id").primaryKey().references(() => schoolUsers.id),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const schoolSessions = pgTable("school_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => schoolUsers.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("school_sessions_user").on(t.userId), index("school_sessions_expiry").on(t.expiresAt)]);
export const schoolLoginLimits = pgTable("school_login_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(1),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
});

// Domain documents retain extensible educational content; all relationships are
// also materialized as foreign-key-protected links below, not isolated JSON IDs.
export const schoolRecords = pgTable("school_records", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  ownerId: text("owner_id").references(() => schoolUsers.id),
  dedupeKey: text("dedupe_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("school_records_entity_status").on(t.entity, t.status),
  index("school_records_owner").on(t.ownerId),
  uniqueIndex("school_profile_email").on(sql`lower(${t.data}->>'email')`).where(sql`${t.entity} in ('students','teachers') and ${t.status} <> 'archived'`),
  check("school_record_entity", sql`${t.entity} in ('languages','levels','students','teachers','courses','enrollments','groups','sessions','lessons','resources','assignments','submissions','attendance','plans','subscriptions','payments','invoices','notifications','settings','audit','progress')`),
]);

export const schoolLinks = pgTable("school_links", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id").notNull().references(() => schoolRecords.id),
  toId: integer("to_id").notNull().references(() => schoolRecords.id),
  kind: text("kind").notNull(),
}, (t) => [
  uniqueIndex("school_link_unique").on(t.fromId, t.toId, t.kind),
  index("school_link_target").on(t.toId),
]);

export const schoolFiles = pgTable("school_files", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => schoolUsers.id),
  courseId: integer("course_id").references(() => schoolRecords.id),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  storageProvider: text("storage_provider").notNull().default("replit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const bytea=customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"bytea"});
export const schoolFileContents=pgTable("school_file_contents",{
  objectPath:text("object_path").primaryKey().references(()=>schoolFiles.objectPath),
  bytes:bytea("bytes").notNull(),
  uploadedAt:timestamp("uploaded_at",{withTimezone:true}).notNull().defaultNow(),
});

export const teacherSpecialties = pgTable("teacher_specialties", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => schoolRecords.id),
  languageId: integer("language_id").notNull().references(() => schoolRecords.id),
  level: text("level").notNull(),
}, (t) => [
  uniqueIndex("teacher_specialty_unique").on(t.teacherId,t.languageId,t.level),
  check("teacher_specialty_level",sql`${t.level} in ('A1','A2','B1','B2','C1','C2')`),
]);

export const insertSchoolRecordSchema = createInsertSchema(schoolRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type SchoolRow = typeof schoolRecords.$inferSelect;
export type SchoolUser = typeof schoolUsers.$inferSelect;
