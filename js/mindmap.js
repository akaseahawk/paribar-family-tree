/* =========================================================
   mindmap.js — the family map, two ways (D3)
   mode 'mind': Circles view (degrees of separation). The center person sits in the
                middle; faint rings mark degrees of separation
                ("1 degree from me", "2 degrees" …). Couples are
                one joined unit; children branch out from them.
                Friend links (dashed, blue) count as one degree.
   mode 'gen' : Generations view — a tall family tree on its side.
                One column per generation: youngest on the left,
                oldest on the right. Each couple (one above the
                other) reaches its children through its own bar.
                Friends get their own block below a divider, in
                the same generation columns, with dashed links.
   Both: a "Degrees" dropdown limits how far out to show.
   ========================================================= */
window.FT = window.FT || {};

FT.mindmap = (() => {
  let svg, gRoot, zoom, onPick, lastMembers = new Map(), lastGeo = null, pickTimer = null;
  // a tap on a person opens their card a moment later, so a double-tap can zoom instead
  const pickSoon = (id) => { clearTimeout(pickTimer); pickTimer = setTimeout(() => onPick && onPick(id), 260); };
  const cancelPick = () => clearTimeout(pickTimer);
  const SIDE_COLOR = {
    me: 'var(--ink)', maternal: 'var(--maternal)', paternal: 'var(--paternal)',
    inlaw: 'var(--inlaw)', close: 'var(--close)', unlinked: 'var(--muted)', friend: 'var(--friend)',
  };

  function init(container, pickHandler) {
    onPick = pickHandler;
    svg = d3.select(container).append('svg').attr('class', 'mm-svg').attr('role', 'img').attr('aria-label', 'Family map');
    svg.append('defs').append('clipPath').attr('id', 'mm-clip').attr('clipPathUnits', 'objectBoundingBox')
      .append('circle').attr('cx', 0.5).attr('cy', 0.5).attr('r', 0.5);
    gRoot = svg.append('g');
    zoom = d3.zoom().scaleExtent([0.2, 3]).on('zoom', (e) => gRoot.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.pick', cancelPick); // mouse: drag to pan, wheel or double-click to zoom
    touchGestures(container);
  }

  /* ---------- Phone gestures, like Google Maps ----------
     Pinch and one-finger drag come from d3-zoom. Added here:
     - double-tap: zoom in where you tapped
     - double-tap and hold, or tap and hold still (~½ s), then slide: up zooms in, down zooms out
     - two-finger tap: zoom out
     Listens on the container in the capture phase, so it sees each touch before d3-zoom and can keep
     d3 from panning while a slide-to-zoom is going on. */
  function touchGestures(el) {
    const opt = { capture: true, passive: false };
    let mode = null;          // null | 'maybe' (one finger down) | 'pan' | 'second' (second tap of a double-tap) | 'zoom'
    let lastTap = 0, lastXY = null, startY = 0, startK = 1, anchor = null, hold = null, two = null;
    const at = (t) => { const r = el.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
    const stop = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', (e) => {
      clearTimeout(hold);
      if (e.touches.length === 2) { mode = null; two = { t: Date.now(), xy: [...e.touches].map(at) }; return; }
      if (e.touches.length !== 1) { mode = null; return; }
      const p = at(e.touches[0]);
      anchor = p; startY = p[1]; startK = d3.zoomTransform(svg.node()).k;
      if (Date.now() - lastTap < 320 && lastXY && Math.hypot(p[0] - lastXY[0], p[1] - lastXY[1]) < 40) { mode = 'second'; cancelPick(); stop(e); return; } // d3 never sees this touch
      mode = 'maybe';
      hold = setTimeout(() => { if (mode === 'maybe') { mode = 'zoom'; if (navigator.vibrate) navigator.vibrate(12); } }, 450);
    }, opt);
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1 || !mode) return;
      const p = at(e.touches[0]);
      if (mode === 'maybe' && Math.hypot(p[0] - anchor[0], p[1] - anchor[1]) > 8) { clearTimeout(hold); mode = 'pan'; } // a normal drag
      if (mode === 'second' && Math.abs(p[1] - startY) > 6) mode = 'zoom';
      if (mode === 'zoom') { stop(e); zoom.scaleTo(svg, startK * Math.pow(2, (startY - p[1]) / 110), anchor); }
      else if (mode === 'second') stop(e);
    }, opt);
    el.addEventListener('touchend', (e) => {
      clearTimeout(hold);
      if (two && !e.touches.length) { // two fingers came down and up quickly without moving: zoom out
        const moved = [...e.changedTouches].some((t) => two.xy.every((q) => Math.hypot(at(t)[0] - q[0], at(t)[1] - q[1]) > 12));
        if (Date.now() - two.t < 280 && !moved) svg.transition().duration(250).call(zoom.scaleBy, 0.5);
        two = null;
      }
      if (mode === 'second') { stop(e); svg.transition().duration(250).call(zoom.scaleBy, 2, anchor); lastTap = 0; } // plain double-tap
      else if (mode === 'zoom') { if (e.cancelable) e.preventDefault(); lastTap = 0; } // let d3 see the finger lift; no click after
      else if (mode === 'maybe') { lastTap = Date.now(); lastXY = anchor; }
      if (!e.touches.length) mode = null;
    }, opt);
    el.addEventListener('touchcancel', () => { clearTimeout(hold); mode = null; two = null; }, opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault()); // no "save image" pop-up when holding on a photo
  }

  // Which units to show: any unit with a member within `depth` steps of the center person
  function visibleUnits(focusUnit, ug, units, deg, depth) {
    const seen = new Set([focusUnit]); const q = [focusUnit];
    while (q.length) { const c = q.shift(); for (const to of (ug.get(c) || new Map()).keys()) if (!seen.has(to)) { seen.add(to); q.push(to); } }
    return new Set([...seen].filter((u) => units.get(u).members.some((m) => deg.has(m) && deg.get(m) <= depth)));
  }

  /* ---------- Radial layout for the mind map ----------
     Breadth-first tree from the center unit, so a unit's ring = its degree.
     d3.tree spreads angles; each ring's radius grows until neighbours don't overlap. */
  const RING = 150, GAPR = 20;
  function radialLayout({ visible, focusUnit, ug, units }) {
    const ORDER = { parent: 0, spouse: 1, sibling: 2, child: 3, friend: 4 };
    const root = { id: focusUnit, children: [] }; const seen = new Set([focusUnit]); const q = [root];
    while (q.length) {
      const n = q.shift();
      [...(ug.get(n.id) || new Map()).entries()].filter(([to]) => visible.has(to) && !seen.has(to))
        .sort((a, b) => ORDER[a[1].kind] - ORDER[b[1].kind])
        .forEach(([to, e]) => { seen.add(to); const c = { id: to, children: [], from: n.id, e }; n.children.push(c); q.push(c); });
    }
    const h = d3.hierarchy(root);
    d3.tree().size([2 * Math.PI, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(h);
    const width = (u) => (units.get(u).members.length > 1 ? 176 : 104);
    // smallest radius per ring that keeps neighbouring units apart
    const byDepth = new Map();
    h.descendants().forEach((d) => d.depth && (byDepth.get(d.depth) || byDepth.set(d.depth, []).get(d.depth)).push(d));
    const radius = new Map([[0, 0]]); let prev = 0;
    [...byDepth.keys()].sort((a, b) => a - b).forEach((dep) => {
      const list = byDepth.get(dep).sort((a, b) => a.x - b.x);
      let need = RING * 0.9;
      list.forEach((n, i) => {
        const nx = list[(i + 1) % list.length];
        let gap = (nx.x - n.x + 2 * Math.PI) % (2 * Math.PI); if (list.length === 1) gap = 2 * Math.PI;
        need = Math.max(need, ((width(n.data.id) + width(nx.data.id)) / 2 + GAPR) / Math.max(gap, 0.05));
      });
      const rad = Math.min(Math.max(prev + RING, need), prev + RING * 3.2);
      radius.set(dep, rad); prev = rad;
    });
    const pos = new Map();
    h.descendants().forEach((d) => {
      const rad = radius.get(d.depth), u = units.get(d.data.id);
      pos.set(d.data.id, { id: d.data.id, a: d.x, r: rad, depth: d.depth, x: rad * Math.sin(d.x), y: -rad * Math.cos(d.x), w: width(d.data.id), unit: u });
    });
    const memberPos = new Map();
    pos.forEach((p) => {
      const ms = p.unit.members;
      if (ms.length === 1) memberPos.set(ms[0], { x: p.x, y: p.y, unit: p.id });
      else { memberPos.set(ms[0], { x: p.x - 40, y: p.y, unit: p.id }); memberPos.set(ms[1], { x: p.x + 40, y: p.y, unit: p.id }); }
    });
    const tree = h.descendants().filter((d) => d.depth).map((d) => ({ from: d.data.from, to: d.data.id, e: d.data.e }));
    return { pos, memberPos, radius, tree };
  }

  // Which person on each end a unit-to-unit edge should touch
  function ends(e) {
    if (e.kind === 'child') return [null, e.childId];   // from the couple to that child
    if (e.kind === 'parent') return [e.childId, null];  // from the child up to the couple
    return [e.a, e.b];
  }

  function render({ mode = 'mind', focusId, people, rels, adj, byId, describe, gens, depth = 4, focusName = 'me', fit = true }) {
    if (!svg) return;
    gRoot.selectAll('*').remove();
    if (!focusId || !byId.get(focusId)) return;
    const { units, unitOf } = FT.fam.buildUnits(people, rels);
    const ug = FT.fam.unitGraph(people, rels, unitOf, adj);
    const focusUnit = unitOf.get(focusId);
    const deg = FT.fam.degrees(focusId, people, rels, adj);
    const visible = visibleUnits(focusUnit, ug, units, deg, depth);
    const R = (id) => (id === focusId ? 28 : 24);
    let pos, rows, memberPos, radius, tree, splitY;
    // a unit is in the friends layer when everyone in it is (a friend married to a cousin counts as family)
    const friendUnits = new Set([...units.values()].filter((u) => u.members.every((m) => describe(m).side === 'friend')).map((u) => u.id));
    // Generations: Baba's side starts at the top, Ma's side below it, in-laws after that
    const SIDE_RANK = { paternal: 0, me: 1, close: 1, maternal: 2, inlaw: 3, unlinked: 4, friend: 5 };
    const rankOf = (u) => Math.min(...units.get(u).members.map((m) => SIDE_RANK[describe(m).side] ?? 4));
    const degOf = (m) => (deg.has(m) ? deg.get(m) : 99);
    // married-in partners (the path to them ends in husband/wife) rank after blood relatives
    const marriedIn = (m) => ['husband', 'wife', 'spouse'].includes((describe(m).words || []).slice(-1)[0]);
    if (mode === 'gen') ({ pos, rows, memberPos, splitY } = FT.fam.layout({ visible, ug, units, gens }, { friendUnits, rankOf, degOf, marriedIn }));
    else ({ pos, memberPos, radius, tree } = radialLayout({ visible, focusUnit, ug, units }));
    const guides = gRoot.append('g').attr('class', 'mm-guides');

    /* --- mind map: degree rings, each labelled in the emptiest gap of that ring --- */
    if (mode !== 'gen') radius.forEach((rad, d) => {
      if (!d) return;
      guides.append('circle').attr('class', 'mm-degring').attr('r', rad);
      const angles = [...pos.values()].filter((p) => p.depth === d).map((p) => ((p.a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
      let best = Math.PI, gap = -1;
      angles.forEach((a, i) => { const nx = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI; if (nx - a > gap) { gap = nx - a; best = (a + nx) / 2; } });
      const t = guides.append('text').attr('class', 'mm-deglabel').attr('text-anchor', 'middle')
        .attr('x', rad * Math.sin(best)).attr('y', -rad * Math.cos(best) + 4);
      t.text(`${d} step${d > 1 ? 's' : ''} from ${focusName}`);
    });

    /* --- generations: one column each (youngest left, oldest right), labelled at the top --- */
    const COL = FT.fam.COL;
    let topY = 0, bottomY = 0;
    if (mode === 'gen') {
      const ys = [...memberPos.values()].map((m) => m.y);
      topY = Math.min(...ys) - 130; bottomY = Math.max(...ys) + 80;
      [...rows.keys()].forEach((g) => {
        const x = g * COL, l = FT.fam.genLabel(g);
        guides.append('line').attr('x1', x).attr('x2', x).attr('y1', topY + 40).attr('y2', bottomY);
        const t = guides.append('text').attr('class', 'mm-gen-head').attr('x', x).attr('y', topY);
        t.append('tspan').attr('class', 'mm-gen-en').attr('x', x).text(l.en);
        if (l.bn) t.append('tspan').attr('class', 'mm-gen-bn').attr('x', x).attr('dy', '1.35em').text(l.bn);
      });
    }

    /* --- links --- */
    const links = gRoot.append('g').attr('class', 'mm-links');
    const done = new Set();
    const childGroups = new Map(); // parentUnit -> [childMemberId]
    pos.forEach((p) => {
      for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!visible.has(to)) continue;
        if (e.kind === 'child') (childGroups.get(p.id) || childGroups.set(p.id, []).get(p.id)).push(e.childId);
      }
    });
    const childOfVisibleParent = new Set([...childGroups.values()].flat());
    const sideOf = (id) => SIDE_COLOR[describe(id).side] || 'var(--muted)';

    /* --- Generations: family bars ---------------------------------------------------------
       Every family hangs off one bar in the gap to the right of the children's column:
       - parents' couple → bar → each child (solid)
       - a brother/sister linked only as a sibling of those children (their own parent links are
         missing): a dashed stub off the same bar, so they still read as one family
       - brothers & sisters whose parents aren't added: the same kind of bar, meeting at a small "?"
       - a child who married into another family on screen sits with that family; their own parents
         reach them with a separate dashed curve instead of stretching the bar across the tree
       The geometry is kept (geo) so a highlighted path can be drawn as one route along these lines. */
    const geo = { bars: new Map(), barOfParent: new Map(), barsOfKid: new Map(), away: new Map(), friend: new Map(), spouse2: new Map() };
    if (mode === 'gen') {
      const ownBlock = (pu, k) => { const u = pos.get(memberPos.get(k).unit); return !u.block || u.block === 'P:' + pu || u.anchor === k; };
      const into = (k) => memberPos.get(k).x + R(k) + 4;
      const bars = [];
      childGroups.forEach((kids, pu) => {
        const P = pos.get(pu);
        const uniq = [...new Set(kids)].filter((k) => memberPos.has(k) && memberPos.get(k).x < P.x);
        if (!uniq.length) return;
        const start = P.unit.members.length > 1 ? P.x - 4 : P.x - R(P.unit.members[0]) - 4;
        uniq.filter((k) => !ownBlock(pu, k)).forEach((k) => { const K = memberPos.get(k), end = into(k);
          geo.away.set(pu + '|' + k, `M${start},${P.y}C${start - 90},${P.y} ${end + 90},${K.y} ${end},${K.y}`); });
        const main = uniq.filter((k) => ownBlock(pu, k));
        const inferred = [...pos.values()].filter((u) => u.block === 'P:' + pu && u.anchor && !uniq.includes(u.anchor) && memberPos.get(u.anchor).x < P.x).map((u) => u.anchor);
        if (main.length || inferred.length) bars.push({ key: 'P:' + pu, pu, px: P.x, py: P.y, start, kids: main, dashed: inferred });
      });
      const sibBlocks = new Map();
      pos.forEach((u) => { if (u.block && u.block[0] === 'S' && u.anchor) (sibBlocks.get(u.block) || sibBlocks.set(u.block, []).get(u.block)).push(u.anchor); });
      sibBlocks.forEach((ms, key) => {
        const xs = new Set(ms.map((m) => memberPos.get(m).x)); if (ms.length < 2 || xs.size > 1) return;
        const ys = ms.map((m) => memberPos.get(m).y);
        bars.push({ key, pu: null, px: [...xs][0] + COL, py: (Math.min(...ys) + Math.max(...ys)) / 2, start: null, kids: ms, dashed: [] });
      });
      // bars in the same gap that would overlap get their own lane
      const byCol = new Map();
      bars.forEach((b) => { const ys = [...b.kids, ...b.dashed].map((k) => memberPos.get(k).y); b.y0 = Math.min(b.py, ...ys); b.y1 = Math.max(b.py, ...ys); (byCol.get(b.px) || byCol.set(b.px, []).get(b.px)).push(b); });
      byCol.forEach((list) => { const ends = []; list.sort((a, b) => a.y0 - b.y0).forEach((b) => {
        let i = ends.findIndex((r) => r < b.y0 - 14); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = b.y1; b.lane = i % 5; }); });
      bars.forEach((b) => {
        b.xMid = b.px - 92 - b.lane * 14; // past the parents' names, before the children's
        const all = [...b.kids, ...b.dashed];
        const g = links.append('g').attr('class', 'mm-fam').attr('data-a', b.pu ? pos.get(b.pu).unit.members.join(' ') : all.join(' ')).attr('data-b', all.join(' '));
        const d = [b.start !== null ? `M${b.start},${b.py}H${b.xMid}` : '', `M${b.xMid},${b.y0}V${b.y1}`, ...b.kids.map((k) => `M${b.xMid},${memberPos.get(k).y}H${into(k)}`)].join('');
        g.append('path').attr('class', 'mm-tree').attr('d', d);
        if (b.dashed.length) g.append('path').attr('class', 'mm-tree is-inferred').attr('d', b.dashed.map((k) => `M${b.xMid},${memberPos.get(k).y}H${into(k)}`).join(''))
          .append('title').text("Linked as a brother/sister here; their own parents aren't linked yet");
        if (b.pu) g.append('circle').attr('class', 'mm-junction').attr('cx', b.xMid).attr('cy', b.py).attr('r', 3.5);
        else {
          const q = g.append('g').attr('class', 'mm-noparents').attr('transform', `translate(${b.xMid},${b.py})`);
          q.append('circle').attr('r', 9); q.append('text').attr('dy', '0.35em').text('?');
          q.append('title').text("Brothers & sisters. Their parents aren't added yet");
        }
        geo.bars.set(b.key, { xMid: b.xMid, py: b.py, start: b.start, pu: b.pu, kids: new Set(all) });
        if (b.pu) geo.barOfParent.set(b.pu, b.key);
        all.forEach((k) => (geo.barsOfKid.get(k) || geo.barsOfKid.set(k, []).get(k)).push(b.key));
      });
      geo.away.forEach((d, key) => {
        const [pu, kid] = key.split('|');
        links.append('g').attr('class', 'mm-fam').attr('data-a', pos.get(pu).unit.members.join(' ')).attr('data-b', kid)
          .append('path').attr('class', 'mm-tree is-away').attr('d', d).append('title').text('Their own parents (they sit with the family they married into)');
      });
    }
    if (mode !== 'gen') {
      const pt = (unitId, personId) => (personId && memberPos.get(personId)) || pos.get(unitId);
      // out from A to a circle between the two rings, along that circle, then out to B
      const curve = (A, B) => {
        const rp = Math.hypot(A.x, A.y), rc = Math.hypot(B.x, B.y);
        if (rp < 1) return `M${A.x},${A.y}L${B.x},${B.y}`;           // from the center: straight spoke
        const rm = rp + (rc - rp) * 0.55;
        const ap = Math.atan2(A.x, -A.y), ac = Math.atan2(B.x, -B.y);
        let da = ac - ap; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const P1 = [rm * Math.sin(ap), -rm * Math.cos(ap)], P2 = [rm * Math.sin(ac), -rm * Math.cos(ac)];
        const big = Math.abs(da) > Math.PI ? 1 : 0, sweep = da > 0 ? 1 : 0;
        return `M${A.x},${A.y}L${P1}A${rm},${rm} 0 ${big} ${sweep} ${P2}L${B.x},${B.y}`;
      };
      const onTree = new Set();
      // 1) branches: center outward, one per unit
      tree.forEach(({ from, to, e }) => {
        onTree.add(from + '>' + to); onTree.add(to + '>' + from);
        const [a, b] = ends(e); const A = pt(from, a), B = pt(to, b);
        const who = b || pos.get(to).unit.members[0];
        links.append('path').attr('class', 'mm-link' + (e.kind === 'sibling' ? ' is-sib' : e.kind === 'friend' ? ' is-friend' : '')).attr('stroke', e.kind === 'friend' ? SIDE_COLOR.friend : sideOf(who)).attr('d', curve(A, B))
          .attr('data-a', a || pos.get(from).unit.members.join(' ')).attr('data-b', b || pos.get(to).unit.members.join(' '));
      });
      // 2) other true links between visible units (e.g. Masi is also Dadu–Didu's child): faint
      pos.forEach((p) => { for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!pos.has(to) || onTree.has(p.id + '>' + to) || e.derived || e.kind === 'parent') continue;
        onTree.add(p.id + '>' + to); onTree.add(to + '>' + p.id);
        const [a, b] = ends(e);
        links.append('path').attr('class', 'mm-xlink').attr('d', `M${pt(p.id, a).x},${pt(p.id, a).y}L${pt(to, b).x},${pt(to, b).y}`)
          .attr('data-a', a || p.unit.members.join(' ')).attr('data-b', b || pos.get(to).unit.members.join(' '));
      } });
    }
    // brothers & sisters not already joined by a family bar (e.g. in different columns): a dashed bracket
    const shareBar = (a, b) => (geo.barsOfKid.get(a) || []).some((k) => (geo.barsOfKid.get(b) || []).includes(k));
    if (mode === 'gen') pos.forEach((p) => {
      for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!visible.has(to) || e.kind !== 'sibling') continue;
        const k = [e.a, e.b].sort().join('|');
        if (done.has(k) || shareBar(e.a, e.b) || (childOfVisibleParent.has(e.a) && childOfVisibleParent.has(e.b))) continue;
        done.add(k);
        const A = memberPos.get(e.a), B = memberPos.get(e.b);
        if (!A || !B) continue;
        const out = Math.max(A.x, B.x) + 82;
        const d = `M${A.x + R(e.a) + 4},${A.y}H${out}V${B.y}H${B.x + R(e.b) + 4}`;
        geo.sib = geo.sib || new Map(); geo.sib.set(k, d);
        links.append('path').attr('class', 'mm-sib').attr('stroke', sideOf(e.b)).attr('data-a', e.a).attr('data-b', e.b).attr('d', d);
      }
    });
    // Generations: dashed friend links (bowed out to the right) + a divider above the friends block
    if (mode === 'gen') {
      const fdone = new Set();
      pos.forEach((p) => { for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!visible.has(to) || e.kind !== 'friend') continue;
        const k = [e.a, e.b].sort().join('|'); if (fdone.has(k)) continue; fdone.add(k);
        const A = memberPos.get(e.a), B = memberPos.get(e.b); if (!A || !B) continue;
        const bow = Math.max(A.x, B.x) + 60 + Math.min(70, Math.abs(B.y - A.y) * 0.05);
        const d = `M${A.x + R(e.a)},${A.y}C${bow},${A.y} ${bow},${B.y} ${B.x + R(e.b)},${B.y}`;
        geo.friend.set(k, d);
        links.append('path').attr('class', 'mm-friendlink').attr('data-a', e.a).attr('data-b', e.b).attr('d', d);
      } });
      if (splitY !== null) {
        const cx = [...pos.values()].map((p) => p.x);
        guides.append('line').attr('class', 'mm-split').attr('x1', Math.min(...cx) - 110).attr('x2', Math.max(...cx) + 110).attr('y1', splitY).attr('y2', splitY);
        guides.append('text').attr('class', 'mm-split-label').attr('x', Math.min(...cx) - 110).attr('y', splitY + 22).text('Friends · বন্ধু');
      }
    }
    // a second marriage (person already paired in another unit)
    if (mode === 'gen') pos.forEach((p) => {
      for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!visible.has(to) || e.kind !== 'spouse') continue;
        const k = 's' + [e.a, e.b].sort().join('|'); if (done.has(k)) continue; done.add(k);
        const A = memberPos.get(e.a), B = memberPos.get(e.b); if (!A || !B) continue;
        const d = `M${A.x},${A.y}Q${(A.x + B.x) / 2 + 70},${(A.y + B.y) / 2} ${B.x},${B.y}`;
        geo.spouse2.set([e.a, e.b].sort().join('|'), d);
        links.append('path').attr('class', 'mm-spouse2').attr('data-a', e.a).attr('data-b', e.b).attr('d', d);
      }
    });

    /* --- units: couples joined, singles alone --- */
    const unitG = gRoot.append('g').selectAll('g').data([...pos.values()]).join('g')
      .attr('class', 'mm-unit').attr('transform', (p) => `translate(${p.x},${p.y})`);
    // couple joiner: double line + interlocking rings (side by side on the Separation map, one above the other in Generations)
    unitG.filter((p) => p.unit.members.length === 2).each(function (p) {
      const g = d3.select(this);
      const status = (p.unit.rel && p.unit.rel.status) || 'married';
      const sep = status === 'separated';
      g.append('path').attr('class', 'mm-wed' + (sep ? ' is-sep' : '')).attr('d', mode === 'gen' ? 'M-3,-10V10M3,-10V10' : 'M-14,-3H14M-14,3H14');
      const rings = g.append('g').attr('class', 'mm-rings' + (sep ? ' is-sep' : '')).attr('transform', mode === 'gen' ? 'translate(24,0)' : `translate(0,${-22})`);
      rings.append('circle').attr('cx', sep ? -6 : -3.5).attr('r', 5.5);
      rings.append('circle').attr('cx', sep ? 6 : 3.5).attr('r', 5.5);
      if (sep) rings.append('path').attr('d', 'M-3,6L3,-6');
      g.append('title').text(sep ? 'Separated' : status === 'widowed' ? 'Married (widowed)' : 'Married');
    });

    // members
    const members = [];
    pos.forEach((p) => p.unit.members.forEach((m) => members.push({ id: m, ...memberPos.get(m), couple: p.unit.members.length === 2 })));
    const node = gRoot.append('g').selectAll('g').data(members).join('g')
      .attr('class', (d) => 'mm-node' + (d.id === focusId ? ' is-focus' : ''))
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .attr('data-id', (d) => d.id).attr('tabindex', 0).attr('role', 'button').attr('aria-label', (d) => byId.get(d.id).name)
      .on('click', (e, d) => pickSoon(d.id))
      .on('keydown', (e, d) => { if (e.key === 'Enter') onPick && onPick(d.id); });
    node.append('circle').attr('class', (d) => 'mm-ring' + (byId.get(d.id).deceased ? ' is-late' : '')).attr('r', (d) => R(d.id) + 3)
      .attr('stroke', (d) => sideOf(d.id));
    node.append('circle').attr('class', 'mm-dot').attr('r', (d) => R(d.id));
    node.filter((d) => !(byId.get(d.id).photos || []).length).append('text').attr('class', 'mm-initials').attr('dy', '0.35em')
      .text((d) => initials(byId.get(d.id).name));
    node.filter((d) => (byId.get(d.id).photos || []).length).append('image').attr('clip-path', 'url(#mm-clip)')
      .attr('href', (d) => byId.get(d.id).photos[0])
      .attr('x', (d) => -R(d.id)).attr('y', (d) => -R(d.id)).attr('width', (d) => 2 * R(d.id)).attr('height', (d) => 2 * R(d.id))
      .attr('preserveAspectRatio', 'xMidYMid slice');
    node.filter((d) => (byId.get(d.id).notes || '').trim()).append('circle').attr('class', 'mm-notedot').attr('r', 5.5)
      .attr('cx', (d) => R(d.id) * 0.72).attr('cy', (d) => -R(d.id) * 0.72);
    // names under the circle; in Generations the upper partner of a couple has them above, so the gap between the two stays clear
    const label = node.append('g').attr('transform', (d) => `translate(0,${mode === 'gen' && d.top ? -R(d.id) - 22 : R(d.id) + 16})`);
    label.append('text').attr('class', 'mm-name').text((d) => (byId.get(d.id).deceased ? 'Late ' : '') + shortName(byId.get(d.id), d.couple ? 11 : 16));
    label.append('text').attr('class', 'mm-term').attr('dy', '1.25em').text((d) => {
      const r = describe(d.id); const t = r.called || (r.bnScript ? [r.bnScript, r.bn].filter(Boolean).join(' · ') : r.en);
      const max = d.couple ? 14 : 22; return t.length > max ? t.slice(0, max - 1) + '…' : t;
    });

    lastMembers = memberPos; lastGeo = mode === 'gen' ? geo : null;
    if (fit && mode === 'gen') fitWidth(focusId); else if (fit) fitView(focusId); else allowFullZoomOut();
  }

  // Light up some people and fade everything else; null clears it.
  // route (Generations only): [[a, b, step], …] drawn as one continuous line along the tree, e.g. Me → Ma → Lina,
  // instead of lighting whole family bars (which would also light Ma's other brothers and sisters).
  function highlight(ids, route) {
    const on = new Set(ids || []);
    const hits = (attr) => String(attr || '').split(' ').some((x) => on.has(x));
    const useRoute = !!(route && route.length && lastGeo);
    svg.classed('has-path', on.size > 0).classed('has-route', useRoute);
    gRoot.selectAll('.mm-node').classed('is-path', function () { return on.has(this.dataset.id); });
    gRoot.selectAll('[data-a]').classed('is-path', function () { return !useRoute && on.size > 0 && hits(this.dataset.a) && hits(this.dataset.b); });
    gRoot.selectAll('.mm-route').remove();
    if (useRoute) {
      const g = gRoot.select('.mm-links').append('g').attr('class', 'mm-route');
      route.forEach(([a, b, step]) => [].concat(routeD(a, b, step) || []).forEach((d) => g.append('path').attr('d', d)));
    }
  }
  // The line(s) between two people in the Generations view, following the drawn tree
  function routeD(a, b, step) {
    const A = lastMembers.get(a), B = lastMembers.get(b); if (!A || !B) return null;
    const G = lastGeo, key = [a, b].sort().join('|');
    const into = (m) => lastMembers.get(m).x + 28;
    // child up to their parents' couple (along the family bar, or the dashed curve for someone who married into another family)
    const upTo = (kid, pu) => {
      const K = lastMembers.get(kid), bar = G.bars.get(G.barOfParent.get(pu));
      if (bar && bar.kids.has(kid)) return `M${into(kid)},${K.y}H${bar.xMid}V${bar.py}H${bar.start}`;
      return G.away.get(pu + '|' + kid) || null;
    };
    const parentUnits = (kid) => [...(G.barsOfKid.get(kid) || []).filter((k) => k[0] === 'P').map((k) => k.slice(2)),
      ...[...G.away.keys()].filter((k) => k.endsWith('|' + kid)).map((k) => k.split('|')[0])];
    if (A.unit === B.unit) return `M${A.x},${A.y}L${B.x},${B.y}`;           // husband & wife: the joiner between them
    if (step === 'parent' || step === 'child') {
      const [par, kid] = step === 'parent' ? [b, a] : [a, b];
      const P = lastMembers.get(par), d = upTo(kid, P.unit);
      if (d) return d + ` L${P.x},${P.y}`; // …then into the parent's own circle
    }
    if (step === 'sibling') {
      const k = (G.barsOfKid.get(a) || []).find((x) => (G.barsOfKid.get(b) || []).includes(x));
      if (k) { const bar = G.bars.get(k); return `M${into(a)},${A.y}H${bar.xMid}V${B.y}H${into(b)}`; }
      // not on one bar (one of them sits with the family they married into): both lines up to the shared parents
      const pu = parentUnits(a).find((u) => parentUnits(b).includes(u));
      if (pu) return [upTo(a, pu), upTo(b, pu)];
      if (G.sib && G.sib.has(key)) return G.sib.get(key);
    }
    if (step === 'friend' && G.friend.has(key)) return G.friend.get(key);
    if (step === 'spouse' && G.spouse2.has(key)) return G.spouse2.get(key);
    return `M${A.x},${A.y}L${B.x},${B.y}`; // anything else: straight
  }
  const isShown = (id) => lastMembers.has(id);
  // Smoothly pan/zoom so one person sits in the middle of the screen
  function zoomTo(id, k = 1.1) {
    const m = lastMembers.get(id); if (!m) return false;
    const el = svg.node(); const W = el.clientWidth || 360, H = el.clientHeight || 520;
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - m.x * k, H * 0.42 - m.y * k).scale(k));
    gRoot.selectAll('.mm-node').classed('is-found', function () { return this.dataset.id === id; });
    return true;
  }
  const svgNode = () => svg.node();

  // Room taken by the Find row at the top and the map buttons at the bottom (two rows on phones)
  function reserved() {
    const c = svg.node().getBoundingClientRect();
    const find = document.querySelector('.map-find'), tools = document.querySelector('.map-tools');
    const legend = document.querySelector('.view-map.key-open .map-legend');
    let top = 96, bottom = 70;
    if (find && find.offsetHeight) top = Math.max(top, find.getBoundingClientRect().bottom - c.top + 12);
    if (legend && legend.offsetHeight) top = Math.max(top, legend.getBoundingClientRect().bottom - c.top + 8);
    if (tools && tools.offsetHeight) bottom = Math.max(bottom, c.bottom - tools.getBoundingClientRect().top + 12);
    return { top, bottom };
  }
  // Zoom so a box (map coordinates) fills the screen; zooming out is allowed at least that far
  function fitBox(x0, y0, x1, y1) {
    const el = svg.node(); const W = el.clientWidth || 360, H = el.clientHeight || 520;
    const pad = 20, { top, bottom } = reserved(); // room for the search box, legend and map buttons
    const k = Math.min(1.1, (W - pad * 2) / Math.max(1, x1 - x0), (H - top - bottom) / Math.max(1, y1 - y0));
    zoom.scaleExtent([Math.min(0.2, k * 0.6), 3]);
    const t = d3.zoomIdentity.translate(W / 2 - ((x0 + x1) / 2) * k, top + (H - top - bottom) / 2 - ((y0 + y1) / 2) * k).scale(k);
    svg.transition().duration(400).call(zoom.transform, t);
  }
  // Fit everything, unless that makes names too small to read: then start zoomed in on the focus person
  // (pinch out to see everyone)
  const MIN_READABLE = 0.72; // 12.5px names stay at ~9px or more
  function fitView(focusId) {
    const bb = gRoot.node().getBBox(); if (!bb.width) return;
    const el = svg.node(); const W = el.clientWidth || 360, H = el.clientHeight || 520;
    const { top, bottom } = reserved();
    const k = Math.min(1.1, (W - 40) / bb.width, (H - top - bottom) / bb.height);
    const m = focusId && lastMembers.get(focusId);
    if (k < MIN_READABLE && m) {
      zoom.scaleExtent([Math.min(0.2, k * 0.6), 3]);
      svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - m.x * MIN_READABLE, top + (H - top - bottom) / 2 - m.y * MIN_READABLE).scale(MIN_READABLE));
      return;
    }
    fitBox(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
  }
  // The tall Generations tree: fill the screen width (readable), centered down the page on one person
  function fitWidth(id) {
    const el = svg.node(), bb = gRoot.node().getBBox(); if (!bb.width) return;
    const W = el.clientWidth || 360, H = el.clientHeight || 520, { top, bottom } = reserved();
    if (bb.height * Math.min(1.1, (W - 40) / bb.width) <= H - top - bottom) { fitView(); return; } // it all fits anyway
    const k = Math.min(1.1, (W - 40) / bb.width);
    const m = lastMembers.get(id);
    const cy = m ? m.y : bb.y + (H - top - bottom) / 2 / k;
    allowFullZoomOut();
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - (bb.x + bb.width / 2) * k, top + (H - top - bottom) / 2 - cy * k).scale(k));
  }
  // Box around some people (with room for their names), or null if none are on screen
  function boxOf(ids) {
    const ms = (ids || []).map((id) => lastMembers.get(id)).filter(Boolean);
    if (!ms.length) return null;
    const xs = ms.map((m) => m.x), ys = ms.map((m) => m.y);
    const box = { x0: Math.min(...xs) - 90, y0: Math.min(...ys) - 80, x1: Math.max(...xs) + 90, y1: Math.max(...ys) + 70 };
    const r = gRoot.select('.mm-route').node(); // a highlighted route can run out to a family bar: keep all of it in
    if (r) { const b = r.getBBox(); if (b.width || b.height) Object.assign(box, { x0: Math.min(box.x0, b.x - 20), y0: Math.min(box.y0, b.y - 20), x1: Math.max(box.x1, b.x + b.width + 20), y1: Math.max(box.y1, b.y + b.height + 20) }); }
    return box;
  }
  function fitTo(ids) { const b = boxOf(ids); if (!b) return false; fitBox(b.x0, b.y0, b.x1, b.y1); return true; }
  // after a redraw without fitting: still let the user zoom out far enough to see everything
  function allowFullZoomOut() {
    const el = svg.node(), bb = gRoot.node().getBBox(); if (!bb.width) return;
    const k = Math.min((el.clientWidth || 360) / bb.width, ((el.clientHeight || 520) - 166) / bb.height);
    zoom.scaleExtent([Math.min(0.2, k * 0.6), 3]);
  }

  function initials(name = '') {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  }
  function shortName(p, max = 16) {
    const n = p.nickname || p.name || '';
    return n.length > max ? n.slice(0, max - 1) + '…' : n;
  }

  return { init, render, fitView, fitTo, boxOf, initials, highlight, zoomTo, isShown, svgNode };
})();
