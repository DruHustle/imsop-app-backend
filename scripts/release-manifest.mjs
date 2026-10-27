import fs from 'node:fs';
const [frontend,backend,digest]=process.argv.slice(2);
if(![frontend,backend].every(v=>/^[a-f0-9]{40}$/.test(v||''))||!/^sha256:[a-f0-9]{64}$/.test(digest||''))throw new Error('Usage: node scripts/release-manifest.mjs FRONTEND_SHA BACKEND_SHA OCI_MANIFEST_DIGEST');
process.stdout.write(JSON.stringify({frontend,backend,imageManifestDigest:digest,target:'linux/arm64',apiContract:2,nodeSchema:'005_provisioning_audit.sql',supplyChainSchema:'202610270002_PurchaseReceiving',productionDeployment:'not performed',generatedAt:new Date().toISOString()},null,2)+'\n');
