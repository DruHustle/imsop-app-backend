import assert from 'node:assert/strict';
import {connection} from '../src/config/db';
const expected=process.argv[2];assert.match(expected||'',/^[a-f0-9]{40}$/);assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:55467\/imsop_test$/);
(async()=>{
 const version=await(await fetch('http://127.0.0.1:18067/version')).json();assert.equal(version.revision,expected);assert.equal(version.apiContract,2);
 const ready=await fetch('http://127.0.0.1:18067/ready');assert.equal(ready.status,200);
 const counts:Record<string,number>={};for(const table of ['provisioning_runs','users','workspaces','workspace_memberships','logistics_connectors','shipments','orders','telemetry','logistics_events','review_cases','review_actions','auth_sessions','reset_deliveries','notification_preferences','notification_deliveries','forecast_observations','forecast_runs','supply_chain.purchase_orders','supply_chain.purchase_order_items','supply_chain.order_outbox','supply_chain.inventories','supply_chain.purchase_receipts','supply_chain.purchase_receipt_items'])counts[table]=Number((await connection.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);
 console.log(JSON.stringify({environment:'isolated rollback rehearsal',version,readiness:ready.status,operationalRowCounts:counts,observedAt:new Date().toISOString(),reverseMigrations:false,productionDeployment:false},null,2));
})().finally(()=>connection.end());
