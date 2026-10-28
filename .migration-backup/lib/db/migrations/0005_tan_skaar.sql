CREATE TABLE "registration_pricing_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"pricing_rule_id" integer NOT NULL,
	"actor_user_id" text,
	"previous_values" jsonb NOT NULL,
	"next_values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_pricing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"country" text NOT NULL,
	"language_id" integer,
	"course_type" text NOT NULL,
	"study_mode" text,
	"study_system" text,
	"weekly_sessions" integer,
	"total_sessions" integer,
	"amount" numeric(12, 2),
	"currency" text NOT NULL,
	"unit" text NOT NULL,
	"duration" text,
	"lesson_hours" numeric(5, 2),
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"source_version" text NOT NULL,
	"source_page" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_pricing_rules_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "registration_pricing_country" CHECK ("registration_pricing_rules"."country" in ('algeria','outside_algeria')),
	CONSTRAINT "registration_pricing_course_type" CHECK ("registration_pricing_rules"."course_type" in ('level','conversation','exam')),
	CONSTRAINT "registration_pricing_mode" CHECK ("registration_pricing_rules"."study_mode" is null or "registration_pricing_rules"."study_mode" in ('group','individual')),
	CONSTRAINT "registration_pricing_system" CHECK ("registration_pricing_rules"."study_system" is null or "registration_pricing_rules"."study_system" in ('regular','intensive')),
	CONSTRAINT "registration_pricing_unit" CHECK ("registration_pricing_rules"."unit" in ('monthly','level','package')),
	CONSTRAINT "registration_pricing_amount" CHECK ("registration_pricing_rules"."amount" is null or "registration_pricing_rules"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "registration_request_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"previous_status" text,
	"next_status" text,
	"previous_quote" jsonb,
	"next_quote" jsonb,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_no" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"user_id" text,
	"student_profile_id" integer,
	"enrollment_id" integer,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"country" text NOT NULL,
	"language_id" integer NOT NULL,
	"course_type" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_method_other" text,
	"payment_status" text DEFAULT 'awaiting_verification' NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"price_rule_id" integer,
	"price_status" text NOT NULL,
	"quote_snapshot" jsonb NOT NULL,
	"details" jsonb NOT NULL,
	"admin_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_requests_request_no_unique" UNIQUE("request_no"),
	CONSTRAINT "registration_requests_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "registration_request_country" CHECK ("registration_requests"."country" in ('algeria','outside_algeria')),
	CONSTRAINT "registration_request_course_type" CHECK ("registration_requests"."course_type" in ('level','conversation','exam')),
	CONSTRAINT "registration_request_payment_method" CHECK ("registration_requests"."payment_method" in ('ccp','baridi_mob','edahabia_cib','international_manual','other')),
	CONSTRAINT "registration_request_payment_status" CHECK ("registration_requests"."payment_status" in ('awaiting_verification','verified','rejected')),
	CONSTRAINT "registration_request_status" CHECK ("registration_requests"."status" in ('pending_review','accepted','rejected','needs_info')),
	CONSTRAINT "registration_request_price_status" CHECK ("registration_requests"."price_status" in ('approved','needs_review','admin_approved'))
);
--> statement-breakpoint
ALTER TABLE "registration_pricing_audit" ADD CONSTRAINT "registration_pricing_audit_pricing_rule_id_registration_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."registration_pricing_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_pricing_audit" ADD CONSTRAINT "registration_pricing_audit_actor_user_id_school_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."school_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_pricing_rules" ADD CONSTRAINT "registration_pricing_rules_language_id_school_records_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_request_audit" ADD CONSTRAINT "registration_request_audit_request_id_registration_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."registration_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_request_audit" ADD CONSTRAINT "registration_request_audit_actor_user_id_school_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."school_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_user_id_school_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."school_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_student_profile_id_school_records_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."school_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_enrollment_id_school_records_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."school_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_language_id_school_records_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."school_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_price_rule_id_registration_pricing_rules_id_fk" FOREIGN KEY ("price_rule_id") REFERENCES "public"."registration_pricing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_pricing_audit_rule_created" ON "registration_pricing_audit" USING btree ("pricing_rule_id","created_at");--> statement-breakpoint
CREATE INDEX "registration_pricing_match" ON "registration_pricing_rules" USING btree ("country","language_id","course_type","active");--> statement-breakpoint
CREATE INDEX "registration_request_audit_request_created" ON "registration_request_audit" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "registration_requests_status_created" ON "registration_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "registration_requests_language_course" ON "registration_requests" USING btree ("language_id","course_type","status");--> statement-breakpoint
CREATE INDEX "registration_requests_phone" ON "registration_requests" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "registration_requests_email" ON "registration_requests" USING btree ("email");