ALTER TABLE shipments
  ADD COLUMN carrier VARCHAR(100) NULL AFTER destination,
  ADD COLUMN transport_mode VARCHAR(20) NULL AFTER carrier;

CREATE TABLE logistics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(100) NOT NULL,
  event_id VARCHAR(100) NOT NULL,
  tracking_number VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_logistics_provider_event (provider, event_id),
  INDEX idx_logistics_tracking (tracking_number),
  INDEX idx_logistics_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
