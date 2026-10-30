import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {server} from '../server.js';
test('segurança: Host, Origin, corpo, sessão, comandos e frequência',{timeout:6000},async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const request=(path,data={},headers={})=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method:'POST',headers:{'Content-Type':'application/json',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});
  req.on('error',reject);req.end(JSON.stringify(data));
 });
 try{
  assert.equal((await request('/api/create',{}, {Host:'foreign.invalid',Origin:'http://foreign.invalid'})).status,403);
  assert.equal((await request('/api/create',{}, {Origin:'https://foreign.invalid','X-Forwarded-Proto':'https'})).status,403);
  assert.equal((await request('/api/create',{name:'x'.repeat(9000)})).status,413);
  assert.equal((await request('/api/create',{}, {'Content-Type':'text/plain'})).status,415);
  const a=(await request('/api/create',{name:'Teste'})).data;
  const headers={Authorization:'Bearer '+a.token};
  assert.equal((await request('/api/start?room='+a.code,{practice:true},headers)).status,200);
  assert.equal((await request('/api/command?room='+a.code,{type:'surrender'})).status,400);
  assert.equal((await request('/api/command?room='+a.code,{type:'unknown',ids:[]},headers)).status,400);
  assert.equal((await request('/api/command?room='+a.code,{type:'move',ids:Array(101).fill(1),x:50,y:50},headers)).status,400);
  assert.equal((await request('/api/command?room='+a.code,{type:'move',ids:[],x:-1,y:50},headers)).status,400);
  let rejected=false;for(let i=0;i<24;i++)if((await request('/api/command?room='+a.code,{type:'stop',ids:[]},headers)).status===429)rejected=true;
  assert.ok(rejected,'excesso de comandos precisa ser limitado');
  assert.equal(server.maxConnections,100);assert.equal(server.requestTimeout,10000);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
