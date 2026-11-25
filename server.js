// server.js — tiny zero-dependency static server for Railway (Railway gives it an https domain)
// The app is fully client-side: family data lives in each phone's browser, never on this server.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8',
};
// Only these folders/files are served (no server.js, package.json, .git, etc.)
const ALLOWED = /^\/(index\.html|sw\.js|manifest\.webmanifest|(css|js|vendor|icons)\/[\w.\-]+|schema\/(paribar-template\.csv|paribar-backup\.schema\.json))$/;

http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Bad request'); }
  if (url === '/') url = '/index.html';
  if (req.method === 'POST' && url === '/share-target') { res.writeHead(303, { Location: '/' }); return res.end(); }
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (!ALLOWED.test(url)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  const file = path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // the service worker and HTML must always be fresh so updates reach the phone
      'Cache-Control': /(sw\.js|index\.html)$/.test(file) ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(self), camera=(self)',
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Paribar on :${PORT}`));
