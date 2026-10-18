ALTER TABLE "infrastructures" ADD COLUMN "managed_key" text;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "managed_digest" text;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD CONSTRAINT "infrastructures_managed_key_unique" UNIQUE("managed_key");