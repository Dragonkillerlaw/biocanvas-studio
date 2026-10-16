// Run against a fresh local test server. Pass the installed Playwright package path.
const {chromium}=require(process.argv[2]||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const out=process.argv[3]?path.resolve(process.argv[3]):path.join(root,'.qa');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');const file=path.resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
 try {res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(()=>window.bioCanvasAI.ready);
 assert.ok(requests.filter(u=>u.endsWith('.svg')).length<55,'startup should not eagerly fetch every SVG');
 // Normalize the vendored SVGs with the exact browser sanitizer for dependency-free CLI exports.
 const normalized=await page.evaluate(async()=>{
   const {sanitizeSVG}=await import('./svg-safety.js');const catalog=await (await fetch('./assets/catalog.json')).json();const result={};
   for(const a of catalog){const raw=await (await fetch(a.src)).text();result[a.id]=sanitizeSVG(raw,'asset-'+a.id.replace(/[^a-zA-Z0-9_-]/g,'_'));if(!/<(?:path|rect|circle|ellipse|line|polyline|polygon|text|use)\b/.test(result[a.id].inner))throw Error('Empty SVG: '+a.id);}
   const malicious=sanitizeSVG('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path onclick="alert(2)" d="M0 0L1 1"/><image href="https://example.org/x"/></svg>','test');
   if(/script|onclick|https:/.test(malicious.svg))throw Error('SVG sanitation failed');
   return result;
 });
 fs.writeFileSync(path.join(dist,'assets/normalized.json'),JSON.stringify(normalized));
 await page.selectOption('#course-module','transcription');
 await page.locator('#asset-search').fill('拟南芥');
 assert.equal(await page.locator('.asset-card').count(),2);
 await page.locator('[data-asset="bioicons-ArabidopsisSeedlings"]').click();
 await page.waitForFunction(()=>window.bioCanvasAI.get_scene().scene.nodes.some(n=>n.assetId==='bioicons-ArabidopsisSeedlings'));
 const result=await page.evaluate(async()=>{
  const api=window.bioCanvasAI, before=api.get_scene(),operations=[
   {op:'add_node',node:{id:'ai-worm',type:'asset',assetId:'bioicons-Celegans',label:'C. elegans',x:160,y:210,w:140,h:100}},
   {op:'add_node',node:{id:'ai-observe',type:'box',label:'观察表型',x:440,y:220,w:160,h:80}},
   {op:'connect',edge:{id:'ai-edge',from:'ai-worm',to:'ai-observe'}}];
  const batch=await api.request({method:'apply_operations',params:{baseRevision:before.revision,operations}});
  const stale=await api.request({method:'apply_operations',params:{baseRevision:before.revision,operations:[{op:'set_title',title:'Stale'}]}});
  const svg=await api.export_scene({format:'svg'}),drawio=await api.export_scene({format:'drawio'});
  return {batch,stale,svg,drawio};
 });
 assert.equal(result.batch.ok,true);assert.equal(result.stale.error.code,'REVISION_CONFLICT');
 assert.ok(result.svg.content.includes('C. elegans'));assert.ok(result.drawio.content.includes('source="ai-worm"'));
 await page.locator('#undo').click();
 assert.equal(await page.evaluate(()=>window.bioCanvasAI.get_scene().scene.nodes.some(n=>n.id==='ai-worm')),false);
 await page.locator('#redo').click();
 assert.equal(await page.evaluate(()=>window.bioCanvasAI.get_scene().scene.nodes.some(n=>n.id==='ai-worm')),true);
 await page.reload();await page.evaluate(()=>window.bioCanvasAI.ready);
 assert.equal(await page.evaluate(()=>window.bioCanvasAI.get_scene().scene.nodes.some(n=>n.id==='ai-worm')),true);
 // Clear the test canvas through real UI, then use the API for a clean course example.
 await page.locator('[data-panel="templates"]').click();await page.locator('[data-template="blank"]').click();
 await page.waitForFunction(()=>window.bioCanvasAI.get_scene().scene.nodes.length===0);
 const preview=await page.evaluate(async()=>{
  const api=window.bioCanvasAI;await api.apply_operations({baseRevision:api.get_scene().revision,operations:[
   {op:'set_title',title:'BIO 251 · 本学期实验模块'},
   {op:'add_node',node:{id:'title',type:'text',x:60,y:40,w:880,h:45,label:'BIO 251 · Fall 2026',fontSize:30}},
   ...[['bioicons-Bacteria_colonies','细菌遗传学'],['bioicons-ArabidopsisSeedlings','拟南芥转录调控'],['bioicons-carrier-protein-membrane-3','有机阴离子运输'],['bioicons-spectrophotometer','Hill 反应 · 吸光度'],['bioicons-Celegans','线虫运动与 GFP']].map(([assetId,label],i)=>({op:'add_node',node:{id:'m'+i,type:'asset',assetId,label,x:90+(i%3)*290,y:i<3?160:390,w:145,h:130,fontSize:16}}))
  ]});return api.export_scene({format:'svg'});
 });
 fs.writeFileSync(path.join(out,'course-preview.svg'),preview.content);
 await page.locator('[data-panel="assets"]').click();await page.screenshot({path:path.join(out,'course-preview.png'),fullPage:true});
 // SVG export must decode as a standalone image, not just a string.
 await page.evaluate(async svg=>{const img=new Image();img.src=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));await img.decode();URL.revokeObjectURL(img.src);},preview.content);
 assert.deepEqual(errors,[]);
 const catalog=JSON.parse(fs.readFileSync(path.join(dist,'assets/catalog.json'),'utf8'));
 await page.setContent('<html><meta charset="utf-8"><body style="font:15px Arial;background:white"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:18px">'+catalog.filter(a=>a.id.startsWith('bioicons-')).map(a=>'<div style="border:1px solid #ddd;padding:10px;text-align:center"><div style="height:140px">'+normalized[a.id].svg.replace('<svg ','<svg width="160" height="140" ')+'</div><p>'+a.label+'</p><small>'+a.author+' · '+a.license+'</small></div>').join('')+'</div></body></html>');
 await page.screenshot({path:path.join(out,'course-assets.png'),fullPage:true});
 console.log(JSON.stringify({ok:true,assets:Object.keys(normalized).length,checks:['lazy loading','all SVG sanitation','course search','UI add','atomic API edit','revision conflict','undo/redo','reload persistence','SVG decode','drawio export'],screenshot:path.join(out,'course-preview.png')}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
