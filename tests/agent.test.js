import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyScene,node} from '../dist/core.js';
import {createAgentAPI,applyOperations,revision,searchAssets} from '../dist/agent-api.js';
const catalog=[{id:'plant',name:'Arabidopsis',label:'拟南芥幼苗',modules:['transcription'],keywords:['LUC'],license:'cc-0'}];
test('course and bilingual searches return metadata without SVG payloads',()=>{
 assert.equal(searchAssets(catalog,{query:'拟南芥',module:'transcription'}).total,1);
 assert.equal(searchAssets(catalog,{query:'luc'}).total,1);
 assert.equal(searchAssets(catalog,{module:'genetics'}).total,0);
});
test('a failed batch leaves the original scene untouched',()=>{
 const s=emptyScene(),before=JSON.stringify(s);
 assert.throws(()=>applyOperations(s,[{op:'add_node',node:{type:'asset',id:'n',assetId:'plant'}},{op:'connect',edge:{from:'n',to:'missing'}}],catalog));
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>applyOperations(s,[{op:'add_node',node:{type:'asset',assetId:'missing'}}],catalog));
});
test('operations preserve stable IDs, remove dangling edges, and reject unsafe fields',()=>{
 let s=applyOperations(emptyScene(),[{op:'add_node',node:{type:'box',id:'a'}},{op:'add_node',node:{type:'box',id:'b'}},{op:'connect',edge:{id:'e',from:'a',to:'b'}},{op:'layout',ids:['a','b'],columns:2,x:10,y:20,gapX:300}],catalog);
 assert.equal(s.nodes[1].x,310);
 s=applyOperations(s,[{op:'remove_node',id:'a'}],catalog);assert.equal(s.edges.length,0);
 assert.throws(()=>applyOperations(s,[{op:'update_node',id:'b',changes:{id:'bad'}}],catalog));
 assert.throws(()=>applyOperations(s,[{op:'update_node',id:'b',changes:{color:'url(https://bad)'}}],catalog));
});
test('API rejects stale revisions and serializes failed requests',async()=>{
 let s=emptyScene();let writes=0;
 const api=createAgentAPI({read:()=>s,write:n=>{s=n;writes++;},catalog:()=>catalog,loadAssets:async()=>new Map()});
 const rev=api.get_scene().revision;
 assert.equal((await api.request({method:'apply_operations',params:{baseRevision:rev,operations:[{op:'set_title',title:'Changed'}]}})).ok,true);
 const failed=await api.request({method:'apply_operations',params:{baseRevision:rev,operations:[{op:'set_title',title:'Lost update'}]}});
 assert.equal(failed.error.code,'REVISION_CONFLICT');assert.equal(writes,1);
 assert.equal((await api.request({method:'__proto__'})).ok,false);
});
test('API detects edits made during asynchronous asset loading',async()=>{
 let s=emptyScene();let wrote=false;
 const api=createAgentAPI({read:()=>s,write:()=>{wrote=true;},catalog:()=>catalog,loadAssets:async()=>{s.title='Manual edit';return new Map();}});
 await assert.rejects(api.apply_operations({baseRevision:revision(s),operations:[{op:'set_title',title:'AI edit'}]}),/REVISION_CONFLICT/);
 assert.equal(wrote,false);
});
test('export uses one snapshot and includes attribution',async()=>{
 const s=emptyScene();s.nodes.push(node('asset',{assetId:'plant'}));
 const api=createAgentAPI({read:()=>s,write:()=>{},catalog:()=>catalog,loadAssets:async()=>new Map([['plant',{...catalog[0],author:'Artist',viewBox:'0 0 10 10',inner:'<circle r="3"/>'}]])});
 const result=await api.export_scene({format:'svg'});assert.match(result.content,/<circle/);assert.match(result.content,/Artist/);assert.equal(result.attributions.length,1);
});
