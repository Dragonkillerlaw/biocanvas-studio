import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/agent-cli.mjs',import.meta.url));
test('CLI creates, edits, exports and refuses stale writes in a real file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'biocanvas-test-')),file=path.join(dir,'figure.biocanvas');
 const run=request=>{const p=spawnSync(process.execPath,[cli,'--scene',file],{input:JSON.stringify(request),encoding:'utf8'});return {status:p.status,...JSON.parse(p.stdout)};};
 try{
  const start=run({method:'get_scene'});assert.equal(start.ok,true);
  assert.equal(run({method:'search_assets',params:{query:'拟南芥'}}).result.total,2);
  const edited=run({method:'apply_operations',params:{baseRevision:start.result.revision,operations:[{op:'add_node',node:{id:'plant',type:'asset',assetId:'bioicons-ArabidopsisSeedlings'}}]}});assert.equal(edited.ok,true,JSON.stringify(edited));
  const svg=run({method:'export_scene',params:{format:'svg'}});assert.equal(svg.ok,true);assert.match(svg.result.content,/<path/);assert.match(svg.result.content,/James-Lloyd/);
  const before=fs.readFileSync(file,'utf8');const failed=run({method:'apply_operations',params:{baseRevision:start.result.revision,operations:[{op:'set_title',title:'stale'}]}});assert.equal(failed.status,1);assert.equal(failed.error.code,'REVISION_CONFLICT');assert.equal(fs.readFileSync(file,'utf8'),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
