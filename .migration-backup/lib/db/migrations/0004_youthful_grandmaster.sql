CREATE TABLE "chat_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" integer,
	"uploader_id" text NOT NULL,
	"object_path" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_attachments_object_path_unique" UNIQUE("object_path"),
	CONSTRAINT "chat_attachment_status" CHECK ("chat_attachments"."status" in ('pending','uploaded','attached')),
	CONSTRAINT "chat_attachment_size" CHECK ("chat_attachments"."size" > 0 and "chat_attachments"."size" <= 26214400)
);
--> statement-breakpoint
CREATE TABLE "chat_conversation_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"profile_record_id" integer,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"can_send" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chat_member_role" CHECK ("chat_conversation_members"."role" in ('admin','staff','teacher','student'))
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"scope_key" text NOT NULL,
	"course_id" integer NOT NULL,
	"group_id" integer,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_scope_key_unique" UNIQUE("scope_key"),
	CONSTRAINT "chat_conversation_kind" CHECK ("chat_conversations"."kind" in ('group','direct'))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_read_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"last_read_message_id" integer,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" integer,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_report_reason" CHECK ("chat_reports"."reason" in ('harassment','contact_info','inappropriate','other')),
	CONSTRAINT "chat_report_status" CHECK ("chat_reports"."status" in ('open','resolved','dismissed'))
);
--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploader_id_school_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_object_path_school_files_object_path_fk" FOREIGN KEY ("object_path") REFERENCES "public"."school_files"("object_path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_user_id_school_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_profile_record_id_school_records_id_fk" FOREIGN KEY ("profile_record_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_course_id_school_records_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_group_id_school_records_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_school_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_user_id_school_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_last_read_message_id_chat_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_school_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reviewed_by_school_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachments_conversation" ON "chat_attachments" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "chat_attachments_message" ON "chat_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_member_unique" ON "chat_conversation_members" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_members_user" ON "chat_conversation_members" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "chat_members_conversation" ON "chat_conversation_members" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_course" ON "chat_conversations" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_group" ON "chat_conversations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_updated" ON "chat_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id" ON "chat_messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "chat_messages_sender" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_read_state_unique" ON "chat_read_states" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_read_state_user" ON "chat_read_states" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "chat_reports_status" ON "chat_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "chat_reports_conversation" ON "chat_reports" USING btree ("conversation_id");
CREATE FUNCTION reject_chat_message_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Chat messages cannot be updated or deleted.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER chat_messages_are_immutable
BEFORE UPDATE OR DELETE ON "chat_messages"
FOR EACH ROW EXECUTE FUNCTION reject_chat_message_mutation();