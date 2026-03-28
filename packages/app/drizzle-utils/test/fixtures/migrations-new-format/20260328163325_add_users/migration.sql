CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"project_id" integer
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");