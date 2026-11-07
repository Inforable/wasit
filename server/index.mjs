import { createServer } from 'node:http';
import { createRuntimeHandler } from './app.mjs';
const server = createServer(createRuntimeHandler());
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
}
server.on('error', () => { console.error('Wasit could not start its HTTP server.'); process.exitCode=1; });
server.listen(Number(process.env.PORT??3301), process.env.HOST??'127.0.0.1',()=>{
  console.log('Wasit is available at http://'+(process.env.HOST??'127.0.0.1')+':'+server.address().port);
});
process.once('SIGINT',stop);
process.once('SIGTERM',stop);
