// Illustrative mixtures, not a fitted relationship between complexity and loss.
const root = document.getElementById('epi-curve-demo');
if (root && !root.dataset.ready) {
  root.dataset.ready = 'true';
  const triangle = root.querySelector('[data-triangle]');
  const handle = root.querySelector('[data-handle]');
  const output = root.querySelector('output');
  let weights = [0.3, 0.45, 0.25]; // easy, rich, noise
  let dragging = false;
  const position = () => ({ x: 32*weights[0] + 120*weights[1] + 208*weights[2], y: 164 - 130*weights[1] });
  const decay = (t, tau) => (Math.exp(-t/tau) - Math.exp(-1/tau)) / (1 - Math.exp(-1/tau));
  function render() {
    const [easy, rich, noise] = weights;
    const p = position();
    handle.setAttribute('transform', `translate(${p.x} ${p.y})`);
    handle.setAttribute('aria-valuenow', Math.round(rich*100));
    handle.setAttribute('aria-valuetext', `${Math.round(easy*100)}% easy structure, ${Math.round(rich*100)}% rich structure, ${Math.round(noise*100)}% noise`);
    const baseline = 0.3*(easy+rich) + 3.6*noise;
    const loss = t => baseline + easy*0.8*decay(t, 0.045) + rich*2.8*decay(t, 0.35);
    const y = v => 164 - 35*v;
    const pts = Array.from({length:201}, (_,i) => [38+302*i/200, y(loss(i/200))]);
    const path = pts.map(([x,v],i) => `${i?'L':'M'}${x.toFixed(2)},${v.toFixed(2)}`).join(' ');
    root.querySelector('[data-curve]').setAttribute('d', path);
    root.querySelector('[data-area]').setAttribute('d', `${path} L38,${y(baseline)} Z`);
    const floor = root.querySelector('[data-floor]');
    floor.setAttribute('y1',y(baseline)); floor.setAttribute('y2',y(baseline));
    const label = root.querySelector('[data-floor-label]');
    label.setAttribute('y',y(baseline)-5); label.textContent=`Final loss ${baseline.toFixed(2)}`;
    // Exact integral of endpoint-corrected exponential over 100 learning steps.
    const area = tau => tau - 1/Math.expm1(1/tau);
    output.value = (100*(easy*0.8*area(0.045)+rich*2.8*area(0.35))).toFixed(1);
    root.querySelector('[data-explanation]').textContent = noise>0.8
      ? 'Mostly noise: loss stays high, with little learnable information.'
      : easy>0.7 ? 'Easy structure: a quick drop, a low floor, and a small area.'
      : rich>0.7 ? 'Rich structure: sustained learning produces a larger shaded area.'
      : noise>0.3 ? 'Structure mixed with noise: the loss falls, but a high floor remains. Only the improvement contributes to the area.'
      : 'More rich structure spreads learning over time; more noise raises the floor.';
  }
  function setPoint(x,y) {
    const rich = (164-y)/130;
    const noise = (x-32-88*rich)/176;
    const raw = [1-rich-noise,rich,noise].map(v=>Math.max(0,v));
    const total = raw.reduce((a,b)=>a+b,0);
    weights = raw.map(v=>v/total);
    render();
  }
  function move(e) {
    const p = new DOMPoint(e.clientX,e.clientY).matrixTransform(triangle.getScreenCTM().inverse());
    setPoint(p.x,p.y);
  }
  triangle.addEventListener('pointerdown',e=>{
    e.preventDefault(); dragging=true; handle.focus({preventScroll:true}); triangle.setPointerCapture(e.pointerId); move(e);
  });
  triangle.addEventListener('pointermove',e=>{if(dragging) move(e);});
  for (const event of ['pointerup','pointercancel','lostpointercapture']) triangle.addEventListener(event,()=>{dragging=false;});
  handle.addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
    e.preventDefault();
    if(e.key==='Home'){weights=[0.3,0.45,0.25]; render(); return;}
    const p=position(), step=e.shiftKey?12:4;
    setPoint(p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));
  });
  render();
}

(function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host || host.dataset.ready) return;
  host.dataset.ready = 'true';
  const preferredDark = window.matchMedia('(prefers-color-scheme: dark)');
  const theme = () => {
    const mode = document.documentElement.getAttribute('data-mode');
    return (mode === 'dark' || (mode !== 'light' && preferredDark.matches))
      ? 'github-dark' : 'github-light';
  };
  const syncTheme = () => {
    host.querySelector('iframe')?.contentWindow.postMessage(
      { type: 'set-theme', theme: theme() }, 'https://utteranc.es'
    );
  };
  const script = document.createElement('script');
  script.src = 'https://utteranc.es/client.js';
  script.async = true;
  script.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  script.setAttribute('issue-term', 'posts/epijepa/epijepa.html');
  script.setAttribute('label', 'comments');
  script.setAttribute('theme', theme());
  script.setAttribute('crossorigin', 'anonymous');
  host.addEventListener('load', syncTheme, true);
  host.appendChild(script);
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-mode']
  });
  preferredDark.addEventListener('change', syncTheme);
})();
