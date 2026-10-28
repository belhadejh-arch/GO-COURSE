CREATE TABLE "registration_receipt_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer,
	"object_path" text NOT NULL,
	"upload_token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone,
	CONSTRAINT "registration_receipt_uploads_object_path_unique" UNIQUE("object_path"),
	CONSTRAINT "registration_receipt_uploads_upload_token_hash_unique" UNIQUE("upload_token_hash"),
	CONSTRAINT "registration_receipt_status" CHECK ("registration_receipt_uploads"."status" in ('pending','attached'))
);
--> statement-breakpoint
ALTER TABLE "registration_receipt_uploads" ADD CONSTRAINT "registration_receipt_uploads_request_id_registration_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."registration_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_receipt_uploads" ADD CONSTRAINT "registration_receipt_uploads_object_path_school_files_object_path_fk" FOREIGN KEY ("object_path") REFERENCES "public"."school_files"("object_path") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_receipt_request" ON "registration_receipt_uploads" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "registration_receipt_expiry" ON "registration_receipt_uploads" USING btree ("status","expires_at");