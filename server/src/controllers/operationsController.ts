import { Request, Response } from 'express';
import { db } from '../config/db';
import { shipments, orders } from '../models/schema';

export const getShipments = async (req: Request, res: Response) => {
  try {
    const allShipments = await db.select().from(shipments);
    res.json(allShipments);
  } catch (error) {
    console.error('[Operations] Failed to fetch shipments:', error);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const allOrders = await db.select().from(orders);
    res.json(allOrders);
  } catch (error) {
    console.error('[Operations] Failed to fetch orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

export const exportShipmentsReport = async (req: Request, res: Response) => {
  try {
    const allShipments = await db.select().from(shipments);
    
    if (!allShipments || allShipments.length === 0) {
      return res.status(404).json({ error: 'No shipments found' });
    }

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
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table>
          <tr>
            <th>Tracking Number</th>
            <th>Origin</th>
            <th>Destination</th>
            <th>Status</th>
            <th>Estimated Arrival</th>
            <th>Actual Arrival</th>
          </tr>
          ${allShipments.map((s: any) => `
            <tr>
              <td>${s.tracking_number}</td>
              <td>${s.origin}</td>
              <td>${s.destination}</td>
              <td>${s.status}</td>
              <td>${s.estimated_arrival ? new Date(s.estimated_arrival).toLocaleDateString() : 'N/A'}</td>
              <td>${s.actual_arrival ? new Date(s.actual_arrival).toLocaleDateString() : 'N/A'}</td>
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

export const exportOrdersReport = async (req: Request, res: Response) => {
  try {
    const allOrders = await db.select().from(orders);
    
    if (!allOrders || allOrders.length === 0) {
      return res.status(404).json({ error: 'No orders found' });
    }

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
        <p>Generated: ${new Date().toLocaleString()}</p>
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
              <td>${o.order_number}</td>
              <td>${o.customer_id || 'N/A'}</td>
              <td>$${parseFloat(o.total_amount).toFixed(2)}</td>
              <td>${o.status}</td>
              <td>${new Date(o.created_at).toLocaleDateString()}</td>
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
