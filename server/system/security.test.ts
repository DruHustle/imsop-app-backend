import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { connection } from '../src/config/db';
import { migrate } from '../src/migrate';
import { buildResetLink } from '../src/services/resetLink';
import { getJwtSecret } from '../src/config/security';

// Opt-in only; never derive a test destination from a developer/production .env.
assert.match(process.env.DATABASE_URL || '', /(?:localhost|127\.0\.0\.1):55467\/imsop_test/);
const server=app.listen(0,'127.0.0.1');
let base='';
before(async()=>{
 await migrate(process.env.DATABASE_URL);
 const address=server.address(); assert(address && typeof address==='object'); base=`http://127.0.0.1:${address.port}`;
});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await connection.end();});
let requestSequence=0;
export async function request(path:string,body?:unknown,cookie?:string,method=body===undefined?'GET':'POST') {
 return fetch(base+path,{method,headers:{'X-Forwarded-For':`192.0.2.${++requestSequence}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie,Origin:'http://localhost:5173'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
const password='Isolated-password-123';
async function account(role='user',workspaceId:string|null=null) {
 const email=`${randomUUID()}@imsop.test`;
 const row=(await connection.query(`INSERT INTO users(email,password,name,role,active_workspace_id) VALUES($1,$2,'Isolated tester',$3,$4) RETURNING *`,[email,await bcrypt.hash(password,4),role,workspaceId])).rows[0];
 if(workspaceId) await connection.query('INSERT INTO workspace_memberships(user_id,workspace_id) VALUES($1,$2)',[row.id,workspaceId]);
 // Login follows the actual API; not a forged fixture JWT.
 const login=await request('/api/auth/login',{email,password}); assert.equal(login.status,200);
 return {row,cookie:login.headers.get('set-cookie')!.split(';')[0]};
}
test('mail builder emits a single hash token and preserves configured query parameters',()=>{
 const link=buildResetLink('https://app.imsop.test/?campaign=help#/reset-password?lang=en&token=old','new.token.value');
 assert.equal(new URL(link).searchParams.get('campaign'),'help');
 assert.equal(new URLSearchParams(new URL(link).hash.split('?')[1]).get('token'),'new.token.value');
});
test('PostgreSQL permits exactly one reset; replay and prior access session are rejected',async()=>{
 const {row,cookie}=await account();
 const token=jwt.sign({id:row.id,purpose:'password-reset',resetVersion:0},getJwtSecret(),{expiresIn:'15m',issuer:'imsop-api',audience:'imsop-password-reset'});
 const results=await Promise.all([request('/api/auth/reset-password',{token,newPassword:'Replacement-pass-123'}),request('/api/auth/reset-password',{token,newPassword:'Replacement-pass-456'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 const stored=(await connection.query('SELECT password_reset_version,session_version FROM users WHERE id=$1',[row.id])).rows[0];
 assert.equal(stored.password_reset_version,1); assert.equal(stored.session_version,1);
 assert.equal((await request('/api/auth/me',undefined,cookie)).status,401);
 assert.equal((await request('/api/auth/reset-password',{token,newPassword:'Replacement-pass-789'})).status,400);
});
test('logout, disabled accounts and role changes revoke captured cookies',async()=>{
 for(const action of ['logout','disabled','role']) {
  const {row,cookie}=await account();
  assert.equal((await request('/api/auth/me',undefined,cookie)).status,200);
  if(action==='logout') assert.equal((await request('/api/auth/logout',{},cookie)).status,204);
  if(action==='disabled') await connection.query('UPDATE users SET disabled=true WHERE id=$1',[row.id]);
  if(action==='role') await connection.query("UPDATE users SET role='analyst' WHERE id=$1",[row.id]);
  assert.equal((await request('/api/auth/me',undefined,cookie)).status,401);
 }
});
test('short passwords fail before reset and unknown reset requests disclose no token',async()=>{
 for(const newPassword of ['123456','12345678901']) assert.equal((await request('/api/auth/reset-password',{token:'invalid'.repeat(4),newPassword})).status,400);
 const res=await request('/api/auth/request-reset',{email:'unknown@imsop.test'}); assert.equal(res.status,202); assert.equal('token' in await res.json(),false);
});

test('workspace provisioning separates public registration, lists, details, events and reports',async()=>{
 const a=randomUUID(),b=randomUUID();
 await connection.query("INSERT INTO workspaces(id,name) VALUES($1,'Workspace A'),($2,'Workspace B')",[a,b]);
 const one=await account('analyst',a),two=await account('user',b),unassigned=await account();
 const row=(await connection.query("INSERT INTO shipments(workspace_id,tracking_number,origin,destination,status) VALUES($1,$2,'A','B','delayed') RETURNING id",[a,randomUUID()])).rows[0];
 const list=await request('/api/operations/shipments?limit=10',undefined,one.cookie);assert.equal(list.status,200);assert.equal((await list.json()).total,1);
 assert.equal((await request(`/api/operations/shipments/${row.id}`,undefined,two.cookie)).status,404);
 assert.equal((await request(`/api/operations/shipments/${row.id}/events`,undefined,two.cookie)).status,404);
 assert.equal((await request('/api/operations/shipments?limit=10',undefined,unassigned.cookie)).status,403);
 assert.equal((await request(`/api/operations/shipments?limit=10&workspaceId=${a}`,undefined,two.cookie)).status,400);
 assert.equal((await request('/api/operations/shipments/export/report',undefined,two.cookie)).status,403);
 assert.equal((await request('/api/operations/shipments/export/report',undefined,one.cookie)).status,200);
 assert.equal((await request('/api/operations/orders?limit=10',undefined,two.cookie)).status,403);
});

test('provider events reduce deterministically across ordering, sparse fields, duplicate identity and workspace/provider collision',async()=>{
 const workspace=randomUUID();await connection.query("INSERT INTO workspaces(id,name) VALUES($1,'Reducer test')",[workspace]);
 const p='test-'+randomUUID(),p2='test-'+randomUUID(),secret='isolated-signing-secret-at-least-32-characters';
 process.env.LOGISTICS_WEBHOOK_SECRETS=JSON.stringify({[p]:secret,[p2]:secret});
 await connection.query('INSERT INTO logistics_connectors(provider,workspace_id) VALUES($1,$2),($3,$2)',[p,workspace,p2]);
 const {cookie}=await account('engineer',workspace),tracking='CARRIER-EXACT-'+randomUUID();
 const {createHmac}=await import('node:crypto');
 const ingest=async(event:any,provider=p)=>{
  const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify(event);
  return fetch(base+`/api/integrations/logistics/${provider}/events`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`192.0.2.${++requestSequence}`,'x-imsop-timestamp':timestamp,'x-imsop-signature':'sha256='+createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex')},body});
 };
 const created={eventId:'a',eventType:'shipment.created',trackingNumber:tracking,status:'in_transit',occurredAt:'2026-10-01T09:00:00Z',origin:'Berlin',destination:'Paris',estimatedArrival:'2026-10-03T12:00:00Z',location:{latitude:52.5,longitude:13.4,label:'Checkpoint'}};
 const delivered={eventId:'z',eventType:'shipment.delivered',trackingNumber:tracking,status:'delivered',actualArrival:'2026-10-03T11:00:00Z',occurredAt:'2026-10-03T11:00:00Z'};
 assert.equal((await ingest(delivered)).status,202);
 assert.equal((await ingest(created)).status,202);
 assert.equal((await (await ingest(created)).json()).duplicate,true);
 assert.equal((await ingest({...created,status:'delayed'})).status,409);
 const snapshot=(await connection.query('SELECT * FROM shipments WHERE workspace_id=$1 AND provider=$2 AND tracking_number=$3',[workspace,p,tracking])).rows[0];
 assert.equal(snapshot.status,'delivered');assert.equal(snapshot.origin,'Berlin');assert.equal(snapshot.destination,'Paris');assert.equal(snapshot.latitude,'52.500000');assert.equal(snapshot.promised_arrival.toISOString(),'2026-10-03T12:00:00.000Z');
 assert.equal(snapshot.observed_at.toISOString(),'2026-10-03T11:00:00.000Z');
 assert.equal((await connection.query('SELECT event_id FROM logistics_events WHERE id=$1',[snapshot.snapshot_event_id])).rows[0].event_id,'z');
 const equal={eventId:'y',eventType:'shipment.updated',trackingNumber:tracking,status:'in_transit',occurredAt:delivered.occurredAt,estimatedArrival:'2026-10-04T12:00:00Z',location:null};
 await Promise.all([ingest(equal),ingest({...created,eventId:'b',destination:'Lyon'})]);
 const corrected=(await connection.query('SELECT * FROM shipments WHERE id=$1',[snapshot.id])).rows[0];
 assert.equal(corrected.status,'delivered');assert.equal(corrected.destination,'Lyon');assert.equal(corrected.latitude,null);assert.equal(corrected.promised_arrival.toISOString(),'2026-10-03T12:00:00.000Z');
 assert.equal((await ingest(created,p2)).status,202);
 assert.equal((await connection.query('SELECT count(*)::int AS count FROM shipments WHERE workspace_id=$1 AND tracking_number=$2',[workspace,tracking])).rows[0].count,2);
 const summary=await (await request('/api/operations/shipments/summary',undefined,cookie)).json();assert.equal(summary.onTime,1);assert.equal(summary.eligible,1);
 const exception={...created,eventId:'exception',trackingNumber:'REVIEW-'+tracking,status:'delayed',eventType:'shipment.exception'};
 const accepted=await ingest(exception);assert.equal(accepted.status,202);
 const feed=await (await request('/api/operations/reviews',undefined,cookie)).json();const review=feed.items[0];assert.equal(review.state,'open');
 const note='Carrier follow-up recorded in isolated verification.';
 assert.equal((await request(`/api/operations/reviews/${review.id}/actions`,{action:'acknowledge',version:0,note},cookie)).status,200);
 assert.equal((await request(`/api/operations/reviews/${review.id}/actions`,{action:'resolve',version:0},cookie)).status,409);
 assert.equal((await request(`/api/operations/reviews/${review.id}/actions`,{action:'resolve',version:1},cookie)).status,200);
 assert.equal((await (await request('/api/operations/reviews',undefined,cookie)).json()).items[0].state,'resolved');
 const notices=await (await request('/api/operations/notifications',undefined,cookie)).json();assert.equal(notices.items[0].action,'resolve');
 assert.equal((await request(`/api/operations/notifications/${notices.items[0].id}/read`,{},cookie)).status,200);
 assert.equal((await (await request('/api/operations/notifications',undefined,cookie)).json()).items[0].read,true);
 assert.equal((await connection.query('SELECT status FROM shipments WHERE id=$1',[review.shipmentId])).rows[0].status,'delayed');
});

test('server search finds older delayed records beyond 500; high-water pagination excludes concurrent inserts',async()=>{
 const workspace=randomUUID();await connection.query("INSERT INTO workspaces(id,name) VALUES($1,'Pagination test')",[workspace]);const {cookie}=await account('analyst',workspace);
 await connection.query("INSERT INTO shipments(workspace_id,tracking_number,origin,destination,status) SELECT $1,'BOUND-'||n,'Start','End',CASE WHEN n=1 THEN 'delayed' ELSE 'in_transit' END FROM generate_series(1,620) n",[workspace]);
 const first=await (await request('/api/operations/shipments?limit=500',undefined,cookie)).json();assert.equal(first.items.length,500);assert.equal(first.total,620);
 await connection.query("INSERT INTO shipments(workspace_id,tracking_number,origin,destination) VALUES($1,'BOUND-new','Start','End')",[workspace]);
 const next=await (await request(`/api/operations/shipments?limit=500&maxId=${first.maxId}&cursor=${first.nextCursor}`,undefined,cookie)).json();assert.equal(next.items.length,120);
 assert.equal(new Set([...first.items,...next.items].map((s:any)=>s.id)).size,620);
 const delayed=await (await request('/api/operations/shipments?limit=500&status=delayed',undefined,cookie)).json();assert.equal(delayed.total,1);assert.equal(delayed.items[0].trackingNumber,'BOUND-1');
 const report=await request('/api/operations/shipments/export/report?status=delayed',undefined,cookie);assert.equal(report.status,200);const html=await report.text();assert.match(html,/BOUND-1/);assert.doesNotMatch(html,/BOUND-620/);
});

test('migration upgrade preserves legacy rows; concurrent runners serialize and changed SQL is rejected',async()=>{
 const {Pool}=await import('pg'),fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const admin=new Pool({connectionString:process.env.DATABASE_URL});const name='imsop_test_upgrade_'+Date.now();
 await admin.query(`CREATE DATABASE ${name}`);
 const url=process.env.DATABASE_URL!.replace(/\/imsop_test$/,`/${name}`),pool=new Pool({connectionString:url});
 try {
  await pool.query(await fs.readFile('migrations/000_initial_schema.sql','utf8'));
  await pool.query("CREATE TABLE schema_migrations(name varchar(255) PRIMARY KEY,applied_at timestamp DEFAULT current_timestamp);INSERT INTO schema_migrations(name) VALUES('000_initial_schema.sql')");
  await pool.query("INSERT INTO shipments(tracking_number,origin,destination,created_at) VALUES('LEGACY','Start','End','2026-10-26 09:00:00')");
  await Promise.all([migrate(url),migrate(url)]);
  const row=(await pool.query("SELECT workspace_id,created_at FROM shipments WHERE tracking_number='LEGACY'")).rows[0];assert.equal(row.workspace_id,null);assert.equal(row.created_at.toISOString(),'2026-10-26T09:00:00.000Z');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,4);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'imsop-migration-'));
  try{for(const file of await fs.readdir('migrations'))if(file.endsWith('.sql'))await fs.copyFile(path.join('migrations',file),path.join(dir,file));await fs.appendFile(path.join(dir,'001_access_recovery.sql'),'\n-- changed applied migration');await assert.rejects(migrate(url,dir),/checksum mismatch/);}finally{await fs.rm(dir,{recursive:true,force:true});}
 }finally{await pool.end();await admin.query(`DROP DATABASE ${name}`);await admin.end();}
});

test('expired resets, malformed credentials and concurrent password changes cannot consume a second version',async()=>{
 const {row,cookie}=await account();
 const token=jwt.sign({id:row.id,purpose:'password-reset',resetVersion:0},getJwtSecret(),{expiresIn:'15m',issuer:'imsop-api',audience:'imsop-password-reset'});
 const expired=jwt.sign({id:row.id,purpose:'password-reset',resetVersion:0},getJwtSecret(),{expiresIn:-1,issuer:'imsop-api',audience:'imsop-password-reset'});
 assert.equal((await request('/api/auth/reset-password',{token:expired,newPassword:'Replacement-pass-123'})).status,400);
 const result=await Promise.all([request('/api/auth/reset-password',{token,newPassword:'Reset-password-123'}),request('/api/auth/change-password/'+row.id,{currentPassword:password,newPassword:'Changed-password-123'},cookie)]);
 assert.equal(result.filter(r=>r.status===200).length,1);
 assert.equal((await connection.query('SELECT password_reset_version FROM users WHERE id=$1',[row.id])).rows[0].password_reset_version,1);
 const fresh=await account();await connection.query('UPDATE auth_sessions SET expires_at=now()-interval \'1 minute\' WHERE user_id=$1',[fresh.row.id]);
 const response=await request('/api/auth/me',undefined,fresh.cookie);assert.equal(response.status,401);assert.equal((await response.json()).code,'SESSION_EXPIRED');
});
