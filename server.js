import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {room,addPlayer,start,command,step,snapshot} from './game.js';
const rooms=new Map(),streams=new Map(),limits=new Map(),connections=new Map();
// Hosts explícitos impedem que um domínio externo seja usado para acessar o servidor local.
const publicHosts=new Set([process.env.RENDER_EXTERNAL_HOSTNAME,...(process.env.ALLOWED_HOSTS||'').split(',')].filter(Boolean).map(h=>h.trim().toLowerCase()));
function allowedHost(host){
 if(typeof host!=='string'||host.length>255||!/^([a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/i.test(host))return false;
 const parsed=new URL('http://'+host);return ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||publicHosts.has(host.toLowerCase())||publicHosts.has(parsed.hostname);
}
function allowedOrigin(origin,host){
 try{const u=new URL(origin);return u.origin===origin&&u.host.toLowerCase()===host.toLowerCase()&&(u.protocol==='https:'||(u.protocol==='http:'&&process.env.NODE_ENV!=='production'));}catch{return false;}
}
function fail(status,message){const error=Error(message);error.status=status;throw error;}

const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function rate(key,max,window=1000){const now=Date.now();let b=limits.get(key);if(!b||now-b.t>window){b={t:now,n:0};limits.set(key,b);}if(++b.n>max)fail(429,'Muitas solicitações. Aguarde um instante.');}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'Envie JSON.');
 if(Number(req.headers['content-length'])>8192)fail(413,'Solicitação muito grande.');
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>8192)fail(413,'Solicitação muito grande.');chunks.push(c);}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Solicitação inválida.');return data;
}

function auth(req,url){const r=rooms.get(url.searchParams.get('room'));const token=(req.headers.authorization||'').replace(/^Bearer /,'');const p=r?.players.find(p=>p.token===token);if(!p)throw Error('Sessão inválida. Entre novamente na sala.');r.touched=Date.now();return [r,p];}
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
 try{
  const host=req.headers.host;
  if(!allowedHost(host))return json(res,403,{error:'Endereço não autorizado.'});
  if(req.headers.origin&&!allowedOrigin(req.headers.origin,host))return json(res,403,{error:'Origem não permitida.'});
  const ip=req.socket.remoteAddress;rate(`requests:${ip}`,180);
  const url=new URL(req.url,'http://localhost');
  if(process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
  if(req.method==='POST'){
   if(!['/api/create','/api/join','/api/start','/api/command'].includes(url.pathname))return json(res,404,{error:'Não encontrado.'});
   // Limitar antes de ler o corpo reduz o custo de pedidos não autenticados.
   let session;
   if(url.pathname==='/api/create')rate(`create:${ip}`,6,60000);
   else if(url.pathname==='/api/join')rate(`join:${ip}`,30,60000);
   else{session=auth(req,url);rate(session[1].id,20);}
   const a=await body(req);
   if(url.pathname==='/api/create'){if(rooms.size>=30||[...rooms.values()].filter(r=>r.creator===ip).length>=3)throw Error('Servidor cheio. Tente mais tarde.');const r=room();r.creator=ip;rooms.set(r.code,r);const p=addPlayer(r,a.name);broadcast(r);return json(res,200,{code:r.code,token:p.token,id:p.id});}
   if(url.pathname==='/api/join'){const r=rooms.get(String(a.code).trim().toLowerCase());if(!r)throw Error('Sala não encontrada. Confira o convite.');const p=addPlayer(r,a.name);broadcast(r);return json(res,200,{code:r.code,token:p.token,id:p.id});}
   const [r,p]=session;
   if(url.pathname==='/api/start')start(r,p,a.practice===true);
   else if(url.pathname==='/api/command')command(r,p,a);
   else return json(res,404,{error:'Não encontrado.'});
   if(url.pathname==='/api/start'||a.type==='surrender')broadcast(r);return json(res,200,{ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/api/events'){
   rate(`events:${ip}`,12,10000);const [r,p]=auth(req,url);rate(`events-player:${p.id}`,4,10000);const old=streams.get(p.id);if(old)old.end();
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(snapshot(r))}\n\n`);streams.set(p.id,res);
   req.on('close',()=>{if(streams.get(p.id)===res)streams.delete(p.id);});return;
  }
  const files={'/':'index.html','/client.js':'client.js','/style.css':'style.css'};const file=files[url.pathname];
  if(req.method!=='GET'||!file)return json(res,404,{error:'Não encontrado.'});
  const data=await readFile(new URL(`./public/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(data);
 }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message});else res.end();}
});
function broadcast(r){const msg=`data: ${JSON.stringify(snapshot(r))}\n\n`;for(const p of r.players){const s=streams.get(p.id);if(s&&!s.destroyed){if(s.writableLength>1024*1024)s.destroy();else s.write(msg);}}}
server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=200;server.maxConnections=100;
server.on('connection',socket=>{const ip=socket.remoteAddress,n=connections.get(ip)||0;if(n>=24){socket.destroy();return;}connections.set(ip,n+1);socket.on('close',()=>{const left=(connections.get(ip)||1)-1;if(left)connections.set(ip,left);else connections.delete(ip);});});
const timer=setInterval(()=>{for(const r of rooms.values()){const active=r.phase==='playing';step(r);if(active)broadcast(r);}},100);timer.unref();
const heartbeat=setInterval(()=>{for(const s of streams.values())if(!s.destroyed)s.write(': ping\n\n');},15000);heartbeat.unref();
const cleanup=setInterval(()=>{const now=Date.now();for(const [key,b]of limits)if(now-b.t>60000)limits.delete(key);for(const [code,r]of rooms){const connected=r.players.some(p=>streams.has(p.id));if(connected)r.touched=now;if(now-r.touched>30*60000||now-r.created>6*60*60000){for(const p of r.players){streams.get(p.id)?.end();streams.delete(p.id);}rooms.delete(code);}}},60000);cleanup.unref();
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`Arte da Guerra: http://localhost:${server.address().port}`));


