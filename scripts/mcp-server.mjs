#!/usr/bin/env node
// Dependency-free MCP stdio server. Only the explicitly configured project
// directory is writable. There is no shell tool, network listener or model call.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAgentAPI,revision,searchAssets} from '../dist/agent-api.js';
import {emptyScene,validateScene} from '../dist/core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--workspace'){console.error('Usage: node scripts/mcp-server.mjs --workspace /absolute/path/to/projects');process.exit(2);}
fs.mkdirSync(path.resolve(args[1]),{recursive:true});
const workspace=fs.realpathSync(path.resolve(args[1]));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/catalog.json'),'utf8'));
const normalized=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/normalized.json'),'utf8'));
const assets=new Map(catalog.map(a=>[a.id,{...a,...normalized[a.id]}]));
const projectSchema={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$',description:'Project name within the configured workspace; no filename extension.'};
const string={type:'string'};
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const tools=[
 ['biocanvas_search_assets','Search bilingual course SVG assets and their author/license metadata.',schema({query:string,module:{type:'string',enum:['basics','genetics','transcription','transport','photosynthesis','movement']},license:string,limit:{type:'integer',minimum:1,maximum:200}}),true],
 ['biocanvas_list_projects','List local BioCanvas projects in the configured workspace.',schema({}),true],
 ['biocanvas_create_project','Create a new empty local project. Never overwrites an existing project.',schema({project:projectSchema,title:{type:'string',maxLength:300}},['project']),false],
 ['biocanvas_get_scene','Read a local project, revision and approximate layout warnings. Read before editing.',schema({project:projectSchema},['project']),true],
 ['biocanvas_apply_operations','Atomically edit a project. Use baseRevision from get_scene. Operations: add_node {node}; update_node {id,changes}; remove_node {id}; connect {edge}; update_edge {id,changes}; remove_edge {id}; set_title {title}; layout {ids,columns,x,y,gapX,gapY}. Nodes: asset/text/box with id,x,y,w,h,label,color,fontSize,rotation and assetId for assets. Edges: id,from,to,label,color.',schema({project:projectSchema,baseRevision:string,operations:{type:'array',minItems:1,maxItems:200,items:{type:'object',properties:{op:{type:'string',enum:['add_node','update_node','remove_node','connect','update_edge','remove_edge','set_title','layout']}},required:['op']}}},['project','baseRevision','operations']),false],
 ['biocanvas_export_scene','Return an editable SVG, drawio or biocanvas document and attribution. Does not write an export file. SVG content is also a preview. Only bundled SVG assets are supported.',schema({project:projectSchema,format:{type:'string',enum:['svg','drawio','biocanvas']}},['project','format']),true]
].map(([name,description,inputSchema,readOnlyHint])=>({name,description,inputSchema,annotations:{readOnlyHint,destructiveHint:name==='biocanvas_apply_operations',openWorldHint:false}}));

function filename(name){
 if(typeof name!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name))throw Error('Invalid project name.');
 const file=path.join(workspace,name+'.biocanvas');
 if(fs.existsSync(file)){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||path.dirname(fs.realpathSync(file))!==workspace)throw Error('Project must be a regular file inside the workspace.');if(stat.size>12_000_000)throw Error('Project exceeds 12 MB.');}
 return file;
}
function read(name){return validateScene(JSON.parse(fs.readFileSync(filename(name),'utf8')));}
function agent(name){
 let lastRead;
 return createAgentAPI({catalog:()=>catalog,read:()=>{lastRead=read(name);return lastRead;},
  write:next=>{
   const file=filename(name),lock=file+'.lock',temp=file+'.'+process.pid+'.tmp';let fd,tempCreated=false;
   try {
    fd=fs.openSync(lock,'wx');
    if(revision(read(name))!==revision(lastRead))throw Error('REVISION_CONFLICT: project changed.');
    const data=JSON.stringify(next,null,2);if(Buffer.byteLength(data)>12_000_000)throw Error('Project exceeds 12 MB.');
    const tempFd=fs.openSync(temp,'wx');tempCreated=true;
    try{fs.writeFileSync(tempFd,data);}finally{fs.closeSync(tempFd);}
    fs.renameSync(temp,file);
   }finally{if(tempCreated&&fs.existsSync(temp))fs.unlinkSync(temp);if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
  },loadAssets:async s=>{
   if(s.customAssets?.length)throw Error('MCP supports bundled assets only; export custom SVGs through the browser API.');
   for(const n of s.nodes)if(n.type==='asset'&&!assets.get(n.assetId)?.inner)throw Error('Missing asset: '+n.assetId);
   return assets;
  }});
}
async function call(name,input={}){
 const tool=tools.find(t=>t.name===name);if(!tool)throw Error('Unknown tool: '+name);
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('Arguments must be an object.');
 for(const key of Object.keys(input))if(!Object.hasOwn(tool.inputSchema.properties,key))throw Error('Unexpected argument: '+key);
 for(const key of tool.inputSchema.required)if(!Object.hasOwn(input,key))throw Error('Missing argument: '+key);
 for(const [key,value] of Object.entries(input)){
  const rule=tool.inputSchema.properties[key];
  if(rule.type==='string'&&typeof value!=='string'||rule.type==='integer'&&!Number.isInteger(value)||rule.type==='array'&&!Array.isArray(value))throw Error('Invalid argument type: '+key);
  if(rule.enum&&!rule.enum.includes(value))throw Error('Unsupported '+key);
  if(rule.maxLength&&value.length>rule.maxLength)throw Error('Argument too long: '+key);
 }
 if(name==='biocanvas_search_assets')return searchAssets(catalog,input);
 if(name==='biocanvas_list_projects')return {projects:fs.readdirSync(workspace).filter(n=>n.endsWith('.biocanvas')).flatMap(n=>{const project=n.slice(0,-10);try{const s=read(project);return [{project,title:s.title,revision:revision(s)}];}catch{return [];}})};
 if(name==='biocanvas_create_project'){
  const file=filename(input.project),scene=validateScene(emptyScene(input.title??input.project));
  fs.writeFileSync(file,JSON.stringify(scene,null,2),{flag:'wx'});
  return {project:input.project,...agent(input.project).get_scene()};
 }
 const api=agent(input.project);
 if(name==='biocanvas_get_scene')return api.get_scene();
 if(name==='biocanvas_apply_operations')return api.apply_operations(input);
 return api.export_scene(input);
}
let initialized=false;
const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
async function receive(line){
 let message;try{message=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
 if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});return;}
 if(!Object.hasOwn(message,'id'))return; // Notifications never produce responses.
 const id=message.id;if(typeof id!=='string'&&typeof id!=='number'){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request id'}});return;}
 let result;
 try{
  if(message.method==='initialize'){
   if(!message.params||typeof message.params.protocolVersion!=='string')throw Error('initialize requires protocolVersion');
   initialized=true;result={protocolVersion:versions.includes(message.params.protocolVersion)?message.params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:'biocanvas',version:'0.3.0'},instructions:'Work only in named local projects. Search assets, create/read a project, apply a batch using its revision, then export. Retain artwork attribution. Browser localStorage is not synchronized.'};
  }else if(message.method==='ping')result={};
  else if(!initialized){send({jsonrpc:'2.0',id,error:{code:-32002,message:'Initialize first'}});return;}
  else if(message.method==='tools/list')result={tools};
  else if(message.method==='tools/call'){
   try{const value=await call(message.params?.name,message.params?.arguments);result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false};}
   catch(error){result={content:[{type:'text',text:error.message}],isError:true};}
  }else{send({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});return;}
  send({jsonrpc:'2.0',id,result});
 }catch(error){send({jsonrpc:'2.0',id,error:{code:-32602,message:error.message}});}
}
// Bounded buffering with sequential dispatch keeps mutation order deterministic.
process.stdin.setEncoding('utf8');let pending='';
for await(const chunk of process.stdin){
 pending+=chunk;let index;
 while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(Buffer.byteLength(line)>2_000_000){console.error('MCP message exceeds 2 MB');process.exit(1);}if(line.trim())await receive(line);}
 if(Buffer.byteLength(pending)>2_000_000){console.error('MCP message exceeds 2 MB');process.exit(1);}
}
if(pending.trim())await receive(pending);
