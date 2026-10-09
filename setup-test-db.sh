#!/bin/bash

# IMSOP Test Database Setup Script
# This script sets up a MySQL database for testing purposes

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
DB_NAME="imsop_test"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     IMSOP Test Database Setup Script                       ║${NC}"
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

echo -e "${YELLOW}[1/4] Checking MySQL service...${NC}"

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
echo -e "${YELLOW}[2/4] Preparing test database...${NC}"

mysql -h "$DB_HOST" -u "$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE $DB_NAME;
EOF

echo -e "${GREEN}✓ Test database created: $DB_NAME${NC}"
echo ""

# Create tables
echo -e "${YELLOW}[3/4] Creating test database schema...${NC}"

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

echo -e "${GREEN}✓ Test database schema created${NC}"
echo ""

# Create .env.test file
echo -e "${YELLOW}[4/4] Creating test environment configuration...${NC}"

cat > .env.test <<EOF
# IMSOP Test Environment Configuration
NODE_ENV=test
DEBUG=false

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# API Configuration
API_PORT=3001
API_HOST=localhost

# Google Maps API (optional)
VITE_GOOGLE_MAPS_API_KEY=test_api_key

# Authentication
JWT_SECRET=test-secret-key

# CORS Configuration
CORS_ORIGINS=localhost:3001

# Logging
LOG_LEVEL=error
EOF

echo -e "${GREEN}✓ Test environment file created: .env.test${NC}"
echo ""

# Display connection information
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Setup Complete ✓                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Test Database Information:${NC}"
echo "  Host:     $DB_HOST"
echo "  Port:     $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo ""
echo -e "${GREEN}Tables Created:${NC}"
echo "  ✓ users"
echo "  ✓ shipments"
echo "  ✓ orders"
echo "  ✓ telemetry"
echo "  ✓ analytics_events"
echo "  ✓ audit_logs"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Copy test environment: cp .env.test .env"
echo "  2. Run tests: pnpm test"
echo ""
echo -e "${YELLOW}Note:${NC}"
echo "  This database is isolated for testing purposes"
echo "  It will be reset before each test run"
echo ""
