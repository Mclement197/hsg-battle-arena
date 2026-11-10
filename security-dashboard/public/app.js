export function filterIncidents(items,{search='',severity='',status='',since='',until='',activeOnly=false}={}) {
 const query=search.trim().toLowerCase();
 return items.filter(i=>(!query||[i.title,i.component,i.source,i.id,i.status,i.severity].join(' ').toLowerCase().includes(query))&&(!severity||i.severity===severity)&&(!status||i.status===status)&&(!activeOnly||i.status!=='resolved')&&(!since||i.lastSeen?.slice(0,10)>=since)&&(!until||i.lastSeen?.slice(0,10)<=until)).sort((a,b)=>(b.lastSeen||'').localeCompare(a.lastSeen||''));
}
export function schedulingLabel(s={}) {
 if(s.status==='stale')return 'Recurring scan scheduler evidence stale · Current state unknown';
 if(s.status==='enabled'&&s.enabled===true)return 'Recurring scans enabled · '+(s.nextRunAt?date(s.nextRunAt):'Next run unknown');
 if(s.status==='disabled'&&s.enabled===false)return 'Recurring scans not enabled · Verified disabled';
 return 'Recurring scan scheduler state unknown · Verification unavailable';
}
export const severities=['critical','high','medium','low','info'];
export function severityDistribution(incidents){return Object.fromEntries(severities.map(level=>[level,incidents.filter(i=>i.status!=='resolved'&&i.severity===level).length]));}
export function scanDistribution(scans){const groups=new Map();for(const s of scans){if(!groups.has(s.category))groups.set(s.category,{ok:0,failed:0,unavailable:0,sources:[]});const g=groups.get(s.category);if(g[s.status]!==undefined)g[s.status]++;g.sources.push(s.source);}return groups;}
export function coverageMeasurements(coverage){return ['lines','branches','functions'].map(key=>({name:key,value:Number.isFinite(coverage?.[key])&&coverage[key]>=0&&coverage[key]<=100?coverage[key]:null}));}
export function coverageSummary(data){
 const source=data?.scans?.find(s=>s.category==='coverage');
 const state=source?.status==='failed'?'Coverage source failed':source?.status==='unavailable'?'Coverage source unavailable':!source?'Coverage source not measured':['expired','unknown'].includes(data?.score?.freshness)?'Evidence unavailable or expired':data?.score?.freshness==='stale'?'Stale evidence':data?.run?.status==='degraded'?'Partial scan · coverage source completed':'Latest coverage evidence';
 const values=source?.status==='ok'&&!['expired','unknown'].includes(data?.score?.freshness)?coverageMeasurements(data?.metrics?.coverage):coverageMeasurements(null);
 return {state,values};
}
const names={sast:'Static analysis',dependencies:'Dependency advisories',secrets:'Secrets detection',configuration:'Runtime configuration',coverage:'Line coverage quality',tests:'Test pass rate',monitoring:'Monitoring'};
const date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString():'Not measured';
const percent=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2)+'%':'N/A';
export function qualityMeasurements({coverage:c,tests:t}={}) {
 const coverageScope=' — security-dashboard/src ONLY',testScope=' — Security dashboard unit and HTTP tests ONLY';
 return [['Lines'+coverageScope,percent(c?.lines)],['Branches'+coverageScope,percent(c?.branches)],['Functions'+coverageScope,percent(c?.functions)],['Statements'+coverageScope,'N/A — unavailable'],['Tests passed'+testScope,typeof t?.passed==='number'&&typeof t?.failed==='number'?t.passed+' / '+(t.passed+t.failed):'N/A'],['Test pass rate'+testScope,percent(t?.passPercent)]];
}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const field=(dl,name,value)=>{dl.append(el('dt',name),el('dd',value??'N/A'));};
const svg=(tag,attributes={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
const track=(value,cls='chart-fill')=>{const bar=svg('svg',{viewBox:'0 0 100 10','aria-hidden':'true',focusable:'false',class:'chart-track'});bar.append(svg('rect',{x:0,y:0,width:100,height:10,class:'track-base'}),svg('rect',{x:0,y:0,width:Math.max(0,Math.min(100,value)),height:10,class:cls}));return bar;};
const dataTable=(headers,rows)=>{const table=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');for(const label of headers){const th=el('th',label);th.scope='col';tr.append(th);}head.append(tr);for(const values of rows){const row=el('tr');for(const value of values)row.append(el('td',value));body.append(row);}table.append(head,body);return table;};
if(typeof document!=='undefined') {
 const $=id=>document.getElementById(id);let snapshot,chartSeverity='',selectedCategory='';
 function charts(data){
  const counts=severityDistribution(data.incidents),maximum=Math.max(1,...Object.values(counts));$('severity-chart').replaceChildren();
  for(const level of severities){const button=el('button',undefined,'severity-choice');button.type='button';button.dataset.severity=level;button.setAttribute('aria-pressed',String(chartSeverity===level));button.setAttribute('aria-label',level+' severity: '+counts[level]+' active reports. '+(chartSeverity===level?'Remove filter':'Filter reports'));const label=el('strong');label.append(el('span',level),el('span',String(counts[level])));button.append(label,track(counts[level]/maximum*100));button.addEventListener('click',()=>{chartSeverity=chartSeverity===level?'':level;$('severity').value=chartSeverity;$('status').value='';reports();charts(data);[...$('severity-chart').children].find(node=>node.dataset.severity===level).focus();});$('severity-chart').append(button);}
  $('severity-data').replaceChildren(dataTable(['Severity','Active reports'],severities.map(level=>[level,String(counts[level])])));
  const groups=scanDistribution(data.scans);$('scan-chart').replaceChildren();const legend=el('div',undefined,'scan-legend');for(const status of ['ok','failed','unavailable'])legend.append(el('span',status==='ok'?'Completed':status,status));
  for(const [category,g] of groups){const total=g.sources.length,button=el('button',undefined,'scan-choice');button.type='button';button.setAttribute('aria-pressed',String(selectedCategory===category));button.setAttribute('aria-label',(names[category]||category)+': '+g.ok+' completed, '+g.failed+' failed, '+g.unavailable+' unavailable. Inspect source rows');const label=el('strong');label.append(el('span',names[category]||category),el('span',String(total)));const bar=svg('svg',{viewBox:'0 0 100 10','aria-hidden':'true',focusable:'false',class:'chart-track'});let offset=0;for(const status of ['ok','failed','unavailable'])if(g[status]){const width=g[status]/total*100;bar.append(svg('rect',{x:offset,y:0,width,height:10,class:'scan-segment '+status}));offset+=width;}button.append(label,bar);button.addEventListener('click',()=>{selectedCategory=category;for(const choice of $('scan-chart').children)if(choice.className==='scan-choice')choice.setAttribute('aria-pressed',String(choice===button));const rows=[...$('scans').children].filter(node=>node.dataset.category===category);for(const row of rows)row.open=true;if(rows.length){rows[0].querySelector('summary').focus();rows[0].scrollIntoView?.({block:'nearest'});}});$('scan-chart').append(button);}
  if(!groups.size)$('scan-chart').append(el('p','No source status measurements available.','subtle'));else $('scan-chart').append(legend);
  $('scan-data').replaceChildren(dataTable(['Category','Completed','Failed','Unavailable'],[...groups].map(([category,g])=>[names[category]||category,String(g.ok),String(g.failed),String(g.unavailable)])));
  const coverage=$('coverage-chart');coverage.replaceChildren();for(const {name,value} of coverageMeasurements(data.metrics.coverage)){const row=el('div',undefined,'coverage-row');row.append(el('span',name[0].toUpperCase()+name.slice(1)),track(value??0),el('strong',percent(value)));coverage.append(row);}
 }
 function reports(){
  const filters=Object.fromEntries(['search','severity','status','since','until'].map(k=>[k,$(k).value]));filters.activeOnly=!!chartSeverity;
  const rows=filterIncidents(snapshot.incidents,filters),container=$('reports');container.replaceChildren();
  $('result-count').textContent=rows.length+' of '+snapshot.incidents.length+' reports'+(chartSeverity?' · active '+chartSeverity+' selected':'');
  for(const i of rows){
   const details=el('details',undefined,'report'),summary=el('summary');
   summary.append(el('span',i.severity,'badge '+i.severity),el('strong',i.title),el('span',i.status==='accepted-risk'?'accepted risk':i.status,'status-label'),el('span',i.component,'component'));
   const body=el('div',undefined,'report-body'),dl=el('dl',undefined,'report-meta');
   body.append(el('p','Public evidence is intentionally limited. '+i.verification,'subtle'));
   for(const [key,value] of [['Report ID',i.id],['Source',i.source],['Confidence',i.confidence],['First seen',date(i.firstSeen)],['Last seen',date(i.lastSeen)],['Observations',i.observationCount],['Last run',i.lastRunId],['Advisory CVSS',i.cvss??'Not provided'],['Advisory CWE',(i.cwe||[]).join(', ')||'Not provided']])field(dl,key,value);
   body.append(dl,el('h3','Recommended next step'),el('p',i.remediation));
   if(i.history?.length){body.append(el('h3','Report timeline'));const history=el('ol');for(const h of i.history)history.append(el('li',date(h.at)+' · '+h.event));body.append(history);}
   details.append(summary,body);container.append(details);
  }
  if(!rows.length)container.append(el('p',snapshot.incidents.length?'No reports match these filters. Clear filters to see all reports.':'No reports recorded. This does not mean every source was measured.','empty'));
 }
 function render(data){
  snapshot=data;chartSeverity='';selectedCategory='';$('severity').value='';$('dashboard').hidden=false;$('loading').hidden=true;
  $('scheduling').textContent=schedulingLabel(data.scheduling);
  const score=data.score,unknown=score.freshness==='unknown'||score.freshness==='expired'||score.confidence===0;
  $('score').textContent=unknown?'—':score.value;$('score').nextElementSibling.hidden=unknown;
  $('score-state').textContent=unknown?'Assessment unavailable · '+score.freshness:score.freshness==='stale'?'Stale evidence · score discounted':'Latest evidence · '+score.freshness;
  $('scan-time').textContent='Last scan: '+date(data.run?.finishedAt)+' · '+(data.run?.status||'not run');
  const active=data.incidents.filter(i=>i.status!=='resolved');$('active-total').textContent=active.length;$('high-total').textContent=active.filter(i=>['critical','high'].includes(i.severity)).length;
  $('source-total').textContent=data.scans.filter(s=>s.status==='ok').length+' / '+data.scans.length;
  const coverage=coverageSummary(data);$('coverage-total').textContent=percent(coverage.values[0].value);$('coverage-branches').textContent=percent(coverage.values[1].value);$('coverage-functions').textContent=percent(coverage.values[2].value);$('coverage-state').textContent=coverage.state;
  $('confidence').textContent=score.confidence+'% of rubric weight measured'+(score.ageHours===null?'':' · '+score.ageHours+'h since last scan');$('nav-count').textContent='('+active.length+')';
  const scans=$('scans');scans.replaceChildren();for(const s of data.scans){const row=el('details',undefined,'check'),heading=el('summary');row.dataset.category=s.category;heading.append(el('strong',s.source),el('span',s.status,'check-status '+s.status),el('span',s.findingCount===null?'Unknown findings':s.findingCount+' findings','check-count'));const body=el('dl',undefined,'check-meta');for(const [k,v] of [['Category',names[s.category]||s.category],['Completed',date(s.completedAt)],['Duration',s.durationMs===null?'Unavailable':s.durationMs+' ms'],['Findings by severity',s.severityCounts?Object.entries(s.severityCounts).filter(([,n])=>n).map(([k,n])=>n+' '+k).join(', ')||'None observed':'Unavailable']])field(body,k,v);row.append(heading,body);scans.append(row);}if(!data.scans.length)scans.append(el('p','No scanner results available.','empty'));
  charts(data);const q=$('quality');q.replaceChildren();for(const [k,v] of qualityMeasurements(data.metrics))field(q,k,v);
  $('rubric').textContent=score.rubric.version;
  const table=el('table'),head=el('thead'),hr=el('tr');for(const label of ['Category','Weight','Measured value','Contribution']){const th=el('th',label);th.scope='col';hr.append(th);}head.append(hr);const tb=el('tbody');for(const [kind,d] of Object.entries(score.dimensions)){const row=el('tr');for(const value of [names[kind]||kind,d.weight+'%',d.value===null?'N/A':percent(d.value)])row.append(el('td',value));const cell=el('td');const meter=el('span',undefined,'score-meter'+(d.value===null?' missing':''));meter.append(el('span',d.contribution.toFixed(2)+' points'+(d.value===null?' · not measured':'')),track(d.weight?d.contribution/d.weight*100:0));cell.append(meter);row.append(cell);tb.append(row);}table.append(head,tb);$('dimensions').replaceChildren(table);
  $('limits').replaceChildren(...data.limits.map(x=>el('li',x)));$('scope-detail').textContent=data.scope.sourceCoverage+'. '+data.scope.testScope+'. '+data.scheduling.message;
  reports();
 }
 async function refresh(){
  $('refresh').disabled=true;$('error').hidden=true;if(!snapshot)$('loading').hidden=false;
  try{const r=await fetch('/security/api/summary',{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error();render(await r.json());}
  catch{$('loading').hidden=true;$('error').textContent='Security evidence could not be loaded. The previous view, if any, is not current. Try Refresh evidence; contact the operator if this persists.';$('error').hidden=false;if(snapshot){$('score-state').textContent='Refresh failed · evidence not current';$('coverage-state').textContent='Refresh failed · coverage evidence not current';}}
  finally{$('refresh').disabled=false;}
 }
 $('refresh').addEventListener('click',refresh);$('filters').addEventListener('input',()=>{if(snapshot){chartSeverity='';reports();charts(snapshot);}});$('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('reset',()=>queueMicrotask(()=>{chartSeverity='';if(snapshot){reports();charts(snapshot);}}));$('score-explain').addEventListener('click',()=>{const panel=$('score-breakdown');panel.open=!panel.open;$('score-explain').setAttribute('aria-expanded',String(panel.open));$('score-explain').textContent=panel.open?'Hide score breakdown':'Show score breakdown';if(panel.open){panel.scrollIntoView?.({block:'nearest'});panel.querySelector('summary').focus();}});$('score-breakdown').addEventListener('toggle',()=>{$('score-explain').setAttribute('aria-expanded',String($('score-breakdown').open));$('score-explain').textContent=$('score-breakdown').open?'Hide score breakdown':'Show score breakdown';});void refresh();
}
