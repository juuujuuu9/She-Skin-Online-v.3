CREATE TABLE "audio_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"audio_file" text,
	"artwork" text,
	"youtube_link" text,
	"soundcloud_link" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "audio_posts_slug_unique" UNIQUE("slug")
);
