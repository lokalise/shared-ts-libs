CREATE TABLE "users" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "project_id" integer REFERENCES "projects"("id")
);
