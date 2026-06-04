const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const dir = __dirname;

const server = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  const filepath = path.join(dir, file);
  if (!filepath.startsWith(dir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!fs.existsSync(filepath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const content = fs.readFileSync(filepath, 'utf-8');
  const ext = path.extname(filepath);
  const ct = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'text/plain';
  res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
  res.end(content);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Preview server on http://127.0.0.1:' + PORT);
});
