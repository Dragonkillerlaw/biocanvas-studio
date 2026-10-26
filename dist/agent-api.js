// Shared, DOM-independent operation contract for browser and CLI clients.
import {clone, node, edge, validateScene, credits, exportSVG, exportDrawio} from './core.js';

export const MODULES = [
  ['basics','移液与基础操作'], ['genetics','细菌正向遗传学'],
  ['transcription','拟南芥转录调控'], ['transport','有机阴离子运输'],
  ['photosynthesis','光合作用 · Hill 反应'], ['movement','线虫运动与 GFP']
];
export const MODULES_EN = [
  ['basics','Pipetting & Basic Lab Skills'], ['genetics','Bacterial Forward Genetics'],
  ['transcription','Arabidopsis Transcriptional Regulation'], ['transport','Organic Anion Transport'],
  ['photosynthesis','Photosynthesis · Hill Reaction'], ['movement','C. elegans Motility & GFP']
];
export function revision(scene) {
  const text=JSON.stringify(scene); let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `v1-${(hash>>>0).toString(16)}-${text.length}`;
}
export function searchAssets(catalog,{query='',module='',license='',limit=50}={}) {
  if(typeof query!=='string'||typeof module!=='string'||typeof license!=='string'||!Number.isInteger(limit)||limit<1||limit>200) throw Error('Invalid search parameters (limit 1–200).');
  const words=query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches=catalog.filter(a=>(!module||a.modules?.includes(module))&&(!license||a.license===license)&&words.every(w=>[a.id,a.name,a.label,a.labelEn||'',a.category,...(a.keywords||[]),...(a.modules||[])].join(' ').toLowerCase().includes(w)));
  return {total:matches.length,items:matches.slice(0,limit).map(({id,name,label,labelEn,category,author,license,licenseUrl,source,src,modules,keywords,scopeNote})=>({id,name,label,labelEn:labelEn||name||label,category,author,license,licenseUrl,source,src,modules,keywords,scopeNote}))};
}
export function inspectScene(scene) {
  const warnings=[];
  for(const n of scene.nodes) {
    if(n.x<0||n.y<0||n.x+n.w>1000||n.y+n.h>650) warnings.push({id:n.id,code:'OUTSIDE_CANVAS'});
    if(n.label.split('\n').some(line=>[...line].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.56),0)*n.fontSize>n.w+30)) warnings.push({id:n.id,code:'POSSIBLE_TEXT_OVERFLOW'});
  }
  return warnings;
}
function onlyKeys(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw Error('Expected an object.');
  for(const key of Object.keys(value)) if(!allowed.includes(key)) throw Error(`Unsupported field: ${key}`);
}
const nodeFields=['type','id','x','y','w','h','label','color','fontSize','rotation','assetId'];
const edgeFields=['id','from','to','label','color'];
export function applyOperations(current,operations,catalog) {
  if(!Array.isArray(operations)||!operations.length||operations.length>200) throw Error('Provide 1–200 operations.');
  const s=clone(validateScene(current));
  for(const op of operations) {
    if(!op||typeof op!=='object') throw Error('Invalid operation.');
    switch(op.op) {
      case 'add_node': onlyKeys(op.node,nodeFields); s.nodes.push(node(op.node.type,op.node)); break;
      case 'connect': onlyKeys(op.edge,edgeFields); s.edges.push(edge(op.edge.from,op.edge.to,op.edge)); break;
      case 'update_node': {
        onlyKeys(op.changes,nodeFields.filter(k=>!['id','type'].includes(k)));
        const n=s.nodes.find(n=>n.id===op.id); if(!n) throw Error(`Unknown node: ${op.id}`);
        Object.assign(n,op.changes); break;
      }
      case 'update_edge': {
        onlyKeys(op.changes,edgeFields.filter(k=>k!=='id'));
        const e=s.edges.find(e=>e.id===op.id); if(!e) throw Error(`Unknown edge: ${op.id}`);
        Object.assign(e,op.changes); break;
      }
      case 'remove_node': {
        if(!s.nodes.some(n=>n.id===op.id)) throw Error(`Unknown node: ${op.id}`);
        s.nodes=s.nodes.filter(n=>n.id!==op.id); s.edges=s.edges.filter(e=>e.from!==op.id&&e.to!==op.id); break;
      }
      case 'remove_edge': {
        if(!s.edges.some(e=>e.id===op.id)) throw Error(`Unknown edge: ${op.id}`);
        s.edges=s.edges.filter(e=>e.id!==op.id); break;
      }
      case 'set_title': s.title=op.title; break;
      case 'layout': {
        if(!Array.isArray(op.ids)||!op.ids.length||new Set(op.ids).size!==op.ids.length) throw Error('Layout needs unique node IDs.');
        const cols=op.columns??Math.min(op.ids.length,4), x=op.x??65, y=op.y??150, gapX=op.gapX??220, gapY=op.gapY??200;
        if(!Number.isInteger(cols)||cols<1||cols>12||![x,y,gapX,gapY].every(Number.isFinite)) throw Error('Invalid layout parameters.');
        op.ids.forEach((id,i)=>{const n=s.nodes.find(n=>n.id===id);if(!n)throw Error(`Unknown node: ${id}`);n.x=x+(i%cols)*gapX;n.y=y+Math.floor(i/cols)*gapY;}); break;
      }
      default: throw Error(`Unknown operation: ${op.op}`);
    }
  }
  validateScene(s);
  const allowed=new Set([...catalog.map(a=>a.id),...(s.customAssets||[]).map(a=>a.id)]);
  for(const n of s.nodes) if(n.type==='asset'&&!allowed.has(n.assetId)) throw Error(`Unknown asset: ${n.assetId}`);
  return s;
}

