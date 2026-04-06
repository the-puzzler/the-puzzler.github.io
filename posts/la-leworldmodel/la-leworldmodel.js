(function initPlanningDeck() {
  const video = document.getElementById('planning-deck-video');
  const status = document.getElementById('planning-deck-status');
  const prev = document.getElementById('planning-deck-prev');
  const next = document.getElementById('planning-deck-next');
  if (!video || !status || !prev || !next) return;

  const cases = [
    'task_027_episode_12047_start_95_true',
    'task_002_episode_1639_start_40_true',
    'task_003_episode_1694_start_59_false',
    'task_004_episode_1761_start_19_true',
    'task_006_episode_2635_start_114_true',
    'task_010_episode_4299_start_20_true',
    'task_020_episode_8488_start_20_false',
    'task_026_episode_11775_start_25_true',
    'task_030_episode_12961_start_25_true',
    'task_033_episode_13586_start_35_true',
    'task_048_episode_17939_start_40_false_realtiydoesntmatch',
  ].map((name) => {
    const success = /_true(?:_|$)/.test(name);
    return {
      name,
      success,
      label: success ? 'Success' : 'Failure',
      src: `posts/la-leworldmodel/assets/${name}/imagined_vs_real.mp4`,
    };
  });

  let index = 0;

  function render() {
    const item = cases[index];
    video.src = item.src;
    video.load();
    status.textContent = `Case ${index + 1}/${cases.length} · ${item.label} · ${item.name}`;
  }

  prev.addEventListener('click', () => {
    index = (index - 1 + cases.length) % cases.length;
    render();
  });

  next.addEventListener('click', () => {
    index = (index + 1) % cases.length;
    render();
  });

  render();
})();

(function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host) return;
  if (host.querySelector('.utterances')) return;

  const s = document.createElement('script');
  s.src = 'https://utteranc.es/client.js';
  s.async = true;
  s.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  s.setAttribute(
    'issue-term',
    'posts/la-leworldmodel/la-leworldmodel.html'
  );
  s.setAttribute('label', 'comments');
  s.setAttribute('theme', 'github-light');
  s.setAttribute('crossorigin', 'anonymous');
  host.appendChild(s);
})();
