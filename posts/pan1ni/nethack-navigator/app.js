// NetHack Navigator — browser inference of the human-pretrained world model.
// The model consumes a 9x9 player-centred tile crop (144x144 RGB) as 8 frames of
// history plus a goal frame, and emits 8 movement logits. Levels ship the REAL NLE
// crop for every reachable cell as a 9x9 grid of atlas-tile indices, so the browser
// just blits stored tiles — byte-identical to what the model trained on.

// action order MUST match nethack.CompassDirection / the eval: N,E,S,W,NE,SE,SW,NW
const DELTAS = [[-1,0],[0,1],[1,0],[0,-1],[-1,1],[1,1],[1,-1],[-1,-1]];
const TS = 16, CROP = 9, PX = 144, CTX = 8, PLANE = 3*PX*PX;

let atlasImg, atlasCols, session, level, goal, agent, trail = [], history = [], steps = 0;
let running = false, busy = false, cropCache = new Map();
const $ = id => document.getElementById(id);

// offscreen 144x144 for tile→pixel work
const off = document.createElement('canvas'); off.width = off.height = PX;
const octx = off.getContext('2d', {willReadFrequently:true});

function drawCrop(ctx, grid){
  for(let r=0;r<CROP;r++) for(let c=0;c<CROP;c++){
    const t = grid[r][c];
    ctx.drawImage(atlasImg, (t%atlasCols)*TS, Math.floor(t/atlasCols)*TS, TS, TS, c*TS, r*TS, TS, TS);
  }
}

// current-cell crop as CHW float32 [3,144,144] in 0..255 (model divides by 255 internally)
function cropCHW(key){
  if(cropCache.has(key)) return cropCache.get(key);
  const grid = level.cells[key];
  octx.clearRect(0,0,PX,PX); drawCrop(octx, grid);
  const d = octx.getImageData(0,0,PX,PX).data;
  const out = new Float32Array(PLANE);
  for(let p=0;p<PX*PX;p++){ out[p]=d[p*4]; out[PX*PX+p]=d[p*4+1]; out[2*PX*PX+p]=d[p*4+2]; }
  cropCache.set(key, out);
  return out;
}

function key(r,c){ return r+','+c; }
function cheb(a,b){ return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1])); }

// ---------- rendering ----------
function renderViews(){
  const av = $('agentView').getContext('2d'); av.clearRect(0,0,PX,PX);
  drawCrop(av, level.cells[key(agent[0],agent[1])]);
  const gv = $('goalView').getContext('2d'); gv.clearRect(0,0,PX,PX);
  drawCrop(gv, level.cells[key(goal.rc[0],goal.rc[1])]);
}

function renderMap(){
  const cvs=$('map'); if(!cvs) return;   // map removed from the arcade layout
  const keys = Object.keys(level.cells).map(k=>k.split(',').map(Number));
  let minr=99,maxr=-99,minc=99,maxc=-99;
  for(const [r,c] of keys){ minr=Math.min(minr,r);maxr=Math.max(maxr,r);minc=Math.min(minc,c);maxc=Math.max(maxc,c); }
  const W=cvs.width; const k=Math.max(3, Math.floor((W-20)/(maxc-minc+1)));
  cvs.height=(maxr-minr+1)*k+20;
  const ctx=cvs.getContext('2d'); ctx.fillStyle='#05070a'; ctx.fillRect(0,0,cvs.width,cvs.height);
  const X=c=>10+(c-minc)*k, Y=r=>10+(r-minr)*k;
  ctx.fillStyle='#39434f';
  for(const [r,c] of keys) ctx.fillRect(X(c),Y(r),k-1,k-1);
  ctx.fillStyle='#4a5566';
  for(const [r,c] of trail) ctx.fillRect(X(c),Y(r),k-1,k-1);
  const [sr,sc]=level.start; ctx.fillStyle='#79a8ff'; ctx.fillRect(X(sc),Y(sr),k-1,k-1);
  ctx.fillStyle='#f5d76e'; ctx.fillRect(X(goal.rc[1]),Y(goal.rc[0]),k-1,k-1);
  ctx.fillStyle='#70d6a5'; ctx.fillRect(X(agent[1]),Y(agent[0]),k-1,k-1);
}

function updateStats(v, cls){
  $('steps').textContent=steps;
  $('dist').textContent=cheb(agent,goal.rc);
  if(v){ const el=$('verdict'); el.textContent=v; el.className=cls; }
}

