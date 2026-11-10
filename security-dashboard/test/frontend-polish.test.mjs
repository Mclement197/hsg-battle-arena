import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterIncidents,severityDistribution,scanDistribution,coverageMeasurements} from '../public/app.js';

const incidents=[{id:'a',title:'one',severity:'critical',status:'open',source:'configuration',component:'runtime'},{id:'b',title:'two',severity:'medium',status:'accepted-risk',source:'configuration',component:'runtime'},{id:'c',title:'old',severity:'critical',status:'resolved',source:'history',component:'runtime'}];
const scans=[{category:'sast',source:'sast',status:'failed',findingCount:null},{category:'dependencies',source:'dependencies:game',status:'ok',findingCount:0},{category:'dependencies',source:'dependencies:usage',status:'unavailable',findingCount:null}];
test('active severity mapping excludes resolved but retains accepted risk; composed drilldown can reset',()=>{assert.deepEqual(severityDistribution(incidents),{critical:1,high:0,medium:1,low:0,info:0});assert.equal(filterIncidents(incidents,{severity:'critical',activeOnly:true}).length,1);assert.equal(filterIncidents(incidents,{severity:'critical'}).length,2);assert.equal(filterIncidents(incidents,{severity:'medium',activeOnly:true})[0].status,'accepted-risk');assert.equal(filterIncidents(incidents).length,3);});
test('scanner statuses count completed, failed, unavailable separately; no invented completion',()=>{const g=scanDistribution(scans);assert.deepEqual([g.get('sast').ok,g.get('sast').failed,g.get('sast').unavailable],[0,1,0]);assert.deepEqual([g.get('dependencies').ok,g.get('dependencies').failed,g.get('dependencies').unavailable],[1,0,1]);assert.equal(scanDistribution([]).size,0);});
test('coverage percentages preserve unknown, zero, and measured scope',()=>{assert.deepEqual(coverageMeasurements(null).map(x=>x.value),[null,null,null]);assert.deepEqual(coverageMeasurements({lines:0,branches:77.89,functions:101}).map(x=>x.value),[0,77.89,null]);});

