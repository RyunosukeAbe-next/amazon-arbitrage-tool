const http = require('http');
const port = 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Test server is working!\n'); // 正しいコード
});

server.listen(port, () => {
  console.log(`--- Plain HTTP Server is running on http://localhost:${port} ---`);
  console.log('--- この状態でプロセスが終了しなければ、expressライブラリに問題がある可能性が高いです。---');
  console.log('--- プロセスを終了するには Ctrl+C を押してください。---');
});

console.log('--- Plain server script finished. Waiting for connections... ---');
