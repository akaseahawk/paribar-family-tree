/* =========================================================
   dupes.js — Find and merge duplicate people
   Scores every pair of people and explains why they might be
   the same person:
     - same name, or the same name spelled differently
       (Sunita / Suneeta, Das / Dash, Pranab / Pronab)
     - one's nickname is the other's name
     - same phone (could be a household number), same email
     - same birth date
   Rules that say "definitely different": different gender,
   different full birth dates, or already linked to each other
   (parent, child, spouse, sibling).
   Scores: 0.8+ = likely duplicate, 0.5–0.8 = possible duplicate.
   ========================================================= */
window.FT = window.FT || {};

FT.dupes = (() => {
  const A = () => FT.app;
  const LIKELY = 0.8, POSSIBLE = 0.5;
  const TITLES = /\b(mr|mrs|ms|dr|smt|sri|shri|shree|late|prof)\b\.?/g;

  // Lower-case, no accents/punctuation/titles
  const clean = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(TITLES, ' ').replace(/\s+/g, ' ').trim();
  // Sound-alike key for Bengali names written in English: sh/s, bh/b, v/b, ee/i, oo/u, o/a, double letters…
  const sound = (w) => w.replace(/chh/g, 'ch').replace(/sh/g, 's').replace(/([bdgkpt])h/g, '$1')
    .replace(/v/g, 'b').replace(/w/g, 'b').replace(/ee|ii|y$/g, 'i').replace(/oo|uu/g, 'u').replace(/ou|au/g, 'o')
    .replace(/aa/g, 'a').replace(/o/g, 'a').replace(/z/g, 'j').replace(/(.)\1+/g, '$1').replace(/e$/, 'i');
  const key = (s) => clean(s).split(' ').filter(Boolean).map(sound);
  const last10 = (v) => String(v || '').replace(/[^\d]/g, '').slice(-10);
  const fullDob = (p) => (/^\d{4}-\d{2}-\d{2}$/.test(p.dob || '') ? p.dob : null);

  // Edit distance, for near-misses like "Sunita" vs "Sunetta"
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // near-miss only for names of 5+ letters that start the same (Tutu/Mutu are different people)
  const close = (a, b) => a === b || (a[0] === b[0] && a.length >= 5 && b.length >= 5 && lev(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));

  // Score one pair. Returns { score, reasons[] } or null when they're clearly different people.
  function compare(a, b, linked) {
    if (linked.has(a.id + '|' + b.id)) return null;                       // already linked to each other
    if (a.gender && b.gender && a.gender !== 'x' && b.gender !== 'x' && a.gender !== b.gender) return null;
    if (fullDob(a) && fullDob(b) && fullDob(a) !== fullDob(b)) return null;
    if (a.isMe && b.isMe) return null;
    let score = 0; const reasons = [];
    const ca = clean(a.name), cb = clean(b.name), ka = key(a.name), kb = key(b.name);
    if (ca && ca === cb) { score += 0.9; reasons.push('same name'); }
    else if (ka.length && ka.join(' ') === kb.join(' ')) { score += 0.85; reasons.push('same name, spelled differently'); }
    else if (ka[0] && kb[0] && close(ka[0], kb[0])) {
      const lastA = ka.length > 1 ? ka[ka.length - 1] : '', lastB = kb.length > 1 ? kb[kb.length - 1] : '';
      if (lastA && lastB && close(lastA, lastB)) { score += 0.75; reasons.push('very similar names'); }
      else if (!lastA || !lastB) { score += 0.55; reasons.push('same first name, one has no surname'); }   // "Sunita" vs "Sunita Das"
    }
    const nick = (p) => [p.nickname, p.calledTerm].map(clean).filter(Boolean);
    const firstOf = (p) => clean(p.name).split(' ')[0];
    if (nick(a).some((n) => n === ca || n === firstOf(b) || nick(b).includes(n)) || nick(b).some((n) => n === cb || n === firstOf(a))) {
      // nickname matches are common for kinship words ("Mama"), so only count real names
      if (!nick(a).concat(nick(b)).every((n) => FT.kin.termToPath(n))) { score += 0.35; reasons.push('nickname matches'); }
    }
    if (last10(a.phone).length === 10 && last10(a.phone) === last10(b.phone)) { score += 0.35; reasons.push('same phone (could be a household number)'); }
    if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) { score += 0.5; reasons.push('same email'); }
    if (fullDob(a) && fullDob(a) === fullDob(b)) { score += 0.3; reasons.push('same birth date'); }
    if (!reasons.some((r) => /name/.test(r))) score = Math.min(score, 0.6);   // never "likely" without a name match
    return score >= POSSIBLE ? { score: Math.min(1, score), reasons } : null;
  }

  // All pairs worth a look, best first. Dismissed pairs ("Different people") are skipped.
  function pairs(people = A().S.people, rels = A().S.relationships, dismissed = new Set(A().S.meta.dismissed || [])) {
    const linked = new Set();
    rels.forEach((r) => { linked.add(r.from + '|' + r.to); linked.add(r.to + '|' + r.from); });
    const out = [];
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      const k = pairKey(a.id, b.id); if (dismissed.has(k)) continue;
      const c = compare(a, b, linked); if (c) out.push({ key: k, a, b, ...c, level: c.score >= LIKELY ? 'likely' : 'possible' });
    }
    return out.sort((x, y) => y.score - x.score);
  }
  const pairKey = (x, y) => `dup:${[x, y].sort().join('+')}`;

  // Best match for a person who's about to be added (used by the Add form and imports)
  function matchFor(candidate, people = A().S.people, rels = A().S.relationships) {
    const linked = new Set(rels.map((r) => r.from + '|' + r.to));
    let best = null;
    people.forEach((p) => { if (p.id === candidate.id) return; const c = compare({ ...candidate, id: candidate.id || '__new' }, p, linked); if (c && (!best || c.score > best.score)) best = { p, ...c }; });
    return best;
  }

  // ---------- Duplicates list (People › Duplicates chip) ----------
  const FIELDS = [['name', 'Name'], ['nickname', 'Nickname'], ['calledTerm', 'Term you use'], ['gender', 'Gender'], ['dob', 'Born'], ['phone', 'Phone'], ['email', 'Email'],
    ['city', 'City'], ['address', 'Address'], ['metOn', 'Met on'], ['notes', 'Notes']];
  const show = (p, f) => { const v = p[f] ?? ''; if (f === 'gender') return { f: 'Female', m: 'Male' }[v] || ''; if (f === 'dob') return FT.io.dobForInput(v) || p.birthYear || ''; return String(v); };
  const richer = (a, b) => { const n = (p) => FIELDS.filter(([f]) => show(p, f)).length + (p.photos || []).length * 0.5 + (p.isMe ? 99 : 0); return n(a) >= n(b) ? [a, b] : [b, a]; };

  function render(ul) {
    const { esc, avatar, describe } = A();
    const list = pairs();
    if (!list.length) { ul.innerHTML = '<li class="empty"><p class="display">No duplicates found</p><p>Checks names (including different spellings), nicknames, phone numbers, emails and birth dates.</p></li>'; return 0; }
    const card = (p) => { const d = describe(p.id);
      return `<button class="dup-person" data-open="${p.id}">${avatar(p)}<span><b>${esc(p.nickname || p.name)}</b>${p.nickname ? `<small>${esc(p.name)}</small>` : ''}<small>${esc(d.called || d.en)}${p.city ? ' · ' + esc(p.city) : ''}</small></span></button>`; };
    ul.innerHTML = `<li class="hint dup-intro">${list.length} pair${list.length > 1 ? 's' : ''} to check. Merge keeps one entry, moves links, photos and visits over, and lets you pick which details win.</li>` +
      list.map((x, i) => `<li class="dup-pair level-${x.level}" data-i="${i}">
        <div class="dup-head"><b>${x.level === 'likely' ? 'Likely the same person' : 'Possibly the same person'}</b><small>${esc(x.reasons.join(' · '))}</small></div>
        <div class="dup-two">${card(x.a)}${card(x.b)}</div>
        <div class="fix-actions"><button class="btn small primary" data-dact="compare">Compare &amp; merge</button><button class="btn small" data-dact="different">Different people</button></div></li>`).join('');
    ul.onclick = async (e) => {
      const o = e.target.closest('[data-open]'); if (o) { A().openSheet(o.dataset.open); return; }
      const b = e.target.closest('[data-dact]'); if (!b) return;
      const x = list[+b.closest('[data-i]').dataset.i];
      if (b.dataset.dact === 'different') { await A().setMeta('dismissed', [...new Set([...(A().S.meta.dismissed || []), x.key])]); A().toast('Marked as different people'); A().refresh(); }
      if (b.dataset.dact === 'compare') openCompare(x.a, x.b);
    };
    return list.length;
  }

  // ---------- Side-by-side compare, pick which value wins per field ----------
  function openCompare(a0, b0) {
    const { esc, S } = A();
    let [keep, drop] = richer(a0, b0);
    const dlg = document.getElementById('visitDlg'); // reuse the full-screen sheet dialog
    const paint = () => {
      const rows = FIELDS.filter(([f]) => show(keep, f) || show(drop, f)).map(([f, label]) => {
        const kv = show(keep, f), dv = show(drop, f), same = kv === dv;
        if (f === 'notes' && !same && kv && dv) return `<tr><th>${label}</th><td>${esc(kv)}</td><td>${esc(dv)}</td></tr><tr class="same"><th></th><td colspan="2" class="hint">Both notes are kept, one after the other.</td></tr>`;
        const pick = same || !dv ? 'keep' : !kv ? 'drop' : 'keep';
        return `<tr class="${same ? 'same' : ''}"><th>${label}</th>
          <td><label><input type="radio" name="f-${f}" value="keep" ${pick === 'keep' ? 'checked' : ''} ${same || !kv ? 'disabled' : ''} /> ${esc(kv) || '<span class="hint">empty</span>'}</label></td>
          <td><label><input type="radio" name="f-${f}" value="drop" ${pick === 'drop' ? 'checked' : ''} ${same || !dv ? 'disabled' : ''} /> ${esc(dv) || '<span class="hint">empty</span>'}</label></td></tr>`;
      }).join('');
      const links = (p) => S.relationships.filter((r) => r.from === p.id || r.to === p.id).length;
      dlg.querySelector('.sheet-inner').innerHTML = `
        <div class="sheet-top"><button class="icon-btn" data-cact="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <h2 class="display">Compare &amp; merge</h2>
        <p class="hint">Pick the value to keep for each field. Links, photos and visits from both are kept, and notes from both are combined.</p>
        <div class="table-wrap"><table class="dup-table"><thead><tr><th></th><th>Keep: ${esc(keep.nickname || keep.name)}<small>${links(keep)} links · ${(keep.photos || []).length} photos</small></th>
          <th>Merge in: ${esc(drop.nickname || drop.name)}<small>${links(drop)} links · ${(drop.photos || []).length} photos</small></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="form-actions"><button class="btn primary block" data-cact="merge">Merge into one</button>
          <button class="btn ghost block" data-cact="swap">Swap which one is kept</button></div>`;
    };
    paint();
    dlg.onclick = async (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const t = e.target.closest('[data-cact]'); if (!t) return;
      if (t.dataset.cact === 'close') dlg.close();
      if (t.dataset.cact === 'swap') { if (drop.isMe) { A().toast('Your own entry is always the one kept'); return; } [keep, drop] = [drop, keep]; paint(); }
      if (t.dataset.cact === 'merge') {
        const choices = {}; // fields where the merged-in person's value should win
        dlg.querySelectorAll('input[type=radio]:checked').forEach((r) => { if (r.value === 'drop') choices[r.name.slice(2)] = true; });
        if (await FT.checks.merge(keep.id, drop.id, { choices })) { dlg.close(); A().recompute(); A().refresh(); }
      }
    };
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  return { pairs, compare, matchFor, render, openCompare, pairKey, LIKELY, POSSIBLE };
})();
