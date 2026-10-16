import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/mcp-server.mjs',import.meta.url));
function client(workspace){
 const process=spawn(globalThis.process.execPath,[script,'--workspace',workspace],{stdio:['pipe','pipe','pipe']});
 let id=0,stderr='';const pending=new Map();
 process.stderr.on('data',chunk=>stderr+=chunk);
 createInterface({input:process.stdout}).on('line',line=>{const message=JSON.parse(line);pending.get(message.id)?.(message);pending.delete(message.id);});
 const closed=new Promise(resolve=>process.on('close',code=>resolve(code)));
 const request=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);process.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
 return {request,notify:(method)=>process.stdin.write(JSON.stringify({jsonrpc:'2.0',method})+'\n'),
  tool:async(name,args={})=>(await request('tools/call',{name:'biocanvas_'+name,arguments:args})).result,
  close:async()=>{process.stdin.end();assert.equal(await closed,0,stderr);},kill:()=>process.kill()};
}
async function initialize(c){const response=await c.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'integration-test',version:'1'}});assert.equal(response.result.protocolVersion,'2025-11-25');c.notify('notifications/initialized');}
const value=r=>{assert.equal(r.isError,false,JSON.stringify(r));return r.structuredContent;};

test('MCP stdio round trip: discover, search, create, edit, export, conflict, persistence', {timeout:20000},async t=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'biocanvas-mcp-'));let c=client(workspace);
 t.after(()=>{c.kill();fs.rmSync(workspace,{recursive:true,force:true});});
 assert.equal((await c.request('tools/list',{})).error.code,-32002);
 await initialize(c);
 assert.equal((await c.request('tools/list',{})).result.tools.length,6);
 const found=value(await c.tool('search_assets',{query:'拟南芥',module:'transcription'}));assert.ok(found.total>0);
 const asset=found.items[0];assert.ok(asset.license&&asset.author);
 const first=value(await c.tool('create_project',{project:'course-figure',title:'Course diagram'}));
 assert.equal((await c.tool('create_project',{project:'course-figure'})).isError,true);
 const edited=value(await c.tool('apply_operations',{project:'course-figure',baseRevision:first.revision,operations:[
  {op:'add_node',node:{id:'plant',type:'asset',assetId:asset.id,label:'拟南芥',x:100,y:180}},
  {op:'add_node',node:{id:'box',type:'box',label:'LUC',x:400,y:180}},
  {op:'connect',edge:{id:'edge',from:'plant',to:'box',label:'Expression'}}]}));
 assert.equal(edited.scene.nodes.length,2);
 const stale=await c.tool('apply_operations',{project:'course-figure',baseRevision:first.revision,operations:[{op:'set_title',title:'Stale'}]});
 assert.equal(stale.isError,true);assert.match(stale.content[0].text,/REVISION_CONFLICT/);
 const invalid=await c.tool('apply_operations',{project:'course-figure',baseRevision:edited.revision,operations:[{op:'set_title',title:'Should roll back'},{op:'connect',edge:{from:'plant',to:'absent'}}]});assert.equal(invalid.isError,true);
 for(const format of ['svg','drawio','biocanvas']){
  const output=value(await c.tool('export_scene',{project:'course-figure',format}));
  assert.ok(output.content.length>100);assert.equal(output.attributions.length,1);assert.equal(output.revision,edited.revision);
  if(format==='svg')assert.match(output.content,/<svg/);
 }
 assert.equal(value(await c.tool('list_projects')).projects[0].project,'course-figure');
 await c.close();c=client(workspace);await initialize(c);
 assert.equal(value(await c.tool('get_scene',{project:'course-figure'})).revision,edited.revision);
 await c.close();
});

test('MCP rejects traversal, unknown arguments, links and concurrent write locks', {timeout:20000},async t=>{
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'biocanvas-mcp-'));const c=client(workspace);
 t.after(()=>{c.kill();fs.rmSync(workspace,{recursive:true,force:true});});await initialize(c);
 for(const project of ['../outside','/tmp/out','C:\\out','con','bad.name',''])assert.equal((await c.tool('create_project',{project})).isError,true);
 assert.equal((await c.tool('create_project',{project:'good',command:'anything'})).isError,true);
 assert.equal((await c.tool('create_project',{project:'good',title:12})).isError,true);
 assert.equal((await c.tool('export_scene',{project:'good',format:'html'})).isError,true);
 const before=value(await c.tool('create_project',{project:'good'}));
 fs.linkSync(path.join(workspace,'good.biocanvas'),path.join(workspace,'linked.biocanvas'));
 assert.equal((await c.tool('get_scene',{project:'linked'})).isError,true);
 fs.unlinkSync(path.join(workspace,'linked.biocanvas'));
 fs.writeFileSync(path.join(workspace,'good.biocanvas.lock'),'other writer');
 assert.equal((await c.tool('apply_operations',{project:'good',baseRevision:before.revision,operations:[{op:'set_title',title:'Locked'}]})).isError,true);
 assert.equal(fs.readFileSync(path.join(workspace,'good.biocanvas.lock'),'utf8'),'other writer');
 assert.equal(value(await c.tool('get_scene',{project:'good'})).revision,before.revision);
 await c.close();
});
