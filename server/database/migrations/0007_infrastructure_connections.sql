ALTER TABLE "infrastructures" ADD COLUMN "connections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "connection_secrets_ciphertext" text;