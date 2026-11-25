/* =========================================================
   family.js — generations, couples ("units") and layout
   - Generation: relative to Me. Parents' generation = 1 up,
     children = 1 down. Spouses / siblings share a generation.
     Shown as names ("Ma–Baba's generation"), never as numbers.
   - Unit: a married couple (or a single person). Children
     hang from the couple's unit, not from one parent.
   - Layout: rows by generation (older above), x spread so
     branches don't overlap. Used by the mind map and the
     Generations view.
   ========================================================= */
window.FT = window.FT || {};

FT.fam = (() => {
  /* ---------- Generation labels (no numbers shown to the user) ---------- */
  const GEN_LABELS = {
    3: ['Boro-Dadu–Didima\'s generation', 'বড়দাদু-দিদিমা'],
    2: ['Dadu–Didu\'s generation', 'দাদু-দিদিমা'],
    1: ['Ma–Baba\'s generation', 'মা-বাবা'],
    0: ['My generation', 'আমার প্রজন্ম'],
    '-1': ['Children\'s generation', 'ছেলে-মেয়ে'],
    '-2': ['Nati–Natni\'s generation', 'নাতি-নাতনি'],
  };
  // Plain-English labels for families that aren't (only) Bengali (v2: set by the app from "your own" heritage)
  const GEN_LABELS_EN = {
    3: ["Great-grandparents' generation", ''], 2: ["Grandparents' generation", ''], 1: ["Parents' generation", ''],
    0: ['My generation', ''], '-1': ["Children's generation", ''], '-2': ["Grandchildren's generation", ''],
  };
  function genLabel(g) {
    if (g === null || g === undefined) return { en: 'Generation unknown', bn: '' };
    if (FT.fam.labelCulture && FT.fam.labelCulture !== 'bengali') {
      const e = GEN_LABELS_EN[g]; if (e) return { en: e[0], bn: '' };
      const n = Math.abs(g) - 2;
      return g > 0 ? { en: `${n} generation${n > 1 ? 's' : ''} above grandparents`, bn: '' } : { en: `${n} generation${n > 1 ? 's' : ''} below grandchildren`, bn: '' };
    }
    const l = GEN_LABELS[g];
    if (l) return { en: l[0], bn: l[1] };
    const n = Math.abs(g) - 2;
    return g > 0 ? { en: `${n} generation${n > 1 ? 's' : ''} above Dadu–Didu`, bn: '' } : { en: `${n} generation${n > 1 ? 's' : ''} below Nati–Natni`, bn: '' };
  }

  /* ---------- Generations: BFS from a root over the kinship graph ---------- */
  const DG = { parent: 1, child: -1, spouse: 0, sibling: 0, friend: 0 }; // a friend is taken as the same generation
  function generations(rootId, adj) {
    const gen = new Map([[rootId, 0]]);
    const q = [rootId];
    while (q.length) {
      const cur = q.shift();
      for (const e of adj.get(cur) || []) {
        if (!gen.has(e.to)) { gen.set(e.to, gen.get(cur) + DG[e.step]); q.push(e.to); }
      }
    }
    return gen;
  }

  /* ---------- Degrees of separation: person-to-person steps from the center ---------- */
  // A married couple is one stop: Ma–Baba are 1 degree from me, Masi–Mesho 2, Mesho's parents 3.
  // The center person's own spouse is 1. Returns Map personId -> degree.
  function degrees(rootId, people, rels, adj) {
    const { units, unitOf } = buildUnits(people, rels);
    const ug = unitGraph(people, rels, unitOf, adj);
    const start = unitOf.get(rootId); const du = new Map([[start, 0]]); const q = [start];
    while (q.length) { const c = q.shift(); for (const to of (ug.get(c) || new Map()).keys()) if (!du.has(to)) { du.set(to, du.get(c) + 1); q.push(to); } }
    const d = new Map();
    du.forEach((n, u) => units.get(u).members.forEach((m) => d.set(m, m === rootId ? 0 : n || 1)));
    return d;
  }

  /* ---------- Birth decade: real if DOB known, otherwise estimated ---------- */
  function decade(person, gens, people) {
    const y = FT.kin.yearOf(person);
    if (y) return { text: `${Math.floor(y / 10) * 10}s`, approx: false };
    if (person.birthDecade) return { text: `${person.birthDecade}s`, approx: false };
    const g = gens.get(person.id);
    if (g === undefined) return null;
    // average birth year of people in the same generation who have one
    const yr = (p) => FT.kin.yearOf(p) || (p.birthDecade ? +p.birthDecade + 5 : null);
    const same = people.filter((p) => gens.get(p.id) === g && yr(p)).map(yr);
    let est = same.length ? same.reduce((a, b) => a + b, 0) / same.length : null;
    if (!est) {
      // otherwise step ~28 years per generation from anyone with a known year
      const ref = people.find((p) => gens.has(p.id) && yr(p));
      if (ref) est = yr(ref) - 28 * (g - gens.get(ref.id));
    }
    return est ? { text: `${Math.floor(est / 10) * 10}s`, approx: true } : null;
  }

  /* ---------- Units: couples share one unit ---------- */
  function buildUnits(people, rels) {
    const byId = new Map(people.map((p) => [p.id, p]));
    const spouses = new Map();
    rels.filter((r) => r.type === 'spouse_of' && byId.has(r.from) && byId.has(r.to)).forEach((r) => {
      (spouses.get(r.from) || spouses.set(r.from, []).get(r.from)).push({ id: r.to, rel: r });
      (spouses.get(r.to) || spouses.set(r.to, []).get(r.to)).push({ id: r.from, rel: r });
    });
    const unitOf = new Map(); const units = new Map();
    // people with exactly one spouse first, so remarried people pair with the right partner
    const order = [...people].sort((a, b) => (spouses.get(a.id) || []).length - (spouses.get(b.id) || []).length);
    order.forEach((p) => {
      if (unitOf.has(p.id)) return;
      const cands = (spouses.get(p.id) || []).filter((s) => !unitOf.has(s.id));
      const partner = cands.find((s) => (s.rel.status || 'married') !== 'separated') || cands[0];
      let members = partner ? [p.id, partner.id] : [p.id];
      // husband on the left, wife on the right (just a convention)
      if (members.length === 2 && byId.get(members[0]).gender === 'f' && byId.get(members[1]).gender !== 'f') members.reverse();
      const id = 'u:' + members.join('+');
      units.set(id, { id, members, rel: partner ? partner.rel : null });
      members.forEach((m) => unitOf.set(m, id));
    });
    return { units, unitOf, spouses };
  }

  /* ---------- Unit graph: parent / child / sibling / extra-spouse edges ---------- */
  function unitGraph(people, rels, unitOf, adj) {
    const g = new Map([...new Set(unitOf.values())].map((u) => [u, new Map()]));
    // one edge per pair of units; a family link always replaces a friend link between the same units
    const add = (a, b, kind, info) => {
      if (a === b || !g.has(a) || !g.has(b)) return;
      const cur = g.get(a).get(b);
      if (!cur || (cur.kind === 'friend' && kind !== 'friend')) g.get(a).set(b, { kind, ...info });
    };
    rels.forEach((r) => {
      const a = unitOf.get(r.from), b = unitOf.get(r.to);
      if (!a || !b) return;
      if (r.type === 'parent_of') { add(b, a, 'parent', { childId: r.to }); add(a, b, 'child', { childId: r.to }); }
      if (r.type === 'sibling_of') { add(a, b, 'sibling', { a: r.from, b: r.to }); add(b, a, 'sibling', { a: r.to, b: r.from }); }
      if (r.type === 'spouse_of' && a !== b) { add(a, b, 'spouse', { a: r.from, b: r.to }); add(b, a, 'spouse', { a: r.to, b: r.from }); }
      if (r.type === 'friend_of') { add(a, b, 'friend', { a: r.from, b: r.to }); add(b, a, 'friend', { a: r.to, b: r.from }); }
    });
    // siblings via shared parents (so siblings appear even before the parents are opened)
    people.forEach((p) => (adj.get(p.id) || []).filter((e) => e.step === 'sibling' && !e.rel).forEach((e) => {
      add(unitOf.get(p.id), unitOf.get(e.to), 'sibling', { a: p.id, b: e.to, derived: true });
    }));
    return g;
  }

  /* ---------- Generations layout (a tall tree) ----------
     One column per generation: youngest on the left, oldest on the right. Inside a column people
     stack top to bottom, and a couple is one above the other. Worked out in four steps (described
     along a column, called a "row" in the code since it is the same maths):
     1. Rows: one per generation. Family and friends are laid out separately; friends then sit
        below a divider.
     2. Families stay together: brothers and sisters form one block under their parents' couple
        (or, if the parents aren't shown, under their sibling bracket). A married couple sits in
        the block of the blood relative (else the partner closer to the center person); the other
        partner's family is pulled alongside and reaches them with a dashed line.
     3. Order: repeated top-down / bottom-up sweeps sort blocks by where their parents or
        children are, and keep the order with the fewest crossing lines.
     4. Spacing: each row is solved so people sit as close as possible to the middle of their
        parents and children without overlapping (pool-adjacent-violators). Couples flip sides
        so the partner whose family is shown faces that family. */
  const COL = 250;            // distance between generation columns
  const W1 = 100, W2 = 206;   // room a single person / a couple takes down the column (circles + names)
  const GAP = 10, FAMGAP = 34, HALF = 36; // gap inside a family block, between blocks; member offset in a couple

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  // Isotonic regression: closest non-decreasing sequence to vals (least squares)
  function pav(vals) {
    const st = [];
    vals.forEach((v) => {
      st.push({ s: v, n: 1 });
      while (st.length > 1 && st[st.length - 2].s / st[st.length - 2].n > st[st.length - 1].s / st[st.length - 1].n) {
        const b = st.pop(), a = st.pop(); st.push({ s: a.s + b.s, n: a.n + b.n });
      }
    });
    return st.flatMap((b) => Array(b.n).fill(b.s / b.n));
  }

  // visible: Set of unit ids. Returns positioned units, rows, member positions and the friends divider.
  function layout({ visible, ug, units, gens }, opts = {}) {
    const genOf = (u) => { for (const m of units.get(u).members) if (gens.has(m)) return gens.get(m); return 0; };
    const friendUnits = opts.friendUnits || new Set();
    const rankOf = opts.rankOf || (() => 0);
    const degOf = opts.degOf || (() => 0);
    const marriedIn = opts.marriedIn || (() => false);
    const pos = new Map();
    visible.forEach((id) => {
      const u = units.get(id), g = genOf(id);
      pos.set(id, { id, unit: u, gen: g, x: 0, w: u.members.length > 1 ? W2 : W1,
        layer: friendUnits.has(id) ? 'friend' : 'family', order: [...u.members] });
    });
    const memX = (p, m) => (p.order.length === 1 ? p.x : p.order[0] === m ? p.x - HALF : p.x + HALF);

    function arrange(list, initKey) {
      if (!list.length) return;
      const inSet = new Set(list.map((p) => p.id)), P = (id) => pos.get(id);
      // parent/child links between rows, and sibling links within a row
      const parentsOf = new Map(), kidsOf = new Map(), sib = new Map();
      list.forEach((p) => { for (const [to, e] of (ug.get(p.id) || new Map())) {
        if (!inSet.has(to)) continue;
        if (e.kind === 'parent' && P(to).gen === p.gen + 1) { push(parentsOf, p.id, { member: e.childId, pu: to }); push(kidsOf, to, { unit: p.id, member: e.childId }); }
        if (e.kind === 'sibling' && P(to).gen === p.gen) { push(sib, e.a, e.b); push(sib, e.b, e.a); }
      } });
      // each person's birth family: their parents' couple, else their group of siblings
      const parentKey = new Map();
      parentsOf.forEach((ps) => ps.forEach((o) => { if (!parentKey.has(o.member)) parentKey.set(o.member, 'P:' + o.pu); }));
      const famKey = new Map(), seen = new Set();
      list.forEach((p) => p.unit.members.forEach((m) => {
        if (seen.has(m) || !sib.has(m)) return;
        const comp = []; const q = [m]; seen.add(m);
        while (q.length) { const c = q.shift(); comp.push(c); (sib.get(c) || []).forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); }
        const k = comp.map((c) => parentKey.get(c)).find(Boolean) || 'S:' + comp.sort()[0];
        comp.forEach((c) => famKey.set(c, k));
      }));
      parentKey.forEach((k, m) => famKey.set(m, k)); // a person's own parents always win
      // a couple joins the block of the partner closer to the center person
      list.forEach((p) => {
        const c = p.unit.members.filter((m) => famKey.has(m))
          .sort((a, b) => marriedIn(a) - marriedIn(b) || (famKey.get(a)[0] === 'P' ? 0 : 1) - (famKey.get(b)[0] === 'P' ? 0 : 1) || degOf(a) - degOf(b));
        p.anchor = c[0] || null; p.block = c[0] ? famKey.get(c[0]) : 'U:' + p.id;
        const o = c.find((m) => m !== p.anchor && famKey.get(m) !== p.block);
        p.other = o || null; p.otherKey = o ? famKey.get(o) : null;
      });
      const rowsBy = new Map(); list.forEach((p) => push(rowsBy, p.gen, p));
      const gensDesc = [...rowsBy.keys()].sort((a, b) => b - a);
      const rows = gensDesc.map((g) => rowsBy.get(g));
      const inBlock = new Map(); list.forEach((p) => push(inBlock, p.block, p));
      const keyX = (k) => (k[0] === 'P' ? P(k.slice(2)).x : mean(inBlock.get(k).map((p) => p.x)));
      const parentX = (p) => (p.block[0] === 'P' ? P(p.block.slice(2)).x : null);
      const kidsX = (p) => (kidsOf.has(p.id) ? mean(kidsOf.get(p.id).map((o) => memX(P(o.unit), o.member))) : null);

      // place a row (already in order) as close as possible to the targets, without overlaps
      const gapBefore = (row, i) => (row[i - 1].w + row[i].w) / 2 + (row[i - 1].block === row[i].block ? GAP : FAMGAP);
      function solve(row, target) {
        const off = [0]; for (let i = 1; i < row.length; i++) off.push(off[i - 1] + gapBefore(row, i));
        const y = pav(row.map((p, i) => target[i] - off[i]));
        row.forEach((p, i) => (p.x = y[i] + off[i]));
      }
      // targets that keep a sibling block centered under its parents
      function slotTargets(row, centerOf) {
        const t = row.map((p) => p.x);
        let i = 0;
        while (i < row.length) {
          let j = i; while (j + 1 < row.length && row[j + 1].block === row[i].block) j++;
          const c = centerOf(row[i], i, j);
          if (c !== null) {
            let w = 0; for (let k = i + 1; k <= j; k++) w += gapBefore(row, k);
            let x = c - w / 2; for (let k = i; k <= j; k++) { if (k > i) x += gapBefore(row, k); t[k] = x; }
          }
          i = j + 1;
        }
        return t;
      }
      // couples: the partner whose family is shown faces it; otherwise the married-in partner sits on the outside
      function flip() {
        list.forEach((p) => {
          if (p.order.length < 2 || !p.anchor) return;
          let anchorLeft;
          if (p.otherKey) anchorLeft = keyX(p.block) <= keyX(p.otherKey);
          else if (inBlock.get(p.block).length > 1) anchorLeft = p.x >= keyX(p.block);
          else return;
          const o = p.unit.members.find((m) => m !== p.anchor);
          p.order = anchorLeft ? [p.anchor, o] : [o, p.anchor];
        });
      }
      function crossings() {
        let n = 0;
        rows.forEach((row) => {
          const es = [];
          row.forEach((p) => (kidsOf.get(p.id) || []).forEach((o) => es.push([p.x, memX(P(o.unit), o.member)])));
          for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) n++;
        });
        return n;
      }

      // initial order: by side (Baba's side left, Ma's side right), then the given key
      const initial = () => rows.forEach((row) => { row.sort((a, b) => initKey(a) - initKey(b) || a.id.localeCompare(b.id)); solve(row, row.map(() => 0)); });
      // extra starting points: the same rows with families shuffled (seeded, so the layout is stable)
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const shuffled = () => rows.forEach((row) => {
        const blocks = new Map(); row.forEach((p) => push(blocks, p.block, p));
        const ks = [...blocks.keys()]; for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; }
        row.splice(0, row.length, ...ks.flatMap((k) => blocks.get(k))); solve(row, row.map(() => 0));
      });
      // ordering sweeps
      function reorder(row, dir) {
        const t = new Map(row.map((p) => { const px = parentX(p), kx = kidsX(p); return [p.id, dir === 'down' ? (px ?? kx ?? p.x) : (kx ?? px ?? p.x)]; }));
        const blocks = new Map(); row.forEach((p) => push(blocks, p.block, p));
        const bt = new Map([...blocks].map(([k, ps]) => [k, dir === 'down' && k[0] === 'P' ? keyX(k) : mean(ps.map((p) => t.get(p.id)))]));
        const inner = (p) => (p.otherKey ? keyX(p.otherKey) : kidsX(p) ?? p.x);
        const sorted = [...blocks.keys()].sort((a, b) => bt.get(a) - bt.get(b) || mean(blocks.get(a).map((p) => p.x)) - mean(blocks.get(b).map((p) => p.x)));
        row.splice(0, row.length, ...sorted.flatMap((k) => blocks.get(k).sort((a, b) => inner(a) - inner(b) || a.x - b.x)));
        solve(row, row.map((p) => t.get(p.id)));
      }
      const snap = () => ({ orders: rows.map((r) => r.map((p) => p.id)), flips: list.map((p) => [p.id, [...p.order]]), xs: list.map((p) => [p.id, p.x]) });
      let best = null, bestN = Infinity;
      // ordering sweeps from the side-based start, then a few shuffled starts; keep the fewest crossings
      // (ties go to the side-based start, so Baba's side stays left and Ma's side right when it makes no difference)
      for (let start = 0; start < 8 && bestN; start++) {
        if (start) shuffled(); else initial();
        for (let it = 0; it < 8; it++) {
          rows.forEach((row, i) => i && reorder(row, 'down'));
          flip();
          [...rows].reverse().forEach((row, i) => i && reorder(row, 'up'));
          flip();
          const n = crossings();
          if (n < bestN) { bestN = n; best = snap(); }
          if (!n) break;
        }
      }
      rows.forEach((row, i) => row.splice(0, row.length, ...best.orders[i].map(P)));
      best.flips.forEach(([id, o]) => (P(id).order = o));
      best.xs.forEach(([id, x]) => (P(id).x = x));
      // polish: swap neighbouring families (and neighbouring siblings) whenever that removes crossings
      if (bestN) {
        const idx = new Map();
        const reindex = () => rows.forEach((row) => row.forEach((p, i) => idx.set(p.id, i)));
        const ordX = (p, m) => idx.get(p.id) + (p.order.length === 1 ? 0 : p.order[0] === m ? -0.25 : 0.25);
        const count = () => {
          let n = 0;
          rows.forEach((row) => {
            const es = []; row.forEach((p) => (kidsOf.get(p.id) || []).forEach((o) => es.push([idx.get(p.id), ordX(P(o.unit), o.member)])));
            for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) n++;
          });
          return n;
        };
        reindex(); let cur = count();
        for (let pass = 0; pass < 4 && cur; pass++) {
          let improved = false;
          rows.forEach((row) => {
            // runs of the row: whole family blocks, then single units inside each block
            const runs = []; let i = 0;
            while (i < row.length) { let j = i; while (j + 1 < row.length && row[j + 1].block === row[i].block) j++; runs.push([i, j]); i = j + 1; }
            const trySwap = (a0, a1, b0, b1) => {
              const before = row.slice();
              row.splice(a0, b1 - a0 + 1, ...row.slice(b0, b1 + 1), ...row.slice(a0, a1 + 1));
              reindex(); const n = count();
              if (n < cur) { cur = n; improved = true; return true; }
              row.splice(0, row.length, ...before); reindex(); return false;
            };
            for (let k = 0; k + 1 < runs.length; k++) {
              const [a0, a1] = runs[k], [b0, b1] = runs[k + 1];
              if (trySwap(a0, a1, b0, b1)) { const la = a1 - a0, lb = b1 - b0; runs[k] = [a0, a0 + lb]; runs[k + 1] = [a0 + lb + 1, a0 + lb + 1 + la]; }
            }
            runs.forEach(([a0, a1]) => { for (let k = a0; k < a1; k++) trySwap(k, k, k + 1, k + 1); });
          });
          if (!improved) break;
        }
        rows.forEach((row) => solve(row, row.map((p) => p.x)));
        bestN = cur;
      }

      // spacing: pull everyone toward the middle of their parents and their children
      const both = (row) => {
        const s = slotTargets(row, (p) => parentX(p));
        return row.map((p, i) => { const k = kidsX(p), hasP = parentX(p) !== null;
          return hasP && k !== null ? (s[i] + k) / 2 : hasP ? s[i] : k !== null ? k : p.x; });
      };
      for (let it = 0; it < 12; it++) {
        rows.forEach((row) => solve(row, both(row)));
        [...rows].reverse().forEach((row) => solve(row, both(row)));
        flip();
      }
      // finish: children right under their parents, then parents without shown parents centered over their children
      rows.forEach((row) => solve(row, slotTargets(row, (p) => parentX(p))));
      [...rows].reverse().forEach((row) => solve(row, row.map((p) => (parentX(p) === null && kidsX(p) !== null ? kidsX(p) : p.x))));
      flip();
      return bestN;
    }

    const famList = [...pos.values()].filter((p) => p.layer === 'family');
    const frList = [...pos.values()].filter((p) => p.layer === 'friend');
    const crossings = arrange(famList, (p) => rankOf(p.id));
    // friends: start each friend near the family member they know, so the dashed links stay short
    const contactX = (p) => {
      const xs = []; for (const [to, e] of (ug.get(p.id) || new Map())) if (e.kind === 'friend' && pos.has(to) && pos.get(to).layer === 'family') xs.push(pos.get(to).x);
      return xs.length ? mean(xs) : 1e6;
    };
    arrange(frList, contactX);
    // close up empty stretches: wherever no column has anyone for more than MAXGAP, pull everything
    // below it up (keeps every line and alignment, just shorter). Family and friends separately.
    const MAXGAP = 70;
    const squeeze = (list) => {
      if (list.length < 2) return;
      const iv = list.map((p) => [p.x - p.w / 2, p.x + p.w / 2]).sort((a, b) => a[0] - b[0]);
      const cuts = []; let end = iv[0][1];
      iv.slice(1).forEach(([a, b]) => { if (a - end > MAXGAP) cuts.push([end, a - end - MAXGAP]); end = Math.max(end, b); });
      if (!cuts.length) return;
      list.forEach((p) => { let d = 0; cuts.forEach(([at, by]) => { if (p.x > at) d += by; }); p.x -= d; });
    };
    squeeze(famList); squeeze(frList);
    let split = null;
    if (famList.length && frList.length) {
      const famMax = Math.max(...famList.map((p) => p.x + p.w / 2)), frMin = Math.min(...frList.map((p) => p.x - p.w / 2));
      const shift = famMax + 120 - frMin;
      frList.forEach((p) => (p.x += shift));
      split = famMax + 60;
    }
    // turn it on its side: generation → column (x), position along the column → y
    const memberPos = new Map();
    pos.forEach((p) => p.order.forEach((m, i) => memberPos.set(m, { x: p.gen * COL, y: memX(p, m), unit: p.id, top: p.order.length > 1 && i === 0 })));
    pos.forEach((p) => { p.y = p.x; p.x = p.gen * COL; });
    const rows = new Map(); // generation -> units
    pos.forEach((p) => push(rows, p.gen, p));
    return { pos, rows, memberPos, splitY: split, crossings };
  }

  return { genLabel, generations, degrees, decade, buildUnits, unitGraph, layout, COL };
})();
