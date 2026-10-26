import { Request, Response } from 'express';
import { db } from '../config/db';
import { shipments, orders } from '../models/schema';
import { AuthRequest } from '../middleware/auth';
import { recordFilters } from './operationalReads';
import { desc } from 'drizzle-orm';

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : 'N/A';

export const getShipments = async (req: AuthRequest, res: Response) => {
  try {
    const allShipments = await db.select().from(shipments).where(recordFilters('shipments',req)).orderBy(desc(shipments.id)).limit(10001);
    res.json(allShipments);
  } catch (error) {
    console.error('[Operations] Failed to fetch shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
};

export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const allOrders = await db.select().from(orders).where(recordFilters('orders',req)).orderBy(desc(orders.id)).limit(10001);
    res.json(allOrders);
  } catch (error) {
    console.error('[Operations] Failed to fetch orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

export const exportShipmentsReport = async (req: AuthRequest, res: Response) => {
  try {
    const allShipments = await db.select().from(shipments).where(recordFilters('shipments',req)).orderBy(desc(shipments.id)).limit(10001);
    
    if (!allShipments || allShipments.length === 0) {
      return res.status(404).json({ error: 'No shipments found' });
    }

    if (allShipments.length>10000) return res.status(413).json({error:'Refine filters to at most 10000 records.'});
    // Generate HTML report
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shipments Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Shipments Report</h1>
        <p>Generated: ${new Date().toISOString()} · Live · node operational database · Workspace matching filters ${escapeHtml(JSON.stringify(req.query))}</p>
        <table>
          <tr>
            <th>Tracking Number</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Status</th>
            <th>Current ETA</th><th>Original promise</th>
            <th>Actual Arrival</th>
          </tr>
          ${allShipments.map((s: any) => `
            <tr>
              <td>${escapeHtml(s.trackingNumber)}</td>
              <td>${escapeHtml(s.origin)}</td>
              <td>${escapeHtml(s.destination)}</td>
              <td>${escapeHtml(s.status)}</td>
              <td>${escapeHtml(formatDate(s.estimatedArrival))}</td><td>${escapeHtml(formatDate(s.promisedArrival))}</td>
              <td>${escapeHtml(formatDate(s.actualArrival))}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="shipments-report-${Date.now()}.html"`);
    res.send(html);
  } catch (error) {
    console.error('[Operations] Failed to export shipments report:', error);
    res.status(500).json({ error: 'Failed to export shipments report' });
  }
};

export const exportOrdersReport = async (req: AuthRequest, res: Response) => {
  try {
    const allOrders = await db.select().from(orders).where(recordFilters('orders',req)).orderBy(desc(orders.id)).limit(10001);
    
    if (!allOrders || allOrders.length === 0) {
      return res.status(404).json({ error: 'No orders found' });
    }

    if (allOrders.length>10000) return res.status(413).json({error:'Refine filters to at most 10000 records.'});
    // Generate HTML report
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orders Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #2196F3; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Orders Report</h1>
        <p>Generated: ${new Date().toISOString()} · Live · node operational database · Workspace matching filters ${escapeHtml(JSON.stringify(req.query))}</p>
        <table>
          <tr>
            <th>Order Number</th>
            <th>Customer ID</th>
            <th>Total Amount</th>
            <th>Status</th>
            <th>Created At</th>
          </tr>
          ${allOrders.map((o: any) => `
            <tr>
              <td>${escapeHtml(o.orderNumber)}</td>
              <td>${escapeHtml(o.customerId ?? 'N/A')}</td>
              <td>${escapeHtml(o.totalAmount)} ${escapeHtml(o.currency ?? 'currency unknown')}</td>
              <td>${escapeHtml(o.status)}</td>
              <td>${escapeHtml(formatDate(o.createdAt))}</td>
            </tr>
          `).join('')}
        </table>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="orders-report-${Date.now()}.html"`);
    res.send(html);
  } catch (error) {
    console.error('[Operations] Failed to export orders report:', error);
    res.status(500).json({ error: 'Failed to export orders report' });
  }
};
