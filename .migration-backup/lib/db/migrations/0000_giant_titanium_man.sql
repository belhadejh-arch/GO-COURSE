CREATE TABLE "school_file_contents" (
	"object_path" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_files" (
	"object_path" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"course_id" integer,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_provider" text DEFAULT 'replit' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_id" integer NOT NULL,
	"to_id" integer NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_records_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "school_record_entity" CHECK ("school_records"."entity" in ('languages','levels','students','teachers','courses','enrollments','groups','sessions','lessons','resources','assignments','submissions','attendance','plans','subscriptions','payments','invoices','notifications','settings','audit','progress'))
);
--> statement-breakpoint
CREATE TABLE "school_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_users_email_unique" UNIQUE("email"),
	CONSTRAINT "school_user_role" CHECK ("school_users"."role" in ('admin','staff','teacher','student'))
);
--> statement-breakpoint
CREATE TABLE "teacher_specialties" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"language_id" integer NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "teacher_specialty_level" CHECK ("teacher_specialties"."level" in ('A1','A2','B1','B2','C1','C2'))
);
--> statement-breakpoint
ALTER TABLE "school_file_contents" ADD CONSTRAINT "school_file_contents_object_path_school_files_object_path_fk" FOREIGN KEY ("object_path") REFERENCES "public"."school_files"("object_path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_files" ADD CONSTRAINT "school_files_owner_id_school_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_files" ADD CONSTRAINT "school_files_course_id_school_records_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_links" ADD CONSTRAINT "school_links_from_id_school_records_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_links" ADD CONSTRAINT "school_links_to_id_school_records_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_records" ADD CONSTRAINT "school_records_owner_id_school_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_specialties" ADD CONSTRAINT "teacher_specialties_teacher_id_school_records_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_specialties" ADD CONSTRAINT "teacher_specialties_language_id_school_records_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_link_unique" ON "school_links" USING btree ("from_id","to_id","kind");--> statement-breakpoint
CREATE INDEX "school_link_target" ON "school_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "school_records_entity_status" ON "school_records" USING btree ("entity","status");--> statement-breakpoint
CREATE INDEX "school_records_owner" ON "school_records" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_profile_email" ON "school_records" USING btree (lower("data"->>'email')) WHERE "school_records"."entity" in ('students','teachers') and "school_records"."status" <> 'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_specialty_unique" ON "teacher_specialties" USING btree ("teacher_id","language_id","level");