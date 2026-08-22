(function initAagTheoryDemo() {
  const root = document.querySelector('.aag-demo');
  if (!root) return;

  const plot = document.getElementById('aag-theory-plot');
  const stageLabel = document.getElementById('aag-stage-label');
  const stageDetail = document.getElementById('aag-stage-detail');
  const resetButton = document.getElementById('aag-reset');
  const gaussianButton = document.getElementById('aag-gaussianise');
  const checkConditioningButton = document.getElementById('aag-check-conditioning');
  const fitButton = document.getElementById('aag-fit');
  const generateButton = document.getElementById('aag-generate');
  const unconditionalButton = document.getElementById('aag-unconditional');
  const conditionalButton = document.getElementById('aag-conditional');
  const conditionControls = document.getElementById('aag-condition-controls');
  const conditionButtons = [...root.querySelectorAll('[data-aag-condition]')];
  const NS = 'http://www.w3.org/2000/svg';
  const POINT_COUNT = 512;
  const TRANSPORT_STEPS = 30;
  const CONDITIONAL_TRAIN_STEPS = 16000;
  const UNCONDITIONAL_TRAIN_STEPS = 28000;
  const CENTRAL = { x: 170, y: 30, size: 300 };
  const GAUSS_FRAME = { x: 24, y: 62, size: 250 };
  const G_GRAPH = { x: 326, y: 62, width: 290, height: 250 };
  const CONDITIONAL_G_GRAPH = { x: 326, y: 62, width: 290, height: 105 };
  const I_GRAPH = { x: 326, y: 207, width: 290, height: 105 };
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let stage = 0;
  let busy = false;
  let runToken = 0;
  let seed = 37;
  let data = [];
  let assigned = [];
  let transport = null;
  let model = null;
  let conditionalMode = true;
  let conditioningChecked = false;
  let selectedCondition = 0;

  function trainingSteps() {
    return conditionalMode ? CONDITIONAL_TRAIN_STEPS : UNCONDITIONAL_TRAIN_STEPS;
  }

  function rngFromSeed(initialSeed) {
    let state = initialSeed >>> 0;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    const u = Math.max(random(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  }

  function normalQuantile(p) {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969,
      138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887,
      66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184,
      -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143,
      3.75440866190742];
    const low = 0.02425;
    const high = 1 - low;
    let q;
    let r;
    if (p < low) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > high) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function makeData() {
    const random = rngFromSeed(904);
    const points = [];
    const half = POINT_COUNT / 2;
    for (let i = 0; i < POINT_COUNT; i++) {
      const jitter = () => normal(random) * 0.012;
      const first = i < half;
      const localT = (i % half) / (half - 1);
      const angle = Math.PI * localT;
      const x = (first ? Math.cos(angle) - 0.52 : 0.52 - Math.cos(angle)) * 0.7;
      const y = (first ? Math.sin(angle) - 0.27 : -Math.sin(angle) + 0.27) * 0.7;
      const colourT = first ? localT * 0.5 : 0.5 + localT * 0.5;
      points.push({ x: x + jitter(), y: y + jitter(), colourT, condition: first ? 0 : 1, index: i });
    }
    const maxAbs = Math.max(...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]));
    return points.map((point) => ({ ...point, x: point.x / maxAbs, y: point.y / maxAbs }));
  }

  function whiten(points) {
    const mx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const my = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    points.forEach((point) => {
      const x = point.x - mx;
      const y = point.y - my;
      xx += x * x;
      xy += x * y;
      yy += y * y;
    });
    xx /= points.length;
    xy /= points.length;
    yy /= points.length;
    const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const trace = xx + yy;
    const gap = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
    const l1 = Math.max((trace + gap) / 2, 1e-5);
    const l2 = Math.max((trace - gap) / 2, 1e-5);
    return points.map((point) => {
      const x = point.x - mx;
      const y = point.y - my;
      return {
        ...point,
        x: (ct * x + st * y) / Math.sqrt(l1),
        y: (-st * x + ct * y) / Math.sqrt(l2),
      };
    });
  }

  function buildTransport(points, transportSeed) {
    const random = rngFromSeed(transportSeed);
    const z = whiten(points);
    const states = [z.map((point) => ({ ...point }))];
    const globalStates = [];
    const conditionalStates = [];
    const slabStates = [];
    const directions = [];
    const conditionalEvents = [];
    const globalScores = [];
    const globalIScores = [];
    const slabs = [];
    const radials = [];
    const targets = Array.from({ length: z.length }, (_, i) =>
      normalQuantile((i + 0.5) / z.length));

    const evalRandom = rngFromSeed(transportSeed + 7000);
    const evalDirections = Array.from({ length: 48 }, () => {
      const angle = evalRandom() * 2 * Math.PI;
      return { dx: Math.cos(angle), dy: Math.sin(angle) };
    });
    const iidReference = samplePrior(points.length, transportSeed + 9000);
    const iidFloor = Math.max(projectionDefect(iidReference, evalDirections, targets), 1e-8);
    const scores = [projectionDefect(z, evalDirections, targets) / iidFloor];
    const groupSize = points.filter((point) => point.condition === 0).length;
    const groupTargets = Array.from({ length: groupSize }, (_, i) =>
      normalQuantile((i + 0.5) / groupSize));
    const groupReference = samplePrior(groupSize, transportSeed + 11000);
    const groupFloor = Math.max(projectionDefect(groupReference, evalDirections, groupTargets), 1e-8);
    const iScores = [independenceRatio(z, evalDirections, groupTargets, groupFloor)];

    for (let step = 0; step < TRANSPORT_STEPS; step++) {
      let best = null;
      let bestScore = -Infinity;
      for (let candidate = 0; candidate < 12; candidate++) {
        const angle = random() * 2 * Math.PI;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const sorted = z.map((point) => point.x * dx + point.y * dy).sort((a, b) => a - b);
        const score = sorted.reduce((sum, value, rank) =>
          sum + (value - targets[rank]) ** 2, 0);
        if (score > bestScore) {
          bestScore = score;
          best = { dx, dy };
        }
      }
      const ranked = z.map((point, index) => ({
        index,
        value: point.x * best.dx + point.y * best.dy,
      })).sort((a, b) => a.value - b.value);
      ranked.forEach((item, rank) => {
        const delta = 0.78 * (targets[rank] - item.value);
        z[item.index].x += delta * best.dx;
        z[item.index].y += delta * best.dy;
      });
      globalStates.push(z.map((point) => ({ ...point })));
      globalScores.push(projectionDefect(z, evalDirections, targets) / iidFloor);
      globalIScores.push(independenceRatio(z, evalDirections, groupTargets, groupFloor));
      const conditionPasses = conditionalMode ? applyConditionalSteps(z, random) : [];
      conditionPasses.forEach((event) => {
        event.gScore = projectionDefect(event.to, evalDirections, targets) / iidFloor;
        event.iScore = independenceRatio(event.to, evalDirections, groupTargets, groupFloor);
      });
      conditionalEvents.push(conditionPasses);
      conditionalStates.push(z.map((point) => ({ ...point })));
      const slab = (step + 1) % 2 === 0 ? applySlabCleanup(z, random) : null;
      slabs.push(slab);
      slabStates.push(z.map((point) => ({ ...point })));
      const radial = (step + 1) % 20 === 0 ? applyRadialCalibration(z) : null;
      radials.push(radial);
      directions.push(best);
      states.push(z.map((point) => ({ ...point })));
      scores.push(projectionDefect(z, evalDirections, targets) / iidFloor);
      iScores.push(independenceRatio(z, evalDirections, groupTargets, groupFloor));
    }
    const conditionScores = [0, 1].map((group) => {
      const subset = z.filter((point) => point.condition === group);
      return projectionDefect(subset, evalDirections, groupTargets) / groupFloor;
    });
    return {
      states,
      globalStates,
      conditionalStates,
      slabStates,
      directions,
      conditionalEvents,
      globalScores,
      globalIScores,
      slabs,
      radials,
      scores,
      iScores,
      conditionScores,
    };
  }

  function applyConditionalSteps(points, random) {
    const events = [];
    for (let group = 0; group < 2; group++) {
      const from = points.map((point) => ({ ...point }));
      const indices = points.map((point, index) => ({ point, index }))
        .filter((item) => item.point.condition === group)
        .map((item) => item.index);
      const targets = Array.from({ length: indices.length }, (_, rank) =>
        normalQuantile((rank + 0.5) / indices.length));
      let best = null;
      let bestScore = -Infinity;
      for (let candidate = 0; candidate < 8; candidate++) {
        const angle = random() * 2 * Math.PI;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const sorted = indices.map((index) => points[index].x * dx + points[index].y * dy)
          .sort((a, b) => a - b);
        const score = sorted.reduce((sum, value, rank) =>
          sum + (value - targets[rank]) ** 2, 0);
        if (score > bestScore) {
          bestScore = score;
          best = { dx, dy };
        }
      }
      const ranked = indices.map((index) => ({
        index,
        value: points[index].x * best.dx + points[index].y * best.dy,
      })).sort((a, b) => a.value - b.value);
      ranked.forEach((item, rank) => {
        const delta = 0.25 * (targets[rank] - item.value);
        points[item.index].x += delta * best.dx;
        points[item.index].y += delta * best.dy;
      });
      events.push({
        group,
        direction: best,
        indices,
        from,
        to: points.map((point) => ({ ...point })),
      });
    }
    return events;
  }

  function applySlabCleanup(points, random) {
    const angle = random() * 2 * Math.PI;
    const normalDirection = { dx: Math.cos(angle), dy: Math.sin(angle) };
    const tangent = { dx: -normalDirection.dy, dy: normalDirection.dx };
    const offset = (random() - 0.5) * 1.1;
    const epsilon = 0.48;
    const selected = points.map((point, index) => ({
      index,
      normalValue: point.x * normalDirection.dx + point.y * normalDirection.dy,
      tangentValue: point.x * tangent.dx + point.y * tangent.dy,
    })).filter((item) => Math.abs(item.normalValue - offset) < epsilon)
      .sort((a, b) => a.tangentValue - b.tangentValue);
    if (selected.length < 8) return null;
    selected.forEach((item, rank) => {
      const target = normalQuantile((rank + 0.5) / selected.length);
      const delta = 0.45 * (target - item.tangentValue);
      points[item.index].x += delta * tangent.dx;
      points[item.index].y += delta * tangent.dy;
    });
    return {
      normalDirection,
      tangent,
      offset,
      epsilon,
      indices: selected.map((item) => item.index),
    };
  }

  function applyRadialCalibration(points) {
    const ranked = points.map((point, index) => ({
      index,
      radius: Math.hypot(point.x, point.y),
    })).sort((a, b) => a.radius - b.radius);
    ranked.forEach((item, rank) => {
      const targetRadius = Math.sqrt(-2 * Math.log(1 - (rank + 0.5) / points.length));
      const scale = item.radius > 1e-8 ? targetRadius / item.radius : 1;
      points[item.index].x *= scale;
      points[item.index].y *= scale;
    });
    return { indices: ranked.map((item) => item.index) };
  }

  function projectionDefect(points, directions, targets) {
    let total = 0;
    directions.forEach(({ dx, dy }) => {
      const sorted = points.map((point) => point.x * dx + point.y * dy).sort((a, b) => a - b);
      for (let rank = 0; rank < sorted.length; rank++) {
        total += (sorted[rank] - targets[rank]) ** 2;
      }
    });
    return total / (directions.length * points.length);
  }

  function independenceRatio(points, directions, targets, referenceFloor) {
    const groupDefects = [0, 1].map((group) => {
      const subset = points.filter((point) => point.condition === group);
      return projectionDefect(subset, directions, targets);
    });
    return Math.max(1, Math.sqrt(((groupDefects[0] + groupDefects[1]) / 2) / referenceFloor));
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function clearPlot(description) {
    plot.replaceChildren();
    const desc = svgElement('desc', { id: 'aag-plot-description' });
    desc.textContent = description;
    plot.appendChild(desc);
  }

  function colour(t) {
    return `hsl(${265 - 70 * t} 52% 48%)`;
  }

  function mapPoint(point, frame, limit) {
    return {
      x: frame.x + frame.size * (point.x / (2 * limit) + 0.5),
      y: frame.y + frame.size * (0.5 - point.y / (2 * limit)),
    };
  }

  function drawFrame(frame, gaussianGuides = false) {
    plot.appendChild(svgElement('rect', {
      x: frame.x,
      y: frame.y,
      width: frame.size,
      height: frame.size,
      class: 'plot-frame',
    }));
    if (!gaussianGuides) return;
    const centerX = frame.x + frame.size / 2;
    const centerY = frame.y + frame.size / 2;
    plot.appendChild(svgElement('line', {
      x1: frame.x,
      y1: centerY,
      x2: frame.x + frame.size,
      y2: centerY,
      class: 'plot-axis',
    }));
    plot.appendChild(svgElement('line', {
      x1: centerX,
      y1: frame.y,
      x2: centerX,
      y2: frame.y + frame.size,
      class: 'plot-axis',
    }));
    [1, 2].forEach((sigma) => {
      plot.appendChild(svgElement('circle', {
        cx: centerX,
        cy: centerY,
        r: frame.size * sigma / 6.4,
        class: 'plot-guide',
      }));
    });
  }

  function drawPoints(points, frame, limit, options = {}) {
    points.forEach((point) => {
      const position = mapPoint(point, frame, limit);
      const circle = svgElement('circle', {
        cx: position.x.toFixed(2),
        cy: position.y.toFixed(2),
        r: options.radius || 3,
        class: options.className || 'plot-point',
      });
      const pointColour = colour(point.colourT ?? (point.index / Math.max(points.length - 1, 1)));
      if (options.outline) circle.setAttribute('stroke', pointColour);
      else circle.setAttribute('fill', pointColour);
      if (options.opacity != null) circle.setAttribute('opacity', options.opacity);
      plot.appendChild(circle);
    });
  }

  function drawLabel(text, x, y, anchor = 'start') {
    const label = svgElement('text', { x, y, class: 'plot-label', 'text-anchor': anchor });
    label.textContent = text;
    plot.appendChild(label);
  }

  function assignmentLabel() {
    return conditionalMode ? 'global + moon-local transport' : 'global rank transport';
  }

  function renderRepresentation(points = data) {
    clearPlot('Points arranged in the selected data-space shape.');
    drawFrame(CENTRAL);
    drawPoints(points, CENTRAL, 1.12);
    drawLabel('data space h', CENTRAL.x, 18);
    if (conditionalMode) {
      drawLabel('upper moon · c = 0', CENTRAL.x + 8, CENTRAL.y + 18);
      drawLabel('lower moon · c = 1', CENTRAL.x + CENTRAL.size - 8, CENTRAL.y + CENTRAL.size - 10, 'end');
    }
  }

  function drawGGraph(scores, progress, currentScore, graph = G_GRAPH) {
    const maxScore = Math.max(2, scores[0] * 1.08);
    const minScore = 0.25;
    const logMin = Math.log10(minScore);
    const logMax = Math.log10(maxScore);
    const xAt = (index) => graph.x + (index / (scores.length - 1)) * graph.width;
    const yAt = (score) => {
      const value = Math.max(minScore, Math.min(maxScore, score));
      return graph.y + graph.height * (1 - (Math.log10(value) - logMin) / (logMax - logMin));
    };

    plot.appendChild(svgElement('rect', {
      x: graph.x,
      y: graph.y,
      width: graph.width,
      height: graph.height,
      class: 'plot-frame',
    }));
    const targetY = yAt(1);
    plot.appendChild(svgElement('line', {
      x1: graph.x,
      y1: targetY,
      x2: graph.x + graph.width,
      y2: targetY,
      class: 'plot-g-target',
    }));
    drawLabel('G score · log scale', graph.x, graph.y - 13);
    drawLabel('1 · iid floor', graph.x + 6, targetY - 7);
    drawLabel(maxScore.toFixed(maxScore >= 10 ? 0 : 1), graph.x - 8, graph.y + 4, 'end');
    drawLabel('0.25', graph.x - 8, graph.y + graph.height, 'end');

    const completed = Math.floor(progress);
    const linePoints = [];
    for (let i = 0; i <= completed && i < scores.length; i++) {
      linePoints.push(`${xAt(i)},${yAt(scores[i])}`);
    }
    if (progress > completed && completed + 1 < scores.length) {
      linePoints.push(`${xAt(progress)},${yAt(currentScore)}`);
    }
    if (linePoints.length > 1) {
      plot.appendChild(svgElement('polyline', {
        points: linePoints.join(' '),
        class: 'plot-g-line',
      }));
    }
    const currentX = xAt(progress);
    const currentY = yAt(currentScore);
    plot.appendChild(svgElement('circle', {
      cx: currentX,
      cy: currentY,
      r: 4,
      class: 'plot-g-current',
    }));
    drawLabel(`G ${currentScore.toFixed(2)}`, graph.x + graph.width, graph.y - 13, 'end');
    drawLabel('rank transports →', graph.x + graph.width, graph.y + graph.height + 19, 'end');
  }

  function drawIGraph(scores, progress, currentScore) {
    const graph = I_GRAPH;
    const maxScore = Math.max(2, scores[0] * 1.08);
    const minScore = 0.5;
    const logMin = Math.log10(minScore);
    const logMax = Math.log10(maxScore);
    const xAt = (index) => graph.x + (index / (scores.length - 1)) * graph.width;
    const yAt = (score) => {
      const value = Math.max(minScore, Math.min(maxScore, score));
      return graph.y + graph.height * (1 - (Math.log10(value) - logMin) / (logMax - logMin));
    };

    plot.appendChild(svgElement('rect', {
      x: graph.x,
      y: graph.y,
      width: graph.width,
      height: graph.height,
      class: 'plot-frame',
    }));
    const targetY = yAt(1);
    plot.appendChild(svgElement('line', {
      x1: graph.x,
      y1: targetY,
      x2: graph.x + graph.width,
      y2: targetY,
      class: 'plot-g-target',
    }));
    drawLabel('I ratio · log scale', graph.x, graph.y - 13);
    drawLabel('1 · independent', graph.x + 6, targetY - 7);

    const completed = Math.floor(progress);
    const linePoints = [];
    for (let i = 0; i <= completed && i < scores.length; i++) {
      linePoints.push(`${xAt(i)},${yAt(scores[i])}`);
    }
    if (progress > completed && completed + 1 < scores.length) {
      linePoints.push(`${xAt(progress)},${yAt(currentScore)}`);
    }
    if (linePoints.length > 1) {
      plot.appendChild(svgElement('polyline', {
        points: linePoints.join(' '),
        class: 'plot-i-line',
      }));
    }
    plot.appendChild(svgElement('circle', {
      cx: xAt(progress),
      cy: yAt(currentScore),
      r: 4,
      class: 'plot-i-current',
    }));
    drawLabel(`I ${currentScore.toFixed(2)}`, graph.x + graph.width, graph.y - 13, 'end');
    drawLabel('conditional steps →', graph.x + graph.width, graph.y + graph.height + 19, 'end');
  }

  function drawAssignmentGraphs(progress, gValue, iValue = null) {
    if (conditionalMode) {
      drawGGraph(transport.scores, progress, gValue, CONDITIONAL_G_GRAPH);
      const liveI = iValue == null ? transport.iScores[Math.round(progress)] : iValue;
      drawIGraph(transport.iScores, progress, liveI);
      return;
    }
    drawGGraph(transport.scores, progress, gValue);
  }

  function renderTransport(
    points,
    direction = null,
    from = null,
    to = null,
    scoreProgress = 0,
    scoreValue = null,
    iValue = null,
  ) {
    clearPlot('The same particles are moved by one-dimensional Gaussian rank transports.');
    drawFrame(GAUSS_FRAME, true);
    if (direction) {
      const center = { x: GAUSS_FRAME.x + GAUSS_FRAME.size / 2, y: GAUSS_FRAME.y + GAUSS_FRAME.size / 2 };
      const radius = GAUSS_FRAME.size * 0.46;
      plot.appendChild(svgElement('line', {
        x1: center.x - direction.dx * radius,
        y1: center.y + direction.dy * radius,
        x2: center.x + direction.dx * radius,
        y2: center.y - direction.dy * radius,
        class: 'plot-projection',
      }));
      if (from && to) {
        for (let i = 0; i < from.length; i += 10) {
          const start = mapPoint(from[i], GAUSS_FRAME, 3.2);
          const end = mapPoint(to[i], GAUSS_FRAME, 3.2);
          plot.appendChild(svgElement('line', {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            class: 'plot-projection-shadow',
          }));
        }
      }
    }
    drawPoints(points, GAUSS_FRAME, 3.2, { radius: 2.35 });
    drawLabel(direction ? assignmentLabel() : 'assigned prior z', GAUSS_FRAME.x, 47);
    const liveScore = scoreValue == null ? transport.scores[Math.round(scoreProgress)] : scoreValue;
    drawAssignmentGraphs(scoreProgress, liveScore, iValue);
  }

  function renderConditioningCheck() {
    const upperFrame = { x: 32, y: 72, size: 240 };
    const lowerFrame = { x: 368, y: 72, size: 240 };
    const upper = assigned.filter((point) => point.condition === 0);
    const lower = assigned.filter((point) => point.condition === 1);
    clearPlot('The assigned latent cloud is inspected separately for each condition.');
    drawLabel('check condition independence', 320, 25, 'middle');
    drawFrame(upperFrame, true);
    drawFrame(lowerFrame, true);
    drawPoints(upper, upperFrame, 3.2, {
      radius: 2.25,
      className: 'plot-condition-point plot-condition-0',
      opacity: 0.82,
    });
    drawPoints(lower, lowerFrame, 3.2, {
      radius: 2.25,
      className: 'plot-condition-point plot-condition-1',
      opacity: 0.82,
    });
    drawLabel('upper moon · c = 0', upperFrame.x, 54);
    drawLabel(`G ${transport.conditionScores[0].toFixed(2)}`, upperFrame.x + upperFrame.size, 54, 'end');
    drawLabel('lower moon · c = 1', lowerFrame.x, 54);
    drawLabel(`G ${transport.conditionScores[1].toFixed(2)}`, lowerFrame.x + lowerFrame.size, 54, 'end');
    drawLabel('each conditional cloud should match N(0, I) · target G = 1', 320, 340, 'middle');
  }

  function interpolatePoints(from, to, amount) {
    return from.map((point, i) => ({
      ...point,
      x: point.x + (to[i].x - point.x) * amount,
      y: point.y + (to[i].y - point.y) * amount,
    }));
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  }

  function animateBetween(from, to, duration, direction, token, scoreIndex) {
    const startScore = transport.scores[scoreIndex];
    const endScore = transport.globalScores[scoreIndex];
    const startI = transport.iScores[scoreIndex];
    const endI = transport.globalIScores[scoreIndex];
    if (prefersReducedMotion || duration === 0) {
      renderTransport(to, direction, from, to, scoreIndex + 0.45, endScore, endI);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min((now - started) / duration, 1);
        const eased = easeInOut(progress);
        const currentScore = startScore + (endScore - startScore) * eased;
        const currentI = startI + (endI - startI) * eased;
        renderTransport(
          interpolatePoints(from, to, eased),
          direction,
          from,
          to,
          scoreIndex + eased * 0.45,
          currentScore,
          currentI,
        );
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderConditionalStep(points, event, scoreProgress, gValue, iValue) {
    const label = event.group === 0 ? 'upper moon' : 'lower moon';
    clearPlot(`The ${label} subset receives its own partial rank transport.`);
    drawFrame(GAUSS_FRAME, true);
    const center = { x: GAUSS_FRAME.x + GAUSS_FRAME.size / 2, y: GAUSS_FRAME.y + GAUSS_FRAME.size / 2 };
    const radius = GAUSS_FRAME.size * 0.46;
    plot.appendChild(svgElement('line', {
      x1: center.x - event.direction.dx * radius,
      y1: center.y + event.direction.dy * radius,
      x2: center.x + event.direction.dx * radius,
      y2: center.y - event.direction.dy * radius,
      class: 'plot-conditional-projection',
    }));
    event.indices.forEach((index, order) => {
      if (order % 7 !== 0) return;
      const start = mapPoint(event.from[index], GAUSS_FRAME, 3.2);
      const end = mapPoint(event.to[index], GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: 'plot-conditional-shadow',
      }));
    });
    drawPoints(points, GAUSS_FRAME, 3.2, { radius: 2.25, opacity: 0.55 });
    event.indices.forEach((index) => {
      const position = mapPoint(points[index], GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('circle', {
        cx: position.x,
        cy: position.y,
        r: 3.05,
        class: `plot-condition-point plot-condition-${event.group}`,
      }));
    });
    drawLabel(assignmentLabel(), GAUSS_FRAME.x, 47);
    drawAssignmentGraphs(scoreProgress, gValue, iValue);
  }

  function animateConditionalStep(event, duration, token, scoreIndex, eventIndex, startMetrics) {
    const endProgress = scoreIndex + (eventIndex === 0 ? 0.68 : 0.86);
    const startProgress = scoreIndex + (eventIndex === 0 ? 0.45 : 0.68);
    if (prefersReducedMotion || duration === 0) {
      renderConditionalStep(event.to, event, endProgress, event.gScore, event.iScore);
      return Promise.resolve({ g: event.gScore, i: event.iScore });
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve(startMetrics);
          return;
        }
        const progress = Math.min((now - started) / duration, 1);
        const eased = easeInOut(progress);
        const liveG = startMetrics.g + (event.gScore - startMetrics.g) * eased;
        const liveI = startMetrics.i + (event.iScore - startMetrics.i) * eased;
        renderConditionalStep(
          interpolatePoints(event.from, event.to, eased),
          event,
          startProgress + (endProgress - startProgress) * eased,
          liveG,
          liveI,
        );
        if (progress < 1) requestAnimationFrame(frame);
        else resolve({ g: event.gScore, i: event.iScore });
      }
      requestAnimationFrame(frame);
    });
  }

  function renderSlabCleanup(points, slab, from, to, scoreIndex) {
    clearPlot('An optional offset-slab pass corrects a tangent coordinate inside a thin local slice.');
    drawFrame(GAUSS_FRAME, true);
    [slab.offset - slab.epsilon, slab.offset + slab.epsilon].forEach((boundary) => {
      const center = {
        x: boundary * slab.normalDirection.dx,
        y: boundary * slab.normalDirection.dy,
      };
      const start = mapPoint({
        x: center.x - 3.5 * slab.tangent.dx,
        y: center.y - 3.5 * slab.tangent.dy,
      }, GAUSS_FRAME, 3.2);
      const end = mapPoint({
        x: center.x + 3.5 * slab.tangent.dx,
        y: center.y + 3.5 * slab.tangent.dy,
      }, GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: 'plot-slab',
      }));
    });
    slab.indices.forEach((index, order) => {
      if (order % 2 !== 0) return;
      const start = mapPoint(from[index], GAUSS_FRAME, 3.2);
      const end = mapPoint(to[index], GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: 'plot-projection-shadow',
      }));
    });
    drawPoints(points, GAUSS_FRAME, 3.2, { radius: 2.35 });
    slab.indices.forEach((index) => {
      const position = mapPoint(points[index], GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('circle', {
        cx: position.x,
        cy: position.y,
        r: 3.3,
        class: 'plot-slab-point',
      }));
    });
    drawLabel(assignmentLabel(), GAUSS_FRAME.x, 47);
    drawAssignmentGraphs(scoreIndex, transport.scores[scoreIndex], transport.iScores[scoreIndex]);
  }

  function animateSlabCleanup(from, to, slab, duration, token, scoreIndex) {
    if (!slab) return Promise.resolve();
    if (prefersReducedMotion || duration === 0) {
      renderSlabCleanup(to, slab, from, to, scoreIndex);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min((now - started) / duration, 1);
        renderSlabCleanup(interpolatePoints(from, to, easeInOut(progress)), slab, from, to, scoreIndex);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderRadialCalibration(points, from, to, scoreIndex) {
    clearPlot('An optional radial pass rank-corrects particle norms toward the exact chi law.');
    drawFrame(GAUSS_FRAME, true);
    for (let i = 0; i < from.length; i += 10) {
      const start = mapPoint(from[i], GAUSS_FRAME, 3.2);
      const end = mapPoint(to[i], GAUSS_FRAME, 3.2);
      plot.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: 'plot-radial-shadow',
      }));
    }
    drawPoints(points, GAUSS_FRAME, 3.2, { radius: 2.35 });
    drawLabel(assignmentLabel(), GAUSS_FRAME.x, 47);
    drawAssignmentGraphs(scoreIndex, transport.scores[scoreIndex], transport.iScores[scoreIndex]);
  }

  function animateRadialCalibration(from, to, duration, token, scoreIndex) {
    if (prefersReducedMotion || duration === 0) {
      renderRadialCalibration(to, from, to, scoreIndex);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min((now - started) / duration, 1);
        renderRadialCalibration(interpolatePoints(from, to, easeInOut(progress)), from, to, scoreIndex);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderWhiteningTransition(from, to, amount) {
    clearPlot('The data shape is PCA-whitened before the rank transports begin.');
    const frame = {
      x: CENTRAL.x + (GAUSS_FRAME.x - CENTRAL.x) * amount,
      y: CENTRAL.y + (GAUSS_FRAME.y - CENTRAL.y) * amount,
      size: CENTRAL.size + (GAUSS_FRAME.size - CENTRAL.size) * amount,
    };
    drawFrame(frame, amount > 0.55);
    from.forEach((point, index) => {
      const start = mapPoint(point, CENTRAL, 1.12);
      const end = mapPoint(to[index], GAUSS_FRAME, 3.2);
      const circle = svgElement('circle', {
        cx: start.x + (end.x - start.x) * amount,
        cy: start.y + (end.y - start.y) * amount,
        r: 3,
        class: 'plot-point',
        fill: colour(point.colourT),
      });
      plot.appendChild(circle);
    });
    drawLabel(amount < 0.5 ? 'data space h' : 'PCA whitening', frame.x, frame.y - 15);
    if (amount > 0.35) {
      drawAssignmentGraphs(0, transport.scores[0], transport.iScores[0]);
    }
  }

  function animateWhitening(from, to, duration, token) {
    if (prefersReducedMotion || duration === 0) {
      renderTransport(to, null, null, null, 0, transport.scores[0]);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min((now - started) / duration, 1);
        renderWhiteningTransition(from, to, easeInOut(progress));
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function makeParameter(length, scale, random) {
    const values = new Float64Array(length);
    for (let i = 0; i < length; i++) values[i] = normal(random) * scale;
    return {
      values,
      gradient: new Float64Array(length),
      first: new Float64Array(length),
      second: new Float64Array(length),
    };
  }

  function createMlp(modelSeed) {
    const random = rngFromSeed(modelSeed);
    const hidden = 64;
    const inputSize = conditionalMode ? 3 : 2;
    const network = {
      hidden,
      inputSize,
      step: 0,
      w1: makeParameter(hidden * inputSize, Math.sqrt(2 / (inputSize + hidden)), random),
      b1: makeParameter(hidden, 0, random),
      w2: makeParameter(hidden * hidden, Math.sqrt(1 / hidden), random),
      b2: makeParameter(hidden, 0, random),
      w3: makeParameter(2 * hidden, Math.sqrt(2 / (hidden + 2)), random),
      b3: makeParameter(2, 0, random),
    };
    network.parameters = [network.w1, network.b1, network.w2, network.b2, network.w3, network.b3];
    return network;
  }

  function mlpForward(network, point) {
    const h = network.hidden;
    const input = [point.x, point.y];
    if (network.inputSize === 3) input.push(point.condition === 0 ? -1 : 1);
    const h1 = new Float64Array(h);
    const h2 = new Float64Array(h);
    for (let j = 0; j < h; j++) {
      let value = network.b1.values[j];
      for (let i = 0; i < network.inputSize; i++) {
        value += network.w1.values[j * network.inputSize + i] * input[i];
      }
      h1[j] = Math.tanh(value);
    }
    for (let k = 0; k < h; k++) {
      let value = network.b2.values[k];
      for (let j = 0; j < h; j++) value += network.w2.values[k * h + j] * h1[j];
      h2[k] = Math.tanh(value);
    }
    const output = new Float64Array(2);
    for (let o = 0; o < 2; o++) {
      let value = network.b3.values[o];
      for (let k = 0; k < h; k++) value += network.w3.values[o * h + k] * h2[k];
      output[o] = value;
    }
    return { input, h1, h2, output };
  }

  function trainMlpBatch(network, inputs, targets, random, batchSize = 28) {
    const h = network.hidden;
    network.parameters.forEach((parameter) => parameter.gradient.fill(0));
    let loss = 0;
    for (let batch = 0; batch < batchSize; batch++) {
      const index = Math.floor(random() * inputs.length);
      const cache = mlpForward(network, inputs[index]);
      const target = targets[index];
      const d3 = new Float64Array(2);
      const d2 = new Float64Array(h);
      const d1 = new Float64Array(h);
      for (let o = 0; o < 2; o++) {
        const expected = o === 0 ? target.x : target.y;
        const difference = cache.output[o] - expected;
        loss += difference * difference * 0.5;
        d3[o] = difference;
        network.b3.gradient[o] += d3[o];
        for (let k = 0; k < h; k++) network.w3.gradient[o * h + k] += d3[o] * cache.h2[k];
      }
      for (let k = 0; k < h; k++) {
        let downstream = 0;
        for (let o = 0; o < 2; o++) downstream += network.w3.values[o * h + k] * d3[o];
        d2[k] = downstream * (1 - cache.h2[k] ** 2);
        network.b2.gradient[k] += d2[k];
        for (let j = 0; j < h; j++) network.w2.gradient[k * h + j] += d2[k] * cache.h1[j];
      }
      for (let j = 0; j < h; j++) {
        let downstream = 0;
        for (let k = 0; k < h; k++) downstream += network.w2.values[k * h + j] * d2[k];
        d1[j] = downstream * (1 - cache.h1[j] ** 2);
        network.b1.gradient[j] += d1[j];
        for (let i = 0; i < network.inputSize; i++) {
          network.w1.gradient[j * network.inputSize + i] += d1[j] * cache.input[i];
        }
      }
    }

    network.step += 1;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const learningRate = 1e-3;
    network.parameters.forEach((parameter) => {
      for (let i = 0; i < parameter.values.length; i++) {
        const gradient = parameter.gradient[i] / batchSize;
        parameter.first[i] = beta1 * parameter.first[i] + (1 - beta1) * gradient;
        parameter.second[i] = beta2 * parameter.second[i] + (1 - beta2) * gradient * gradient;
        const firstHat = parameter.first[i] / (1 - beta1 ** network.step);
        const secondHat = parameter.second[i] / (1 - beta2 ** network.step);
        parameter.values[i] -= learningRate * firstHat / (Math.sqrt(secondHat) + 1e-8);
      }
    });
    return loss / batchSize;
  }

  function predict(network, points) {
    return points.map((point) => {
      const output = mlpForward(network, point).output;
      return { ...point, x: output[0], y: output[1] };
    });
  }

  function mlpLoss(network, inputs, targets) {
    let total = 0;
    inputs.forEach((point, index) => {
      const output = mlpForward(network, point).output;
      total += ((output[0] - targets[index].x) ** 2 + (output[1] - targets[index].y) ** 2) / 2;
    });
    return total / inputs.length;
  }

  function drawLossGraph(history) {
    const graph = G_GRAPH;
    const totalSteps = trainingSteps();
    const maxLoss = Math.max(0.1, history[0].loss * 1.15);
    const minLoss = Math.min(0.001, Math.max(history.at(-1).loss * 0.5, 1e-5));
    const logMin = Math.log10(minLoss);
    const logMax = Math.log10(maxLoss);
    const xAt = (step) => graph.x + (step / totalSteps) * graph.width;
    const yAt = (loss) => {
      const value = Math.max(minLoss, Math.min(maxLoss, loss));
      return graph.y + graph.height * (1 - (Math.log10(value) - logMin) / (logMax - logMin));
    };
    plot.appendChild(svgElement('rect', {
      x: graph.x,
      y: graph.y,
      width: graph.width,
      height: graph.height,
      class: 'plot-frame',
    }));
    const linePoints = history.map((item) => `${xAt(item.step)},${yAt(item.loss)}`);
    if (linePoints.length > 1) {
      plot.appendChild(svgElement('polyline', {
        points: linePoints.join(' '),
        class: 'plot-loss-line',
      }));
    }
    const current = history.at(-1);
    plot.appendChild(svgElement('circle', {
      cx: xAt(current.step),
      cy: yAt(current.loss),
      r: 4,
      class: 'plot-loss-current',
    }));
    drawLabel('MLP loss · log scale', graph.x, graph.y - 13);
    drawLabel(current.loss.toFixed(4), graph.x + graph.width, graph.y - 13, 'end');
    drawLabel('0', graph.x, graph.y + graph.height + 19);
    drawLabel(`${totalSteps.toLocaleString()} steps`, graph.x + graph.width, graph.y + graph.height + 19, 'end');
  }

  function renderFit(predictions, history) {
    clearPlot('An actual two-layer MLP learns the fixed mapping from assigned Gaussian coordinates to the data.');
    drawFrame(GAUSS_FRAME);
    drawPoints(data, GAUSS_FRAME, 1.12, { className: 'plot-target', radius: 2.65 });
    drawPoints(predictions, GAUSS_FRAME, 1.12, { radius: 2.25 });
    drawLabel('target and MLP predictions', GAUSS_FRAME.x, 47);
    drawLossGraph(history);
  }

  function samplePrior(count, sampleSeed) {
    const random = rngFromSeed(sampleSeed);
    return Array.from({ length: count }, (_, index) => ({
      x: normal(random),
      y: normal(random),
      index,
      colourT: index / Math.max(count - 1, 1),
    }));
  }

  function nearestTrainingColour(point) {
    const candidates = conditionalMode
      ? assigned.filter((candidate) => candidate.condition === point.condition)
      : assigned;
    let nearest = candidates[0];
    let distance = Infinity;
    candidates.forEach((candidate) => {
      const current = (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2;
      if (current < distance) {
        distance = current;
        nearest = candidate;
      }
    });
    return nearest.colourT;
  }

  function renderGeneration(priorSamples, outputs, progress = 1) {
    const left = { x: 24, y: 78, size: 218 };
    const right = { x: 398, y: 78, size: 218 };
    clearPlot('Fresh Gaussian samples pass through the trained MLP and reconstruct the data distribution.');
    drawFrame(left, true);
    drawFrame(right);
    drawLabel('fresh z from prior', left.x, 63);
    const conditionName = selectedCondition === 0 ? 'upper moon' : 'lower moon';
    drawLabel(conditionalMode ? `G(z, ${conditionName})` : 'G(z)', right.x, 63);

    const modelBox = svgElement('rect', { x: 281, y: 151, width: 78, height: 54, rx: 4, class: 'plot-model' });
    plot.appendChild(modelBox);
    const modelText = svgElement('text', { x: 320, y: 174, class: 'plot-model-text' });
    const line1 = svgElement('tspan', { x: 320, dy: 0 });
    line1.textContent = 'MLP';
    const line2 = svgElement('tspan', { x: 320, dy: 15 });
    line2.textContent = conditionalMode ? 'G(z, c)' : 'G(z)';
    modelText.append(line1, line2);
    plot.appendChild(modelText);
    drawLabel('→', 261, 183, 'middle');
    drawLabel('→', 379, 183, 'middle');

    priorSamples.forEach((point) => {
      const position = mapPoint(point, left, 3.2);
      const circle = svgElement('circle', {
        cx: position.x,
        cy: position.y,
        r: 2.8,
        class: 'plot-sample',
        stroke: colour(point.colourT),
      });
      plot.appendChild(circle);
    });

    outputs.forEach((point, index) => {
      const destination = mapPoint(point, right, 1.12);
      const start = { x: 359, y: 178 };
      const eased = easeInOut(progress);
      const circle = svgElement('circle', {
        cx: start.x + (destination.x - start.x) * eased,
        cy: start.y + (destination.y - start.y) * eased,
        r: 2.8,
        class: 'plot-point',
        fill: colour(priorSamples[index].colourT),
      });
      plot.appendChild(circle);
    });
  }

  function animateGeneration(priorSamples, outputs, token) {
    if (prefersReducedMotion) {
      renderGeneration(priorSamples, outputs, 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = performance.now();
      function frame(now) {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min((now - started) / 700, 1);
        renderGeneration(priorSamples, outputs, progress);
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function setStatus(label, detail) {
    stageLabel.textContent = label;
    stageDetail.textContent = detail;
  }

  function syncControls() {
    gaussianButton.disabled = busy || stage !== 0;
    checkConditioningButton.hidden = !conditionalMode;
    checkConditioningButton.disabled = busy || stage !== 1 || conditioningChecked;
    fitButton.disabled = busy || stage !== 1 || (conditionalMode && !conditioningChecked);
    generateButton.disabled = busy || stage < 2;
    fitButton.textContent = conditionalMode ? '3 · Fit MLP' : '2 · Fit MLP';
    const generateStep = conditionalMode ? 4 : 3;
    generateButton.textContent = stage >= 3
      ? `${generateStep} · Resample`
      : `${generateStep} · Generate`;
    gaussianButton.dataset.current = String(stage === 0 && !busy);
    checkConditioningButton.dataset.current = String(conditionalMode && stage === 1 && !conditioningChecked && !busy);
    fitButton.dataset.current = String(stage === 1 && (!conditionalMode || conditioningChecked) && !busy);
    generateButton.dataset.current = String(stage >= 2 && !busy);
    unconditionalButton.disabled = busy;
    conditionalButton.disabled = busy;
    conditionButtons.forEach((button) => { button.disabled = busy; });
  }

  function setMode(nextConditionalMode) {
    if (busy || conditionalMode === nextConditionalMode) return;
    conditionalMode = nextConditionalMode;
    unconditionalButton.classList.toggle('is-active', !conditionalMode);
    unconditionalButton.setAttribute('aria-pressed', String(!conditionalMode));
    conditionalButton.classList.toggle('is-active', conditionalMode);
    conditionalButton.setAttribute('aria-pressed', String(conditionalMode));
    conditionControls.hidden = !conditionalMode;
    reset();
  }

  function reset() {
    runToken += 1;
    busy = false;
    stage = 0;
    conditioningChecked = false;
    seed += 31;
    data = makeData();
    transport = buildTransport(data, seed);
    assigned = [];
    model = null;
    setStatus(
      'Representation',
      conditionalMode
        ? 'The moon-half label c is attached to every point.'
        : 'The points begin in data space.',
    );
    renderRepresentation();
    syncControls();
  }

  gaussianButton.addEventListener('click', async () => {
    const token = ++runToken;
    busy = true;
    syncControls();
    setStatus('Whitening', 'PCA removes linear correlation before sliced transport.');
    await animateWhitening(data, transport.states[0], prefersReducedMotion ? 0 : 520, token);
    if (token !== runToken) return;
    const slabCount = transport.slabs.filter(Boolean).length;
    const radialCount = transport.radials.filter(Boolean).length;
    const conditionalCount = transport.conditionalEvents.reduce((sum, events) => sum + events.length, 0);
    const animationWeight = transport.directions.length + conditionalCount * 0.45 + slabCount * 0.65 + radialCount * 0.8;
    const stepDuration = Math.max(75, Math.min(650, 4200 / animationWeight));
    setStatus(
      conditionalMode ? 'Conditional Gaussianisation' : 'Gaussianisation',
      conditionalMode
        ? 'Global and moon-local rank transports are running.'
        : 'Global rank transports are running.',
    );
    for (let i = 0; i < transport.directions.length; i++) {
      await animateBetween(
        transport.states[i],
        transport.globalStates[i],
        prefersReducedMotion ? 0 : stepDuration,
        transport.directions[i],
        token,
        i,
      );
      if (token !== runToken) return;
      let conditionalMetrics = {
        g: transport.globalScores[i],
        i: transport.globalIScores[i],
      };
      for (let eventIndex = 0; eventIndex < transport.conditionalEvents[i].length; eventIndex++) {
        const event = transport.conditionalEvents[i][eventIndex];
        conditionalMetrics = await animateConditionalStep(
          event,
          prefersReducedMotion ? 0 : stepDuration * 0.45,
          token,
          i,
          eventIndex,
          conditionalMetrics,
        );
        if (token !== runToken) return;
      }
      if (transport.slabs[i]) {
        await animateSlabCleanup(
          transport.conditionalStates[i],
          transport.slabStates[i],
          transport.slabs[i],
          prefersReducedMotion ? 0 : stepDuration * 0.65,
          token,
          i + 1,
        );
        if (token !== runToken) return;
      }
      if (transport.radials[i]) {
        await animateRadialCalibration(
          transport.slabStates[i],
          transport.states[i + 1],
          prefersReducedMotion ? 0 : stepDuration * 0.8,
          token,
          i + 1,
        );
        if (token !== runToken) return;
      }
    }
    assigned = transport.states.at(-1).map((point) => ({ ...point }));
    busy = false;
    stage = 1;
    const radialMessage = TRANSPORT_STEPS >= 20
      ? ' Radial calibration ran every 20 steps.'
      : ' Radial calibration begins at step 20.';
    const conditionalMessage = conditionalMode
      ? ` Conditional transports pushed I to ${transport.iScores.at(-1).toFixed(2)}.`
      : '';
    setStatus('Assignment complete', `Slab cleanup ran every 2 steps.${radialMessage}${conditionalMessage}`);
    renderTransport(
      assigned,
      null,
      null,
      null,
      transport.scores.length - 1,
      transport.scores.at(-1),
    );
    syncControls();
  });

  checkConditioningButton.addEventListener('click', () => {
    if (busy || !conditionalMode || stage !== 1) return;
    conditioningChecked = true;
    const [upperScore, lowerScore] = transport.conditionScores;
    setStatus(
      'Conditioning checked',
      `Upper G ${upperScore.toFixed(2)} · lower G ${lowerScore.toFixed(2)} · iid target 1.`,
    );
    renderConditioningCheck();
    syncControls();
  });

  fitButton.addEventListener('click', async () => {
    const token = ++runToken;
    busy = true;
    syncControls();
    model = createMlp(seed + 500);
    const random = rngFromSeed(seed + 800);
    const totalSteps = trainingSteps();
    let loss = mlpLoss(model, assigned, data);
    const lossHistory = [{ step: 0, loss }];
    const renderEvery = Math.max(40, Math.ceil(totalSteps / 2400) * 40);
    renderFit(predict(model, assigned), lossHistory);
    for (let step = 0; step < totalSteps; step++) {
      trainMlpBatch(model, assigned, data, random, 36);
      if ((step + 1) % renderEvery === 0 || step + 1 === totalSteps) {
        if (token !== runToken) return;
        loss = mlpLoss(model, assigned, data);
        lossHistory.push({ step: model.step, loss });
        setStatus('Fitting generator', `Adam update ${model.step.toLocaleString()} of ${totalSteps.toLocaleString()} · loss ${loss.toFixed(4)}`);
        renderFit(predict(model, assigned), lossHistory);
        if (!prefersReducedMotion) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
    }
    if (token !== runToken) return;
    if (model.step !== totalSteps) {
      throw new Error(`Expected ${totalSteps} Adam updates, completed ${model.step}`);
    }
    loss = mlpLoss(model, assigned, data);
    if (lossHistory.at(-1).step !== totalSteps) lossHistory.push({ step: totalSteps, loss });
    busy = false;
    stage = 2;
    setStatus('Generator fitted', `${model.step.toLocaleString()} Adam updates completed on ${POINT_COUNT} persistent pairs.`);
    renderFit(predict(model, assigned), lossHistory);
    syncControls();
  });

  generateButton.addEventListener('click', async () => {
    const token = ++runToken;
    busy = true;
    syncControls();
    seed += 101;
    const priorSamples = samplePrior(180, seed + 1200);
    priorSamples.forEach((point) => { point.condition = selectedCondition; });
    priorSamples.forEach((point) => { point.colourT = nearestTrainingColour(point); });
    const outputs = predict(model, priorSamples);
    const conditionName = selectedCondition === 0 ? 'upper moon' : 'lower moon';
    setStatus(
      'Sampling',
      conditionalMode
        ? `Fresh Gaussian coordinates are paired with the ${conditionName} label.`
        : 'Fresh Gaussian coordinates pass through the fitted MLP once.',
    );
    await animateGeneration(priorSamples, outputs, token);
    if (token !== runToken) return;
    busy = false;
    stage = 3;
    setStatus(
      'Generated',
      conditionalMode
        ? `Fresh prior samples generate the ${conditionName}.`
        : 'Fresh prior samples reconstruct the learned data shape.',
    );
    syncControls();
  });

  unconditionalButton.addEventListener('click', () => setMode(false));
  conditionalButton.addEventListener('click', () => setMode(true));
  conditionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (busy) return;
      selectedCondition = Number(button.dataset.aagCondition);
      conditionButtons.forEach((candidate) => {
        const isSelected = Number(candidate.dataset.aagCondition) === selectedCondition;
        candidate.classList.toggle('is-active', isSelected);
        candidate.setAttribute('aria-pressed', String(isSelected));
      });
    });
  });
  resetButton.addEventListener('click', reset);
  reset();
})();

(function initAagResultsLightbox() {
  const dialog = document.getElementById('aag-results-lightbox');
  const image = document.getElementById('aag-lightbox-image');
  const caption = document.getElementById('aag-lightbox-caption');
  const closeButton = document.getElementById('aag-lightbox-close');
  const triggers = [...document.querySelectorAll('.newgen-result-open')];
  if (!dialog || !image || !caption || !closeButton || !triggers.length) return;

  let lastTrigger = null;

  function closeLightbox() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const preview = trigger.querySelector('img');
      lastTrigger = trigger;
      image.src = trigger.dataset.aagFull;
      image.alt = preview ? preview.alt : '';
      caption.textContent = trigger.dataset.aagCaption || '';
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  });

  closeButton.addEventListener('click', closeLightbox);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeLightbox();
  });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    if (lastTrigger) lastTrigger.focus();
  });
})();

