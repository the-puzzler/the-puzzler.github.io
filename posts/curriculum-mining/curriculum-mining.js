const SIZE = 8;
const EMPTY = 0;
const BLACK = 1;
const WHITE = -1;
const DIRECTIONS = [-1, 0, 1].flatMap(dr => [-1, 0, 1].map(dc => [dr, dc]))
  .filter(([dr, dc]) => dr || dc);

const boardEl = document.getElementById('othello-board');
const statusEl = document.getElementById('game-status');
const modelStatusEl = document.getElementById('model-status');
const blackScoreEl = document.getElementById('black-score');
const whiteScoreEl = document.getElementById('white-score');
const depthInput = document.getElementById('reset-depth');
const depthOutput = document.getElementById('depth-output');
const noteEl = document.getElementById('position-note');
const mineButton = document.getElementById('mine-position');
const newButton = document.getElementById('new-game');

let board = initialBoard();
let turn = BLACK;
let resetPly = 0;
let thinking = false;
let gameToken = 0;
let modelReady = false;
let modelFailed = false;

const ORT_BASE = new URL(
  'posts/curriculum-mining/assets/ort/',
  document.baseURI,
).toString();
const MODEL_URL = new URL(
  'posts/curriculum-mining/assets/othello-aznet.onnx?v=20260726c',
  document.baseURI,
).toString();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (globalThis.ort) resolve();
      else existing.addEventListener('load', resolve, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadModel() {
  await loadScript(`${ORT_BASE}ort.wasm.min.js?v=20260726c`);
  globalThis.ort.env.wasm.wasmPaths = ORT_BASE;
  globalThis.ort.env.wasm.numThreads = 1;
  globalThis.ort.env.wasm.proxy = false;
  const session = await globalThis.ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'basic',
  });
  modelReady = true;
  modelStatusEl.textContent = 'Othello AZNet loaded · 1.83M parameters · no search';
  if (!thinking && turn === BLACK) {
    statusEl.textContent = 'Your move. Choose a marked cell.';
    render();
  }
  return session;
}

const modelSessionPromise = loadModel().catch((error) => {
  const errorMessage = error?.message || error?.stack || String(error);
  console.error(
    'Could not load Othello checkpoint',
    errorMessage,
  );
  modelFailed = true;
  thinking = false;
  statusEl.textContent = 'The trained policy could not be loaded.';
  modelStatusEl.textContent = `Model load failed: ${errorMessage.slice(0, 180)}`;
  render();
  return null;
});

function initialBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  b[3][3] = WHITE; b[3][4] = BLACK;
  b[4][3] = BLACK; b[4][4] = WHITE;
  return b;
}

function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function cloneBoard(b) { return b.map(row => row.slice()); }

function flipsFor(b, r, c, player) {
  if (!inside(r, c) || b[r][c] !== EMPTY) return [];
  const flips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const ray = [];
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc) && b[rr][cc] === -player) {
      ray.push([rr, cc]);
      rr += dr; cc += dc;
    }
    if (ray.length && inside(rr, cc) && b[rr][cc] === player) flips.push(...ray);
  }
  return flips;
}

function legalMoves(b, player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = flipsFor(b, r, c, player);
      if (flips.length) moves.push({ r, c, flips });
    }
  }
  return moves;
}

function applyMove(b, move, player) {
  const next = cloneBoard(b);
  next[move.r][move.c] = player;
  move.flips.forEach(([r, c]) => { next[r][c] = player; });
  return next;
}

function counts(b) {
  let black = 0, white = 0, empty = 0;
  b.flat().forEach(v => {
    if (v === BLACK) black++;
    else if (v === WHITE) white++;
    else empty++;
  });
  return { black, white, empty };
}

function nextPlayer(b, player) {
  if (legalMoves(b, -player).length) return -player;
  if (legalMoves(b, player).length) return player;
  return EMPTY;
}

function weightedChoice(items) {
  const weights = items.map(m => {
    const corner = (m.r === 0 || m.r === 7) && (m.c === 0 || m.c === 7);
    return corner ? 8 : 1 + Math.random() * 2;
  });
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

function minePosition(targetDepth) {
  let b = initialBoard();
  let player = BLACK;
  let actual = 0;
  for (let ply = 0; ply < targetDepth; ply++) {
    const moves = legalMoves(b, player);
    if (!moves.length) {
      player = -player;
      if (!legalMoves(b, player).length) break;
    }
    const move = weightedChoice(legalMoves(b, player));
    b = applyMove(b, move, player);
    player = nextPlayer(b, player);
    actual++;
    if (player === EMPTY) break;
  }
  return { b, player: player || BLACK, actual };
}

async function policyMove(b, player) {
  const moves = legalMoves(b, player);
  const session = await modelSessionPromise;
  if (!session) throw new Error('Othello model is unavailable');
  const observation = new Float32Array(SIZE * SIZE * 2);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const offset = (r * SIZE + c) * 2;
      observation[offset] = b[r][c] === player ? 1 : 0;
      observation[offset + 1] = b[r][c] === -player ? 1 : 0;
    }
  }
  const tensor = new globalThis.ort.Tensor('float32', observation, [1, SIZE, SIZE, 2]);
  const outputs = await session.run({ observation: tensor });
  const logits = outputs.logits.data;
  let best = moves[0];
  let bestLogit = -Infinity;
  for (const move of moves) {
    const logit = Number(logits[move.r * SIZE + move.c]);
    if (logit > bestLogit) {
      bestLogit = logit;
      best = move;
    }
  }
  return best;
}

