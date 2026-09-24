-- CockroachDB 25.4+ creates tables schema-locked, and a locked table cannot take the
-- CREATE INDEX that follows its CREATE TABLE in the same Prisma migration.
ALTER ROLE ALL SET create_table_with_schema_locked = false;
