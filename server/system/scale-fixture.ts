import {connection} from '../src/config/db';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {hashPassword} from '../src/services/passwords';
import assert from 'node:assert/strict';
assert.match(process.env.DATABASE_URL||'',/@127\.0\.0\.1:55467\/imsop_test$/);
(async()=>{
 const workspace=randomUUID(),email=randomUUID()+'@imsop.test';await connection.query("INSERT INTO workspaces(id,name) VALUES($1,'Isolated scale verification')",[workspace]);
 const user=(await connection.query("INSERT INTO users(email,password,name,role,active_workspace_id) VALUES($1,$2,'Scale Verification','analyst',$3) RETURNING id",[email,await hashPassword('Scale-test-password-123'),workspace])).rows[0];
 await connection.query('INSERT INTO workspace_memberships(user_id,workspace_id) VALUES($1,$2)',[user.id,workspace]);
 await connection.query("INSERT INTO shipments(workspace_id,tracking_number,origin,destination,status,latitude,longitude) SELECT $1,'LARGE-'||lpad(n::text,4,'0'),'Isolated hub A','Isolated hub B',CASE WHEN n=1 THEN 'delayed' ELSE 'in_transit' END,CASE WHEN n=1 THEN 0 ELSE NULL END,CASE WHEN n=1 THEN 0 ELSE NULL END FROM generate_series(1,620)n",[workspace]);
 await writeFile('/tmp/imsop-scale-fixture.json',JSON.stringify({email,workspaceId:workspace}));
 console.log(JSON.stringify({fixture:'synthetic authorized scale selection',records:620,oldDelayed:'LARGE-0001'}));
})().finally(()=>connection.end());
