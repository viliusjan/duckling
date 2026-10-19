// Serves the fake Ente API over HTTP for manual UI testing without a real account.
// Run: npm run fake-server, then log in with server http://localhost:8787,
// email test@example.com, password hunter2-but-longer, 2FA code 123456.
import { createServer } from 'node:http';
import sodium from 'libsodium-wrappers-sumo';
import { FakeEnte } from './fake-ente.ts';
await sodium.ready;
const t0 = Date.now();
const fake = new FakeEnte({
  totp: true,
  opsLimit: 4, memLimit: 1024 * 1024 * 1024, // Ente "sensitive" params, as real accounts use
  uris: [
    'otpauth://totp/GitHub:tadas?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
    'otpauth://totp/Google:personal?secret=JBSWY3DPEHPK3PXQ&issuer=Google',
    'otpauth://totp/Discord?secret=JBSWY3DPEHPK3PXR&issuer=Discord',
    'otpauth://steam/Steam:gaben?secret=JBSWY3DPEHPK3PXS&issuer=Steam',
    'otpauth://totp/Acme%20Corp:admin@acme.test?secret=JBSWY3DPEHPK3PXT&issuer=Acme%20Corp&digits=8&period=60&codeDisplay=%7B%22pinned%22%3Atrue%7D',
  ],
});
console.log(`keys generated in ${Date.now() - t0} ms`);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Client-Package', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const r = await fake.fetch(`http://localhost:8787${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: body || undefined });
  res.writeHead(r.status, { ...cors, 'Content-Type': 'application/json' });
  res.end(await r.text());
  console.log(req.method, req.url?.split('?')[0], r.status);
}).listen(8787, () => console.log('fake ente on :8787'));
