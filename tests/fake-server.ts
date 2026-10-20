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
    'otpauth://totp/GitHub:tadas?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&codeDisplay=%7B%22pinned%22%3Atrue%2C%22tags%22%3A%5B%22Dev%22%5D%7D',
    'otpauth://totp/Google:personal%40gmail.com?secret=JBSWY3DPEHPK3PXQ&issuer=Google&codeDisplay=%7B%22tags%22%3A%5B%22Personal%22%5D%7D',
    'otpauth://totp/Discord:duck%230001?secret=JBSWY3DPEHPK3PXR&issuer=Discord&codeDisplay=%7B%22tags%22%3A%5B%22Personal%22%5D%7D',
    'otpauth://steam/Steam:gaben?secret=JBSWY3DPEHPK3PXS&issuer=Steam&codeDisplay=%7B%22tags%22%3A%5B%22Personal%22%5D%7D',
    'otpauth://totp/Acme%20Corp:admin%40acme.test?secret=JBSWY3DPEHPK3PXT&issuer=Acme%20Corp&digits=8&period=60&codeDisplay=%7B%22tags%22%3A%5B%22Work%22%5D%2C%22note%22%3A%22Backup%20codes%20are%20in%20the%20safe%22%7D',
    'otpauth://totp/Proton:duck%40proton.me?secret=JBSWY3DPEHPK3PXU&issuer=Proton',
    'otpauth://totp/Cloudflare:ops%40acme.test?secret=JBSWY3DPEHPK3PXV&issuer=Cloudflare&codeDisplay=%7B%22tags%22%3A%5B%22Work%22%2C%22Dev%22%5D%7D',
    'otpauth://totp/KTU:viljan9?secret=JBSWY3DPEHPK3PXW&issuer=KTU',
    'otpauth://totp/Microsoft:alex%40outlook.com?secret=JBSWY3DPEHPK3PXX&issuer=Microsoft',
    'otpauth://totp/Bitwarden:alex%40example.com?secret=JBSWY3DPEHPK3PXY&issuer=Bitwarden',
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
