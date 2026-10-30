import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='production';
process.env.RENDER_EXTERNAL_HOSTNAME='rts-test.onrender.com';
const {server}=await import('../server.js');
test('Render: domínio configurado e HTTPS, sem confiar em cabeçalhos de proxy',{timeout:5000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const post=(host,origin)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/create',method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json','X-Forwarded-Proto':'https'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{"name":"Teste"}');});
 try{
  assert.equal(await post('rts-test.onrender.com','https://rts-test.onrender.com'),200);
  assert.equal(await post('rts-test.onrender.com','http://rts-test.onrender.com'),403);
  assert.equal(await post('other.onrender.com','https://other.onrender.com'),403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
