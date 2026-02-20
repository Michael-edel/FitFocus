-- Add profile columns to users table for Google OAuth
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN picture TEXT;
ALTER TABLE users ADD COLUMN updated_at INTEGER;
