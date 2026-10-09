ALTER TABLE users
  ADD COLUMN password_reset_version INT NOT NULL DEFAULT 0 AFTER role;
