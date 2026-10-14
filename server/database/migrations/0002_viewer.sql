CREATE TABLE "user_preferences" (
	"subject" text PRIMARY KEY NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_installations" ADD COLUMN "bundled" boolean DEFAULT false NOT NULL;