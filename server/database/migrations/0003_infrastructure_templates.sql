ALTER TABLE "infrastructures" ADD COLUMN "template" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "list_source" text DEFAULT 'registry' NOT NULL;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "sync" jsonb DEFAULT '{"serverSyncsRegistry":true,"serverSyncsDiscovery":true,"studioDefault":"autoCreate","userOverride":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "service_profiles" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD COLUMN "probed_at" timestamp with time zone;--> statement-breakpoint
-- The discovery endpoint type of the viewer port is named like the other
-- AAS service types.
UPDATE "infrastructures" SET "endpoints" = (
  SELECT jsonb_agg(CASE WHEN "entry"->>'type' = 'discovery' THEN jsonb_set("entry", '{type}', '"aasDiscovery"') ELSE "entry" END)
  FROM jsonb_array_elements("endpoints") AS "entry"
) WHERE "endpoints" @> '[{"type":"discovery"}]';--> statement-breakpoint
-- Templates of existing infrastructures: an AAS environment alone serves
-- everything; with further endpoints, those are its registries and discovery.
UPDATE "infrastructures" SET "template" = CASE
  WHEN NOT "endpoints" @> '[{"type":"aasEnvironment"}]' THEN 'full'
  WHEN jsonb_array_length("endpoints") = 1 THEN 'mono-all'
  ELSE 'mono-repo'
END;--> statement-breakpoint
-- Existing infrastructures listed their shells from the AAS repository.
UPDATE "infrastructures" SET "list_source" = 'repository';