function render() {
  if (!boardEl) return;
  const moves = turn === BLACK && !thinking && !modelFailed
    ? legalMoves(board, BLACK)
    : [];
  const legalMap = new Map(moves.map(m => [`${m.r},${m.c}`, m]));
  boardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'othello-cell';
      cell.setAttribute('role', 'gridcell');
      const move = legalMap.get(`${r},${c}`);
      if (move) {
        cell.classList.add('legal');
        cell.setAttribute('aria-label', `Play ${String.fromCharCode(65 + c)}${r + 1}`);
        cell.addEventListener('click', () => humanMove(move));
      } else {
        cell.tabIndex = -1;
        cell.setAttribute('aria-label', board[r][c] === BLACK ? 'Black stone' : board[r][c] === WHITE ? 'White stone' : 'Empty');
      }
      if (board[r][c]) {
        const stone = document.createElement('span');
        stone.className = `stone ${board[r][c] === BLACK ? 'black' : 'white'}`;
        cell.appendChild(stone);
      }
      boardEl.appendChild(cell);
    }
  }
  const cs = counts(board);
  blackScoreEl.textContent = cs.black;
  whiteScoreEl.textContent = cs.white;
  noteEl.textContent = `${resetPly ? `Reset at ply ${resetPly}` : 'Opening position'} · ${cs.empty} empty squares`;
}

function endStatus() {
  const cs = counts(board);
  if (cs.black > cs.white) return `Game over — you win ${cs.black}–${cs.white}.`;
  if (cs.white > cs.black) return `Game over — white wins ${cs.white}–${cs.black}.`;
  return `Game over — draw, ${cs.black} each.`;
}

function settleTurn(lastPlayer) {
  turn = nextPlayer(board, lastPlayer);
  if (turn === EMPTY) {
    thinking = false;
    statusEl.textContent = endStatus();
    render();
    return;
  }
  if (turn === lastPlayer) statusEl.textContent = `${lastPlayer === BLACK ? 'White' : 'You'} had no legal move and passed.`;
  if (turn === WHITE) schedulePolicy();
  else {
    thinking = false;
    statusEl.textContent = 'Your move. Choose a marked intersection.';
    render();
  }
}

function humanMove(move) {
  if (thinking || turn !== BLACK || modelFailed) return;
  board = applyMove(board, move, BLACK);
  thinking = true;
  statusEl.textContent = 'White is considering the position…';
  render();
  settleTurn(BLACK);
}

function schedulePolicy() {
  thinking = true;
  const token = gameToken;
  statusEl.textContent = modelReady ? 'The trained policy is choosing a move…' : 'Loading the trained policy…';
  render();
  window.setTimeout(async () => {
    if (token !== gameToken || turn !== WHITE) return;
    try {
      const moves = legalMoves(board, WHITE);
      if (moves.length) board = applyMove(board, await policyMove(board, WHITE), WHITE);
      if (token === gameToken) settleTurn(WHITE);
    } catch (error) {
      console.error('Othello inference failed', error);
      thinking = false;
      statusEl.textContent = 'Model inference failed. Refresh to try again.';
      render();
    }
  }, 260);
}

function startFromOpening() {
  gameToken++;
  board = initialBoard();
  turn = BLACK;
  resetPly = 0;
  thinking = false;
  statusEl.textContent = 'Your move. Choose a marked cell.';
  render();
}

function startFromMine() {
  gameToken++;
  const result = minePosition(Number(depthInput.value));
  board = result.b;
  turn = result.player;
  resetPly = result.actual;
  thinking = false;
  if (turn === WHITE) schedulePolicy();
  else {
    statusEl.textContent = `Sampled a legal position after ${resetPly} random plies. You play black.`;
    render();
  }
}

if (boardEl) {
  depthInput.addEventListener('input', () => { depthOutput.textContent = `${depthInput.value} plies`; });
  mineButton.addEventListener('click', startFromMine);
  newButton.addEventListener('click', startFromOpening);
  render();
}

(function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host || host.querySelector('.utterances')) return;
  const s = document.createElement('script');
  s.src = 'https://utteranc.es/client.js';
  s.async = true;
  s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  s.setAttribute('issue-term', 'posts/curriculum-mining/curriculum-mining.html');
  s.setAttribute('label', 'comments');
  s.setAttribute('theme', 'github-light');
  s.setAttribute('crossorigin', 'anonymous');
  host.appendChild(s);
})();