class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.attributes={};this.value='';this.hidden=false;this.textContent='';this.nextElementSibling=null;this.open=false;this.focused=false;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k];}
 addEventListener(k,fn){this.listeners[k]=fn;}
 emit(k,event={}){this.listeners[k]?.(event);}
 focus(){this.focused=true;}
 scrollIntoView(){}
 querySelector(selector){if(selector==='summary')return this.children.find(n=>n.tagName==='summary');return null;}
}
function fixture(data){const nodes=new Map();const document={createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}};const get=id=>document.getElementById(id);get('score').nextElementSibling=new Node();get('score-breakdown').append(new Node('summary'));const fetch=async()=>({ok:true,json:async()=>data});return {document,get,fetch};}
const snapshot={scheduling:{enabled:false,message:'Authorization pending'},score:{value:0,confidence:0,freshness:'unknown',ageHours:null,rubric:{version:'1'},dimensions:{sast:{weight:25,value:null,contribution:0},coverage:{weight:5,value:0,contribution:0}}},run:null,incidents,scans,metrics:{coverage:{lines:0,branches:null,functions:75},tests:null},limits:[],scope:{sourceCoverage:'bounded',testScope:'security-dashboard/src only'}};
test('native button chart toggles filter with focus, reset, scanner drilldown and score disclosure',async()=>{const f=fixture(snapshot);globalThis.document=f.document;globalThis.fetch=f.fetch;try{await import('../public/app.js?ui-dom-fixture');await new Promise(resolve=>setImmediate(resolve));const get=f.get;assert.equal(get('dashboard').hidden,false);assert.equal(get('score').textContent,'—');assert.equal(get('coverage-chart').children[0].children[2].textContent,'0.00%');assert.equal(get('coverage-chart').children[1].children[2].textContent,'N/A');assert.equal(get('severity-chart').children.length,5);let critical=get('severity-chart').children[0];assert.equal(critical.getAttribute('aria-pressed'),'false');critical.emit('click');critical=get('severity-chart').children[0];assert.equal(critical.getAttribute('aria-pressed'),'true');assert.equal(critical.focused,true);assert.equal(get('severity').value,'critical');assert.match(get('result-count').textContent,/1 of 3.*active critical/);critical.emit('click');assert.equal(get('result-count').textContent,'3 of 3 reports');get('severity-chart').children[2].emit('click');get('filters').emit('reset');get('severity').value='';await new Promise(resolve=>queueMicrotask(resolve));assert.equal(get('severity-chart').children[2].getAttribute('aria-pressed'),'false');assert.equal(get('result-count').textContent,'3 of 3 reports');get('scan-chart').children[0].emit('click');assert.equal(get('scans').children[0].open,true);assert.equal(get('scans').children[0].children[0].focused,true);get('score-explain').emit('click');assert.equal(get('score-breakdown').open,true);assert.equal(get('score-explain').getAttribute('aria-expanded'),'true');assert.match(get('scheduling').textContent,/state unknown/);assert.equal(get('severity-data').children[0].tagName,'table');assert.equal(get('scan-data').children[0].tagName,'table');get('scan-chart').children[1].emit('click');assert.equal(get('scans').children[1].open,true);assert.equal(get('scans').children[2].open,true);globalThis.fetch=async()=>({ok:false});get('refresh').emit('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(get('error').hidden,false);assert.match(get('score-state').textContent,/Refresh failed/);}finally{delete globalThis.document;delete globalThis.fetch;}});
test('empty evidence stays explicitly unknown without a fabricated trend',async()=>{const f=fixture({...snapshot,incidents:[],scans:[],metrics:{coverage:null,tests:null}});globalThis.document=f.document;globalThis.fetch=f.fetch;try{await import('../public/app.js?ui-empty-fixture');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.get('severity-chart').children.length,5);assert.match(f.get('scans').children[0].textContent,/No scanner results/);assert.match(f.get('reports').children[0].textContent,/No reports recorded/);assert.equal(f.get('coverage-chart').children[0].children[2].textContent,'N/A');}finally{delete globalThis.document;delete globalThis.fetch;}});
test('public source has no fabricated trend or private-evidence route and scoped coverage label',async()=>{const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),js=await readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(html,/security-dashboard\/src/);assert.doesNotMatch(js,/innerHTML|private\/|historicalSeries/);assert.match(js,/security\/api\/summary/);assert.match(html,/aria-controls="score-breakdown"/);assert.doesNotMatch(html,/Run Scan|Resolve incident/);});

test('prominent coverage summary preserves scope, missing values and evidence state',async()=>{
 const {coverageSummary}=await import('../public/app.js');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<h2>Code coverage<\/h2>.*security-dashboard\/src<\/code>/);
 const base={scans:[{category:'coverage',status:'ok'}],metrics:{coverage:{lines:66.87,branches:83.15,functions:81.58}},score:{freshness:'fresh'},run:{status:'ok'}};
 assert.deepEqual(coverageSummary(base).values.map(x=>x.value),[66.87,83.15,81.58]);
 assert.deepEqual(coverageSummary({...base,metrics:{coverage:{lines:null,branches:0,functions:undefined}}}).values.map(x=>x.value),[null,0,null]);
 assert.match(coverageSummary({...base,score:{freshness:'stale'}}).state,/Stale/);
 assert.match(coverageSummary({...base,run:{status:'degraded'}}).state,/Partial scan/);
 assert.deepEqual(coverageSummary({...base,scans:[{category:'coverage',status:'failed'}]}).values.map(x=>x.value),[null,null,null]);
 assert.deepEqual(coverageSummary({...base,scans:[]}).values.map(x=>x.value),[null,null,null]);
 assert.deepEqual(coverageSummary({...base,score:{freshness:'expired'}}).values.map(x=>x.value),[null,null,null]);
});
test('unknown freshness does not present coverage as current',async()=>{
 const {coverageSummary}=await import('../public/app.js');
 const result=coverageSummary({scans:[{category:'coverage',status:'ok'}],metrics:{coverage:{lines:90}},score:{freshness:'unknown'}});
 assert.equal(result.values[0].value,null);
 assert.match(result.state,/unavailable/);
});
