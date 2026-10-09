ALTER TABLE shipments
  ADD COLUMN latitude DECIMAL(9, 6) NULL AFTER destination,
  ADD COLUMN longitude DECIMAL(9, 6) NULL AFTER latitude;
