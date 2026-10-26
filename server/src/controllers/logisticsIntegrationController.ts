import { Request, Response } from 'express';
import { connection } from '../config/db';

// Contract v2: (occurredAt, eventId in C byte order) is the deterministic total order.
// Absent fields preserve evidence; null explicitly clears optional fields. Route labels are never destinations.
export function projectEvents(events:any[]) {
 const snapshot:any={origin:'Unknown',destination:'Unknown',carrier:null,transportMode:null,latitude:null,longitude:null,estimatedArrival:null,actualArrival:null,promisedArrival:null,status:'pending',provenance:{}};
 let terminal=false;
 for(const stored of events) {
  const event=JSON.parse(stored.payload);
  for(const field of ['origin','destination','carrier','transportMode','estimatedArrival','actualArrival']) {
   if(Object.hasOwn(event,field)) {snapshot[field]=event[field];snapshot.provenance[field]=stored.id;}
  }
  if(event.estimatedArrival && snapshot.promisedArrival===null) {snapshot.promisedArrival=event.estimatedArrival;snapshot.provenance.promisedArrival=stored.id;}
  if(Object.hasOwn(event,'location')) {
   snapshot.provenance.location=stored.id; snapshot.latitude=event.location?.latitude ?? null; snapshot.longitude=event.location?.longitude ?? null;
  }
  if(!terminal || event.eventType==='shipment.corrected' || event.status==='delivered') {snapshot.status=event.status;snapshot.provenance.status=stored.id;}
  terminal=snapshot.status==='delivered';
  snapshot.eventId=stored.id; snapshot.observedAt=stored.occurred_at; snapshot.receivedAt=stored.received_at;
 }
 return snapshot;
}
export async function ingestLogisticsEvent(req:Request,res:Response) {
 const provider=req.logisticsProvider!, event=req.body;
 const tx=await connection.connect();
 try {
  await tx.query('BEGIN');
  const connector=(await tx.query('SELECT workspace_id FROM logistics_connectors WHERE provider=$1 AND enabled FOR SHARE',[provider])).rows[0];
  if(!connector) {await tx.query('ROLLBACK');return res.status(403).json({error:'Provider workspace is not provisioned'});}
  const workspace=connector.workspace_id;
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${workspace}:${provider}:${event.trackingNumber}`]);
  const inserted=await tx.query(`INSERT INTO logistics_events(workspace_id,provider,event_id,tracking_number,event_type,payload,occurred_at)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,provider,event_id) DO NOTHING RETURNING id`,[workspace,provider,event.eventId,event.trackingNumber,event.eventType,JSON.stringify(event),event.occurredAt]);
  if(!inserted.rowCount) {
   const old=(await tx.query('SELECT payload FROM logistics_events WHERE workspace_id=$1 AND provider=$2 AND event_id=$3',[workspace,provider,event.eventId])).rows[0];
   // Reused identity with changed content is a conflict, never silently treated as an identical retry.
   if(old.payload!==JSON.stringify(event)) {await tx.query('ROLLBACK');return res.status(409).json({error:'Event identity already used with different content'});}
   await tx.query('COMMIT');return res.status(202).json({accepted:true,duplicate:true});
  }
  const history=await tx.query(`SELECT id,payload,occurred_at,received_at FROM logistics_events WHERE workspace_id=$1 AND provider=$2 AND tracking_number=$3
   ORDER BY occurred_at,event_id COLLATE "C" LIMIT 10001`,[workspace,provider,event.trackingNumber]);
  if(history.rows.length>10000) throw new Error('Projection history limit; operator compaction required');
  const s=projectEvents(history.rows);
  const shipment=(await tx.query(`INSERT INTO shipments(workspace_id,provider,tracking_number,origin,destination,carrier,transport_mode,latitude,longitude,status,estimated_arrival,actual_arrival,promised_arrival,snapshot_event_id,observed_at,received_at,projection_version,projection_provenance)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,2,$17)
   ON CONFLICT(workspace_id,provider,tracking_number) DO UPDATE SET origin=EXCLUDED.origin,destination=EXCLUDED.destination,carrier=EXCLUDED.carrier,transport_mode=EXCLUDED.transport_mode,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,status=EXCLUDED.status,estimated_arrival=EXCLUDED.estimated_arrival,actual_arrival=EXCLUDED.actual_arrival,promised_arrival=coalesce(shipments.promised_arrival,EXCLUDED.promised_arrival),snapshot_event_id=EXCLUDED.snapshot_event_id,observed_at=EXCLUDED.observed_at,received_at=EXCLUDED.received_at,projection_version=2,projection_provenance=EXCLUDED.projection_provenance || CASE WHEN shipments.promised_arrival IS NOT NULL THEN jsonb_build_object('promisedArrival',shipments.projection_provenance->'promisedArrival') ELSE '{}'::jsonb END RETURNING id`,
   [workspace,provider,event.trackingNumber,s.origin,s.destination,s.carrier,s.transportMode,s.latitude,s.longitude,s.status,s.estimatedArrival,s.actualArrival,s.promisedArrival,s.eventId,s.observedAt.toISOString(),s.receivedAt.toISOString(),JSON.stringify(s.provenance)])).rows[0];
  if(['delayed','exception'].includes(s.status)) {
   const review=await tx.query(`INSERT INTO review_cases(workspace_id,shipment_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id`,[workspace,shipment.id]);
   if(review.rowCount) await tx.query("INSERT INTO review_actions(workspace_id,case_id,action) VALUES($1,$2,'opened')",[workspace,review.rows[0].id]);
  }
  await tx.query('COMMIT');
  res.status(202).json({accepted:true,duplicate:false,shipmentId:shipment.id,projectionVersion:2});
 } catch {
  await tx.query('ROLLBACK');
  console.error(JSON.stringify({event:'ingestion_failed',provider,correlationId:req.header('x-request-id')}));
  res.status(503).json({error:'Event could not be persisted. Retry with the same event identity.'});
 } finally {tx.release();}
}