export function createAgentAPI({read,write,catalog,loadAssets}) {
  const snapshot=()=>{const scene=clone(read());return {revision:revision(scene),scene,warnings:inspectScene(scene)};};
  const api={
    version:'1.0',
    capabilities:()=>({version:'1.0',methods:['search_assets','get_scene','apply_operations','export_scene'],operations:['add_node','update_node','remove_node','connect','update_edge','remove_edge','set_title','layout'],formats:['biocanvas','svg','drawio'],modules:MODULES,modulesEn:MODULES_EN}),
    search_assets:params=>searchAssets(catalog(),params),
    get_scene:snapshot,
    async apply_operations({baseRevision,operations}={}) {
      const before=read();
      if(typeof baseRevision!=='string'||baseRevision!==revision(before)) throw Error('REVISION_CONFLICT: read get_scene and retry against its revision.');
      const next=applyOperations(before,operations,catalog());
      await loadAssets(next);
      if(baseRevision!==revision(read())) throw Error('REVISION_CONFLICT: scene changed while loading assets.');
      write(next); return snapshot();
    },
    async export_scene({format='biocanvas'}={}) {
      if(!['biocanvas','svg','drawio'].includes(format)) throw Error('Unsupported export format.');
      const scene=clone(validateScene(read())), assets=await loadAssets(scene);
      const attributions=credits(scene,assets);
      const content=format==='biocanvas'?JSON.stringify({...scene,attributions},null,2):format==='svg'?exportSVG(scene,assets):exportDrawio(scene,assets);
      return {format,content,attributions,revision:revision(scene),warnings:inspectScene(scene)};
    },
    async request(request) {
      try {
        if(!request||!['capabilities','search_assets','get_scene','apply_operations','export_scene'].includes(request.method)) throw Error('Unknown method.');
        return {ok:true,result:await api[request.method](request.params)};
      } catch(error) {return {ok:false,error:{code:error.message.startsWith('REVISION_CONFLICT')?'REVISION_CONFLICT':'INVALID_REQUEST',message:error.message}};}
    }
  };
  return Object.freeze(api);
}
