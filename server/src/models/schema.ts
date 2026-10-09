import { pgTable, serial, varchar, text, timestamp, numeric, integer, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  passwordResetVersion: integer('password_reset_version').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const shipments = pgTable('shipments', {
  id: serial('id').primaryKey(),
  trackingNumber: varchar('tracking_number', { length: 100 }).notNull().unique(),
  origin: varchar('origin', { length: 255 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  carrier: varchar('carrier', { length: 100 }),
  transportMode: varchar('transport_mode', { length: 20 }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  estimatedArrival: timestamp('estimated_arrival'),
  actualArrival: timestamp('actual_arrival'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const logisticsEvents = pgTable('logistics_events', {
  id: serial('id').primaryKey(),
  provider: varchar('provider', { length: 100 }).notNull(),
  eventId: varchar('event_id', { length: 100 }).notNull(),
  trackingNumber: varchar('tracking_number', { length: 100 }).notNull(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  payload: text('payload').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
  receivedAt: timestamp('received_at').defaultNow(),
}, table => [uniqueIndex('uq_logistics_provider_event').on(table.provider, table.eventId)]);

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: varchar('order_number', { length: 100 }).notNull().unique(),
  customerId: integer('customer_id'),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const telemetry = pgTable('telemetry', {
  id: serial('id').primaryKey(),
  deviceId: varchar('device_id', { length: 100 }).notNull(),
  metricName: varchar('metric_name', { length: 100 }).notNull(),
  metricValue: numeric('metric_value', { precision: 10, scale: 2 }).notNull(),
  timestamp: timestamp('timestamp').defaultNow(),
});
