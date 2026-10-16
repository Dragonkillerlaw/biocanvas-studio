#!/usr/bin/env node
// JSON stdin -> JSON stdout. No network or hosted-model dependency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAgentAPI,revision} from '../dist/agent-api.js';
import {emptyScene,validateScene} from '../dist/core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
let scenePath;
if(args.length){if(args.length!==2||args[0]!=='--scene'){console.error('Usage: node scripts/agent-cli.mjs [--scene path.biocanvas] < request.json');process.exit(2);}scenePath=path.resolve(args[1]);}
try {
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>2_000_000)throw Error('Request exceeds 2 MB.');}
  let scene=scenePath&&fs.existsSync(scenePath)?validateScene(JSON.parse(fs.readFileSync(scenePath,'utf8'))):emptyScene();
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/catalog.json'),'utf8'));
  const api=createAgentAPI({read:()=>scene,catalog:()=>catalog,
    write:next=>{
      if(!scenePath)throw Error('Mutations require --scene path.biocanvas.');
      if(fs.existsSync(scenePath)&&revision(JSON.parse(fs.readFileSync(scenePath,'utf8')))!==revision(scene))throw Error('REVISION_CONFLICT: scene file changed.');
      const temp=scenePath+'.'+process.pid+'.tmp';
      try{fs.writeFileSync(temp,JSON.stringify(next,null,2),{flag:'wx'});fs.renameSync(temp,scenePath);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
      scene=next;
    },
    loadAssets:async s=>{
      if(s.customAssets?.length)throw Error('CLI supports bundled assets only. Use the browser API to sanitize and export custom SVG assets.');
      const normalized=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/normalized.json'),'utf8'));
      const map=new Map(catalog.map(a=>[a.id,{...a,...normalized[a.id]}]));
      for(const n of s.nodes)if(n.type==='asset'&&!map.get(n.assetId)?.inner)throw Error(`Missing normalized asset: ${n.assetId}`);
      return map;
    }});
  const response=await api.request(JSON.parse(input));
  console.log(JSON.stringify(response));if(!response.ok)process.exitCode=1;
}catch(error){console.log(JSON.stringify({ok:false,error:{code:'INVALID_REQUEST',message:error.message}}));process.exitCode=1;}
