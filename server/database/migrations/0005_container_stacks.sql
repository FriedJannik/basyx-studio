CREATE TABLE "container_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"engine_host" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_stacks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"secrets_ciphertext" text NOT NULL,
	"engine_host" text NOT NULL,
	"images" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"infrastructure_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "infrastructures" ALTER COLUMN "sync" SET DEFAULT '{"serverSyncsRegistry":true,"serverSyncsDiscovery":true,"studioDefault":"autoCreate","userOverride":false,"idScheme":"iri","idPrefix":"https://example.com/ids/"}'::jsonb;--> statement-breakpoint
ALTER TABLE "container_stacks" ADD CONSTRAINT "container_stacks_infrastructure_id_infrastructures_id_fk" FOREIGN KEY ("infrastructure_id") REFERENCES "public"."infrastructures"("id") ON DELETE set null ON UPDATE no action;