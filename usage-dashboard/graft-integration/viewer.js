// Public Graft wiring viewer. No dynamic HTML or inline styles; safe under dashboard CSP.
const svgNS = 'http://www.w3.org/2000/svg';
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const svg = (tag, attrs = {}) => { const el = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); return el; };

export async function mountGraftGraph(host, url = '/usage/graft/graph.json') {
  host.replaceChildren(node('p', 'graft-status', 'Loading code graph…'));
  let graph;
  try {
    const response = await fetch(url, {cache:'no-store', credentials:'omit', redirect:'error'});
    if (!response.ok) throw new Error('Graph unavailable');
    graph = await response.json();
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Invalid graph');
  } catch {
    const retry = node('button', 'button button-secondary', 'Try again'); retry.type = 'button';
    retry.addEventListener('click', () => mountGraftGraph(host, url));
    host.replaceChildren(node('p', 'graft-status', 'The code graph could not be loaded.'), retry);
    return;
  }
  const files = graph.nodes.filter(item => item.kind === 'file');
  const fileByPath = new Map(files.map(item => [item.path, item.id]));
  const byId = new Map(graph.nodes.map(item => [item.id, item]));
  const pathOf = id => byId.get(id)?.path;
  const links = new Map();
  for (const edge of graph.edges) {
    if (edge.relation === 'contains') continue;
    const source = fileByPath.get(pathOf(edge.source)), target = fileByPath.get(pathOf(edge.target));
    if (!source || !target || source === target) continue;
    const key = source + '→' + target;
    links.set(key, {source, target, count:(links.get(key)?.count || 0) + 1});
  }
  const wrap = node('div', 'graft-view');
  const intro = node('p', 'graft-caption', graph.meta.scope + ' · ' + files.length + ' files · ' + graph.meta.nodeCount + ' nodes · ' + graph.meta.edgeCount + ' internal links');
  const controls = node('div', 'graft-controls');
  const label = node('label', '', 'Find a file or symbol');
  const input = node('input'); input.type='search'; input.placeholder='Search graph'; input.setAttribute('aria-label','Find a file or symbol');
  label.append(input); controls.append(label);
  const board = node('div', 'graft-board');
  const diagram = svg('svg', {viewBox:'0 0 900 540',role:'img','aria-label':'File dependency graph; use the file list to select a node'});
  const list = node('div', 'graft-files'); list.setAttribute('aria-label','Graph files');
  const detail = node('div', 'graft-detail'); detail.setAttribute('aria-live','polite');
  board.append(diagram,list); wrap.append(intro,controls,board,detail); host.replaceChildren(wrap);
  const positions = new Map(files.map((item, index) => [item.id, {x:450 + 350*Math.cos(2*Math.PI*index/files.length),y:270 + 205*Math.sin(2*Math.PI*index/files.length)}]));
  const selected = {id:null};
  function draw() {
    diagram.replaceChildren(); list.replaceChildren();
    const query = input.value.trim().toLowerCase();
    const matches = new Set(graph.nodes.filter(item => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)).map(item => item.path));
    const shown = files.filter(item => !query || matches.has(item.path));
    const edges = [...links.values()].filter(item => shown.some(file => file.id === item.source) && shown.some(file => file.id === item.target));
    for (const edge of edges) {
      const a=positions.get(edge.source), b=positions.get(edge.target);
      const line=svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'graft-edge' + (selected.id && selected.id !== edge.source && selected.id !== edge.target ? ' is-muted' : '')});
      const title=svg('title'); title.textContent=edge.count + ' extracted or inferred code dependencies'; line.append(title); diagram.append(line);
    }
    for (const item of shown) {
      const point=positions.get(item.id);
      const circle=svg('circle',{cx:point.x,cy:point.y,r:selected.id===item.id?14:10,class:'graft-node' + (selected.id===item.id?' is-selected':'')});
      const title=svg('title'); title.textContent=item.path; circle.append(title); diagram.append(circle);
      const button=node('button','graft-file' + (selected.id===item.id?' is-selected':''),item.path.replace('usage-dashboard/',''));
      button.type='button'; button.setAttribute('aria-pressed',selected.id===item.id?'true':'false'); button.addEventListener('click',()=>select(item.id)); list.append(button);
    }
    if (!shown.length) list.append(node('p','graft-status','No matching files or symbols.'));
  }
  function select(id) {
    selected.id=id; draw(); detail.replaceChildren();
    const file=byId.get(id); if (!file) return;
    detail.append(node('h3','',file.path.replace('usage-dashboard/','')));
    const symbols=graph.nodes.filter(item => item.path===file.path && item.kind!=='file');
    detail.append(node('p','graft-caption',symbols.length + ' symbols · ' + [...links.values()].filter(edge=>edge.source===id || edge.target===id).length + ' connected files'));
    const items=node('ul','graft-symbols');
    for (const item of symbols) { const li=node('li','',item.name + ' · ' + item.kind + ' · ' + item.span); items.append(li); }
    detail.append(items);
  }
  input.addEventListener('input',draw);
  draw();
}
