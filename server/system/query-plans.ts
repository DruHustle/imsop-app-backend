import {connection} from '../src/config/db';
import assert from 'node:assert/strict';
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:55467\/imsop_test$/);
(async()=>{
 await connection.query('ANALYZE shipments');await connection.query('ANALYZE logistics_events');
 const workspace=(await connection.query("SELECT workspace_id FROM shipments WHERE tracking_number='BOUND-1' LIMIT 1")).rows[0]?.workspace_id;
 const history=(await connection.query('SELECT workspace_id,provider,tracking_number FROM logistics_events GROUP BY workspace_id,provider,tracking_number ORDER BY count(*) DESC LIMIT 1')).rows[0];
 for(const [name,query,values] of [
  ['scoped status page',"SELECT id,tracking_number FROM shipments WHERE workspace_id=$1 AND status='delayed' ORDER BY id DESC LIMIT 100",[workspace]],
  ['projection history',"SELECT id,payload FROM logistics_events WHERE workspace_id=$1 AND provider=$2 AND tracking_number=$3 ORDER BY occurred_at,event_id COLLATE \"C\" LIMIT 10001",[history.workspace_id,history.provider,history.tracking_number]],
 ] as const){const result=await connection.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) '+query,[...values]);console.log(name+'\n'+result.rows.map(r=>r['QUERY PLAN']).join('\n'));}
 const times=[];for(let i=0;i<30;i++){const start=performance.now();await connection.query("SELECT id,tracking_number FROM shipments WHERE workspace_id=$1 AND status='delayed' ORDER BY id DESC LIMIT 100",[workspace]);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
 console.log(JSON.stringify({samples:30,process:'local host to disposable ARM64 PostgreSQL',medianMs:times[15],p95Ms:times[28],note:'Representative local sample only; no general production latency claim.'}));
})().finally(()=>connection.end());
