import { createServer } from 'node:http';

export function ipv6LoopbackAlias() {
  return {
    name:'wasit-loopback-alias',
    configureServer(server) {
      if(server.config.server.host!=='127.0.0.1'||!server.httpServer)return;
      const alias=createServer((req,res)=>server.httpServer.emit('request',req,res));
      alias.on('upgrade',(req,socket,head)=>server.httpServer.emit('upgrade',req,socket,head));
      alias.on('error',error=>{if(!['EADDRNOTAVAIL','EAFNOSUPPORT'].includes(error.code))server.config.logger.warn('The IPv6 loopback alias could not start. IPv4 remains available.');});
      server.httpServer.once('listening',()=>{
        const address=server.httpServer.address();
        if(address&&typeof address==='object')alias.listen({port:address.port,host:'::1',ipv6Only:true});
      });
      server.httpServer.once('close',()=>alias.close());
    },
  };
}
