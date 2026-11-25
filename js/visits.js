/* =========================================================
   visits.js — Visit log
   A visit = { id, date 'YYYY-MM-DD', place, peopleIds[], notes,
               giftsGiven, giftsReceived, photos[], createdAt, updatedAt }
   - Timeline (newest first, grouped by month) on People › Visits
   - Older "Met on" dates show in the timeline too, with a button
     to turn them into a full visit
   - Saving a visit fills in "Met on" for anyone who doesn't have it
   - Visits are kept in the .json backup (with photos)
   ========================================================= */
window.FT = window.FT || {};

FT.visits = (() => {
  const A = () => FT.app;
  const short = (p) => (p ? p.nickname || p.name : '?');
  const fmt = (iso) => FT.io.dobForInput(iso);                         // 2026-10-27 -> 10/27/2026
  const weekday = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  const monthOf = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  let draft = null; // the visit being edited in the dialog

  // ---------- Timeline ----------
  function entries() {
    const { S } = A();
    const real = (S.visits || []).map((v) => ({ type: 'visit', date: v.date, v }));
    // "Met on" dates not already covered by a visit with that person on that day
    const covered = new Set((S.visits || []).flatMap((v) => (v.peopleIds || []).map((id) => `${v.date}|${id}`)));
    const met = new Map();
    S.people.forEach((p) => { if (p.metOn && !covered.has(`${p.metOn}|${p.id}`)) (met.get(p.metOn) || met.set(p.metOn, []).get(p.metOn)).push(p.id); });
    const fromMet = [...met.entries()].map(([date, ids]) => ({ type: 'met', date, ids }));
    return [...real, ...fromMet].sort((a, b) => b.date.localeCompare(a.date));
  }

  function render(el) {
    const { S, esc, avatar } = A();
    const list = entries();
    const chips = (ids) => ids.map((id) => S.byId.get(id)).filter(Boolean)
      .map((p) => `<button class="fix-chip" data-open="${p.id}">${avatar(p, 'sm')}<span>${esc(short(p))}</span></button>`).join('');
    let month = '';
    const items = list.map((e) => {
      const head = monthOf(e.date) !== month ? `<li class="tl-month">${esc((month = monthOf(e.date)))}</li>` : '';
      if (e.type === 'met') return head + `<li class="tl-item is-met"><div class="tl-date">${weekday(e.date)} ${fmt(e.date)}</div>
        <div class="tl-main"><b>Met on this day</b><div class="fix-people">${chips(e.ids)}</div>
        <button class="btn small" data-from-met="${e.date}">Turn into a visit</button></div></li>`;
      const v = e.v;
      return head + `<li class="tl-item"><div class="tl-date">${weekday(v.date)} ${fmt(v.date)}</div>
        <div class="tl-main"><b>${esc(v.place || 'Visit')}</b>
          <div class="fix-people">${chips(v.peopleIds || [])}</div>
          ${v.notes ? `<p>${esc(v.notes).replace(/\n/g, '<br>')}</p>` : ''}
          ${v.giftsGiven ? `<p class="tl-gift"><span>Gave</span> ${esc(v.giftsGiven)}</p>` : ''}
          ${v.giftsReceived ? `<p class="tl-gift"><span>Got</span> ${esc(v.giftsReceived)}</p>` : ''}
          ${(v.photos || []).length ? `<div class="tl-photos">${v.photos.slice(0, 6).map((ph) => `<img src="${ph}" alt="" />`).join('')}</div>` : ''}
          <button class="btn small" data-edit-visit="${v.id}">Edit</button></div></li>`;
    }).join('');
    el.innerHTML = `<div class="tl-top"><button class="btn primary" data-new-visit>Log a visit</button>
      <p class="hint">Who you saw, where, gifts and photos. "Met on" dates from cards show here too.</p></div>
      ${list.length ? `<ul class="timeline">${items}</ul>` : '<div class="empty"><p class="lede">No visits yet.</p></div>'}`;
    el.onclick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.open) A().openSheet(t.dataset.open);
      else if ('newVisit' in t.dataset) open();
      else if (t.dataset.editVisit) open((S.visits || []).find((v) => v.id === t.dataset.editVisit));
      else if (t.dataset.fromMet) { const e2 = list.find((x) => x.type === 'met' && x.date === t.dataset.fromMet); open(null, e2.ids, e2.date); }
    };
  }

  // ---------- On a person's card ----------
  function forPersonHtml(id) {
    const { S, esc } = A();
    const vs = (S.visits || []).filter((v) => (v.peopleIds || []).includes(id)).sort((a, b) => b.date.localeCompare(a.date));
    const p = S.byId.get(id);
    return `<div class="fam-group"><span class="rl-kind">Visits${vs.length ? ` · ${vs.length}` : ''}</span>
      ${vs.length ? `<ul class="rel-list">${vs.slice(0, 5).map((v) => `<li><button class="link-row" data-edit-visit="${v.id}"><span>${fmt(v.date)}</span><small>${esc(v.place || 'Visit')}</small></button></li>`).join('')}</ul>` : ''}
      <button class="btn small" type="button" data-act="visit">Log a visit with ${esc(short(p))}</button></div>`;
  }

  // ---------- Add / edit dialog ----------
  function open(visit = null, presetIds = [], presetDate = null) {
    draft = visit ? { ...visit, peopleIds: [...(visit.peopleIds || [])], photos: [...(visit.photos || [])] }
      : { id: null, date: presetDate || new Date().toISOString().slice(0, 10), place: '', peopleIds: [...presetIds], notes: '', giftsGiven: '', giftsReceived: '', photos: [] };
    const dlg = document.getElementById('visitDlg');
    paint(dlg);
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  function paint(dlg) {
    const { S, esc, MIC_SVG_BTN } = A();
    const people = [...S.people].sort((a, b) => short(a).localeCompare(short(b)));
    dlg.querySelector('.sheet-inner').innerHTML = `
      <div class="sheet-top"><button class="icon-btn" data-vact="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <h2 class="display">${draft.id ? 'Edit visit' : 'Log a visit'}</h2>
      <form class="form" id="visitForm" novalidate>
        <div class="row2">
          <label class="field"><span>Date</span><input name="date" value="${esc(fmt(draft.date))}" placeholder="MM/DD/YYYY" inputmode="numeric" /></label>
          <label class="field"><span>Place</span><div class="with-mic"><input name="place" id="vPlace" value="${esc(draft.place)}" placeholder="e.g. Didima's house, Behala" />${MIC_SVG_BTN('vPlace')}</div></label>
        </div>
        <div class="field"><span id="vCount">Who was there (${draft.peopleIds.length} picked)</span>
          <input type="search" id="vFind" placeholder="Filter names…" aria-label="Filter people" />
          <div class="v-people" id="vPeople">${people.map((p) => `<label class="check v-person" data-name="${esc((p.name + ' ' + (p.nickname || '') + ' ' + (p.calledTerm || '')).toLowerCase())}">
            <input type="checkbox" value="${p.id}" ${draft.peopleIds.includes(p.id) ? 'checked' : ''} /> <span>${esc(short(p))}${p.nickname ? ` <small>${esc(p.name)}</small>` : ''}</span></label>`).join('')}</div></div>
        <label class="field"><span>Notes</span><div class="with-mic area"><textarea name="notes" id="vNotes" rows="3" placeholder="What you talked about, food, plans…">${esc(draft.notes)}</textarea>${MIC_SVG_BTN('vNotes')}</div></label>
        <div class="row2">
          <label class="field"><span>Gifts you gave</span><input name="giftsGiven" value="${esc(draft.giftsGiven)}" placeholder="e.g. sweets from Phoenix" /></label>
          <label class="field"><span>Gifts you got</span><input name="giftsReceived" value="${esc(draft.giftsReceived)}" placeholder="e.g. a kurta" /></label>
        </div>
        <div class="field"><span>Photos</span>
          <div class="photo-strip">${draft.photos.map((ph, i) => `<div class="ph"><img src="${ph}" alt="" /><button type="button" data-vdel="${i}" aria-label="Remove photo">×</button></div>`).join('')}</div>
          <div class="row2">
            <label class="btn ghost"><input type="file" accept="image/*" capture="environment" data-vphoto hidden />Take photo</label>
            <label class="btn ghost"><input type="file" accept="image/*" multiple data-vphoto hidden />From gallery</label>
          </div></div>
        <div class="form-actions">
          <button class="btn primary block" type="submit">Save visit</button>
          ${draft.id ? '<button class="btn danger ghost block" type="button" data-vact="delete">Delete visit</button>' : ''}
        </div>
      </form>`;
    const form = dlg.querySelector('#visitForm');
    dlg.querySelectorAll('.mic').forEach((btn) => A().attachMic(btn, () => dlg.querySelector('#' + btn.dataset.target)));
    // keep typed text when the dialog repaints (after adding/removing photos)
    const keep = () => { const fd = new FormData(form);
      ['place', 'notes', 'giftsGiven', 'giftsReceived'].forEach((k) => (draft[k] = (fd.get(k) || '').trim()));
      draft._dateText = (fd.get('date') || '').trim();
      draft.peopleIds = [...form.querySelectorAll('#vPeople input:checked')].map((x) => x.value); };
    if (draft._dateText) form.date.value = draft._dateText;
    form.querySelector('#vFind').oninput = (e) => { const q = e.target.value.toLowerCase().trim();
      form.querySelectorAll('.v-person').forEach((l) => (l.style.display = q && !l.dataset.name.includes(q) ? 'none' : '')); };
    form.querySelector('#vPeople').onchange = () => { keep(); form.querySelector('#vCount').textContent = `Who was there (${draft.peopleIds.length} picked)`; };
    form.querySelectorAll('[data-vphoto]').forEach((inp) => (inp.onchange = async () => {
      keep(); for (const f of inp.files) draft.photos.push(await A().resizeImage(f)); paint(dlg);
    }));
    dlg.onclick = async (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.vdel) { keep(); draft.photos.splice(+t.dataset.vdel, 1); paint(dlg); return; }
      if (t.dataset.vact === 'close') dlg.close();
      if (t.dataset.vact === 'delete') await remove(dlg);
    };
    form.onsubmit = async (e) => { e.preventDefault(); keep(); await save(dlg); };
  }

  async function save(dlg) {
    const app = A(); const { S } = app;
    const iso = FT.io.parseDate(draft._dateText || fmt(draft.date));
    if (!iso || iso.length !== 10) { app.toast('Date: use MM/DD/YYYY, e.g. 10/27/2026'); return; }
    if (!draft.peopleIds.length) { app.toast('Pick at least one person'); return; }
    const now = new Date().toISOString();
    const v = { ...draft, date: iso, id: draft.id || app.uid(), updatedAt: now, createdAt: draft.createdAt || now };
    delete v._dateText;
    S.visits = [...(S.visits || []).filter((x) => x.id !== v.id), v];
    await FT.db.put('visits', v);
    // first time you met them = this visit, if "Met on" is empty
    for (const id of v.peopleIds) { const p = S.byId.get(id); if (p && !p.metOn) { p.metOn = v.date; await app.savePerson(p); } }
    dlg.close(); app.toast('Visit saved'); app.recompute(); app.refresh();
  }

  async function remove(dlg) {
    const app = A(); const { S } = app;
    if (!await app.ask('Delete this visit and its photos?')) return;
    S.visits = (S.visits || []).filter((x) => x.id !== draft.id);
    await FT.db.del('visits', draft.id);
    dlg.close(); app.toast('Visit deleted'); app.refresh();
  }

  return { render, open, forPersonHtml };
})();
