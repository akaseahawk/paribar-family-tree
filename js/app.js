/* =========================================================
   app.js — UI and app logic for Paribar
   Sections:
     1. State + derived data
     2. Linking logic (plan → preview → save)
     3. Views: people list, mind map, add/edit form, backup
     4. Person sheet
     5. Voice input + photos
     6. Export / import / vCard / demo data
     7. Boot
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- 1. State + derived data ---------- */
  const S = {
    people: [], relationships: [], meta: {}, visits: [], pane: 'people',
    byId: new Map(), adj: new Map(), paths: new Map(), descCache: new Map(),
    view: 'people', filter: 'all', group: 'side', mapFocus: null, mapMode: 'mind', mapDepth: 99, mapLayer: 'all', mapSub: null, mapHi: null, rel: 'all', gens: new Map(), editingId: null, formPhotos: [],
  };

  /* ---------- Heritage (v2): which culture's words each side of the family uses ----------
     S.meta.heritage = { me, paternal, maternal, inlaw } (culture ids from cultures.js). A person can
     also have their own (p.heritage). No setting at all = Bengali everywhere, the original behaviour. */
  function heritage() {
    const h = S.meta.heritage || {};
    const me = h.me || h.paternal || 'bengali';
    return { me, paternal: h.paternal || me, maternal: h.maternal || me, inlaw: h.inlaw || me };
  }
  function cultureOfSide(side) {
    const h = heritage();
    return side === 'maternal' ? h.maternal : side === 'paternal' ? h.paternal : side === 'inlaw' ? h.inlaw : h.me;
  }
  /* "View as" (top bar, v2.0.1): show everyone's terms in one heritage's words, just for looking.
     Nothing saved changes, placeholders still get the family's real words, and the family's own
     words show underneath on each card. '' = the family's own heritage settings. */
  const viewAs = () => S.meta.viewAs || '';
  const dispSide = (side) => viewAs() || cultureOfSide(side);
  const cultureOf = (id, side) => viewAs() || ((S.byId.get(id) || {}).heritage) || cultureOfSide(side);
  const altCultures = () => {
    const h = heritage(); const u = [...new Set([h.paternal, h.maternal, h.me])];
    if (viewAs()) return u.filter((x) => x !== viewAs()).length ? [viewAs(), ...u] : [];
    return u.length > 1 ? u : [];
  };
  const allBengali = () => { if (viewAs()) return viewAs() === 'bengali'; const h = heritage(); return [h.me, h.paternal, h.maternal, h.inlaw].every((x) => x === 'bengali'); };
  const cultName = (id) => FT.cultures.get(id).name;

  function recompute() {
    FT.fam.labelCulture = viewAs() || heritage().me;
    S.byId = new Map(S.people.map((p) => [p.id, p]));
    S.adj = FT.kin.buildGraph(S.people, S.relationships);
    S.paths = S.meta.meId ? FT.kin.pathsFrom(S.meta.meId, S.adj) : new Map();
    S.gens = S.meta.meId ? FT.fam.generations(S.meta.meId, S.adj) : new Map();
    S.descCache = new Map();
  }
  function describe(id) {
    if (!S.descCache.has(id)) {
      const d = FT.kin.describe(id, { byId: S.byId, meId: S.meta.meId, paths: S.paths, cultureOf, altCultures: altCultures() });
      const p = S.byId.get(id) || {};
      // called = the term YOU use (e.g. "Pishe Dadu"); bn/bnScript = what the app works out from the links
      const gen = S.gens.has(id) ? S.gens.get(id) : null;
      S.descCache.set(id, { ...d, called: viewAs() ? '' : p.calledTerm || '', yourWord: p.calledTerm || '', nuance: p.termNuance || '', gen, genLabel: FT.fam.genLabel(gen) });
    }
    return S.descCache.get(id);
  }
  async function savePerson(p) { p.updatedAt = new Date().toISOString(); await FT.db.put('people', p); }
  async function saveRel(r) { await FT.db.put('relationships', r); }
  async function setMeta(k, v) { S.meta[k] = v; await FT.db.setMeta(k, v); }

  /* ---------- 2. Linking logic ---------- */
  const sideOfWord = (w) => (w === 'mother' ? 'maternal' : w === 'father' ? 'paternal' : ['wife', 'husband', 'spouse'].includes(w) ? 'inlaw' : 'close');
  const WORD_GENDER = { mother: 'f', father: 'm', sister: 'f', brother: 'm', daughter: 'f', son: 'm', wife: 'f', husband: 'm' };
  const WORD_STEP = { mother: 'parent', father: 'parent', sister: 'sibling', brother: 'sibling', daughter: 'child', son: 'child', wife: 'spouse', husband: 'spouse',
    friend: 'friend', colleague: 'friend', neighbor: 'friend', classmate: 'friend' }; // friend words = the friends layer

  // Neighbours of `id` reached by `step` (uses a given graph so it works for previews too)
  const neighbours = (adj, id, step) => (adj.get(id) || []).filter((e) => e.step === step).map((e) => e.to);

  // Create the relationship records that make `newId` the <word> of `anchorId`
  function linkRecords(newId, word, anchorId, ctx, alsoLink = true) {
    const recs = [];
    const R = (type, from, to, extra = {}) => recs.push({ id: uid(), type, from, to, createdAt: new Date().toISOString(), ...extra });
    const step = WORD_STEP[word];
    if (step === 'parent') {
      R('parent_of', newId, anchorId);
      if (alsoLink) {
        const others = neighbours(ctx.adj, anchorId, 'parent').filter((x) => x !== newId);
        if (others.length === 1) R('spouse_of', newId, others[0]);
      }
    } else if (step === 'child') {
      R('parent_of', anchorId, newId);
      if (alsoLink) {
        const sp = neighbours(ctx.adj, anchorId, 'spouse');
        if (sp.length === 1) R('parent_of', sp[0], newId);
      }
    } else if (step === 'sibling') {
      const parents = neighbours(ctx.adj, anchorId, 'parent');
      if (parents.length) parents.forEach((p) => R('parent_of', p, newId));
      else R('sibling_of', anchorId, newId);
    } else if (step === 'spouse') {
      R('spouse_of', anchorId, newId);
    } else if (step === 'friend') {
      R('friend_of', anchorId, newId, { kind: word }); // kind: friend / colleague / neighbor / classmate
    }
    return recs;
  }

  // Text for the "also link" checkbox
  function alsoLinkLabel(word, anchorId) {
    const step = WORD_STEP[word];
    if (step === 'parent') {
      const others = neighbours(S.adj, anchorId, 'parent');
      if (others.length === 1) return `Also married to ${S.byId.get(others[0]).name}`;
    }
    if (step === 'child') {
      const sp = neighbours(S.adj, anchorId, 'spouse');
      if (sp.length === 1) return `Also ${sp[0] && S.byId.get(sp[0]).name}'s child`;
    }
    return '';
  }

  // Build a plan from the form: new people + new relationship records
  function planFromForm(fd, newPerson) {
    const people = [newPerson];
    const rels = [];
    const mode = fd.get('mode');
    if (mode === 'preset') {
      const preset = presetList()[+fd.get('preset')];
      let cur = S.meta.meId;
      const walked = [];
      // Walk intermediate steps (always parents in our presets), creating placeholders if missing
      for (let i = 0; i < preset.path.length - 1; i++) {
        const w = preset.path[i];
        walked.push(w);
        const found = neighbours(S.adj, cur, 'parent').find((id) => S.byId.get(id).gender === WORD_GENDER[w]);
        if (found) { cur = found; continue; }
        const ph = { id: uid(), name: FT.kin.placeholder(walked, cultureOfSide(sideOfWord(walked[0]))) || w, gender: WORD_GENDER[w], placeholder: true,
          photos: [], createdAt: new Date().toISOString() };
        people.push(ph);
        rels.push(...linkRecords(ph.id, w, cur, { adj: S.adj }));
        cur = ph.id;
      }
      const last = preset.path[preset.path.length - 1];
      if (WORD_GENDER[last]) newPerson.gender = WORD_GENDER[last];
      // Use a preview graph that includes placeholders so sibling linking finds new parents
      const g = FT.kin.buildGraph([...S.people, ...people], [...S.relationships, ...rels]);
      rels.push(...linkRecords(newPerson.id, last, cur, { adj: g }));
    } else if (mode === 'relative') {
      const word = fd.get('relation');
      if (WORD_GENDER[word]) newPerson.gender = WORD_GENDER[word];
      rels.push(...linkRecords(newPerson.id, word, fd.get('anchor'), { adj: S.adj }, fd.get('alsoLink') === 'on'));
    }
    return { people, rels };
  }

  // Describe a hypothetical person without saving anything
  function previewDescribe(plan, id) {
    const people = [...S.people, ...plan.people];
    const rels = [...S.relationships, ...plan.rels];
    const byId = new Map(people.map((p) => [p.id, p]));
    const adj = FT.kin.buildGraph(people, rels);
    const paths = FT.kin.pathsFrom(S.meta.meId, adj);
    return FT.kin.describe(id, { byId, meId: S.meta.meId, paths, cultureOf: (pid, side) => ((byId.get(pid) || {}).heritage) || cultureOfSide(side), altCultures: [] });
  }


  /* ---------- Icons (inline SVG, stroke = currentColor) ---------- */
  const ICON = {
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2L9 9.5z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    address: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    city: '<path d="M4 21V8l5-3v16M9 21V11l6-3v13M15 21V13l5 2v6M3 21h18"/>',
    dob: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 14h16M12 9V6M12 4.5v.01"/>',
    notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
    nuance: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    photo: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  };
  const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  // Small icon strip that shows at a glance what info a person has
  function infoIcons(p) {
    const has = [
      ['phone', p.phone, 'Phone'], ['whatsapp', p.phone && p.whatsapp !== false, 'WhatsApp'], ['email', p.email, 'Email'],
      ['address', p.address, 'Address'], ['notes', p.notes, 'Notes'], ['nuance', p.termNuance, 'Term nuance'], ['photo', (p.photos || []).length, 'Photo'],
    ].filter((x) => x[1]);
    return has.length ? `<span class="info-icons" aria-label="Has: ${has.map((x) => x[2]).join(', ')}">${has.map(([k, , t]) => `<span title="${t}">${icon(k)}</span>`).join('')}</span>` : '';
  }
  const mapsUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const waUrl = (phone) => {
    let d = String(phone || '').replace(/[^\d]/g, '');
    if (d.length === 10) d = '91' + d;               // bare 10-digit Indian mobile → add +91
    return `https://wa.me/${d}`;
  };
  // Contact rows for the person card: icon + value + tap action
  function contactRows(p) {
    const rows = [];
    if (p.phone) rows.push(`<a class="c-row" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span><small>Phone</small>${esc(p.phone)}</span><b>Call</b></a>`);
    if (p.phone && p.whatsapp !== false) rows.push(`<a class="c-row" href="${waUrl(p.phone)}" target="_blank" rel="noopener">${icon('whatsapp')}<span><small>WhatsApp</small>${esc(p.phone)}</span><b>Chat</b></a>`);
    if (p.email) rows.push(`<a class="c-row" href="mailto:${esc(p.email)}">${icon('email')}<span><small>Email</small>${esc(p.email)}</span><b>Write</b></a>`);
    if (p.address) rows.push(`<a class="c-row" href="${mapsUrl([p.address, p.city].filter(Boolean).join(', '))}" target="_blank" rel="noopener">${icon('address')}<span><small>Address</small>${esc(p.address).replace(/\n/g, '<br>')}${p.city ? `<br>${esc(p.city)}` : ''}</span><b>Map</b></a>`);
    else if (p.city) rows.push(`<a class="c-row" href="${mapsUrl(p.city)}" target="_blank" rel="noopener">${icon('city')}<span><small>City</small>${esc(p.city)}</span><b>Map</b></a>`);
    return rows.length ? `<div class="contact-list">${rows.join('')}</div>` : '<p class="hint">No phone, email or address yet — tap Edit to add them.</p>';
  }

  /* ---------- 3. Views ---------- */
  function show(view) {
    S.view = view;
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
    $$('#tabbar button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
    $('#tabbar').hidden = view === 'setup';
    if (view === 'people') renderPane();
    if (view === 'map') renderMap();
    if (view === 'data') renderStats();
    window.scrollTo({ top: 0 });
  }

  function renderHeader() {
    applySideLabels();
    const n = S.people.length;
    const last = S.meta.lastBackup ? new Date(S.meta.lastBackup) : null;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const changes = S.meta.changesSinceBackup || 0;
    const nudge = n > 3 && (days === null || days >= 3 || changes >= 10);
    const label = !last ? 'Not backed up' : changes >= 10 ? `${changes} changes · back up` : `Backup ${days}d ago`;
    const db = $('#demoBanner'); if (db) db.hidden = !S.meta.demo;
    $('#headerMeta').innerHTML = `<span>${n} ${n === 1 ? 'person' : 'people'}</span>` +
      (nudge ? `<button class="pill warn" id="nudge">${label}</button>` : '');
    const nb = $('#nudge'); if (nb) nb.onclick = quickBackup;
  }

  const SIDE_LABEL = { me: 'You', close: 'Close family', maternal: "Ma's side · মামার বাড়ি", paternal: "Baba's side · বাবার দিক", inlaw: 'In-laws · শ্বশুরবাড়ি',
    friend: 'Friends & circles · বন্ধু-বান্ধব', unlinked: 'Not linked yet' };
  // v2: when the sides have different heritages, say so ("Mother's side · Cantonese")
  function applySideLabels() {
    const h = heritage(), bn = allBengali();
    SIDE_LABEL.maternal = bn ? "Ma's side · মামার বাড়ি" : `Mother's side · ${cultName(h.maternal)}`;
    SIDE_LABEL.paternal = bn ? "Baba's side · বাবার দিক" : `Father's side · ${cultName(h.paternal)}`;
    SIDE_LABEL.inlaw = bn ? 'In-laws · শ্বশুরবাড়ি' : 'In-laws';
    SIDE_LABEL.friend = bn ? 'Friends & circles · বন্ধু-বান্ধব' : 'Friends & circles';
    $$('[data-side-name]').forEach((el) => { const k = el.dataset.sideName; el.textContent = bn ? (k === 'maternal' ? "Ma's side" : "Baba's side") : (k === 'maternal' ? "Mother's side" : "Father's side"); });
  }
  const SIDE_ORDER = ['me', 'close', 'maternal', 'paternal', 'inlaw', 'friend', 'unlinked'];

  function avatar(p, size = 'md') {
    const ph = (p.photos || [])[0];
    const d = describe(p.id);
    return ph ? `<img class="avatar ${size} side-${d.side}" src="${ph}" alt="" />`
      : `<span class="avatar ${size} side-${d.side}" aria-hidden="true">${esc(FT.mindmap.initials(p.name))}</span>`;
  }

  // "2 degrees from me" for the map card (a married couple counts as one stop; see FT.fam.degrees)
  function degreeText(id) {
    if (id === S.mapFocus) return '';
    const sub = S.mapSub || mapSubset(); // count degrees on what the map shows
    const d = FT.fam.degrees(S.mapFocus, sub.people, sub.rels, sub.adj).get(id);
    return d ? ` · ${d} degree${d > 1 ? 's' : ''} from ${focusName()}` : ' · not connected';
  }
  // Inline "Born" editor: full date, year, or decade
  function bornEditor(p, pre) {
    const cur = FT.io.dobForInput(p.dob || p.birthYear || '') || (p.birthDecade ? p.birthDecade + 's' : '');
    const a = p.dob || p.birthYear ? FT.io.age(p.dob || p.birthYear) : null;
    return `<div class="born-edit"><label for="${pre}Born">Born</label>
      <input id="${pre}Born" value="${esc(cur)}" placeholder="MM/DD/YYYY, 1962 or 1960s" autocomplete="off" />
      <button class="btn small" type="button" data-act="born">Save</button>
      ${a && a.years >= 0 ? `<small class="hint">${a.approx ? '~' : ''}${a.years} yrs</small>` : ''}</div>`;
  }
  async function saveBorn(p, raw) {
    raw = (raw || '').trim();
    const dec = raw.match(/^~?(\d{3})0'?s$/i);
    const dob = dec ? '' : FT.io.parseDate(raw);
    if (raw && !dob && !dec) { toast('Born: try 04/14/1962, 1962, or 1960s'); return; }
    p.dob = dob || ''; p.birthYear = dob ? dob.slice(0, 4) : ''; p.birthDecade = dec ? dec[1] + '0' : '';
    await savePerson(p); recompute(); toast(raw ? 'Born saved' : 'Born cleared');
  }
  // What to read aloud: the Bengali script if we have it, else the called term / romanized term
  function sayPerson(id) {
    const d = describe(id);
    const called = d.called || '';
    const calledIsBn = /[\u0980-\u09FF]/.test(called) && d.culture === 'bengali';
    if (!calledIsBn && called && d.culture !== 'bengali') { FT.speak.say({ script: called, roman: called, lang: d.lang }, toast); return; }
    FT.speak.say({ script: calledIsBn ? called : d.bnScript || '', roman: calledIsBn ? d.bn : called || d.bn, lang: calledIsBn ? 'bn-IN' : d.lang }, toast);
  }
  // Light up the path from me to this person on the map
  /* ----- Map highlights ----------------------------------------------------------
     One highlight at a time, kept across redraws until cleared or reset:
     path (me → them), family (their path to me + their parents, brothers & sisters, spouse, children),
     side (legend buttons), rel (a relation group like cousins), married, late. */
  const relOf = (id) => FT.kin.relGroup(S.paths.get(id));
  const directFamily = (id) => (S.adj.get(id) || []).filter((e) => e.step !== 'friend').map((e) => e.to);
  function hiIds(hi) {
    if (!hi) return [];
    if (hi.kind === 'path') return FT.checks.pathIds(hi.id);
    if (hi.kind === 'between') { const st = betweenSteps(hi.a, hi.id); return st ? [hi.a, ...st.map((x) => x.id)] : []; }
    if (hi.kind === 'family') return [...new Set([hi.id, ...FT.checks.pathIds(hi.id), ...directFamily(hi.id)])];
    if (hi.kind === 'side') return S.people.filter((p) => describe(p.id).side === hi.value || (hi.value === 'close' && p.id === S.meta.meId)).map((p) => p.id);
    if (hi.kind === 'rel') return S.people.filter((p) => relOf(p.id) === hi.value).map((p) => p.id);
    if (hi.kind === 'married') return S.relationships.filter((r) => r.type === 'spouse_of').flatMap((r) => [r.from, r.to]);
    if (hi.kind === 'late') return S.people.filter((p) => p.deceased).map((p) => p.id);
    return [];
  }
  // The lines to draw for a path / family highlight: each step from me to them, plus them to each close relative
  function hiRoute(hi) {
    if (!hi || !['path', 'family', 'between'].includes(hi.kind)) return null;
    const r = []; let prev = S.meta.meId;
    if (hi.kind === 'between') { prev = hi.a; (betweenSteps(hi.a, hi.id) || []).forEach((st) => { r.push([prev, st.id, st.step]); prev = st.id; }); return r; }
    (S.paths.get(hi.id) || []).forEach((st) => { r.push([prev, st.id, st.step]); prev = st.id; });
    if (hi.kind === 'family') (S.adj.get(hi.id) || []).filter((e) => e.step !== 'friend').forEach((e) => r.push([hi.id, e.to, e.step]));
    return r;
  }
  const hiKey = (hi) => (hi ? (hi.kind === 'side' ? 'side:' + hi.value : hi.kind) : '');
  function applyHi(zoom = false) {
    const hi = S.mapHi, ids = hiIds(hi);
    FT.mindmap.highlight(hi ? (ids.length ? ids : ['-']) : null, hiRoute(hi)); // '-': a group with no one in it dims everything
    $('#mapClearPath').hidden = !hi;
    const pathy = hi && ['path', 'family', 'between'].includes(hi.kind);
    $('#mapOnlyPath').hidden = !pathy; $('#mapOnlyPath').textContent = S.mapOnly ? 'Show everyone' : 'Only the path';
    $$('#mapLegend [data-hi]').forEach((b) => { const on = b.dataset.hi === hiKey(hi); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    $('#mapHi').value = hi && hi.kind === 'rel' ? hi.value : '';
    if (zoom) FT.mindmap.fitTo(ids);
    return ids;
  }
  function setHi(hi, zoom = false) {
    const wasOnly = S.mapOnly && S.mapHi && ['path', 'family', 'between'].includes(S.mapHi.kind);
    S.mapHi = hi;
    if (wasOnly && !(hi && ['path', 'family', 'between'].includes(hi.kind))) { S.mapOnly = false; drawMap(); }
    const ids = applyHi(zoom);
    if (hi && !['path', 'family', 'between'].includes(hi.kind)) {
      const on = ids.filter((id) => FT.mindmap.isShown(id)).length;
      toast(!ids.length ? 'No one in that group yet' : on < ids.length ? `${on} of ${ids.length} are on the map (the rest are hidden by Show or Degrees)` : `${ids.length} highlighted`);
    }
  }
  // Light up someone on the map: just the path from me, or (family) the path plus their own family
  function showPath(id, kind = 'path') {
    const p = S.byId.get(id); if (!p) return;
    if (kind === 'path' && !S.paths.has(id)) { toast('Not connected to you yet'); return; }
    S.mapHi = { kind, id }; S.mapOnly = true; // focus on the path: just these people, laid out tight
    const ids = hiIds(S.mapHi);
    setFocus(S.meta.meId); S.mapDepth = 99;
    if (!ids.every((x) => mapSubset().ids.has(x))) S.mapLayer = 'all'; // crosses layers
    $('#sheet').open && $('#sheet').close(); show('map');
    applyHi(true);
    const name = p.nickname || p.name;
    if (S.paths.has(id)) toast(`${name} is ${FT.checks.sentence(FT.checks.chain(id))}`);
    else toast(`${name}'s family (not connected to you yet)`);
  }
  /* ----- Trail between any two people (v2): "Ethan is Mira's mother's sister's son (first cousin) · 4 steps" ----- */
  const GWORD = { parent: { m: 'father', f: 'mother' }, child: { m: 'son', f: 'daughter' }, spouse: { m: 'husband', f: 'wife' }, sibling: { m: 'brother', f: 'sister' } };
  const betweenSteps = (a, b) => (a === b ? [] : FT.kin.pathsFrom(a, S.adj).get(b) || null);
  function betweenSentence(a, b, steps = betweenSteps(a, b)) {
    const nm = (id) => { const p = S.byId.get(id) || {}; return id === S.meta.meId ? 'you' : p.nickname || p.name || 'Someone'; };
    if (!steps) return `${nm(b)} and ${nm(a)} aren't connected yet`;
    const words = steps.map((x) => (x.step === 'friend' ? x.kind || 'friend' : (GWORD[x.step] || {})[(S.byId.get(x.id) || {}).gender] || ({ parent: 'parent', child: 'child', spouse: 'spouse', sibling: 'sibling' })[x.step] || x.step));
    const term = steps.some((x) => x.step === 'friend') ? '' : FT.cultures.englishTerm(FT.kin.normalize(steps, S.byId).map((n) => n.word)) || '';
    const who = nm(b).replace(/^you$/, 'You');
    const chain = words.join("'s ");
    const t = term && term.toLowerCase() !== chain.toLowerCase() ? ` (${term.toLowerCase()})` : '';
    return `${who} ${b === S.meta.meId ? 'are' : 'is'} ${a === S.meta.meId ? 'your' : nm(a) + "'s"} ${chain}${t} · ${steps.length} step${steps.length > 1 ? 's' : ''}`;
  }
  function betweenPicker(id, pfx) {
    const p = S.byId.get(id) || {};
    return `<div class="between"><label class="field"><span>Trail between ${esc(p.nickname || p.name || '')} and …</span>
      <select id="${pfx}Between">${personOptions(S.people.filter((x) => x.id !== id))}</select></label>
      <button class="btn small" type="button" data-act="between">Show the trail</button></div>`;
  }
  function showBetween(a, b) {
    if (!a || !b || a === b) return;
    const steps = betweenSteps(a, b);
    if (!steps) { toast('No connection between them yet'); return; }
    S.mapHi = { kind: 'between', a, id: b }; S.mapOnly = true;
    if (!S.byId.has(S.mapFocus) || ![a, b].includes(S.mapFocus)) setFocus(a);
    S.mapDepth = 99;
    if (!hiIds(S.mapHi).every((x) => mapSubset().ids.has(x))) S.mapLayer = 'all';
    $('#sheet').open && $('#sheet').close(); show('map');
    applyHi(true);
    toast(betweenSentence(a, b, steps));
  }
  // "Ma–Baba's generation · মা-বাবা · born ~1960s"
  function genLine(p, d) {
    const dec = FT.fam.decade(p, S.gens, S.people);
    return [d.genLabel.en, d.genLabel.bn, dec ? `born ${dec.approx ? '~' : ''}${dec.text}` : ''].filter(Boolean).join(' · ');
  }
  const lateTag = (p) => (p.deceased ? `<em class="tag late" title="Passed away${p.died ? ' ' + esc(p.died) : ''}">স্বর্গীয় · Late</em> ` : '');

  const langAttr = (d) => (d.lang || 'bn').split('-')[0];
  function personRow(p, d, extraCls = '') {
    return `<li><button class="person-row ${extraCls}" data-id="${p.id}">
        ${avatar(p)}
        <span class="pr-main">
          <span class="pr-name">${lateTag(p)}${esc(p.nickname ? `${p.nickname}` : p.name)}${p.nickname ? `<small> ${esc(p.name)}</small>` : ''}${p.placeholder ? ' <em class="tag">add details</em>' : ''}</span>
          <span class="pr-term">${d.called ? `<b class="called">${esc(d.called)}</b> · ` : ''}${d.bnScript ? `<b lang="${langAttr(d)}">${esc(d.bnScript)}</b>${d.called || !d.bn ? '' : ' ' + esc(d.bn)} · ` : ''}${esc(d.en)}</span>
          ${infoIcons(p)}
          ${p.notes ? `<span class="pr-note">${esc(p.notes.split('\n')[0].slice(0, 80))}</span>` : ''}
        </span>
        <span class="pr-city">${esc(p.city || '')}</span>
      </button></li>`;
  }

  // People view has four panes: People, Visits, Dates, Needs attention
  function renderPane() {
    let n = 0; try { n = FT.checks.issues().length; } catch (e) { console.error(e); }
    $('#fixCount').textContent = n ? String(n) : ''; $('#fixCount').hidden = !n;
    $$('#peoplePanes button').forEach((b) => b.classList.toggle('is-on', b.dataset.pane === S.pane));
    ['people', 'visits', 'dates', 'fix'].forEach((k) => ($('#pane-' + k).hidden = k !== S.pane));
    const safe = (fn, el) => { try { fn(); } catch (e) { console.error(e); if (el) el.innerHTML = `<p class="fatal">This section hit an error: ${esc(e.message)}</p>`; } };
    if (S.pane === 'people') renderPeople(); // the main list never depends on the new sections
    if (S.pane === 'visits') safe(() => FT.visits.render($('#pane-visits')), $('#pane-visits'));
    if (S.pane === 'dates') safe(() => FT.dates.render($('#pane-dates')), $('#pane-dates'));
    if (S.pane === 'fix') safe(() => FT.checks.render($('#pane-fix')), $('#pane-fix'));
  }
  function renderPeople() {
    let nd = 0; try { nd = FT.dupes.pairs().length; } catch (e) { console.error(e); }
    $('#dupCount').textContent = nd ? String(nd) : ''; $('#dupCount').hidden = !nd;
    relOptions($('#relFilter'), 'Everyone', S.rel); S.rel = $('#relFilter').value;
    $('#peopleReset').disabled = !($('#search').value.trim() || S.filter !== 'all' || S.rel !== 'all' || S.group !== 'side'); // always there, greyed out when nothing is set
    if (S.filter === 'dupes') { try { FT.dupes.render($('#peopleList')); } catch (e) { console.error(e); $('#peopleList').innerHTML = `<li class="fatal">${esc(e.message)}</li>`; } return; }
    const q = $('#search').value.trim().toLowerCase();
    const list = S.people.map((p) => ({ p, d: describe(p.id) }))
      .filter(({ p, d }) => S.filter === 'all' || d.side === S.filter || (S.filter === 'maternal' && d.side === 'me'))
      .filter(({ p }) => S.rel === 'all' || relOf(p.id) === S.rel)
      .filter(({ p, d }) => !q || [p.name, p.nickname, p.city, p.notes, p.calledTerm, d.bn, d.bnScript, d.en, d.genLabel.en, d.side === 'friend' ? 'friend' : ''].join(' ').toLowerCase().includes(q))
      .sort((a, b) => SIDE_ORDER.indexOf(a.d.side) - SIDE_ORDER.indexOf(b.d.side)
        || (a.d.words.length - b.d.words.length) || a.p.name.localeCompare(b.p.name));
    const ul = $('#peopleList');
    if (!list.length) {
      ul.innerHTML = `<li class="empty"><p class="display">${q ? 'No one matches that' : 'No one here yet'}</p>
        <p>${q ? 'Try a different spelling, or a Bengali term like মামা.' : 'Tap <b>Add</b> to place your first relative — start with Ma.'}</p></li>`;
      return;
    }
    if (S.group === 'generation' && !q) {
      const order = [...new Set(list.map((x) => x.d.gen))].sort((a, b) => (b ?? -99) - (a ?? -99));
      ul.innerHTML = order.map((g) => {
        const l = FT.fam.genLabel(g);
        const members = list.filter((x) => x.d.gen === g).sort((a, b) => (FT.kin.yearOf(a.p) || 9999) - (FT.kin.yearOf(b.p) || 9999) || a.p.name.localeCompare(b.p.name));
        return `<li class="group-head">${esc(l.en)}${l.bn ? ` · <span lang="bn">${esc(l.bn)}</span>` : ''} <small>${members.length}</small></li>` + members.map(({ p, d }) => personRow(p, d)).join('');
      }).join('');
      return;
    }
    if (S.group === 'family' && !q) { ul.innerHTML = renderFamilies(list); return; }
    let lastSide = null;
    ul.innerHTML = list.map(({ p, d }) => {
      const head = S.filter === 'all' && !q && d.side !== lastSide ? `<li class="group-head">${SIDE_LABEL[d.side]}</li>` : '';
      lastSide = d.side;
      return head + personRow(p, d);
    }).join('');
  }

  // Families: one box per couple (or single parent) with their children underneath
  function renderFamilies(list) {
    const allowed = new Set(list.map((x) => x.p.id));
    const { units } = FT.fam.buildUnits(S.people, S.relationships);
    const kidsOf = (members) => [...new Set(S.relationships.filter((r) => r.type === 'parent_of' && members.includes(r.from)).map((r) => r.to))].filter((k) => S.byId.has(k));
    const boxes = [...units.values()].map((u) => ({ u, kids: kidsOf(u.members) }))
      .filter(({ u, kids }) => (u.members.length > 1 || kids.length) && [...u.members, ...kids].some((id) => allowed.has(id)))
      .map((b) => ({ ...b, gen: Math.max(...b.u.members.map((m) => (S.gens.has(m) ? S.gens.get(m) : -99))) }))
      .sort((a, b) => b.gen - a.gen);
    const inBox = new Set(boxes.flatMap((b) => [...b.u.members, ...b.kids]));
    const loose = list.filter((x) => !inBox.has(x.p.id));
    const nm = (id) => { const p = S.byId.get(id); return p.nickname || p.name; };
    const html = boxes.map(({ u, kids }) => {
      const st = u.rel && u.rel.status && u.rel.status !== 'married' ? ` <em class="tag">${esc(u.rel.status)}</em>` : '';
      const l = describe(u.members[0]).genLabel;
      return `<li class="fam-box"><div class="fam-head">
          ${u.members.length > 1 ? `<svg class="ic rings-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>` : ''}
          <b>${u.members.map((m) => esc(nm(m))).join(' & ')}</b>${st}<small>${esc(l.en)}</small></div>
        <ul class="fam-members">${u.members.map((m) => personRow(S.byId.get(m), describe(m))).join('')}</ul>
        ${kids.length ? `<div class="fam-kids-label">Children</div><ul class="fam-members fam-kids">${kids.map((k) => personRow(S.byId.get(k), describe(k), 'is-child')).join('')}</ul>` : ''}
      </li>`;
    }).join('');
    return html + (loose.length ? `<li class="group-head">Not in a family group yet</li>` + loose.map(({ p, d }) => personRow(p, d)).join('') : '');
  }


  // generations relative to Me; if the focus isn't connected to Me, relative to the focus
  function mapGens() { return S.gens.has(S.mapFocus) ? S.gens : FT.fam.generations(S.mapFocus, S.adj); }
  // Map layer: everyone, family only, or friends only (you are always in it)
  function mapSubset() {
    const side = (id) => describe(id).side;
    // Friends view also keeps the relatives a friend hangs off (Ma → Lina → Lina's neighbor), so nobody floats unattached
    const bridges = new Set();
    if (S.mapLayer === 'friends') S.people.forEach((p) => { if (side(p.id) === 'friend') (S.paths.get(p.id) || []).forEach((st) => bridges.add(st.id)); });
    // "Only the path" (v2.0.2): a path / family / trail highlight can redraw the tree with just those people
    const only = S.mapOnly && S.mapHi && ['path', 'family', 'between'].includes(S.mapHi.kind) ? new Set(hiIds(S.mapHi)) : null;
    if (only && only.size > 1) {
      const people = S.people.filter((p) => only.has(p.id)); const ids = new Set(people.map((p) => p.id));
      const rels = S.relationships.filter((r) => ids.has(r.from) && ids.has(r.to));
      // brothers and sisters are linked through their parents, who may not be on the path: link each step directly
      const has = (x, y, type) => rels.some((r) => r.type === type && ((r.from === x && r.to === y) || (r.from === y && r.to === x)));
      (hiRoute(S.mapHi) || []).forEach(([x, y, step]) => {
        const type = { parent: 'parent_of', child: 'parent_of', spouse: 'spouse_of', sibling: 'sibling_of', friend: 'friend_of' }[step];
        if (!type || has(x, y, type)) return;
        const [from, to] = step === 'parent' ? [y, x] : [x, y];
        rels.push({ id: `bridge:${from}+${to}`, type, from, to });
      });
      return { people, rels, adj: FT.kin.buildGraph(people, rels), ids };
    }
    const keep = S.mapLayer === 'family' ? (p) => side(p.id) !== 'friend'
      : S.mapLayer === 'friends' ? (p) => p.id === S.meta.meId || side(p.id) === 'friend' || bridges.has(p.id) : () => true;
    const people = S.people.filter(keep); const ids = new Set(people.map((p) => p.id));
    const rels = S.relationships.filter((r) => ids.has(r.from) && ids.has(r.to) && !(S.mapLayer === 'family' && r.type === 'friend_of'));
    // Ma and Lina are sisters through Dadu–Didu, who aren't in the friends view: link the bridge sisters directly
    if (S.mapLayer === 'friends') S.people.forEach((p) => {
      if (side(p.id) !== 'friend') return;
      let prev = S.meta.meId;
      (S.paths.get(p.id) || []).forEach((st) => {
        if (st.step === 'sibling' && !rels.some((r) => (r.from === prev && r.to === st.id) || (r.from === st.id && r.to === prev)))
          rels.push({ id: `bridge:${prev}+${st.id}`, type: 'sibling_of', from: prev, to: st.id });
        prev = st.id;
      });
    });
    const adj = S.mapLayer === 'all' ? S.adj : FT.kin.buildGraph(people, rels);
    return { people, rels, adj, ids };
  }
  function drawMap(fit = true) {
    const sub = (S.mapSub = mapSubset());
    if (!sub.ids.has(S.mapFocus)) setFocus(S.meta.meId); // e.g. centered on a friend, then switched to Family
    const gens = sub.adj === S.adj ? mapGens() : FT.fam.generations(S.mapFocus, sub.adj);
    FT.mindmap.render({ mode: S.mapMode, focusId: S.mapFocus, people: sub.people, rels: sub.rels, adj: sub.adj, byId: S.byId,
      describe, gens, depth: S.mapDepth, focusName: focusName(), fit });
    $('#mapLayer').value = S.mapLayer;
    $$('#mapMode button').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === S.mapMode));
    $('#mapDepth').value = String(S.mapDepth);
    relOptions($('#mapHi'), 'None', S.mapHi && S.mapHi.kind === 'rel' ? S.mapHi.value : '');
    applyHi(); // highlights stay on through redraws
  }
  // "Cousins (12)" etc., only for groups that have someone in them
  function relOptions(sel, first, value) {
    const n = new Map(); S.people.forEach((p) => { const g = relOf(p.id); if (g) n.set(g, (n.get(g) || 0) + 1); });
    sel.innerHTML = `<option value="${sel.id === 'relFilter' ? 'all' : ''}">${esc(first)}</option>` + FT.kin.REL_GROUPS.filter((g) => n.has(g.id))
      .map((g) => `<option value="${g.id}">${esc(g.en)} (${n.get(g.id)})</option>`).join('');
    sel.value = [...sel.options].some((o) => o.value === value) ? value : sel.options[0].value;
  }
  // People tab back to its starting state: everyone, by side, no search (and the People pane, if asked)
  function resetPeople(toPeoplePane = false) {
    Object.assign(S, { filter: 'all', rel: 'all', group: 'side' }); $('#search').value = '';
    $$('.chip').forEach((x) => x.classList.toggle('is-on', x.dataset.side === 'all'));
    $$('#groupBy button').forEach((x) => x.classList.toggle('is-on', x.dataset.group === 'side'));
    if (toPeoplePane) S.pane = 'people';
    renderPane(); window.scrollTo({ top: 0 }); toast('Filters reset');
  }
  // Settings tab: empty paste box, merge on, no old import report
  function resetData() {
    $('#pasteImport').value = ''; $('input[name=pasteFmt][value=auto]').checked = true; updatePasteDetect();
    $('#importMerge').checked = true; $('#importReport').hidden = true; $('#importReport').innerHTML = '';
    window.scrollTo({ top: 0 }); toast('Backup page reset');
  }
  // Back to the starting view: centered on me, everyone shown, no highlight, whole map in view
  function resetMap() {
    Object.assign(S, { mapLayer: 'all', mapDepth: 99, mapHi: null }); setFocus(S.meta.meId);
    $('#mapFind').value = ''; $('#mapFindList').hidden = true; $('#mapCard').hidden = true;
    drawMap(true); toast('Map reset');
  }
  // "me" when centred on me, otherwise the person's short name ("2 degrees from Masi")
  function focusName() { const p = S.byId.get(S.mapFocus); return S.mapFocus === S.meta.meId ? 'me' : (p.nickname || p.name.split(' ')[0]); }
  function setFocus(id) { S.mapFocus = id; }
  function renderMap() {
    if (!S.mapFocus || !S.byId.has(S.mapFocus)) setFocus(S.meta.meId);
    $('#mapCard').hidden = true;
    drawMap();
  }


  function mapPick(id, editing = false) {
    const p = S.byId.get(id), d = describe(id);
    const card = $('#mapCard');
    card.innerHTML = `<button class="icon-btn small mc-close" data-act="close" aria-label="Close card"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      ${avatar(p)}<div class="mc-main"><b>${esc(p.nickname || p.name)}</b>${p.nickname ? `<small>${esc(p.name)}</small>` : ''}
      <span>${d.called ? `<b class="called">${esc(d.called)}</b> · ` : ''}${d.bnScript ? `<span lang="${langAttr(d)}">${esc(d.bnScript)}</span>${d.bn ? ' ' + esc(d.bn) : ''} · ` : ''}${esc(d.en)} ${id !== S.meta.meId ? FT.speak.button() : ''}</span></div>
      <div class="mc-contact">${infoIcons(p)}
        <span class="mc-quick">${p.phone ? `<a class="icon-btn" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}" aria-label="Call">${icon('phone')}</a>` : ''}${p.phone && p.whatsapp !== false ? `<a class="icon-btn" href="${waUrl(p.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}${p.email ? `<a class="icon-btn" href="mailto:${esc(p.email)}" aria-label="Email">${icon('email')}</a>` : ''}${p.address || p.city ? `<a class="icon-btn" href="${mapsUrl([p.address, p.city].filter(Boolean).join(', '))}" target="_blank" rel="noopener" aria-label="Open in Maps">${icon('address')}</a>` : ''}</span></div>
      <p class="mc-gen">${esc(genLine(p, d))}${degreeText(id)}</p>
      ${bornEditor(p, 'mc')}
      ${d.nuance ? `<p class="mc-nuance"><b>Nuance:</b> ${esc(d.nuance)}</p>` : ''}
      <div class="mc-notes">
        ${editing ? `<div class="with-mic area"><textarea id="mcNotes" rows="4" placeholder="Notes about ${esc(p.nickname || p.name)}…">${esc(p.notes || '')}</textarea>${MIC_SVG_BTN('mcNotes')}</div>
          <div class="mc-actions"><button class="btn small" data-act="cancel">Cancel</button><button class="btn small primary" data-act="save">Save notes</button></div>`
        : `<button class="mc-note-view" data-act="edit" aria-label="Edit notes">${p.notes ? esc(p.notes).replace(/\n/g, '<br>') : '<span class="hint">No notes yet — tap to add</span>'}</button>`}
      </div>
      ${editing ? '' : `<div class="mc-actions">${S.paths.has(id) && id !== S.meta.meId ? '<button class="btn small" data-act="path">Path from me</button>' : ''}${id !== S.meta.meId ? '<button class="btn small" data-act="family">Their family + path</button>' : ''}<button class="btn small" data-act="trail">Trail to …</button><button class="btn small" data-act="center">Center here</button><button class="btn small primary" data-act="open">Open card</button></div>`}`;
    card.hidden = false;
    card.onclick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') card.hidden = true;
      if (act === 'center') { setFocus(id); drawMap(); card.hidden = true; }
      if (act === 'open') openSheet(id);
      if (act === 'edit') { mapPick(id, true); $('#mcNotes').focus(); }
      if (act === 'cancel') mapPick(id);
      if (act === 'say') sayPerson(id);
      if (act === 'path') { card.hidden = true; showPath(id); }
      if (act === 'family') { card.hidden = true; showPath(id, 'family'); }
      if (act === 'trail') { const box = card.querySelector('.mc-actions'); box.outerHTML = betweenPicker(id, 'mc'); }
      if (act === 'between') { const other = $('#mcBetween').value; card.hidden = true; showBetween(id, other); }
      if (act === 'born') { await saveBorn(p, $('#mcBorn').value); drawMap(false); mapPick(id); }
      if (act === 'save') {
        p.notes = $('#mcNotes').value.trim(); await savePerson(p);
        recompute(); toast('Notes saved'); drawMap(false); mapPick(id);
      }
    };
    if (editing) attachMic(card.querySelector('.mic'), () => $('#mcNotes'));
  }

  // ---- Add / edit form
  const presetList = () => FT.kin.presets(dispSide);
  function fillPresetAndAnchors() {
    $('#presetSelect').innerHTML = presetList().map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('');
    $('#anchorSelect').innerHTML = personOptions(S.people, true);
  }
  // Person dropdowns: Me first, then A→Z by the name shown; the relation is added so two "Ravi"s can be told apart
  function personOptions(list, withTerm = false) {
    const label = (p) => (p.id === S.meta.meId ? 'Me' : p.nickname || p.name);
    const seen = new Map(); list.forEach((p) => { const k = label(p).toLowerCase(); seen.set(k, (seen.get(k) || 0) + 1); });
    return [...list].sort((a, b) => (a.id === S.meta.meId ? -1 : b.id === S.meta.meId ? 1 : label(a).localeCompare(label(b), undefined, { sensitivity: 'base' })))
      .map((p) => {
        const d = describe(p.id), t = d.called || d.bn || d.bnScript || d.en;
        const dup = seen.get(label(p).toLowerCase()) > 1;
        const extra = p.id === S.meta.meId ? '' : withTerm && (d.bn || d.bnScript) ? ` (${d.bn || d.bnScript})` : dup ? ` (${t}${p.nickname && p.nickname !== p.name ? ', ' + p.name : ''})` : '';
        return `<option value="${p.id}">${esc(label(p) + extra)}</option>`;
      }).join('');
  }

  function openForm({ editId = null, anchorId = null } = {}) {
    const f = $('#personForm');
    f.reset();
    S.editingId = editId;
    fillPresetAndAnchors();
    $('#relateBlock').hidden = !!editId;
    $('#formTitle').textContent = editId ? 'Edit details' : 'Add someone';
    $('#saveBtn').textContent = editId ? 'Save changes' : 'Save person';
    f.metOn.value = today();
    S.formPhotos = [];
    $('#fcPasteBox').hidden = true; $('#fcText').value = '';
    if (editId) {
      const p = S.byId.get(editId);
      ['name', 'nickname', 'phone', 'city', 'address', 'email', 'metOn', 'notes', 'calledTerm', 'termNuance', 'heritage'].forEach((k) => (f[k].value = p[k] || ''));
      f.dob.value = FT.io.dobForInput(p.dob || p.birthYear || '') || (p.birthDecade ? p.birthDecade + 's' : '');
      f.whatsapp.checked = p.whatsapp !== false;
      f.deceased.checked = !!p.deceased; f.died.value = p.died || '';
      $$('input[name=gender]', f).forEach((r) => (r.checked = r.value === (p.gender || 'x')));
      S.formPhotos = [...(p.photos || [])];
    } else if (anchorId) {
      $$('input[name=mode]', f).forEach((r) => (r.checked = r.value === 'relative'));
      f.anchor.value = anchorId;
    }
    syncMode();
    renderFormPhotos();
    show('add');
  }

  function syncMode() {
    const f = $('#personForm');
    const mode = f.querySelector('input[name=mode]:checked').value;
    $$('[data-mode]', f).forEach((el) => (el.hidden = el.dataset.mode !== mode));
    // family relations decide gender; friends (and "not sure yet") need it picked
    const word = mode === 'relative' ? f.relation.value : mode === 'preset' ? (presetList()[+f.preset.value] || { path: [''] }).path.slice(-1)[0] : '';
    $('#genderField').hidden = mode !== 'none' && !S.editingId && WORD_STEP[word] !== 'friend';
    const lbl = mode === 'relative' ? alsoLinkLabel(f.relation.value, f.anchor.value) : '';
    $('#alsoLinkRow').hidden = !lbl;
    $('#alsoLinkText').textContent = lbl;
    updatePreview();
  }

  function updatePreview() {
    const f = $('#personForm');
    if (S.editingId) return;
    const fd = new FormData(f);
    const tmp = { id: '__preview__', name: fd.get('name') || 'They', dob: FT.io.parseDate(fd.get('dob')) || '', photos: [] };
    if (fd.get('mode') === 'none') { $('#relPreview').innerHTML = 'They\'ll be saved unlinked — you can connect them later from their card.'; return; }
    const plan = planFromForm(fd, tmp);
    const d = previewDescribe(plan, tmp.id);
    const extra = plan.people.length > 1 ? ` <span class="hint">Will also add placeholder${plan.people.length > 2 ? 's' : ''}: ${plan.people.slice(1).map((p) => esc(p.name)).join(', ')}</span>` : '';
    $('#relPreview').innerHTML = `<span class="pv-label">Your</span> <b lang="${langAttr(d)}">${esc(d.bnScript || '')}</b> <b>${esc(d.bn || '')}</b> <span class="pv-en">${esc(d.en)}</span>${extra}`;
  }

  async function submitForm(e) {
    e.preventDefault();
    const f = $('#personForm');
    const fd = new FormData(f);
    const name = (fd.get('name') || '').trim();
    if (!name) { f.name.focus(); toast('Add a name first'); return; }
    const dobRaw = (fd.get('dob') || '').trim();
    const decM = dobRaw.match(/^~?(\d{3})0'?s$/i);
    const dob = decM ? '' : FT.io.parseDate(dobRaw);
    if (dobRaw && !dob && !decM) { f.dob.focus(); toast('Date of birth: try 04/14/1962, 1962, or a decade like 1960s'); return; }
    const fields = {
      name, nickname: fd.get('nickname').trim(), calledTerm: (fd.get('calledTerm') || '').trim(), termNuance: (fd.get('termNuance') || '').trim(), heritage: fd.get('heritage') || '', dob: dob || '', birthYear: dob ? dob.slice(0, 4) : '', birthDecade: decM ? decM[1] + '0' : '',
      phone: fd.get('phone').trim(), whatsapp: fd.get('whatsapp') === 'on', email: fd.get('email').trim(),
      deceased: fd.get('deceased') === 'on', died: (fd.get('died') || '').trim(),
      city: fd.get('city').trim(), address: (fd.get('address') || '').trim(), metOn: fd.get('metOn'), notes: fd.get('notes').trim(), photos: S.formPhotos,
    };
    if (S.editingId) {
      const p = { ...S.byId.get(S.editingId), ...fields, placeholder: false };
      if (!$('#genderField').hidden) p.gender = fd.get('gender');
      Object.assign(S.people.find((x) => x.id === p.id), p);
      await savePerson(p);
      recompute(); toast('Saved'); renderHeader(); openSheet(p.id); show('people');
      return;
    }
    const person = { id: uid(), ...fields, gender: fd.get('gender') || 'x', createdAt: new Date().toISOString() };
    const twin = FT.dupes.matchFor(person);
    if (twin && twin.reasons.some((r) => /name/.test(r))) {
      const pick = await choose(`${person.name} looks like ${twin.p.nickname || twin.p.name}, who's already saved (${twin.reasons.join(', ')}).`, [
        { key: 'open', label: `Open ${twin.p.nickname || twin.p.name} instead`, primary: true }, { key: 'new', label: "Save as a new person (they're different)" }]);
      if (!pick) return;
      if (pick === 'open') { show('people'); openSheet(twin.p.id); return; }
    }
    const plan = planFromForm(fd, person);
    for (const p of plan.people) { S.people.push(p); await savePerson(p); }
    for (const r of plan.rels) { S.relationships.push(r); await saveRel(r); }
    recompute(); renderHeader();
    const d = describe(person.id);
    toast(`Added ${person.name}${d.bn || d.bnScript ? ' — your ' + (d.bn || d.bnScript) : ''}`);
    show('people');
    openSheet(person.id);
  }

  // ---- Backup view stats
  async function renderStats() {
    const photos = S.people.reduce((n, p) => n + (p.photos || []).length, 0);
    const est = await FT.db.estimate();
    const persisted = await FT.db.isPersisted();
    const mb = est ? (est.usage / 1048576).toFixed(1) : '?';
    const last = S.meta.lastBackup ? new Date(S.meta.lastBackup).toLocaleString() : 'never';
    $('#stats').innerHTML = `
      <div><b>${S.people.length}</b><span>people</span></div>
      <div><b>${S.relationships.length}</b><span>links</span></div>
      <div><b>${photos}</b><span>photos</span></div>
      <div><b>${mb} MB</b><span>used</span></div>
      <p class="hint full">Last backup: ${esc(last)} · Storage ${persisted ? 'protected' : 'not protected yet'}</p>`;
    $('#voiceLang').value = S.meta.voiceLang || 'en-IN';
    renderHeritage();
  }

  /* ---------- 4. Person sheet ---------- */

  // Spouse(s) with marriage status, then parents, siblings, children — each tappable
  function familySection(id) {
    const edges = S.adj.get(id) || [];
    const chip = (e) => { const w = S.byId.get(e.to);
      const kindLabel = e.step === 'friend' ? (FT.kin.FRIEND_KINDS[e.rel.kind] || FT.kin.FRIEND_KINDS.friend).en : '';
      return `<li><button class="link-row" data-open="${e.to}"><span>${lateTag(w)}${esc(w.nickname || w.name)}</span>${kindLabel ? `<small>${esc(kindLabel)}</small>` : (() => { const dd = describe(e.to), t = dd.called || dd.bn || ''; return t && t.toLowerCase() !== (w.nickname || w.name).toLowerCase() ? `<small>${esc(t)}</small>` : ''; })()}</button>
        ${e.rel ? `<button class="icon-btn small" data-unlink="${e.rel.id}" aria-label="Remove link"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : '<span class="hint">via parents</span>'}</li>`; };
    const group = (label, list) => (list.length ? `<div class="fam-group"><span class="rl-kind">${label}</span><ul class="rel-list">${list.map(chip).join('')}</ul></div>` : '');
    const spouses = edges.filter((e) => e.step === 'spouse' && e.rel);
    const spouseHtml = spouses.map((e) => { const w = S.byId.get(e.to); const st = e.rel.status || 'married';
      return `<div class="spouse-row">
        <svg class="ic rings-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>
        <button class="link-row" data-open="${e.to}"><span>${lateTag(w)}${esc(w.nickname || w.name)}</span></button>
        <select data-rel-status="${e.rel.id}" aria-label="Marriage status">${['married', 'separated', 'widowed'].map((x) => `<option value="${x}" ${x === st ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select>
        <input data-rel-year="${e.rel.id}" value="${esc(e.rel.marriedOn ? FT.io.dobForInput(e.rel.marriedOn) : e.rel.marriedYear || '')}" placeholder="Year or date" aria-label="Year or full date married" />
        <button class="icon-btn small" data-unlink="${e.rel.id}" aria-label="Remove link"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>`; }).join('');
    const html = (spouses.length ? `<div class="fam-group"><span class="rl-kind">Married to</span>${spouseHtml}</div>` : '')
      + group('Parents', edges.filter((e) => e.step === 'parent'))
      + group('Siblings', edges.filter((e) => e.step === 'sibling'))
      + group('Children', edges.filter((e) => e.step === 'child'))
      + group('Friends & circles', edges.filter((e) => e.step === 'friend'));
    return html || '<p class="hint">Not linked to anyone yet.</p>';
  }

  function openSheet(id) {
    const p = S.byId.get(id); if (!p) return; S.sheetId = id;
    const d = describe(id);
    const photos = p.photos || [];
    $('#sheetBody').innerHTML = `
      <div class="sheet-top"><button class="icon-btn" data-act="close" aria-label="Close">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="sheet-hero">
        ${photos.length ? `<img class="hero-photo" id="heroPhoto" src="${photos[0]}" alt="Photo of ${esc(p.name)}" />` : avatar(p, 'xl')}
        <div>
          ${p.deceased ? `<p class="late-line">স্বর্গীয় · Late${p.died ? ` · passed away ${esc(p.died)}` : ''}</p>` : ''}
          <h2 class="display" id="sheetName">${esc(p.nickname || p.name)}</h2>
          ${p.nickname ? `<p class="muted">${esc(p.name)}</p>` : ''}
          ${d.called ? `<p class="term called-big">${esc(d.called)}</p>` : ''}
          <p class="term side-${d.side}">${d.bnScript ? `<b lang="${langAttr(d)}">${esc(d.bnScript)}</b> ${esc(d.bn)}` : ''}${d.called && d.bnScript ? ' <span class="hint">(from the links)</span>' : ''}${d.bnScript && !allBengali() ? ` <small class="cult-tag">${esc(cultName(d.culture))}</small>` : ''} ${id !== S.meta.meId && (d.bnScript || d.called) ? FT.speak.button() : ''}</p>
          ${viewAs() && d.yourWord ? `<p class="muted">Your word: <b>${esc(d.yourWord)}</b></p>` : ''}
          <p class="muted">${esc(d.en)}${d.enTerm && d.culture !== 'english' && d.enTerm.toLowerCase() !== d.en.toLowerCase() ? ` · ${esc(d.enTerm)}` : ''}</p>
          ${(d.alt || []).length ? `<p class="alt-terms">${d.alt.map((a) => `<span><small>${esc(a.name)}</small> <b lang="${esc(a.lang)}">${esc(a.script)}</b>${a.roman ? ' ' + esc(a.roman) : ''}</span>`).join('')}</p>` : ''}
        </div>
      </div>
      ${photos.length > 1 ? `<div class="thumbs">${photos.map((ph, i) => `<button data-photo="${i}"><img src="${ph}" alt="Photo ${i + 1}" /></button>`).join('')}</div>` : ''}
      ${infoIcons(p)}
      <h3>Contact</h3>
      ${contactRows(p)}
      ${d.nuance ? `<div class="nuance"><span>Term nuance</span><p>${esc(d.nuance)}</p></div>` : ''}
      <dl class="facts">
        ${p.metOn ? `<div><dt>Met on</dt><dd>${esc(p.metOn)}</dd></div>` : ''}
        ${p.notes ? `<div class="full"><dt>Notes</dt><dd>${esc(p.notes).replace(/\n/g, '<br>')}</dd></div>` : ''}
      </dl>
      <h3>Family</h3>
      ${FT.checks.pathHtml(id)}
      ${S.people.length > 2 ? betweenPicker(id, 'sh') : ''}
      <p class="gen-line">${esc(genLine(p, d))}</p>
      ${id !== S.meta.meId && d.side !== 'friend' ? heritagePicker(p, d) : ''}
      ${bornEditor(p, 'sh')}
      ${familySection(id)}
      ${FT.visits.forPersonHtml(id)}
      <details class="link-existing"><summary>Link to someone already saved</summary>
        <div class="row2">
          <label class="field"><span>${esc(p.nickname || p.name)} is the…</span>
            <select id="leRel">${Object.keys(WORD_STEP).map((w) => `<option value="${w}">${w}</option>`).join('')}</select></label>
          <label class="field"><span>…of</span><select id="lePerson">${personOptions(S.people.filter((x) => x.id !== id))}</select></label>
        </div>
        <button class="btn small primary" id="leGo">Link them</button>
      </details>
      <div class="sheet-actions">
        <button class="btn primary" data-act="relative">Add their relative</button>
        <button class="btn" data-act="map">Show on map</button>
        <button class="btn" data-act="edit">Edit</button>
        ${id !== S.meta.meId ? '<button class="btn danger ghost" data-act="delete">Delete</button>' : ''}
      </div>`;

    const sheet = $('#sheet');
    const body = $('#sheetBody');
    body.onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.photo) { $('#heroPhoto').src = photos[+t.dataset.photo]; return; }
      if (t.dataset.open) { openSheet(t.dataset.open); return; }
      if (t.dataset.editVisit) { FT.visits.open(S.visits.find((v) => v.id === t.dataset.editVisit)); return; }
      if (t.dataset.unlink) {
        if (!await ask('Remove this link?')) return;
        S.relationships = S.relationships.filter((r) => r.id !== t.dataset.unlink);
        await FT.db.del('relationships', t.dataset.unlink);
        recompute(); openSheet(id); refresh(); return;
      }
      if (t.id === 'leGo') {
        const recs = linkRecords(id, $('#leRel').value, $('#lePerson').value, { adj: S.adj }, false);
        for (const r of recs) { S.relationships.push(r); await saveRel(r); }
        const g = WORD_GENDER[$('#leRel').value];
        if (g && (!p.gender || p.gender === 'x')) { p.gender = g; await savePerson(p); }
        recompute(); toast('Linked'); openSheet(id); refresh(); return;
      }
      switch (t.dataset.act) {
        case 'born': await saveBorn(p, $('#shBorn').value); openSheet(id); refresh(); return;
        case 'say': sayPerson(id); return;
        case 'showpath': showPath(id); return;
        case 'showfamily': showPath(id, 'family'); return;
        case 'between': showBetween(id, $('#shBetween').value); return;
        case 'visit': FT.visits.open(null, [id]); return;
        case 'close': sheet.close(); break;
        case 'relative': sheet.close(); openForm({ anchorId: id }); break;
        case 'edit': sheet.close(); openForm({ editId: id }); break;
        case 'map': sheet.close(); setFocus(id); show('map'); break;
        case 'delete':
          if (!await ask(`Delete ${p.name} and their links? This can't be undone (unless you have a backup).`)) return;
          S.people = S.people.filter((x) => x.id !== id);
          const gone = S.relationships.filter((r) => r.from === id || r.to === id);
          S.relationships = S.relationships.filter((r) => !gone.includes(r));
          await FT.db.del('people', id);
          for (const r of gone) await FT.db.del('relationships', r.id);
          for (const v of S.visits.filter((x) => (x.peopleIds || []).includes(id))) { // take them out of visits too
            v.peopleIds = v.peopleIds.filter((x) => x !== id); await FT.db.put('visits', v);
          }
          recompute(); sheet.close(); refresh(); toast('Deleted');
          break;
      }
    };
    body.onchange = async (e) => {
      const st = e.target.dataset.relStatus, yr = e.target.dataset.relYear;
      const r = S.relationships.find((x) => x.id === (st || yr)); if (!r) return;
      if (st) r.status = e.target.value;
      if (yr) { // a year (1985) or a full date (02/14/1985); a full date also gives an anniversary under Dates
        const v = e.target.value.trim(); const full = /^\d{4}$/.test(v) ? null : FT.io.parseDate(v);
        if (v && !/^\d{4}$/.test(v) && !(full && full.length === 10)) { toast('Married: a year like 1985, or a date like 02/14/1985'); return; }
        r.marriedOn = full && full.length === 10 ? full : ''; r.marriedYear = v ? (full ? full.slice(0, 4) : v) : '';
      }
      await saveRel(r); recompute(); toast('Saved'); refresh();
    };
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
  }

  function refresh() { renderHeader(); if (S.view === 'people') renderPane(); if (S.view === 'map') renderMap(); }

  /* ---------- Fill the form from a shared contact ---------- */
  async function fillFormFromContact(c, source) {
    if (!c) { toast("Couldn't find a name, number or email in that"); return; }
    const f = $('#personForm');
    const set = (k, v) => { if (v) f[k].value = v; };
    set('name', c.name); set('nickname', c.nickname); set('phone', c.phone); set('email', c.email);
    set('address', c.address); set('city', c.city);
    if (c.dob) f.dob.value = FT.io.dobForInput(c.dob);
    if (c.notes) f.notes.value = [f.notes.value.trim(), c.notes].filter(Boolean).join('\n');
    for (const url of c.photos || []) {
      try { const blob = await (await fetch(url)).blob(); S.formPhotos.push(await resizeImage(blob)); } catch { /* skip bad photo */ }
    }
    renderFormPhotos(); updatePreview();
    $('#fcPasteBox').hidden = true;
    toast(`Filled from ${source} — now choose how they're related, then Save`);
    f.name.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function contactFromFile(file) {
    const text = await file.text();
    const cards = FT.io.parseVCards(text);
    if (cards.length > 1) {
      if (await ask(`This file has ${cards.length} contacts. Import all of them as unlinked people? (Cancel = just fill the form with the first one)`)) {
        await importFile(new File([text], file.name || 'contacts.vcf', { type: 'text/vcard' }), true); show('data'); return;
      }
    }
    await fillFormFromContact(cards[0] || FT.io.parseContactText(text), 'the contact file');
  }
  // Android Chrome Contact Picker (needs https or localhost)
  const hasPicker = () => 'contacts' in navigator && navigator.contacts && 'select' in navigator.contacts;
  async function pickPhoneContact() {
    try {
      const avail = navigator.contacts.getProperties ? await navigator.contacts.getProperties() : ['name', 'tel', 'email'];
      const want = ['name', 'tel', 'email', 'address', 'icon'].filter((x) => avail.includes(x));
      const [c] = await navigator.contacts.select(want, { multiple: false });
      if (!c) return;
      const a = (c.address || [])[0];
      const out = { name: (c.name || [])[0] || '', phone: (c.tel || [])[0] || '', email: (c.email || [])[0] || '',
        address: a ? [...(a.addressLine || []), a.region, a.postalCode, a.country].filter(Boolean).join(', ') : '', city: a ? a.city || '' : '',
        notes: (c.tel || []).length > 1 ? 'Other numbers: ' + c.tel.slice(1).join(', ') : '', photos: [] };
      for (const blob of c.icon || []) { try { S.formPhotos.push(await resizeImage(blob)); } catch {} }
      await fillFormFromContact(out, 'your phone contacts');
    } catch (e) { if (e.name !== 'AbortError' && e.name !== 'InvalidStateError') toast('Could not open contacts: ' + e.message); }
  }
  // Contact shared to Paribar from another Android app (installed app only — see sw.js share target)
  async function checkShareInbox() {
    if (!/[?&]share=1/.test(location.search) || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname);
    const cache = await caches.open('paribar-share');
    const res = await cache.match(new URL('__share-inbox', location.href).href);
    if (!res) return;
    const { text } = await res.json();
    await cache.delete(new URL('__share-inbox', location.href).href);
    if (!S.meta.meId) { toast('Set yourself up first, then share the contact again'); return; }
    openForm();
    const cards = FT.io.parseVCards(text);
    if (cards.length > 1) { await contactFromFile(new File([text], 'shared.vcf')); return; }
    await fillFormFromContact(cards[0] || FT.io.parseContactText(text), 'the shared contact');
  }

  /* ---------- 5. Voice input + photos ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let activeRec = null;
  function MIC_SVG_BTN(target) {
    return `<button type="button" class="mic" data-target="${target}" aria-label="Speak"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></button>`;
  }
  function setupMics() { $$('#personForm .mic').forEach((btn) => attachMic(btn, () => $('#personForm')[btn.dataset.target])); }
  function attachMic(btn, getInput) {
    if (!btn) return;
    if (!SR) { btn.hidden = true; return; }
    btn.addEventListener('click', () => {
      if (activeRec) { activeRec.stop(); return; }
      const input = getInput();
      const rec = new SR();
      rec.lang = S.meta.voiceLang || 'en-IN';
      rec.interimResults = true;
      rec.continuous = input.tagName === 'TEXTAREA';
      const base = input.value ? input.value.replace(/\s*$/, ' ') : '';
      let finalText = '';
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
        }
        input.value = (base + finalText + interim).trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Allow microphone access to use voice' : 'Voice: ' + ev.error);
      rec.onend = () => { btn.classList.remove('is-rec'); activeRec = null; };
      btn.classList.add('is-rec');
      activeRec = rec;
      rec.start();
    });
  }

  // Shrink photos so hundreds of them still fit comfortably on the phone
  function resizeImage(file, max = 960, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  async function addPhotos(files) {
    for (const f of files) {
      try { S.formPhotos.push(await resizeImage(f)); } catch { toast('Could not read that image'); }
    }
    renderFormPhotos();
  }
  function renderFormPhotos() {
    $('#photoStrip').innerHTML = S.formPhotos.map((ph, i) => `<div class="ps-item">
      <img src="${ph}" alt="Photo ${i + 1}" />${i === 0 ? '<span class="ps-main">Main</span>' : `<button type="button" data-main="${i}" class="ps-make">Make main</button>`}
      <button type="button" class="ps-del" data-del="${i}" aria-label="Remove photo"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('');
  }

  /* ---------- 6. Export / import / vCard / demo ---------- */
  function backupBlob() {
    const data = { app: 'paribar', schemaVersion: 2, exportedAt: new Date().toISOString(),
      meta: S.meta, relationships: S.relationships, visits: S.visits,
      // relationToMe is computed for readability (Bengali term etc.); it is ignored on import and recalculated
      people: S.people.map((p) => {
        const d = describe(p.id);
        return { ...p, relationToMe: { term: d.bnScript || null, termRoman: d.bn || null, heritage: d.culture || null, english: d.en, side: d.side, path: d.words } };
      }) };
    return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  }
  // Paribar_backup_2026-10-22_14-35.json — app name, kind, local date + 24h time (no colons)
  const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`; };
  const KIND = { json: 'backup', csv: 'spreadsheet', zip: 'spreadsheet+photos', vcf: 'contacts', ics: 'calendar', png: 'family-tree' };
  const fname = (ext, kind = KIND[ext]) => `Paribar_${kind}_${stamp()}.${ext}`;
  function download(blob, name) {
    if (FT.db.download) return FT.db.download(blob, name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function markBackedUp() {
    clearTimeout(changeTimer); // a pending counter write must not undo the reset
    await setMeta('lastBackup', new Date().toISOString()); await setMeta('changesSinceBackup', 0); renderHeader(); renderStats();
  }
  // One tap from the header pill: share sheet on Android (WhatsApp, Drive…), download elsewhere
  async function quickBackup() {
    const n = S.meta.changesSinceBackup || 0;
    if (!await ask(`Back up now? ${n ? `${n} change${n > 1 ? 's' : ''} since your last backup. ` : ''}This saves everything, photos and visits included, as one .json file.`, { ok: 'Back up' })) return;
    await exportShare();
  }
  // Every save/delete counts as a change; at 10 we remind once, then the header pill stays up
  let changeTimer = null;
  function countChange() {
    S.meta.changesSinceBackup = (S.meta.changesSinceBackup || 0) + 1;
    clearTimeout(changeTimer); // write the counter once per burst of saves, not on every single one
    changeTimer = setTimeout(() => { FT.db.setMeta('changesSinceBackup', S.meta.changesSinceBackup); renderHeader(); }, 400);
    if (S.meta.changesSinceBackup === 10) setTimeout(() => toast('10 changes since your last backup. Tap the red button at the top to back up.'), 600);
  }

  async function exportShare() {
    const file = new File([backupBlob()], fname('json'), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Paribar backup' }); await markBackedUp(); }
      catch (e) { if (e.name !== 'AbortError') toast('Share failed — try Download instead'); }
    } else { download(file, file.name); await markBackedUp(); toast('Sharing not available here, so it was downloaded'); }
  }

  function exportVcf() {
    const vc = S.people.filter((p) => p.phone || p.email).map((p) => {
      const d = describe(p.id);
      const term = [d.bn, d.en].filter(Boolean).join(' — ');
      return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${p.nickname ? `${p.nickname} (${p.name})` : p.name}`,
        d.bn ? `NICKNAME:${d.bn}` : '', p.phone ? `TEL;TYPE=CELL:${p.phone}` : '', p.email ? `EMAIL:${p.email}` : '',
        p.address || p.city ? `ADR;TYPE=HOME:;;${(p.address || '').replace(/[\n;]/g, ', ')};${p.city || ''};;;` : '', `NOTE:${(term + (p.notes ? ' | ' + p.notes : '')).replace(/\n/g, ' ')}`,
        'CATEGORIES:Paribar', 'END:VCARD'].filter(Boolean).join('\r\n');
    });
    if (!vc.length) { toast('No one has a phone or email yet'); return; }
    download(new Blob([vc.join('\r\n')], { type: 'text/vcard' }), fname('vcf'));
    toast(`Exported ${vc.length} contact${vc.length > 1 ? 's' : ''}`);
  }

  /* ----- CSV export: one row per person, links as id + name columns ----- */
  const CSV_HEADERS = ['id', 'name', 'nickname', 'gender', 'dob', 'phone', 'whatsapp', 'email', 'address', 'city', 'met_on', 'notes',
    'relation_to_me', 'called_term', 'term_nuance', 'native_term', 'native_roman', 'term_heritage', 'heritage', 'relation_english', 'side',
    'mother_id', 'mother_name', 'father_id', 'father_name', 'parent_ids', 'spouse_ids', 'spouse_names', 'sibling_ids', 'sibling_names', 'friend_ids', 'friend_names',
    'deceased', 'died', 'is_me', 'photo_count', 'photo_files'];
  function buildCsv(photoMap = null) {
    const nm = (id) => { const x = S.byId.get(id); return x ? x.name : ''; };
    const extraKeys = [...new Set(S.people.flatMap((p) => Object.keys(p.extra || {})))];
    const rows = S.people.map((p) => {
      const d = describe(p.id);
      const edges = S.adj.get(p.id) || [];
      const parents = edges.filter((e) => e.step === 'parent').map((e) => e.to);
      const mom = parents.find((id) => S.byId.get(id).gender === 'f');
      const dad = parents.find((id) => S.byId.get(id).gender === 'm');
      const other = parents.filter((id) => id !== mom && id !== dad);
      const spouses = edges.filter((e) => e.step === 'spouse').map((e) => e.to);
      const sibs = edges.filter((e) => e.step === 'sibling' && e.rel).map((e) => e.to); // explicit only; shared parents imply the rest
      const friends = S.relationships.filter((r) => r.type === 'friend_of' && r.from === p.id);
      return { id: p.id, name: p.name, nickname: p.nickname, gender: p.gender, dob: p.dob || p.birthYear || (p.birthDecade ? p.birthDecade + 's' : ''), phone: p.phone,
        whatsapp: p.phone ? (p.whatsapp !== false ? 'yes' : 'no') : '', email: p.email, address: p.address || '', city: p.city, met_on: p.metOn, notes: p.notes,
        called_term: p.calledTerm || '', term_nuance: p.termNuance || '', heritage: p.heritage ? cultName(p.heritage) : '', term_heritage: d.culture ? cultName(d.culture) : '',
        relation_to_me: d.side === 'friend' ? d.en : p.calledTerm || (d.culture === 'bengali' && d.bn) || (d.words.length ? d.words.join("'s ") : (p.id === S.meta.meId ? 'me' : '')),
        native_term: d.bnScript, native_roman: d.bn, relation_english: d.side === 'unlinked' ? '' : d.en, side: d.side,
        mother_id: mom || '', mother_name: nm(mom), father_id: dad || '', father_name: nm(dad), parent_ids: other.join('; '),
        spouse_ids: spouses.join('; '), spouse_names: spouses.map(nm).join('; '), sibling_ids: sibs.join('; '), sibling_names: sibs.map(nm).join('; '),
        // friend links written once (on the "from" person) as id:kind, plus readable names
        friend_ids: friends.map((r) => `${r.to}:${r.kind || 'friend'}`).join('; '), friend_names: friends.map((r) => `${nm(r.to)} (${r.kind || 'friend'})`).join('; '),
        deceased: p.deceased ? 'yes' : '', died: p.died || '',
        is_me: p.id === S.meta.meId ? 'yes' : '', photo_count: (p.photos || []).length || '',
        photo_files: photoMap && photoMap[p.id] ? photoMap[p.id].join('; ') : '', ...(p.extra || {}) };
    });
    return FT.io.toCSV([...CSV_HEADERS, ...extraKeys], rows);
  }
  function csvTemplate() {
    const h = ['name', 'nickname', 'relation_to_me', 'called_term', 'heritage', 'term_nuance', 'gender', 'dob', 'phone', 'whatsapp', 'email', 'address', 'city', 'notes', 'mother', 'father', 'spouse', 'siblings', 'photo_files'];
    return FT.io.toCSV(h, FT.demo.rows()); // the made-up sample family
  }

  /* ----- Spreadsheet + photos zip: people.csv + photos/<name>-<id>-<n>.jpg ----- */
  const dataUrlToBytes = (url) => {
    const [head, b64] = url.split(',');
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, ext: (head.match(/image\/(\w+)/) || [, 'jpg'])[1].replace('jpeg', 'jpg') };
  };
  const bytesToDataUrl = (bytes, mime) => {
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return `data:${mime};base64,${btoa(bin)}`;
  };
  const safeName = (s) => String(s || 'person').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 30) || 'person';

  function exportZip() {
    const files = {}; const photoMap = {}; let n = 0;
    S.people.forEach((p) => (p.photos || []).forEach((url, i) => {
      try {
        const { bytes, ext } = dataUrlToBytes(url);
        const path = `photos/${safeName(p.nickname || p.name)}-${p.id.slice(0, 8)}-${i + 1}.${ext}`;
        files[path] = [bytes, { level: 0 }];               // JPEGs are already compressed
        (photoMap[p.id] = photoMap[p.id] || []).push(path); n++;
      } catch { /* skip a broken photo rather than fail the export */ }
    }));
    files['people.csv'] = fflate.strToU8(buildCsv(photoMap));
    const zipped = fflate.zipSync(files);
    download(new Blob([zipped], { type: 'application/zip' }), fname('zip'));
    return n;
  }

  // Unzip → find the spreadsheet/backup inside → attach photos listed in photo_files
  async function readZip(file, warnings) {
    let entries;
    try { entries = fflate.unzipSync(new Uint8Array(await file.arrayBuffer())); }
    catch (e) { return { error: "That .zip couldn't be opened." }; }
    const names = Object.keys(entries).filter((k) => !k.startsWith('__MACOSX') && !k.endsWith('/') && !/(^|\/)\./.test(k));
    const dataName = names.find((k) => /(^|\/)people\.csv$/i.test(k)) || names.find((k) => /\.csv$/i.test(k)) || names.find((k) => /\.json$/i.test(k));
    if (!dataName) return { error: 'No .csv or .json file found inside the zip.' };
    const parsed = FT.io.readImport(fflate.strFromU8(entries[dataName]), dataName);
    if (parsed.error) return parsed;
    const byLower = new Map(names.map((k) => [k.toLowerCase(), k]));
    const byBase = new Map(names.map((k) => [k.split('/').pop().toLowerCase(), k]));
    const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
    parsed.photoCount = 0;
    for (const row of parsed.rows) {
      for (const ref of row.photoFiles || []) {
        const key = byLower.get(ref.toLowerCase()) || byLower.get(ref.toLowerCase().replace(/^\.?\//, '')) || byBase.get(ref.split('/').pop().toLowerCase());
        if (!key) { parsed.warnings.push(`${row.label}: photo "${ref}" not found in the zip`); continue; }
        const ext = key.split('.').pop().toLowerCase();
        const mime = MIME[ext];
        if (!mime) { parsed.warnings.push(`${row.label}: "${ref}" isn't a photo type I can read`); continue; }
        const bytes = entries[key];
        let url;
        // Small JPEGs (like our own exports) are kept byte-for-byte so re-imports don't duplicate photos
        if (mime === 'image/jpeg' && bytes.length < 400 * 1024) url = bytesToDataUrl(bytes, mime);
        else { try { url = await resizeImage(new Blob([bytes], { type: mime })); } catch { parsed.warnings.push(`${row.label}: couldn't read photo "${ref}"`); continue; } }
        row.person.photos = [...(row.person.photos || []), url]; parsed.photoCount++;
      }
    }
    parsed.format = 'zip';
    return parsed;
  }

  /* ----- Import: JSON or CSV → people + links, never throws on missing optional data ----- */
  const nameKey = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  function mergeFields(target, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (FT.io.isBlank(v)) return;                        // never blank out existing data
      if (k === 'photos') target.photos = [...new Set([...(target.photos || []), ...v])];
      else if (k === 'extra') target.extra = { ...(target.extra || {}), ...v };
      else if (k === 'gender' && v === 'x' && target.gender && target.gender !== 'x') return;
      else target[k] = v;
    });
    if (target.placeholder && src.name && src.placeholder !== true) target.placeholder = false;
  }

  // Walk a kinship path from Me (e.g. mother → sister), reusing people that exist and
  // creating placeholders that don't, then link `targetId` as the last step.
  function walkAndLink(path, targetId, people, rels, meId, addRel) {
    const byId = new Map(people.map((p) => [p.id, p]));
    let cur = meId; const walked = []; let created = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const w = path[i]; walked.push(w);
      const adj = FT.kin.buildGraph(people, rels);
      const cands = neighbours(adj, cur, WORD_STEP[w] || 'parent').filter((id) => id !== targetId);
      const found = cands.find((id) => byId.get(id).gender === WORD_GENDER[w]) || cands.find((id) => (byId.get(id).gender || 'x') === 'x');
      if (found) { cur = found; continue; }
      const curP = byId.get(cur);
      const ph = { id: uid(), name: FT.kin.placeholder(walked, cultureOfSide(sideOfWord(walked[0]))) || `${cur === meId ? 'My' : (curP.nickname || curP.name) + "'s"} ${w}`,
        gender: WORD_GENDER[w] || 'x', placeholder: true, photos: [], createdAt: new Date().toISOString() };
      people.push(ph); byId.set(ph.id, ph); created++;
      linkRecords(ph.id, w, cur, { adj }).forEach((r) => addRel(r.type, r.from, r.to));
      cur = ph.id;
    }
    const last = path[path.length - 1];
    const t = byId.get(targetId);
    if (WORD_GENDER[last] && (!t.gender || t.gender === 'x')) t.gender = WORD_GENDER[last];
    linkRecords(targetId, last, cur, { adj: FT.kin.buildGraph(people, rels) }).forEach((r) => addRel(r.type, r.from, r.to));
    return created;
  }

  async function importFile(file, merge) {
    const isXlsx = /\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type);
    const isZip = !isXlsx && (/\.zip$/i.test(file.name) || /zip/.test(file.type));
    let parsed;
    if (/\.xls$/i.test(file.name) || file.type === 'application/vnd.ms-excel') parsed = { error: 'That is the old Excel format (.xls). In Excel, use File › Save As › Excel Workbook (.xlsx) or CSV, then import that.' };
    else if (isXlsx) { // Excel: read the sheet as a spreadsheet, then import it like a .csv
      const x = FT.io.xlsxToCsv(new Uint8Array(await file.arrayBuffer()));
      parsed = x.error ? x : FT.io.readImport(x.csv, file.name.replace(/\.xlsx$/i, '.csv'));
      if (!parsed.error) { parsed.format = 'xlsx'; if (x.sheets > 1) parsed.warnings.unshift(`Read the sheet "${x.sheet}" (the file has ${x.sheets} sheets with data)`); }
    } else parsed = isZip ? await readZip(file) : FT.io.readImport(await file.text(), file.name);
    if (parsed.error) { showReport({ error: parsed.error }); toast(parsed.error); return; }
    if (parsed.format === 'vcf') merge = true; // contacts always add to what you have, never replace
    if (!merge && S.people.length > 1 && !await ask('Replace everything on this phone with this file? (Uncheck to merge instead.)')) return;
    const report = { format: parsed.format === 'zip' ? `ZIP · ${parsed.photoCount} photos` : parsed.format === 'xlsx' ? 'Excel' : /^pasted-contacts/.test(file.name) ? 'pasted contacts' : /^pasted\./.test(file.name) ? `pasted ${parsed.format.toUpperCase()}` : parsed.format.toUpperCase(), added: 0, updated: 0, links: 0, placeholders: 0, warnings: [...parsed.warnings] };
    const now = new Date().toISOString();
    const people = merge ? S.people.map((p) => ({ ...p })) : [];
    const rels = merge ? S.relationships.map((r) => ({ ...r })) : [];
    let meId = merge ? S.meta.meId : null;
    const idMap = new Map();

    // 1. People — match by id, then (merge only) by unique name, otherwise add
    parsed.rows.forEach((row) => {
      let target = row.srcId ? people.find((p) => p.id === row.srcId) : null;
      if (!target && merge) {
        const m = people.filter((p) => nameKey(p.name) === nameKey(row.person.name));
        if (m.length === 1 && (!row.srcId || !idMap.has(row.srcId))) target = m[0];
      }
      if (!target && merge && row.person.phone) {
        const last10 = (v) => String(v || '').replace(/[^\d]/g, '').slice(-10);
        const m = people.filter((p) => p.phone && last10(p.phone) === last10(row.person.phone));
        if (m.length === 1) target = m[0];
      }
      if (target && parsed.format === 'vcf') { delete row.person.name; delete row.person.nickname; }
      row.friend = FT.kin.friendKind(row.relationText); // friends layer: "colleague", "Priya's neighbor"
      const rel = row.friend ? null : FT.kin.termToPath(row.relationText);
      if (rel && rel.length === 0) row.isMe = true;
      if (!target && row.isMe && meId) target = people.find((p) => p.id === meId);
      if (target) { mergeFields(target, row.person); report.updated++; }
      else {
        target = { gender: 'x', photos: [], createdAt: now, ...row.person, id: row.srcId && !people.some((p) => p.id === row.srcId) ? row.srcId : uid() };
        people.push(target); report.added++;
      }
      row.finalId = target.id;
      row.path = rel;
      if (row.srcId) idMap.set(row.srcId, target.id);
      if (row.isMe) meId = target.id;
    });
    if (parsed.meRef && idMap.has(parsed.meRef)) meId = idMap.get(parsed.meRef);
    if (!meId || !people.some((p) => p.id === meId)) {
      const cur = S.byId.get(S.meta.meId);
      if (cur && !people.some((p) => p.id === cur.id)) { people.push({ ...cur }); meId = cur.id; report.warnings.push('No row was marked as you, so your current "Me" was kept.'); }
      else if (cur) meId = cur.id;
      else { const me = { id: uid(), name: 'Me', gender: 'x', isMe: true, placeholder: true, photos: [], createdAt: now }; people.push(me); meId = me.id;
        report.warnings.push('No row was marked as you (relation_to_me = "me"), so a "Me" placeholder was added — edit it with your name.'); }
    }

    // 2. Links
    const touched = new Set();
    const sameRel = (r, type, a, b) => r.type === type && ((r.from === a && r.to === b) || (type !== 'parent_of' && r.from === b && r.to === a));
    const addRel = (type, from, to, extra = {}) => {
      if (!from || !to || from === to || rels.some((r) => sameRel(r, type, from, to))) return false;
      rels.push({ id: uid(), type, from, to, createdAt: now, ...extra }); touched.add(from); touched.add(to); report.links++; return true;
    };
    const resolve = (ref, label) => {
      const r = String(ref || '').trim(); if (!r) return null;
      if (FT.kin.termToPath(r) && FT.kin.termToPath(r).length === 0 && ['me', 'self', 'ami', 'আমি', 'myself'].includes(r.toLowerCase())) return meId;
      if (idMap.has(r)) return idMap.get(r);
      if (people.some((p) => p.id === r)) return r;
      const match = (q) => people.filter((p) => nameKey(p.name) === nameKey(q) || (p.nickname && nameKey(p.nickname) === nameKey(q)));
      let m = match(r);
      if (m.length !== 1 && /\(.+\)/.test(r)) {               // "Grace Wong (Mom)" → try "Grace Wong", then "Mom"
        const outside = r.replace(/\s*\(.*?\)\s*/g, ' ').trim(), inside = (r.match(/\((.*?)\)/) || [])[1] || '';
        m = match(outside); if (m.length !== 1) m = match(inside);
      }
      if (m.length === 1) return m[0].id;
      report.warnings.push(`${label}: ${m.length ? `"${r}" matches ${m.length} people — use the id instead` : `couldn't find "${r}"`} — link skipped`);
      return null;
    };
    parsed.rels.forEach((r, i) => {
      const a = resolve(r.from, `Link ${i + 1}`), b = resolve(r.to, `Link ${i + 1}`);
      const { status, marriedYear, marriedOn } = r;
      if (a && b) addRel(r.type, a, b, Object.fromEntries(Object.entries({ status, marriedYear, marriedOn }).filter(([, v]) => v)));
    });
    const byIdNow = () => new Map(people.map((p) => [p.id, p]));
    parsed.rows.forEach((row) => {
      const L = row.links, me = row.finalId, lab = row.label;
      const setG = (id, g) => { const p = byIdNow().get(id); if (p && (!p.gender || p.gender === 'x')) p.gender = g; };
      L.mother.forEach((ref) => { const id = resolve(ref, lab); if (id) { addRel('parent_of', id, me); setG(id, 'f'); } });
      L.father.forEach((ref) => { const id = resolve(ref, lab); if (id) { addRel('parent_of', id, me); setG(id, 'm'); } });
      L.parents.forEach((ref) => { const id = resolve(ref, lab); if (id) addRel('parent_of', id, me); });
      L.spouses.forEach((ref) => { const id = resolve(ref, lab); if (id) addRel('spouse_of', me, id); });
      L.siblings.forEach((ref) => { const id = resolve(ref, lab); if (id) addRel('sibling_of', me, id); });
      // friends column: "Priya (colleague); Ma (neighbor)" or "id:colleague"
      // names here are often short ("Priya", "Lina"), so try a unique full name, nickname, term or first name before the usual lookup
      const loose = (ref) => {
        const k = nameKey(ref);
        for (const f of [(x) => x.name, (x) => x.nickname, (x) => x.calledTerm, (x) => (x.name || '').split(' ')[0]]) {
          const m = people.filter((x) => f(x) && nameKey(f(x)) === k); if (m.length === 1) return m[0].id;
        }
        return null;
      };
      L.friends.forEach((ref) => {
        const m = ref.match(/^(.*?)\s*(?:\(([^)]+)\)|:([a-z ]+))$/i);
        const who = m ? m[1] : ref, kind = (m && FT.kin.friendKindOf(m[2] || m[3])) || 'friend';
        const id = loose(who) || resolve(who, lab); if (id) addRel('friend_of', me, id, { kind });
      });
      // relation_to_me "colleague" or "Priya's neighbor"
      if (row.friend) { const id = row.friend.owner ? loose(row.friend.owner) || resolve(row.friend.owner, lab) : meId; if (id) addRel('friend_of', id, me, { kind: row.friend.kind }); }
    });

    // 2b. Only one parent given? If that parent has exactly one spouse, assume they're the other parent (same as the Add form)
    parsed.rows.forEach((row) => {
      const g = FT.kin.buildGraph(people, rels);
      const pars = neighbours(g, row.finalId, 'parent');
      if (pars.length !== 1) return;
      const sp = neighbours(g, pars[0], 'spouse');
      if (sp.length === 1 && addRel('parent_of', sp[0], row.finalId)) {
        const pn = (id) => { const x = people.find((p) => p.id === id); return x.nickname || x.name; };
        report.warnings.push(`${row.label}: assumed ${pn(sp[0])} is also a parent (spouse of ${pn(pars[0])})`);
      }
    });

    // 3. relation_to_me for anyone not linked yet — shortest paths first so Ma exists before Mama
    // Skip anyone already connected to Me through explicit links; link the rest via their relation
    const pending = parsed.rows.filter((row) => row.finalId !== meId);
    // Place disconnected branches one at a time. For each branch, try every member's relation_to_me,
    // and pick the most trustworthy placement:
    //   1. must be valid (nobody ends up with >2 parents or two mothers/fathers)
    //   2. prefer terms anchored on a parent (Pishi Didu = Ma's father's sister) over loose
    //      sibling-style terms (cousins are often called "Didi / Bon")
    //   3. fewer placeholders created, then longer (more specific) paths
    const validFamily = (ps, rs) => {
      const g = new Map(ps.map((x) => [x.id, x.gender || 'x']));
      const par = new Map();
      rs.filter((r) => r.type === 'parent_of').forEach((r) => (par.get(r.to) || par.set(r.to, []).get(r.to)).push(g.get(r.from)));
      for (const list of par.values()) {
        if (list.length > 2) return false;
        if (list.filter((x) => x === 'm').length > 1 || list.filter((x) => x === 'f').length > 1) return false;
      }
      return true;
    };
    for (let guard = 0; guard < 50; guard++) {
      const graph = FT.kin.buildGraph(people, rels.filter((r) => r.type !== 'friend_of')); // family placement ignores friend links
      const reach = FT.kin.pathsFrom(meId, graph);
      const cands = pending.filter((row) => row.path && row.path.length && !reach.has(row.finalId));
      if (!cands.length) break;
      // group by branch (connected component among unreached people)
      const comp = new Map(); let cid = 0;
      cands.forEach((row) => {
        if (comp.has(row.finalId)) return;
        const q = [row.finalId]; comp.set(row.finalId, ++cid);
        while (q.length) { const c = q.shift(); (graph.get(c) || []).forEach((e) => { if (!comp.has(e.to) && !reach.has(e.to)) { comp.set(e.to, cid); q.push(e.to); } }); }
      });
      let best = null;
      cands.forEach((row) => {
        const ps = people.map((x) => ({ ...x })), rs = rels.map((x) => ({ ...x }));
        let ok = true;
        const tmpAdd = (type, from, to) => { if (!rs.some((r) => sameRel(r, type, from, to))) rs.push({ id: 't', type, from, to }); return true; };
        let ph = 0;
        try { ph = walkAndLink(row.path, row.finalId, ps, rs, meId, tmpAdd); } catch { ok = false; }
        if (!ok || !validFamily(ps, rs)) return;
        const score = [['mother', 'father'].includes(row.path[0]) ? 0 : 1, ph, -row.path.length];
        const better = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
        if (!best || better(score, best.score)) best = { row, score };
      });
      if (!best) break; // nothing can be placed safely
      report.placeholders += walkAndLink(best.row.path, best.row.finalId, people, rels, meId, addRel);
    }
    pending.filter((row) => row.path && row.path.length && !FT.kin.pathsFrom(meId, FT.kin.buildGraph(people, rels)).has(row.finalId))
      .forEach((row) => report.warnings.push(`${row.label}: "${row.relationText}" can't be placed without contradicting other links (e.g. they'd get 3 parents) — saved unlinked`));
    const finalReach = FT.kin.pathsFrom(meId, FT.kin.buildGraph(people, rels));
    pending.filter((row) => row.relationText && !row.path && !row.friend && !finalReach.has(row.finalId))
      .forEach((row) => report.warnings.push(FT.kin.termOptions(row.relationText).length > 1
        ? `${row.label}: "${row.relationText}" could mean different relations — add a mother/father/spouse/siblings column to place them`
        : `${row.label}: didn't recognise relation "${row.relationText}" — saved unlinked`));
    const loose = parsed.rows.filter((row) => !finalReach.has(row.finalId)).length;
    if (loose) report.warnings.push(`${loose} imported ${loose > 1 ? 'people are' : 'person is'} not connected to you yet — find them under the "Unlinked" filter.`);

    // 3b. Possible duplicates that involve someone from this file (they're also listed under People › Duplicates)
    const fromFile = new Set(parsed.rows.map((r) => r.finalId));
    const dupList = FT.dupes.pairs(people, rels, new Set(S.meta.dismissed || [])).filter((x) => fromFile.has(x.a.id) || fromFile.has(x.b.id));
    if (dupList.length) report.warnings.push(`${dupList.length} possible duplicate${dupList.length > 1 ? 's' : ''} (e.g. ${dupList[0].a.name} / ${dupList[0].b.name}). Check them under People › Duplicates.`);

    // 4. Visits (JSON backups only): point them at the final person ids
    const mapId = (id) => idMap.get(id) || id;
    const visits = merge ? (S.visits || []).map((v) => ({ ...v })) : [];
    (parsed.visits || []).forEach((v) => {
      const nv = { ...v, peopleIds: [...new Set((v.peopleIds || []).map(mapId))].filter((id) => people.some((p) => p.id === id)) };
      const i = visits.findIndex((x) => x.id === nv.id); if (i >= 0) visits[i] = nv; else visits.push(nv);
    });

    // 5. Save atomically. Warnings stay visible under People › Needs attention until cleared.
    const keepWarnings = report.warnings.filter((w) => !/not connected to you yet|possible duplicate/.test(w)); // these have their own checks
    const meta = { ...(merge ? S.meta : {}), meId, importWarnings: keepWarnings.length ? { at: now, items: keepWarnings } : null };
    // heritage: a backup's own setting wins on replace; otherwise keep what's set here
    const her = (!merge && parsed.heritage) || S.meta.heritage || parsed.heritage; if (her) meta.heritage = her;
    const th = (!merge && parsed.theme) || S.meta.theme || parsed.theme; if (th) meta.theme = th;
    await FT.db.replaceAll({ people, relationships: rels, meta, visits });
    Object.assign(S, { people, relationships: rels, meta, visits }); renderTheme();
    recompute(); renderHeader();
    showReport(report);
    toast(`Imported: ${report.added} added, ${report.updated} updated`);
    if (S.view === 'setup') show('people');
  }

  /* ----- Paste-to-import: turn pasted text into a "file" and reuse the normal import ----- */
  function detectPasted(text) {
    const t = text.replace(/^\uFEFF/, '').trim();
    if (!t) return null;
    if (/^[{[]/.test(t)) return 'json';
    if (/BEGIN:VCARD/i.test(t)) return 'vcf';
    const first = t.split(/\r?\n/, 1)[0];
    const cells = first.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length > 1 && cells.some((c) => /^(name|full ?name|নাম)$/i.test(c))) return 'csv';
    return 'contact';
  }
  const FMT_LABEL = { json: 'JSON backup', csv: 'spreadsheet (CSV)', vcf: 'contact card (vCard)', contact: 'contact info' };
  function updatePasteDetect() {
    const t = $('#pasteImport').value;
    const chosen = $('input[name=pasteFmt]:checked').value;
    const fmt = chosen === 'auto' ? detectPasted(t) : chosen;
    if (!t.trim()) { $('#pasteDetect').textContent = ''; return; }
    let extra = '';
    if (fmt === 'contact') { const n = t.split(/\n\s*\n/).filter((b) => FT.io.parseContactText(b)).length; extra = ` · ${n} contact${n === 1 ? '' : 's'} found`; }
    if (fmt === 'csv') { const n = FT.io.parseCSV(t).records.length; extra = ` · ${n} row${n === 1 ? '' : 's'}`; }
    $('#pasteDetect').textContent = `${chosen === 'auto' ? 'Looks like' : 'Reading as'}: ${FT_LABEL(fmt)}${extra}`;
  }
  const FT_LABEL = (f) => FMT_LABEL[f] || f;
  async function importPasted() {
    const t = $('#pasteImport').value;
    if (!t.trim()) { toast('Paste something first'); $('#pasteImport').focus(); return; }
    const chosen = $('input[name=pasteFmt]:checked').value;
    let fmt = chosen === 'auto' ? detectPasted(t) : chosen;
    if (fmt === 'contact' && /BEGIN:VCARD/i.test(t)) fmt = 'vcf';
    let file;
    if (fmt === 'json') file = new File([t], 'pasted.json', { type: 'application/json' });
    else if (fmt === 'csv') file = new File([t], 'pasted.csv', { type: 'text/csv' });
    else if (fmt === 'vcf') file = new File([t], 'pasted.vcf', { type: 'text/vcard' });
    else {
      // plain contact details: one contact per blank-line-separated block → a small JSON list
      const people = t.split(/\n\s*\n/).map((b) => FT.io.parseContactText(b)).filter(Boolean)
        .map((c) => ({ name: c.name || c.phone || c.email, nickname: c.nickname, phone: c.phone, email: c.email,
          address: c.address, city: c.city, dob: c.dob, notes: c.notes }));
      if (!people.length) { toast("Couldn't find a name, number or email in that"); return; }
      file = new File([JSON.stringify(people)], 'pasted-contacts.json', { type: 'application/json' });
    }
    // contacts always merge; backups/spreadsheets follow the merge checkbox
    const merge = fmt === 'contact' || fmt === 'vcf' ? true : $('#importMerge').checked;
    await importFile(file, merge);
    if (!$('#importReport').textContent.includes('Import failed')) { $('#pasteImport').value = ''; updatePasteDetect(); }
  }

  function showReport(r) {
    const el = $('#importReport'); if (!el) return;
    el.hidden = false;
    if (r.error) { el.innerHTML = `<h3>Import failed</h3><p class="hint">${esc(r.error)}</p>`; return; }
    el.innerHTML = `<h3>Last import (${esc(r.format)})</h3>
      <div class="stats"><div><b>${r.added}</b><span>added</span></div><div><b>${r.updated}</b><span>updated</span></div>
      <div><b>${r.links}</b><span>new links</span></div><div><b>${r.placeholders}</b><span>placeholders</span></div></div>
      ${r.warnings.length ? `<details ${r.warnings.length < 6 ? 'open' : ''}><summary>${r.warnings.length} note${r.warnings.length > 1 ? 's' : ''}</summary>
        <ul class="warn-list">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '<p class="hint">No problems found.</p>'}`;
  }

  /* ---------- Heritage + AI helpers (v2) ---------- */
  function fillCultureSelects() {
    const opts = FT.cultures.list().map((c) => `<option value="${c.id}">${esc(c.name)}${c.native && c.native !== c.name ? ` · ${esc(c.native)}` : ''}</option>`).join('');
    $$('select[data-cultures]').forEach((sel) => {
      const first = sel.dataset.cultures === 'same' ? '<option value="">Same as father\'s side</option>' : sel.dataset.cultures === 'side' ? '<option value="">Same as their side of the family</option>' : '';
      sel.innerHTML = first + opts;
    });
    const f = $('#setupForm'); if (f) { f.hPaternal.value = 'bengali'; f.hMaternal.value = 'bengali'; f.hMe.value = ''; }
  }
  // Person sheet: which heritage's words to use for this one person (blank = their side of the family)
  function heritagePicker(p, d) {
    const sideName = { maternal: "mother's side", paternal: "father's side", inlaw: "spouse's family", close: 'your own family' }[d.side] || 'their side';
    const def = cultureOfSide(d.side);
    const opts = `<option value="">Same as ${esc(sideName)} (${esc(cultName(def))})</option>` + FT.cultures.list().map((c) => `<option value="${c.id}"${p.heritage === c.id ? ' selected' : ''}>${esc(c.name)}${c.native && c.native !== c.name ? ` · ${esc(c.native)}` : ''}</option>`).join('');
    return `<label class="field person-heritage"><span>Heritage for ${esc(p.nickname || p.name.split(' ')[0])}</span><select id="shHeritage">${opts}</select>
      <small class="hint">${viewAs() ? 'The Language menu at the top is on, so you are seeing those words right now.' : 'Changes the words used for them, e.g. an aunt who married in.'}</small></label>`;
  }
  function renderViewAs() {
    const sel = $('#viewAs'); if (!sel) return;
    sel.innerHTML = `<option value="">Our words</option>` +
      FT.cultures.list().map((c) => `<option value="${c.id}">${esc(c.name)}${c.native && c.native !== c.name ? ` · ${esc(c.native)}` : ''}</option>`).join('') +
      `<option value="__settings">Change our family's heritage…</option>`;
    sel.value = viewAs();
    $('.view-as').classList.toggle('is-on', !!viewAs());
  }
  // Theme menu: accent color + motif. "Default" and "Bengali" are the same look.
  function renderTheme() {
    const sel = $('#themePick'); if (!sel || !FT.themes) return;
    const cur = FT.themes.has(S.meta.theme) ? S.meta.theme : '';
    sel.innerHTML = `<option value="">Default</option>` +
      FT.themes.list().map((t) => `<option value="${t.id}" title="${esc(t.motif)}">${esc(t.name)}</option>`).join('');
    sel.value = cur; FT.themes.apply(cur);
  }
  function renderHeritage() {
    const h = heritage();
    $('#heritPaternal').value = h.paternal; $('#heritMaternal').value = h.maternal; $('#heritMe').value = h.me; $('#heritInlaw').value = h.inlaw;
  }
  function openAi() {
    const me = S.byId.get(S.meta.meId), h = heritage(), f = $('#setupForm');
    const fromSetup = !me && f;
    const name = me ? me.name : (f && f.name.value.trim()) || '';
    const pat = fromSetup ? cultName(f.hPaternal.value) : cultName(h.paternal), mat = fromSetup ? cultName(f.hMaternal.value) : cultName(h.maternal);
    $('#aiPromptText').value = FT.ai.prompt({ name, paternal: pat, maternal: mat });
    $('#aiDict').innerHTML = FT.ai.FIELDS.map(([c, req, what, allowed, ex]) => `<div class="ai-dict-row"><b>${esc(c)}</b>${req ? ' <em class="tag">required</em>' : ''}<span>${esc(what)}.</span><small>Allowed: ${esc(allowed)} · e.g. ${esc(ex)}</small></div>`).join('');
    $('#aiTips').innerHTML = FT.ai.TIPS.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('');
    $('#aiDlg').showModal();
  }

  async function loadDemo() {
    if (S.people.length > 1 && !await ask('Replace your data with the sample family? Export a backup first if needed.')) return;
    // Made-up family (js/demo.js): Bengali father's side, Cantonese mother's side
    const demo = FT.demo.build(uid);
    const meta = { ...S.meta, meId: demo.meId, heritage: demo.heritage, demo: true };
    await FT.db.replaceAll({ people: demo.people, relationships: demo.relationships, meta, visits: demo.visits });
    Object.assign(S, { people: demo.people, relationships: demo.relationships, meta, visits: demo.visits });
    recompute(); renderHeader(); renderHeritage(); toast('Sample family loaded'); show('people');
  }

  /* ---------- Misc ---------- */
  // Promise-based confirm dialog (window.confirm is blocked in some embedded viewers)
  function ask(message, { ok = 'Yes', cancel = 'Cancel', html = false } = {}) {
    return new Promise((resolve) => {
      const dlg = $('#askDlg');
      $('#askMsg')[html ? 'innerHTML' : 'textContent'] = message;
      $('#askOk').textContent = ok; $('#askCancel').textContent = cancel; $('#askCancel').hidden = !cancel;
      const done = (v) => { dlg.close(); resolve(v); };
      $('#askOk').onclick = () => done(true); $('#askCancel').onclick = () => done(false);
      dlg.oncancel = (e) => { e.preventDefault(); done(false); };
      dlg.showModal();
    });
  }
  FT.ask = ask;
  let toastT;
  // Pick one of several options; resolves to the option key, or null if dismissed
  function choose(message, options) {
    return new Promise((resolve) => {
      const dlg = $('#chooseDlg');
      $('#chooseMsg').textContent = message;
      $('#chooseOpts').innerHTML = options.map((o) => `<button class="btn${o.primary ? ' primary' : ''}" data-k="${o.key}">${esc(o.label)}</button>`).join('') + '<button class="btn ghost" data-k="">Cancel</button>';
      const done = (v) => { dlg.close(); resolve(v || null); };
      $('#chooseOpts').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) done(b.dataset.k); };
      dlg.oncancel = (e) => { e.preventDefault(); done(null); };
      dlg.showModal();
    });
  }
  // Map → picture: share, download or print
  async function saveMapPicture() {
    const me = S.byId.get(S.meta.meId), focus = S.byId.get(S.mapFocus);
    const stampDay = FT.io.dobForInput(today());
    let title = `Paribar · পরিবার: ${(focus && (focus.id === S.meta.meId ? me.name : focus.nickname || focus.name)) || ''}'s family · ${S.mapMode === 'gen' ? 'Generations' : 'Separation'}${S.mapLayer === 'all' ? '' : S.mapLayer === 'family' ? ' · family' : ' · friends'} · ${stampDay}`;
    // a highlight on screen: offer just that part, titled "Vivian is Ishaan's mother's sister · Vivian's family"
    let crop = null, kind = 'family-tree';
    const ids = hiIds(S.mapHi).filter((id) => FT.mindmap.isShown(id));
    if (S.mapHi && ids.length) {
      const part = await choose('Save the whole map, or just the highlighted people?', [
        { key: 'part', label: 'Just the highlighted people', primary: true }, { key: 'all', label: 'The whole map' }]);
      if (!part) return;
      if (part === 'part') {
        crop = FT.mindmap.boxOf(ids);
        const h = S.mapHi, who = h.id && S.byId.get(h.id);
        if (h.kind === 'between') {
          title = `${betweenSentence(h.a, h.id).replace(/ · \d+ steps?$/, '')} · Paribar · ${stampDay}`; kind = 'trail';
        } else if (who) {
          const nm = who.nickname || who.name, meFirst = (me.nickname || me.name).split(' ')[0];
          const how = S.paths.has(who.id) ? `${nm} is ${FT.checks.sentence(FT.checks.chain(who.id)).replace(/^your /, meFirst + "'s ")}` : nm;
          title = `${how}${h.kind === 'family' ? ` · ${nm}'s family` : ''} · Paribar · ${stampDay}`;
          kind = h.kind === 'family' ? 'family-and-path' : 'path';
        } else {
          const g = h.kind === 'rel' ? FT.kin.REL_GROUPS.find((x) => x.id === h.value) : null;
          title = `${g ? g.en : $(`#mapLegend [data-hi="${hiKey(h)}"]`)?.textContent.trim() || 'Highlighted'} · Paribar · ${stampDay}`;
          kind = 'highlight';
        }
      }
    }
    let out; try { out = await FT.treeImage.render(title, crop); } catch (e) { toast(e.message); return; }
    const file = new File([out.blob], fname('png', kind), { type: 'image/png' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const pick = await choose('Your family map is ready as a picture. Names and terms only, no phone numbers or addresses.', [
      ...(canShare ? [{ key: 'share', label: 'Share (WhatsApp, Drive…)', primary: true }] : []),
      { key: 'download', label: 'Download picture (.png)', primary: !canShare }, { key: 'print', label: 'Print or save as PDF' }]);
    if (pick === 'share') { try { await navigator.share({ files: [file], title: 'Family tree' }); } catch (e) { if (e.name !== 'AbortError') toast('Share failed, try Download'); } }
    if (pick === 'download') download(file, file.name);
    if (pick === 'print') FT.treeImage.print(out.blob, out.landscape, file.name.replace(/\.png$/, ''));
  }
  // Map search: type a name, jump to them
  function mapSearch(q) {
    q = q.trim().toLowerCase(); const box = $('#mapFindList');
    if (!q) { box.hidden = true; return; }
    const hits = S.people.filter((p) => { const d = describe(p.id); return [p.name, p.nickname, p.calledTerm, d.bn, d.bnScript, d.en].join(' ').toLowerCase().includes(q); }).slice(0, 6);
    box.innerHTML = hits.length ? hits.map((p) => `<li><button data-id="${p.id}">${avatar(p, 'sm')}<span>${esc(p.nickname || p.name)}<small>${esc(describe(p.id).called || describe(p.id).en)}</small></span></button></li>`).join('') : '<li class="hint">No match</li>';
    box.hidden = false;
  }
  function mapJump(id) {
    $('#mapFindList').hidden = true; $('#mapFind').value = ''; $('#mapFind').blur();
    if (!FT.mindmap.isShown(id)) {
      // not on screen: switch to the layer that has them, show all degrees, and center on them if they're not connected
      if (!mapSubset().ids.has(id)) S.mapLayer = 'all';
      const sub = mapSubset();
      const reach = FT.fam.degrees(S.mapFocus, sub.people, sub.rels, sub.adj);
      if (!reach.has(id)) setFocus(id);
      S.mapDepth = 99; drawMap(false);
    }
    FT.mindmap.zoomTo(id); mapPick(id);
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- 7. Boot ---------- */
  // Shared helpers for js/checks.js, visits.js, dates.js (they run inside this app's state)
  FT.app = { S, esc, showPath, uid, describe, avatar, waUrl, savePerson, saveRel, setMeta, recompute, refresh, openSheet, openForm,
    toast, ask, download, fname, attachMic, MIC_SVG_BTN, resizeImage };

  async function boot() {
    const data = await FT.db.loadAll();
    Object.assign(S, data);
    S.visits = data.visits || [];
    // count every save/delete toward the backup reminder
    const rawPut = FT.db.put.bind(FT.db), rawDel = FT.db.del.bind(FT.db), rawAll = FT.db.replaceAll.bind(FT.db);
    FT.db.put = (store, obj) => { countChange(); return rawPut(store, obj); };
    FT.db.del = (store, id) => { countChange(); return rawDel(store, id); };
    FT.db.replaceAll = (d) => { if (d.people.length) countChange(); return rawAll(d); };
    recompute();
    FT.mindmap.init($('#mapCanvas'), mapPick);
    setupMics();

    // Navigation
    // tapping the tab you're already on puts that tab back to its starting state
    $$('#tabbar button').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.view, again = S.view === v;
      if (v === 'add') return openForm();
      if (again && v === 'people') return resetPeople(true);
      if (again && v === 'map') return resetMap();
      if (again && v === 'data') return resetData();
      show(v);
    }));
    $('#search').addEventListener('input', renderPeople);
    $$('.chip').forEach((c) => c.addEventListener('click', () => {
      S.filter = c.dataset.side; $$('.chip').forEach((x) => x.classList.toggle('is-on', x === c)); renderPeople();
    }));
    $('#peopleList').addEventListener('click', (e) => { const b = e.target.closest('.person-row'); if (b) openSheet(b.dataset.id); }); // duplicates view has its own handler
    $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').close(); });
    $('#sheet').addEventListener('change', async (e) => {
      if (e.target.id !== 'shHeritage' || !S.sheetId) return;
      const p = S.byId.get(S.sheetId); p.heritage = e.target.value || ''; await savePerson(p);
      recompute(); openSheet(p.id); refresh();
      toast(p.heritage ? `${p.nickname || p.name}: ${cultName(p.heritage)} words` : `${p.nickname || p.name}: back to their side's words`);
    });

    // Setup
    $('#setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const dob = FT.io.parseDate(fd.get('dob')) || '';
      const me = { id: uid(), name: fd.get('name').trim(), gender: fd.get('gender'), dob, birthYear: dob.slice(0, 4),
        isMe: true, photos: [], createdAt: new Date().toISOString() };
      const hp = fd.get('hPaternal') || 'bengali', hm = fd.get('hMaternal') || hp, hs = fd.get('hMe') || hp;
      S.people.push(me); await savePerson(me); await setMeta('meId', me.id);
      await setMeta('heritage', { paternal: hp, maternal: hm, me: hs, inlaw: hs });
      FT.db.requestPersist();
      recompute(); renderHeader(); renderHeritage(); fillPresetAndAnchors(); show('people');
      toast(hm === 'bengali' && hp === 'bengali' ? 'Now add Ma — tap Add' : 'Now add your mother or father — tap Add');
    });
    $('#setupImport').onclick = () => $('#setupImportFile').click();
    $('#setupImportFile').onchange = (e) => e.target.files[0] && importFile(e.target.files[0], false);

    // Form
    const f = $('#personForm');
    f.addEventListener('submit', submitForm);
    f.addEventListener('change', (e) => { if (['mode', 'relation', 'anchor', 'preset'].includes(e.target.name)) syncMode(); });
    f.addEventListener('input', (e) => { if (['name', 'dob'].includes(e.target.name)) updatePreview(); });
    $('#cancelBtn').onclick = () => show('people');
    $('#fcPasteBtn').onclick = () => { const b = $('#fcPasteBox'); b.hidden = !b.hidden; if (!b.hidden) $('#fcText').focus(); };
    $('#fcApply').onclick = () => fillFormFromContact(FT.io.parseContactText($('#fcText').value), 'the pasted text');
    $('#fcFile').onchange = (e) => { e.target.files[0] && contactFromFile(e.target.files[0]); e.target.value = ''; };
    if (hasPicker()) { $('#fcPick').hidden = false; $('#fcPick').onclick = pickPhoneContact; }
    $('#photoCamera').onchange = (e) => { addPhotos(e.target.files); e.target.value = ''; };
    $('#photoGallery').onchange = (e) => { addPhotos(e.target.files); e.target.value = ''; };
    $('#photoStrip').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.del) S.formPhotos.splice(+b.dataset.del, 1);
      if (b.dataset.main) S.formPhotos.unshift(S.formPhotos.splice(+b.dataset.main, 1)[0]);
      renderFormPhotos();
    });

    // Map
    $('#mapMe').onclick = () => { setFocus(S.meta.meId); $('#mapCard').hidden = true; drawMap(); };
    $$('#mapMode button').forEach((b) => (b.onclick = () => { S.mapMode = b.dataset.mode; $('#mapCard').hidden = true; drawMap(); }));
    $('#mapDepth').onchange = (e) => { S.mapDepth = +e.target.value; $('#mapCard').hidden = true; drawMap(); };
    $('#mapPicture').onclick = saveMapPicture;
    $('#mapLayer').onchange = (e) => { S.mapLayer = e.target.value; $('#mapCard').hidden = true; drawMap(); };
    $('#mapFind').addEventListener('input', (e) => mapSearch(e.target.value));
    $('#mapFind').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('#mapFindList button'); if (b) mapJump(b.dataset.id); } if (e.key === 'Escape') mapSearch(''); });
    $('#mapFindList').onclick = (e) => { const b = e.target.closest('button[data-id]'); if (b) mapJump(b.dataset.id); };
    $('#mapClearPath').onclick = () => setHi(null);
    $('#mapOnlyPath').onclick = () => { S.mapOnly = !S.mapOnly; if (S.mapHi && S.mapHi.kind === 'between' && S.mapOnly) setFocus(S.mapHi.a); drawMap(); applyHi(true); };
    $('#mapFit').onclick = () => FT.mindmap.fitView();
    $('#mapReset').onclick = resetMap;
    $('#mapLegend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hi]'); if (!b) return;
      const [kind, value] = b.dataset.hi.split(':');
      setHi(hiKey(S.mapHi) === b.dataset.hi ? null : { kind, value }); // tap again to clear
    });
    $('#mapHi').onchange = (e) => setHi(e.target.value ? { kind: 'rel', value: e.target.value } : null);
    $('#relFilter').onchange = (e) => { S.rel = e.target.value; renderPeople(); };
    $('#peopleReset').onclick = resetPeople;
    $('#dataReset').onclick = resetData;
    $('#clearFormBtn').onclick = () => { openForm(); toast('Form cleared'); };
    $$('#peoplePanes button').forEach((b) => (b.onclick = () => { S.pane = b.dataset.pane; renderPane(); window.scrollTo({ top: 0 }); }));
    $$('#groupBy button').forEach((b) => (b.onclick = () => { S.group = b.dataset.group; $$('#groupBy button').forEach((x) => x.classList.toggle('is-on', x === b)); renderPeople(); }));
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => S.view === 'map' && renderMap(), 200); });

    // Backup
    $('#exportShare').onclick = exportShare;
    $('#exportDownload').onclick = async () => { download(backupBlob(), fname('json')); await markBackedUp(); };
    $('#exportVcf').onclick = exportVcf;
    $('#exportCsv').onclick = async () => { download(new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' }), fname('csv')); await markBackedUp(); toast('Spreadsheet saved (photos are only in the .json backup)'); };
    $('#exportZip').onclick = async () => { const n = exportZip(); await markBackedUp(); toast(`Saved spreadsheet + ${n} photo${n === 1 ? '' : 's'} (.zip)`); };
    $('#csvTemplate').onclick = () => download(new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' }), fname('csv', 'template'));
    $('#pasteImport').addEventListener('input', updatePasteDetect);
    $$('input[name=pasteFmt]').forEach((r) => r.addEventListener('change', updatePasteDetect));
    $('#pasteGo').onclick = importPasted;
    $('#pasteClear').onclick = () => { $('#pasteImport').value = ''; updatePasteDetect(); $('#pasteImport').focus(); };
    $('#importFile').onchange = (e) => { e.target.files[0] && importFile(e.target.files[0], $('#importMerge').checked); e.target.value = ''; };
    $('#voiceLang').onchange = (e) => setMeta('voiceLang', e.target.value).then(() => toast('Voice language saved'));
    $('#persistBtn').onclick = async () => toast((await FT.db.requestPersist()) ? 'Storage is protected' : 'The browser declined — install the app to home screen and try again');
    $('#demoBtn').onclick = loadDemo;
    // v2: heritage pickers, AI chat helper
    fillCultureSelects();
    [['#heritPaternal', 'paternal'], ['#heritMaternal', 'maternal'], ['#heritMe', 'me'], ['#heritInlaw', 'inlaw']].forEach(([sel, k]) => {
      $(sel).onchange = async (e) => { await setMeta('heritage', { ...heritage(), [k]: e.target.value }); recompute(); fillPresetAndAnchors(); refresh(); toast(`${cultName(e.target.value)} words for ${k === 'me' ? 'your own family' : k === 'inlaw' ? "your spouse's family" : k === 'paternal' ? "your father's side" : "your mother's side"}`); };
    });
    renderHeritage();
    renderViewAs(); renderTheme();
    $('#themePick').onchange = async (e) => {
      const v = e.target.value; await setMeta('theme', v); renderTheme();
      toast(v ? `${FT.themes.get(v).name} theme: ${FT.themes.get(v).motif}. Side colors stay the same.` : 'Default theme');
    };
    $('#viewAs').onchange = async (e) => {
      const v = e.target.value;
      if (v === '__settings') { renderViewAs(); show('data'); setTimeout(() => $('#heritagePanel').scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); return; }
      await setMeta('viewAs', v); recompute(); fillPresetAndAnchors(); renderViewAs(); refresh();
      if ($('#sheet').open && S.sheetId) openSheet(S.sheetId);
      toast(v ? `Viewing everyone in ${cultName(v)} words. Nothing saved changes.` : "Back to your family's own words");
    };
    $('#aiOpen').onclick = openAi; $('#setupAi').onclick = openAi;
    $('#setupDemo').onclick = loadDemo;
    $('#aiDlg').addEventListener('click', (e) => { if (e.target.closest('[data-act=close]') || e.target === $('#aiDlg')) $('#aiDlg').close(); });
    $('#aiCopy').onclick = async () => {
      const t = $('#aiPromptText').value;
      try { await navigator.clipboard.writeText(t); toast('Prompt copied. Paste it into your AI chat.'); }
      catch { $('#aiPromptText').select(); document.execCommand('copy'); toast('Prompt copied'); }
    };
    $('#aiToPaste').onclick = () => { $('#aiDlg').close(); if (!S.meta.meId) { toast('Create your tree first (just your name), then paste'); return; } show('data'); setTimeout(() => { $('#pasteImport').focus(); $('#pasteImport').scrollIntoView({ block: 'center' }); }, 150); };
    // Back to the first screen. The sample family is made up, so one tap; real data asks twice.
    // Theme and language choices are kept.
    const startOver = async () => {
      if (S.meta.demo && S.people.length) { if (!await ask('Clear the sample family and start with you?', { ok: 'Start my own' })) return; }
      else if (S.people.length) {
        if (!await ask('Start over? This erases everyone on this phone.', { ok: 'Erase and start over' })) return;
        if (!await ask('Really? Make sure you have a backup.')) return;
      }
      const meta = {}; ['theme', 'viewAs', 'voiceLang'].forEach((k) => { if (S.meta[k]) meta[k] = S.meta[k]; });
      await FT.db.replaceAll({ people: [], relationships: [], meta, visits: [] });
      Object.assign(S, { people: [], relationships: [], meta, visits: [] });
      recompute(); renderHeader(); renderTheme(); renderViewAs(); window.scrollTo(0, 0); show('setup');
    };
    $('#startOverBtn').onclick = startOver; $('#demoLeave').onclick = startOver;
    $('#wipeBtn').onclick = async () => {
      if (!await ask('Erase all people, photos and links on this phone?')) return;
      if (!await ask('Really? Make sure you have a backup.')) return;
      await FT.db.replaceAll({ people: [], relationships: [], meta: {}, visits: [] });
      Object.assign(S, { people: [], relationships: [], meta: {}, visits: [] });
      recompute(); renderHeader(); renderTheme(); show('setup');
    };

    renderHeader();
    show(S.meta.meId && S.byId.has(S.meta.meId) ? 'people' : 'setup');
    checkShareInbox().catch(() => {});

    // Offline support (works when served over https or localhost)
    if (!FT.db.remote && !window.FT_STANDALONE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // Any unexpected error shows up on screen (instead of a silent blank page), so it can be reported
  const showError = (msg) => { let el = $('#errBanner');
    if (!el) { el = document.createElement('p'); el.id = 'errBanner'; el.className = 'fatal'; document.body.appendChild(el); }
    el.textContent = `Something went wrong: ${msg}`; };
  window.addEventListener('error', (e) => showError(e.message));
  window.addEventListener('unhandledrejection', (e) => showError((e.reason && e.reason.message) || String(e.reason)));
  boot().catch((e) => { console.error(e); showError(`could not open storage (${e.message}). Your data is still on this phone.`); });
})();
