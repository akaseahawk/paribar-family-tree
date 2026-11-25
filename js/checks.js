/* =========================================================
   checks.js — "Needs attention" + "How are we related?"
   Needs attention looks for problems that make the map look
   wrong even though the app is doing what the data says:
     1. couples who share a child but aren't linked as married
     2. people with more than two parents
     3. possible duplicates (same name, or same phone number)
     4. a term you use that points to a different generation
     5. gender not set (terms then show "Mama / Mami")
     6. people not connected to you (grouped by family branch)
     7. auto-created placeholders that still need details
     8. notes left by your last import (e.g. names it couldn't match)
   Each item has one-tap fixes. "Dismiss" remembers your choice.
   ========================================================= */
window.FT = window.FT || {};

FT.checks = (() => {
  const A = () => FT.app; // the app's shared helpers (set in app.js before boot)
  // step + gender -> word ("parent" + f = "mother"); unknown gender keeps the neutral word
  const GW = { parent: { f: 'mother', m: 'father' }, child: { f: 'daughter', m: 'son' }, sibling: { f: 'sister', m: 'brother' }, spouse: { f: 'wife', m: 'husband' } };
  const GEN_STEP = { mother: 1, father: 1, parent: 1, son: -1, daughter: -1, child: -1 }; // others (sibling, spouse) = 0
  const genOfPath = (words) => words.reduce((g, w) => g + (GEN_STEP[w] || 0), 0);
  const short = (p) => (p ? p.nickname || p.name : '?');

  // ---------- 1. Find issues ----------
  function issues() {
    const { S, describe } = A();
    const out = [];
    const dismissed = new Set(S.meta.dismissed || []);
    const add = (it) => { if (!dismissed.has(it.key)) out.push(it); };
    const parentsOf = new Map();
    S.relationships.filter((r) => r.type === 'parent_of').forEach((r) => (parentsOf.get(r.to) || parentsOf.set(r.to, new Set()).get(r.to)).add(r.from));
    const married = (a, b) => S.relationships.some((r) => r.type === 'spouse_of' && ((r.from === a && r.to === b) || (r.from === b && r.to === a)));

    // 1 + 2. parents
    const seenCouple = new Set();
    parentsOf.forEach((set, child) => {
      const ps = [...set].filter((id) => S.byId.has(id));
      if (ps.length > 2) add({ key: `parents3:${child}`, kind: 'parents', title: `${short(S.byId.get(child))} has ${ps.length} parents`,
        body: 'Someone was linked as a parent by mistake. Open the card and remove the extra parent link.', people: [child, ...ps], actions: [{ label: 'Open card', act: 'open', id: child }] });
      if (ps.length === 2 && !married(ps[0], ps[1])) {
        const k = `couple:${[...ps].sort().join('+')}`; if (seenCouple.has(k)) return; seenCouple.add(k);
        add({ key: k, kind: 'couple', title: `${short(S.byId.get(ps[0]))} and ${short(S.byId.get(ps[1]))} aren't linked as married`,
          body: `They share a child (${short(S.byId.get(child))}). Linking them shows them as a couple with one family line.`, people: ps,
          actions: [{ label: 'Mark as married', act: 'marry', a: ps[0], b: ps[1] }, { label: 'Not married', act: 'dismiss' }] });
      }
    });

    // 3. duplicates (scored in dupes.js: spellings, nicknames, phone, email, birth date)
    FT.dupes.pairs(S.people, S.relationships, dismissed).forEach((x) => add({ key: x.key, kind: 'dup',
      title: `${x.level === 'likely' ? 'Likely' : 'Possibly'} the same person: ${short(x.a)} and ${short(x.b)}`,
      body: `Why: ${x.reasons.join(', ')}.`, people: [x.a.id, x.b.id],
      actions: [{ label: 'Compare & merge', act: 'compare', a: x.a.id, b: x.b.id }, { label: 'Different people', act: 'dismiss' }] }));

    // 4. a term you use that points to another generation (courtesy terms like "Dadu" for any elder of that generation are fine)
    S.people.forEach((p) => {
      if (!p.calledTerm || !S.gens.has(p.id) || p.id === S.meta.meId) return;
      const opts = FT.kin.termOptions(p.calledTerm); const one = FT.kin.termToPath(p.calledTerm);
      const paths = opts.length ? opts : one && one.length ? [one] : [];
      if (!paths.length) return; // not a term the app knows: nothing to compare
      const g = S.gens.get(p.id);
      if (paths.some((w) => genOfPath(w) === g)) return;
      const d = describe(p.id);
      add({ key: `term:${p.id}:${p.calledTerm}`, kind: 'term', title: `"${p.calledTerm}" for ${short(p)}: generation doesn't match`,
        body: `That term is for ${FT.fam.genLabel(genOfPath(paths[0])).en.toLowerCase()}, but the links put ${short(p)} in ${d.genLabel.en.toLowerCase()} (${d.en}). Either the term or a link is off.`,
        people: [p.id], actions: [{ label: 'Open card', act: 'open', id: p.id }, { label: "It's right", act: 'dismiss' }] });
    });

    // 5. gender not set (only matters for people connected to you)
    S.people.filter((p) => p.id !== S.meta.meId && S.paths.has(p.id) && (!p.gender || p.gender === 'x')).forEach((p) =>
      add({ key: `gender:${p.id}`, kind: 'gender', title: `Gender not set for ${short(p)}`, body: 'Bengali terms depend on it (Mama vs Mami).', people: [p.id],
        actions: [{ label: 'Female', act: 'gender', id: p.id, g: 'f' }, { label: 'Male', act: 'gender', id: p.id, g: 'm' }] }));

    // 6. not connected to you: one item per separate branch
    const loose = S.people.filter((p) => p.id !== S.meta.meId && !S.paths.has(p.id));
    const done = new Set();
    loose.forEach((p) => {
      if (done.has(p.id)) return;
      const comp = []; const q = [p.id]; done.add(p.id);
      while (q.length) { const c = q.shift(); comp.push(c); (S.adj.get(c) || []).forEach((e) => { if (!done.has(e.to)) { done.add(e.to); q.push(e.to); } }); }
      add({ key: `island:${[...comp].sort().join('+')}`, kind: 'island',
        title: comp.length > 1 ? `Not connected to you: a group of ${comp.length}` : `${short(p)} isn't connected to you`,
        body: 'Open one card and use "Link to someone already saved" to attach this branch to the family.', people: comp,
        actions: [...comp.slice(0, 4).map((id) => ({ label: `Open ${short(S.byId.get(id))}`, act: 'open', id })), { label: 'Leave for now', act: 'dismiss' }] });
    });

    // 7. placeholders
    S.people.filter((p) => p.placeholder).forEach((p) => add({ key: `ph:${p.id}`, kind: 'placeholder', title: `Add details for ${short(p)}`,
      body: 'Created automatically to connect people. Add a real name when you know it.', people: [p.id], actions: [{ label: 'Edit', act: 'edit', id: p.id }, { label: 'Dismiss', act: 'dismiss' }] }));

    // 8. notes from the last import
    const iw = S.meta.importWarnings;
    if (iw && iw.items && iw.items.length) out.push({ key: 'importWarnings', kind: 'import', title: `Notes from your last import (${iw.items.length})`,
      body: `<ul class="fix-notes">${iw.items.map((w) => `<li>${A().esc(w)}</li>`).join('')}</ul>`, html: true, people: [],
      actions: [{ label: 'Clear these notes', act: 'clearImport' }] });
    return out;
  }

  // ---------- 2. Render the list ----------
  function render(el) {
    const { S, esc, avatar } = A();
    const list = issues();
    el.innerHTML = list.length ? `<p class="hint">${list.length} thing${list.length > 1 ? 's' : ''} to look at. Fixing these makes the map and the Bengali terms more accurate.</p>
      <ul class="fix-list">${list.map((it, i) => `<li class="fix-item kind-${it.kind}" data-i="${i}">
        <b class="fix-title">${esc(it.title)}</b>
        <div class="fix-body">${it.html ? it.body : esc(it.body)}</div>
        ${it.people.length ? `<div class="fix-people">${it.people.slice(0, 8).map((id) => S.byId.get(id)).filter(Boolean).map((p) => `<button class="fix-chip" data-open="${p.id}">${avatar(p, 'sm')}<span>${esc(short(p))}</span></button>`).join('')}${it.people.length > 8 ? `<span class="hint">+${it.people.length - 8} more</span>` : ''}</div>` : ''}
        <div class="fix-actions">${it.actions.map((a, j) => `<button class="btn small${j === 0 ? ' primary' : ''}" data-j="${j}">${esc(a.label)}</button>`).join('')}</div>
      </li>`).join('')}</ul>`
      : '<div class="empty"><p class="lede">Nothing needs attention right now.</p><p class="hint">This list checks for missing marriage links, duplicates, people not connected to you, and terms that don\'t match the links.</p></div>';
    el.onclick = async (e) => {
      const chip = e.target.closest('[data-open]'); if (chip) { A().openSheet(chip.dataset.open); return; }
      const b = e.target.closest('[data-j]'); if (!b) return;
      const it = list[+b.closest('[data-i]').dataset.i]; await act(it, it.actions[+b.dataset.j]);
    };
    return list.length;
  }

  // ---------- 3. Fixes ----------
  async function act(it, a) {
    const app = A(); const { S } = app;
    switch (a.act) {
      case 'open': app.openSheet(a.id); return;
      case 'edit': app.openForm({ editId: a.id }); return;
      case 'dismiss': await app.setMeta('dismissed', [...new Set([...(S.meta.dismissed || []), it.key])]); break;
      case 'clearImport': await app.setMeta('importWarnings', null); break;
      case 'marry': {
        const r = { id: app.uid(), type: 'spouse_of', from: a.a, to: a.b, status: 'married', createdAt: new Date().toISOString() };
        S.relationships.push(r); await app.saveRel(r); app.toast('Linked as married'); break;
      }
      case 'gender': { const p = S.byId.get(a.id); p.gender = a.g; await app.savePerson(p); break; }
      case 'compare': FT.dupes.openCompare(S.byId.get(a.a), S.byId.get(a.b)); return;
    }
    app.recompute(); app.refresh();
  }

  // Merge two entries into one: keep's details win, blanks are filled from drop, links and visits move over
  // choices = { field: true } where the merged-in person's value should win (from the compare screen)
  async function merge(keepId, dropId, { choices = {} } = {}) {
    const app = A(); const { S } = app;
    const keep = { ...S.byId.get(keepId) }, drop = S.byId.get(dropId);
    if (drop.isMe && !keep.isMe) return merge(dropId, keepId, { choices: {} }); // your own entry is always the one kept
    if (!await app.ask(`Merge ${short(drop)} into ${short(keep)}? The details you picked stay, empty fields are filled in, and photos, links and visits move over. This can't be undone (unless you have a backup).`, { ok: 'Merge' })) return false;
    Object.entries(drop).forEach(([k, v]) => {
      if (['id', 'createdAt', 'isMe'].includes(k) || FT.io.isBlank(v)) return;
      if (k === 'photos') keep.photos = [...new Set([...(keep.photos || []), ...v])];
      else if (k === 'notes' && keep.notes && keep.notes !== v) keep.notes = `${keep.notes}\n${v}`;
      else if (choices[k] || FT.io.isBlank(keep[k]) || (k === 'gender' && keep.gender === 'x')) keep[k] = v;
    });
    if (choices.dob) { keep.dob = drop.dob || ''; keep.birthYear = drop.birthYear || ''; keep.birthDecade = drop.birthDecade || ''; } // born travels as one value
    keep.placeholder = !!(keep.placeholder && drop.placeholder);
    if (drop.isMe) keep.isMe = true; // merging into/away from "me" keeps you as the center
    const swap = (id) => (id === dropId ? keepId : id);
    const sig = (r) => (r.type === 'parent_of' ? `${r.type}:${r.from}>${r.to}` : `${r.type}:${[r.from, r.to].sort().join('+')}`);
    const seen = new Set(); const rels = [];
    S.relationships.forEach((r0) => {
      const r = { ...r0, from: swap(r0.from), to: swap(r0.to) };
      if (r.from === r.to || seen.has(sig(r))) return; // self-links and duplicates disappear
      seen.add(sig(r)); rels.push(r);
    });
    const visits = (S.visits || []).map((v) => ({ ...v, peopleIds: [...new Set((v.peopleIds || []).map(swap))] }));
    const people = S.people.filter((p) => p.id !== dropId).map((p) => (p.id === keepId ? keep : p));
    const meta = { ...S.meta, meId: swap(S.meta.meId) };
    await FT.db.replaceAll({ people, relationships: rels, meta, visits });
    Object.assign(S, { people, relationships: rels, meta, visits });
    app.toast('Merged'); return true;
  }

  // ---------- 4. How are we related? ----------
  // [{ id, word }] from Me to the person, e.g. [{Ma, mother}, {Lina, sister}, {Mesho, husband}]
  function chain(id) {
    const { S } = A();
    const steps = S.paths.get(id); if (!steps) return null;
    return steps.map((s) => ({ id: s.id, word: s.step === 'friend' ? s.kind || 'friend' : (GW[s.step] || {})[(S.byId.get(s.id) || {}).gender] || s.step }));
  }
  // "your mother's sister's husband"
  // friend steps in the middle carry the name: "your friend Priya's colleague"
  const sentence = (c) => 'your ' + c.map((x, i) => (x.word && FT.kin.FRIEND_KINDS[x.word] && i < c.length - 1 ? `${x.word} ${short(A().S.byId.get(x.id)).split(' ')[0]}` : x.word)).join("'s ");
  function pathHtml(id) {
    const { S, esc, describe } = A();
    if (id === S.meta.meId) return '';
    const c = chain(id);
    if (!c) return '<div class="rel-path"><span class="rl-kind">How you\'re related</span><p class="hint">Not connected to you yet. See People › Needs attention.</p></div>';
    const chip = (pid, word) => { const p = S.byId.get(pid); const d = describe(pid); const t = d.called || d.bnScript || '';
      return `<button class="path-chip" data-open="${pid}"><b>${esc(short(p))}</b>${word ? `<small>${esc(word)}</small>` : ''}${t && t !== short(p) ? `<small lang="bn">${esc(t)}</small>` : ''}</button>`; };
    return `<div class="rel-path"><span class="rl-kind">How you're related · ${c.length} step${c.length > 1 ? 's' : ''}</span>
      <p class="path-sentence">${esc(short(S.byId.get(id)))} is ${esc(sentence(c))}.</p>
      <div class="path-chips">${chip(S.meta.meId, 'you')}${c.map((x) => `<span class="path-arrow" aria-hidden="true">→</span>${chip(x.id, x.word)}`).join('')}</div>
      <div class="row-btns"><button class="btn small" type="button" data-act="showpath">Show this path on the map</button>
      <button class="btn small" type="button" data-act="showfamily">Their family + path</button></div></div>`;
  }
  const pathIds = (id) => { const c = chain(id); return c ? [A().S.meta.meId, ...c.map((x) => x.id)] : []; };

  return { issues, render, merge, chain, sentence, pathHtml, pathIds };
})();
