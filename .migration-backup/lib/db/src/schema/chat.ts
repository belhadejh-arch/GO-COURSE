import {
  boolean, check, index, integer, pgTable, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { schoolFiles, schoolRecords, schoolUsers } from "./school";

export const chatConversations = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  scopeKey: text("scope_key").notNull().unique(),
  courseId: integer("course_id").notNull().references(() => schoolRecords.id),
  groupId: integer("group_id").references(() => schoolRecords.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("chat_conversation_kind", sql`${t.kind} in ('group','direct')`),
  index("chat_conversations_course").on(t.courseId),
  index("chat_conversations_group").on(t.groupId),
  index("chat_conversations_updated").on(t.updatedAt),
]);

export const chatConversationMembers = pgTable("chat_conversation_members", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => chatConversations.id),
  userId: text("user_id").notNull().references(() => schoolUsers.id),
  profileRecordId: integer("profile_record_id").references(() => schoolRecords.id),
  role: text("role").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  canSend: boolean("can_send").notNull().default(false),
}, (t) => [
  uniqueIndex("chat_member_unique").on(t.conversationId, t.userId),
  index("chat_members_user").on(t.userId, t.conversationId),
  index("chat_members_conversation").on(t.conversationId),
  check("chat_member_role", sql`${t.role} in ('admin','staff','teacher','student')`),
]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => chatConversations.id),
  senderId: text("sender_id").notNull().references(() => schoolUsers.id),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("chat_messages_conversation_id").on(t.conversationId, t.id),
  index("chat_messages_sender").on(t.senderId),
]);

export const chatAttachments = pgTable("chat_attachments", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => chatConversations.id),
  messageId: integer("message_id").references(() => chatMessages.id),
  uploaderId: text("uploader_id").notNull().references(() => schoolUsers.id),
  objectPath: text("object_path").notNull().unique().references(() => schoolFiles.objectPath),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("chat_attachments_conversation").on(t.conversationId, t.id),
  index("chat_attachments_message").on(t.messageId),
  check("chat_attachment_status", sql`${t.status} in ('pending','uploaded','attached')`),
  check("chat_attachment_size", sql`${t.size} > 0 and ${t.size} <= 26214400`),
]);

export const chatReadStates = pgTable("chat_read_states", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => chatConversations.id),
  userId: text("user_id").notNull().references(() => schoolUsers.id),
  lastReadMessageId: integer("last_read_message_id").references(() => chatMessages.id),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("chat_read_state_unique").on(t.conversationId, t.userId),
  index("chat_read_state_user").on(t.userId, t.conversationId),
]);

export const chatReports = pgTable("chat_reports", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => chatConversations.id),
  messageId: integer("message_id").references(() => chatMessages.id),
  reporterId: text("reporter_id").notNull().references(() => schoolUsers.id),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("open"),
  reviewedBy: text("reviewed_by").references(() => schoolUsers.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("chat_reports_status").on(t.status, t.createdAt),
  index("chat_reports_conversation").on(t.conversationId),
  check("chat_report_reason", sql`${t.reason} in ('harassment','contact_info','inappropriate','other')`),
  check("chat_report_status", sql`${t.status} in ('open','resolved','dismissed')`),
]);