// ---------- inference ----------
async function step(){
  if(busy || !session) return; busy=true;
  const curCrop = cropCHW(key(agent[0],agent[1]));
  history.push(curCrop); if(history.length>CTX) history.shift();
  while(history.length<CTX) history.unshift(curCrop);
  const hist=new Float32Array(CTX*PLANE);
  for(let i=0;i<CTX;i++) hist.set(history[i], i*PLANE);
  const feeds={
    history_pixels:new ort.Tensor('float32',hist,[1,CTX,3,PX,PX]),
    goal_pixels:new ort.Tensor('float32',cropCHW(key(goal.rc[0],goal.rc[1])),[1,3,PX,PX]),
  };
  const out=await session.run(feeds);
  const logits=out.action_logits.data;
  // mask: only directions whose neighbour is a known cell
  const legal=DELTAS.map(([dr,dc])=>level.cells[key(agent[0]+dr,agent[1]+dc)]!==undefined);
  const masked=Array.from(logits,(v,i)=>legal[i]?v:-1e9);
  const mx=Math.max(...masked); const ex=masked.map(v=>Math.exp(v-mx));
  const sum=ex.reduce((a,b)=>a+b,0);
  let rnd=Math.random()*sum, a=0; for(;a<7;a++){ rnd-=ex[a]; if(rnd<=0) break; }
  const nr=agent[0]+DELTAS[a][0], nc=agent[1]+DELTAS[a][1];
  if(level.cells[key(nr,nc)]!==undefined){ agent=[nr,nc]; }
  trail.push([agent[0],agent[1]]); steps++;
  renderViews(); renderMap();
  busy=false;
  if(agent[0]===goal.rc[0]&&agent[1]===goal.rc[1]){ running=false; updateStats('reached ✓','ok'); return true; }
  if(steps>=goal.dist*14+60){ running=false; updateStats('gave up','fail'); return true; }
  updateStats(running?'navigating…':'paused', 'run');
  return false;
}

async function loop(){
  if(!running) return;
  const done=await step();
  if(done||!running) return;
  const d = 210-Number($('speed').value);
  if(d<=10){ loop(); return; }   // max speed: no artificial delay, run as fast as inference allows
  setTimeout(loop, d);
}

// ---------- setup ----------
function reset(){
  running=false; steps=0; trail=[]; history=[];
  agent=level.start.slice();
  updateStats('ready','run'); $('gdist').textContent=goal?goal.dist:'–';
  renderViews(); renderMap();
}

function selectGoal(g, cardEl){
  goal=g; document.querySelectorAll('.goalcard').forEach(e=>e.classList.remove('sel'));
  cardEl.classList.add('sel'); reset();
}

function buildGoals(){
  const grid=$('goalGrid'); grid.innerHTML='';
  level.goals.forEach((g,i)=>{
    const card=document.createElement('div'); card.className='goalcard';
    const cv=document.createElement('canvas'); cv.width=cv.height=PX;
    drawCrop(cv.getContext('2d'), level.cells[key(g.rc[0],g.rc[1])]);
    const cap=document.createElement('span'); cap.textContent='d'+g.dist;
    card.appendChild(cv); card.appendChild(cap);
    card.onclick=()=>selectGoal(g,card); grid.appendChild(card);
    if(i===0){ goal=g; card.classList.add('sel'); }
  });
}

async function loadLevel(file){
  level=await (await fetch('levels/'+file)).json();
  cropCache.clear(); buildGoals(); reset();
}

async function main(){
  const meta=await (await fetch('assets/atlas.json')).json(); atlasCols=meta.cols;
  atlasImg=new Image(); atlasImg.src='assets/atlas.png';
  await atlasImg.decode();

  // discover level files (level1.json, level2.json, …)
  const files=[];
  for(let i=1;i<=20;i++){ const r=await fetch('levels/level'+i+'.json',{method:'HEAD'}); if(!r.ok)break; files.push('level'+i+'.json'); }
  const sel=$('levelSel'); let defFile=files[0];
  for(const f of files){ const o=document.createElement('option'); o.value=f;
    const j=await (await fetch('levels/'+f)).json(); o.textContent=`Dungeon level ${j.dlvl} · ${Object.keys(j.cells).length} tiles`;
    if(j.dlvl===4) defFile=f;   // default the demo to Dungeon level 4
    sel.appendChild(o); }
  sel.onchange=()=>loadLevel(sel.value);
  sel.value=defFile;

  // Render the dungeon, goals and map immediately so the cabinet is populated
  // while (or even if) the model is still loading.
  await loadLevel(defFile);
  $('run').onclick=()=>{ if(running){running=false;$('run').textContent='▶ Run';return;}
    running=true; $('run').textContent='⏸ Pause'; loop().then(()=>$('run').textContent='▶ Run'); };
  $('step').onclick=()=>{ if(!running) step(); };
  $('reset').onclick=reset;

  // Absolute URL — a bare 'ort/' makes ORT's dynamic import() a bare module
  // specifier, which the browser can't resolve ("Failed to resolve module specifier").
  ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href;
  $('boot').textContent='loading model (48 MB, one-time)…';
  session=await ort.InferenceSession.create('model/policy.onnx',{executionProviders:['webgpu','wasm']});
  $('backend').textContent=(session.handler?.backendName)|| (navigator.gpu?'webgpu':'wasm');
  $('boot').textContent='ready — pick a goal and press Run.';
}
main().catch(e=>{ $('boot').textContent='error: '+e.message; console.error(e); });
