CREATE TABLE "school_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_login_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_credentials" ADD CONSTRAINT "school_credentials_user_id_school_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_sessions" ADD CONSTRAINT "school_sessions_user_id_school_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."school_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_sessions_user" ON "school_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "school_sessions_expiry" ON "school_sessions" USING btree ("expires_at");