(function initAagModelSwitcher() {
  const tabs = [...document.querySelectorAll('.aag-model-tabs [role="tab"]')];
  const panes = [...document.querySelectorAll('.aag-model-pane')];
  if (!tabs.length || !panes.length) return;

  function selectTab(tab) {
    tabs.forEach((candidate) => {
      candidate.setAttribute('aria-selected', String(candidate === tab));
    });
    panes.forEach((pane) => {
      pane.hidden = pane.id !== tab.getAttribute('aria-controls');
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });
})();

(function initAagDoomWorldModel() {
  const root = document.getElementById('aag-doom-demo');
  const canvas = document.getElementById('aag-doom-canvas');
  const loadButton = document.getElementById('aag-doom-load');
  const resetButton = document.getElementById('aag-doom-reset');
  const status = document.getElementById('aag-doom-status');
  const stepLabel = document.getElementById('aag-doom-step');
  const actionButtons = [...document.querySelectorAll('[data-doom-action]')];
  if (!root || !canvas || !loadButton || !resetButton || !status || !stepLabel) return;

  const MODEL_URL = 'posts/aag/assets/doom-browser/worldmodel.onnx?v=20260822b';
  const SEED_URL = 'posts/aag/assets/doom_worldmodel.png';
  const ORT_VERSION = '1.24.1';
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const FRAME_SIZE = 64;
  const FRAME_VALUES = 3 * FRAME_SIZE * FRAME_SIZE;
  const SEED_CROPS = [
    [17, 44, 126, 126],
    [151, 44, 125, 126],
    [284, 44, 126, 126],
  ];

  const context = canvas.getContext('2d', { alpha: false });
  let session = null;
  let seedFrames = [];
  let frames = [];
  let busy = false;
  let step = 0;
  let heldAction = null;
  let holdToken = 0;

  function setStatus(message) {
    status.textContent = message;
  }

  function setControlsEnabled(enabled) {
    actionButtons.forEach((button) => {
      button.disabled = !enabled;
    });
    resetButton.disabled = !enabled;
  }

  function syncResetButton() {
    resetButton.disabled = !session || busy || Boolean(heldAction);
  }

  function frameFromCanvas(sourceCanvas) {
    const pixels = sourceCanvas.getContext('2d').getImageData(
      0, 0, FRAME_SIZE, FRAME_SIZE,
    ).data;
    const frame = new Float32Array(FRAME_VALUES);
    const plane = FRAME_SIZE * FRAME_SIZE;
    for (let pixel = 0; pixel < plane; pixel += 1) {
      frame[pixel] = pixels[pixel * 4] / 127.5 - 1;
      frame[plane + pixel] = pixels[pixel * 4 + 1] / 127.5 - 1;
      frame[plane * 2 + pixel] = pixels[pixel * 4 + 2] / 127.5 - 1;
    }
    return frame;
  }

  function drawFrame(frame) {
    const image = context.createImageData(FRAME_SIZE, FRAME_SIZE);
    const plane = FRAME_SIZE * FRAME_SIZE;
    for (let pixel = 0; pixel < plane; pixel += 1) {
      image.data[pixel * 4] = Math.max(0, Math.min(255, (frame[pixel] + 1) * 127.5));
      image.data[pixel * 4 + 1] = Math.max(0, Math.min(255, (frame[plane + pixel] + 1) * 127.5));
      image.data[pixel * 4 + 2] = Math.max(0, Math.min(255, (frame[plane * 2 + pixel] + 1) * 127.5));
      image.data[pixel * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${url}`));
      image.src = url;
    });
  }

  async function loadSeedFrames() {
    if (seedFrames.length) return;
    const sheet = await loadImage(SEED_URL);
    seedFrames = SEED_CROPS.map(([x, y, width, height]) => {
      const buffer = document.createElement('canvas');
      buffer.width = FRAME_SIZE;
      buffer.height = FRAME_SIZE;
      const bufferContext = buffer.getContext('2d', { alpha: false });
      bufferContext.imageSmoothingEnabled = true;
      bufferContext.imageSmoothingQuality = 'high';
      bufferContext.drawImage(
        sheet, x, y, width, height, 0, 0, FRAME_SIZE, FRAME_SIZE,
      );
      return frameFromCanvas(buffer);
    });
  }

  async function reset() {
    await loadSeedFrames();
    frames = seedFrames.map((frame) => frame.slice());
    step = 0;
    stepLabel.textContent = 'seed context';
    drawFrame(frames[frames.length - 1]);
    if (session) setStatus('Ready for an action.');
  }

  function loadRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    const existing = document.querySelector('script[data-aag-ort]');
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(window.ort), { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${ORT_BASE}ort.min.js`;
      script.async = true;
      script.dataset.aagOrt = ORT_VERSION;
      script.onload = () => resolve(window.ort);
      script.onerror = () => reject(new Error('Could not load the browser inference runtime.'));
      document.head.appendChild(script);
    });
  }

  async function fetchModel() {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`Model download failed with ${response.status}`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) return new Uint8Array(await response.arrayBuffer());

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      setStatus(`Downloading model · ${Math.round(received / total * 100)}%`);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return bytes;
  }

  function gaussianNoise() {
    const values = new Float32Array(64);
    for (let index = 0; index < values.length; index += 2) {
      const u = Math.max(Number.EPSILON, Math.random());
      const v = Math.random();
      const radius = Math.sqrt(-2 * Math.log(u));
      values[index] = radius * Math.cos(2 * Math.PI * v);
      values[index + 1] = radius * Math.sin(2 * Math.PI * v);
    }
    return values;
  }

  async function loadModel() {
    if (busy || session) return;
    busy = true;
    loadButton.disabled = true;
    setStatus('Loading browser runtime...');
    try {
      const [runtime, modelBytes] = await Promise.all([loadRuntime(), fetchModel()]);
      runtime.env.wasm.numThreads = 1;
      runtime.env.wasm.wasmPaths = ORT_BASE;
      setStatus('Preparing model...');
      session = await runtime.InferenceSession.create(modelBytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      await reset();
      setControlsEnabled(true);
      loadButton.textContent = 'Model loaded';
    } catch (error) {
      session = null;
      loadButton.disabled = false;
      setStatus(`Could not load model: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  async function takeAction(actionIndex, actionName) {
    if (!session || busy) return false;
    busy = true;
    syncResetButton();
    setStatus(`Predicting ${actionName.toLowerCase()}...`);
    let completed = false;
    try {
      const stackedFrames = new Float32Array(frames.length * FRAME_VALUES);
      frames.forEach((frame, index) => stackedFrames.set(frame, index * FRAME_VALUES));
      const action = new Float32Array(18);
      action[actionIndex] = 1;
      const feeds = {
        frames: new window.ort.Tensor('float32', stackedFrames, [1, 3, 3, 64, 64]),
        noise: new window.ort.Tensor('float32', gaussianNoise(), [1, 64]),
        action: new window.ort.Tensor('float32', action, [1, 18]),
      };
      const output = await session.run(feeds);
      const nextFrame = new Float32Array(output.next_frame.data);
      frames = [frames[1], frames[2], nextFrame];
      step += 1;
      drawFrame(nextFrame);
      stepLabel.textContent = `step ${step}`;
      setStatus(`${actionName} · ready`);
      completed = true;
    } catch (error) {
      setStatus(`Prediction failed: ${error.message}`);
    } finally {
      busy = false;
      syncResetButton();
    }
    return completed;
  }

  function stopHeldAction() {
    holdToken += 1;
    heldAction = null;
    actionButtons.forEach((button) => button.classList.remove('is-held'));
    syncResetButton();
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function repeatHeldAction(button, token) {
    let firstCompleted = false;
    while (heldAction === button && token === holdToken) {
      const completed = await takeAction(
        Number(button.dataset.doomAction),
        button.dataset.doomName,
      );
      if (heldAction !== button || token !== holdToken) break;
      if (completed && !firstCompleted) {
        firstCompleted = true;
        await wait(260);
      } else {
        await wait(completed ? 55 : 35);
      }
    }
  }

  actionButtons.forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      if (!session || event.button !== 0) return;
      event.preventDefault();
      stopHeldAction();
      heldAction = button;
      syncResetButton();
      const token = holdToken;
      button.classList.add('is-held');
      if (typeof button.setPointerCapture === 'function') {
        button.setPointerCapture(event.pointerId);
      }
      repeatHeldAction(button, token);
    });
    button.addEventListener('click', (event) => {
      if (event.detail === 0) {
        takeAction(Number(button.dataset.doomAction), button.dataset.doomName);
      }
    });
  });
  window.addEventListener('pointerup', stopHeldAction);
  window.addEventListener('pointercancel', stopHeldAction);
  window.addEventListener('blur', stopHeldAction);
  loadButton.addEventListener('click', loadModel);
  resetButton.addEventListener('click', reset);
  reset().catch(() => setStatus('Preview unavailable. The model can still be loaded.'));
})();

(function initAagCelebaDemo() {
  const root = document.getElementById('aag-celeba-demo');
  const canvas = document.getElementById('aag-celeba-canvas');
  const loadButton = document.getElementById('aag-celeba-load');
  const sampleButton = document.getElementById('aag-celeba-sample');
  const status = document.getElementById('aag-celeba-status');
  const placeholder = document.getElementById('aag-celeba-placeholder');
  const fieldset = root ? root.querySelector('.aag-celeba-conditions') : null;
  const checkboxHost = document.getElementById('aag-celeba-checkboxes');
  if (!root || !canvas || !loadButton || !sampleButton || !status || !placeholder || !fieldset || !checkboxHost) return;

  const MODEL_URL = 'posts/aag/assets/celeba-browser/generator-cond.onnx';
  const ORT_VERSION = '1.24.1';
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const FACE_COUNT = 18;
  const FACE_COLUMNS = 6;
  const FACE_SIZE = 64;
  const FACE_PLANE = FACE_SIZE * FACE_SIZE;
  const FACE_VALUES = 3 * FACE_PLANE;
  const DEFAULT_FACE_SEEDS = [
    1975887587, 2380606041, 3745204751, 2129590463, 1367594244, 448088262,
    1929526248, 3874245998, 2126376399, 1258965489, 3703626157, 2603089353,
    2207234326, 2680225980, 3092199768, 2071319590, 4130305047, 3833760874,
  ];
  const ATTRIBUTES = [
    '5_o_Clock_Shadow', 'Arched_Eyebrows', 'Attractive', 'Bags_Under_Eyes',
    'Bald', 'Bangs', 'Big_Lips', 'Big_Nose', 'Black_Hair', 'Blond_Hair',
    'Blurry', 'Brown_Hair', 'Bushy_Eyebrows', 'Chubby', 'Double_Chin',
    'Eyeglasses', 'Goatee', 'Gray_Hair', 'Heavy_Makeup', 'High_Cheekbones',
    'Male', 'Mouth_Slightly_Open', 'Mustache', 'Narrow_Eyes', 'No_Beard',
    'Oval_Face', 'Pale_Skin', 'Pointy_Nose', 'Receding_Hairline',
    'Rosy_Cheeks', 'Sideburns', 'Smiling', 'Straight_Hair', 'Wavy_Hair',
    'Wearing_Earrings', 'Wearing_Hat', 'Wearing_Lipstick', 'Wearing_Necklace',
    'Wearing_Necktie', 'Young',
  ];
  const DEFAULT_ATTRIBUTES = new Set([
    'Male', 'Receding_Hairline',
  ]);
  const VISIBLE_ATTRIBUTES = [
    'Blond_Hair', 'Wearing_Hat', 'Black_Hair', 'Gray_Hair',
    'Bangs', 'Eyeglasses', 'Male', 'Receding_Hairline', 'Blurry',
  ];
  const context = canvas.getContext('2d', { alpha: false });
  let session = null;
  let faceSeeds = [...DEFAULT_FACE_SEEDS];
  let noise = gaussianNoiseFromSeeds(faceSeeds);
  let busy = false;
  let queued = false;

  logFaceSeeds();

  VISIBLE_ATTRIBUTES.forEach((name) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const text = document.createElement('span');
    input.type = 'checkbox';
    input.value = String(ATTRIBUTES.indexOf(name));
    input.checked = DEFAULT_ATTRIBUTES.has(name);
    text.textContent = name;
    label.append(input, text);
    checkboxHost.appendChild(label);
  });

  function setStatus(message) {
    status.textContent = message;
  }

  function syncControls() {
    loadButton.disabled = busy || Boolean(session);
    sampleButton.disabled = busy || !session;
    fieldset.disabled = !session;
  }

  function drawFaces(faces) {
    for (let faceIndex = 0; faceIndex < FACE_COUNT; faceIndex += 1) {
      const image = context.createImageData(FACE_SIZE, FACE_SIZE);
      const start = faceIndex * FACE_VALUES;
      for (let pixel = 0; pixel < FACE_PLANE; pixel += 1) {
        image.data[pixel * 4] = Math.max(0, Math.min(255, (faces[start + pixel] + 1) * 127.5));
        image.data[pixel * 4 + 1] = Math.max(0, Math.min(255, (faces[start + FACE_PLANE + pixel] + 1) * 127.5));
        image.data[pixel * 4 + 2] = Math.max(0, Math.min(255, (faces[start + FACE_PLANE * 2 + pixel] + 1) * 127.5));
        image.data[pixel * 4 + 3] = 255;
      }
      const row = Math.floor(faceIndex / FACE_COLUMNS);
      const column = faceIndex % FACE_COLUMNS;
      context.putImageData(image, column * FACE_SIZE, row * FACE_SIZE);
    }
    placeholder.hidden = true;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussianNoiseFromSeeds(seeds) {
    const values = new Float32Array(64 * seeds.length);
    seeds.forEach((seed, faceIndex) => {
      const random = seededRandom(seed);
      const offset = faceIndex * 64;
      for (let index = 0; index < 64; index += 2) {
        const u = Math.max(Number.EPSILON, random());
        const v = random();
        const radius = Math.sqrt(-2 * Math.log(u));
        values[offset + index] = radius * Math.cos(2 * Math.PI * v);
        values[offset + index + 1] = radius * Math.sin(2 * Math.PI * v);
      }
    });
    return values;
  }

  function freshFaceSeeds(count) {
    const values = new Uint32Array(count);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(values);
    } else {
      for (let index = 0; index < count; index += 1) {
        values[index] = Math.floor(Math.random() * 4294967296);
      }
    }
    return Array.from(values);
  }

  function logFaceSeeds() {
    console.info(`[AAG CelebA] face seeds = [${faceSeeds.join(', ')}]`);
  }

  function loadRuntime() {
    if (window.ort) return Promise.resolve(window.ort);
    const existing = document.querySelector('script[data-aag-ort]');
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(window.ort), { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${ORT_BASE}ort.min.js`;
      script.async = true;
      script.dataset.aagOrt = ORT_VERSION;
      script.onload = () => resolve(window.ort);
      script.onerror = () => reject(new Error('Could not load the browser inference runtime.'));
      document.head.appendChild(script);
    });
  }

  async function fetchModel() {
    const response = await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`Model download failed with ${response.status}`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) return new Uint8Array(await response.arrayBuffer());

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      setStatus(`Downloading model · ${Math.round(received / total * 100)}%`);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return bytes;
  }

  function selectedAttributes() {
    const single = new Float32Array(ATTRIBUTES.length);
    DEFAULT_ATTRIBUTES.forEach((name) => {
      single[ATTRIBUTES.indexOf(name)] = 1;
    });
    checkboxHost.querySelectorAll('input').forEach((input) => {
      single[Number(input.value)] = input.checked ? 1 : 0;
    });
    const values = new Float32Array(FACE_COUNT * ATTRIBUTES.length);
    for (let index = 0; index < FACE_COUNT; index += 1) {
      values.set(single, index * ATTRIBUTES.length);
    }
    return values;
  }

  async function generateFace() {
    if (!session) return;
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    syncControls();
    setStatus('Generating faces...');
    try {
      const output = await session.run({
        noise: new window.ort.Tensor('float32', noise, [FACE_COUNT, 64]),
        attributes: new window.ort.Tensor('float32', selectedAttributes(), [FACE_COUNT, 40]),
      });
      drawFaces(output.face.data);
      const selected = [...checkboxHost.querySelectorAll('input:checked')].length;
      setStatus(`${selected} shown conditions active · ready`);
    } catch (error) {
      setStatus(`Generation failed: ${error.message}`);
    } finally {
      busy = false;
      syncControls();
      if (queued) {
        queued = false;
        generateFace();
      }
    }
  }

  async function loadModel() {
    if (busy || session) return;
    busy = true;
    syncControls();
    setStatus('Loading browser runtime...');
    try {
      const [runtime, modelBytes] = await Promise.all([loadRuntime(), fetchModel()]);
      runtime.env.wasm.numThreads = 1;
      runtime.env.wasm.wasmPaths = ORT_BASE;
      setStatus('Preparing model...');
      session = await runtime.InferenceSession.create(modelBytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      loadButton.textContent = 'Model loaded';
      busy = false;
      syncControls();
      await generateFace();
    } catch (error) {
      session = null;
      busy = false;
      syncControls();
      setStatus(`Could not load model: ${error.message}`);
    }
  }

  checkboxHost.addEventListener('change', generateFace);
  sampleButton.addEventListener('click', () => {
    faceSeeds = freshFaceSeeds(FACE_COUNT);
    noise = gaussianNoiseFromSeeds(faceSeeds);
    logFaceSeeds();
    generateFace();
  });
  loadButton.addEventListener('click', loadModel);
  syncControls();
})();

(function initPostComments() {
  const host = document.getElementById('post-comments-thread');
  if (!host || host.querySelector('.utterances')) return;

  const script = document.createElement('script');
  script.src = 'https://utteranc.es/client.js';
  script.async = true;
  script.setAttribute('repo', 'the-puzzler/the-puzzler.github.io');
  script.setAttribute('issue-term', 'posts/aag/aag.html');
  script.setAttribute('label', 'comments');
  script.setAttribute('theme', 'github-light');
  script.setAttribute('crossorigin', 'anonymous');
  host.appendChild(script);
})();
