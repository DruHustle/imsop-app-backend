#!/bin/bash

# IMSOP Development Database Setup Script
# This script sets up a MySQL database for local development with sample data

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="imsop_dev"
DEMO_DB_USER="imsop_dev"
DEMO_DB_PASSWORD="imsop_dev_password"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     IMSOP Development Database Setup Script                ║${NC}"
echo -e "${BLUE}║     Intelligent Multi-Cloud Supply Chain Platform          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if MySQL is installed
if ! command -v mysql &> /dev/null; then
  echo -e "${RED}✗ MySQL is not installed${NC}"
  echo "Please install MySQL first:"
  echo "  Ubuntu/Debian: sudo apt-get install mysql-server"
  echo "  macOS: brew install mysql"
  exit 1
fi

echo -e "${YELLOW}[1/5] Checking MySQL service...${NC}"

# Check if MySQL service is running
if ! pgrep -x "mysqld" > /dev/null; then
  echo -e "${YELLOW}MySQL service is not running. Attempting to start...${NC}"
  if command -v sudo &> /dev/null; then
    sudo service mysql start || sudo /usr/local/mysql/support-files/mysql.server start || true
  fi
  sleep 2
fi

# Verify MySQL connection
if ! mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "SELECT 1" &> /dev/null; then
  echo -e "${RED}✗ Cannot connect to MySQL${NC}"
  echo "Please ensure MySQL is running and credentials are correct:"
  echo "  Host: $DB_HOST"
  echo "  User: $DB_USER"
  exit 1
fi

echo -e "${GREEN}✓ MySQL service is running${NC}"
echo ""

# Drop existing database if it exists
echo -e "${YELLOW}[2/5] Preparing database...${NC}"

mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE $DB_NAME;
EOF

echo -e "${GREEN}✓ Database created: $DB_NAME${NC}"
echo ""

# Create tables
echo -e "${YELLOW}[3/5] Creating database schema...${NC}"

mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" <<'EOF'
-- Users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  password_reset_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shipments table
CREATE TABLE shipments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tracking_number VARCHAR(100) NOT NULL UNIQUE,
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  carrier VARCHAR(100) NULL,
  transport_mode VARCHAR(20) NULL,
  latitude DECIMAL(9, 6) NULL,
  longitude DECIMAL(9, 6) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  estimated_arrival TIMESTAMP NULL,
  actual_arrival TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_tracking (tracking_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Orders table
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id INT,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_order_number (order_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Telemetry table
CREATE TABLE telemetry (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10, 2) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device (device_id),
  INDEX idx_metric (metric_name),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Analytics events table
CREATE TABLE analytics_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  event_data JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_type (event_type),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit logs table
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id INT,
  changes JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
EOF

echo -e "${GREEN}✓ Database schema created${NC}"
echo ""

# Insert sample data
echo -e "${YELLOW}[4/5] Inserting sample data...${NC}"

# Hash passwords using bcryptjs (demo passwords)
# admin@demo.local: demo-admin-password
# operator@demo.local: demo-operator-password
# analyst@demo.local: demo-analyst-password
# demo@demo.local: demo-password

mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" <<'EOF'
-- Insert demo users
INSERT INTO users (email, password, name, role) VALUES
('admin@demo.local', '$2b$10$YourHashedPasswordHere1', 'Admin User', 'admin'),
('operator@demo.local', '$2b$10$YourHashedPasswordHere2', 'Operator User', 'user'),
('analyst@demo.local', '$2b$10$YourHashedPasswordHere3', 'Analyst User', 'user'),
('demo@demo.local', '$2b$10$YourHashedPasswordHere4', 'Demo User', 'user');

-- Insert sample shipments
INSERT INTO shipments (tracking_number, origin, destination, latitude, longitude, status, estimated_arrival) VALUES
('SHP-001-2026', 'Shanghai Port', 'Los Angeles Port', 33.7405, -118.2775, 'in_transit', DATE_ADD(NOW(), INTERVAL 15 DAY)),
('SHP-002-2026', 'Rotterdam Port', 'Singapore Port', 1.2644, 103.8200, 'pending', DATE_ADD(NOW(), INTERVAL 30 DAY)),
('SHP-003-2026', 'Dubai Port', 'Hamburg Port', 53.5461, 9.9661, 'delivered', NOW()),
('SHP-004-2026', 'Hong Kong Port', 'New York Port', 40.6840, -74.0062, 'in_transit', DATE_ADD(NOW(), INTERVAL 20 DAY)),
('SHP-005-2026', 'Singapore Port', 'Tokyo Port', 35.6167, 139.7958, 'pending', DATE_ADD(NOW(), INTERVAL 10 DAY));

-- Insert sample orders
INSERT INTO orders (order_number, customer_id, total_amount, status) VALUES
('ORD-001-2026', 1, 50000.00, 'pending'),
('ORD-002-2026', 2, 75000.00, 'confirmed'),
('ORD-003-2026', 3, 120000.00, 'shipped'),
('ORD-004-2026', 4, 45000.00, 'delivered'),
('ORD-005-2026', 5, 95000.00, 'pending');

-- Insert sample telemetry data
INSERT INTO telemetry (device_id, metric_name, metric_value) VALUES
('DEVICE-001', 'temperature', 22.5),
('DEVICE-001', 'humidity', 45.3),
('DEVICE-002', 'temperature', 21.8),
('DEVICE-002', 'humidity', 48.2),
('DEVICE-003', 'temperature', 23.1),
('DEVICE-003', 'humidity', 42.7),
('DEVICE-004', 'temperature', 20.9),
('DEVICE-004', 'humidity', 50.1);

-- Insert sample analytics events
INSERT INTO analytics_events (event_type, event_data) VALUES
('shipment_created', '{"shipment_id": 1, "status": "pending"}'),
('order_confirmed', '{"order_id": 1, "amount": 50000}'),
('device_online', '{"device_id": "DEVICE-001", "timestamp": "2026-01-10T10:00:00Z"}'),
('alert_triggered', '{"alert_type": "high_temperature", "device_id": "DEVICE-001"}');
EOF

echo -e "${GREEN}✓ Sample data inserted${NC}"
echo ""

# Create .env.dev file
echo -e "${YELLOW}[5/5] Creating environment configuration...${NC}"

cat > .env.dev <<EOF
# IMSOP Development Environment Configuration
NODE_ENV=development
DEBUG=true

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# API Configuration
API_PORT=3000
API_HOST=localhost

# Google Maps API (optional)
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here

# Authentication
JWT_SECRET=dev-secret-key-change-in-production

# CORS Configuration
CORS_ORIGINS=*

# Logging
LOG_LEVEL=debug
EOF

echo -e "${GREEN}✓ Environment file created: .env.dev${NC}"
echo ""

# Display connection information
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Setup Complete ✓                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Database Information:${NC}"
echo "  Host:     $DB_HOST"
echo "  Port:     $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo ""
echo -e "${GREEN}Demo Accounts:${NC}"
echo "  Admin:    admin@demo.local / demo-admin-password"
echo "  Operator: operator@demo.local / demo-operator-password"
echo "  Analyst:  analyst@demo.local / demo-analyst-password"
echo "  Demo:     demo@demo.local / demo-password"
echo ""
echo -e "${GREEN}Sample Data:${NC}"
echo "  ✓ 4 demo users"
echo "  ✓ 5 sample shipments"
echo "  ✓ 5 sample orders"
echo "  ✓ 8 telemetry readings"
echo "  ✓ 4 analytics events"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Copy environment file: cp .env.dev .env"
echo "  2. Install dependencies: pnpm install"
echo "  3. Start development server: pnpm dev"
echo ""
echo -e "${YELLOW}Note:${NC}"
echo "  Password hashes need to be generated with bcryptjs"
echo "  Run: node -e \"require('bcryptjs').hash('password', 10, (err, hash) => console.log(hash))\""
echo ""
