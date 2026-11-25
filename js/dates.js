/* =========================================================
   dates.js — Birthdays, anniversaries, remembrance days
   - People › Dates lists what's coming up in the next 12 months
   - Needs a FULL date: birthday from Born (MM/DD/YYYY),
     anniversary from "Married to" when you type a full date,
     remembrance from "When" on a late relative's card
   - "Add all to calendar" makes one .ics file: yearly repeats
     plus a reminder at 9 AM the day before
   ========================================================= */
window.FT = window.FT || {};

FT.dates = (() => {
  const A = () => FT.app;
  const short = (p) => (p ? p.nickname || p.name : '?');
  const full = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  // Next time month/day comes round (today counts). Feb 29 falls on Feb 28 in non-leap years.
  function nextOccurrence(iso, from = new Date()) {
    const [, m, d] = iso.split('-').map(Number);
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const on = (y) => { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return new Date(y, m - 1, m === 2 && d === 29 && !leap ? 28 : d); };
    let next = on(today.getFullYear()); if (next < today) next = on(today.getFullYear() + 1);
    return { date: next, days: Math.round((next - today) / 864e5) };
  }

  // Every dated event, whether or not it is coming up soon
  function events() {
    const { S, describe } = A();
    const out = [];
    S.people.forEach((p) => {
      const d = describe(p.id); const label = d.called || short(p); const isMe = p.id === A().S.meta.meId;
      if (full(p.dob)) out.push({ kind: p.deceased ? 'birth-anniv' : 'birthday', iso: p.dob, ids: [p.id], uid: `bday-${p.id}`,
        title: isMe ? 'Your birthday' : p.deceased ? `${label}'s birth anniversary` : `${label}'s birthday`, who: p.name, year: +p.dob.slice(0, 4), phone: p.deceased || isMe ? '' : p.phone,
        wish: (() => { const w = FT.cultures.get(d.culture || 'bengali').wish; return d.culture === 'english' ? `Happy birthday, ${label}!` : `${w} ${label}! Happy birthday.`; })(), detail: [d.bnScript, d.en].filter(Boolean).join(' · ') });
      const died = p.deceased && FT.io.parseDate(p.died || '');
      if (full(died)) out.push({ kind: 'remembrance', iso: died, ids: [p.id], uid: `rem-${p.id}`, title: `Remembering ${label}`, who: p.name, year: +died.slice(0, 4), phone: '', detail: `Passed away ${FT.io.dobForInput(died)}` });
    });
    S.relationships.filter((r) => r.type === 'spouse_of' && full(r.marriedOn) && r.status !== 'separated').forEach((r) => {
      const a = S.byId.get(r.from), b = S.byId.get(r.to); if (!a || !b) return;
      const alive = !a.deceased && !b.deceased;
      out.push({ kind: 'anniversary', iso: r.marriedOn, ids: [a.id, b.id], uid: `anniv-${r.id}`, title: `${short(a)} & ${short(b)}: anniversary`, who: `${a.name} & ${b.name}`,
        year: +r.marriedOn.slice(0, 4), phone: alive ? a.phone || b.phone : '', wish: 'শুভ বিবাহবার্ষিকী! Happy anniversary.', detail: `Married ${FT.io.dobForInput(r.marriedOn)}` });
    });
    return out;
  }

  function upcoming() {
    return events().map((e) => ({ ...e, ...nextOccurrence(e.iso) })).sort((a, b) => a.days - b.days);
  }

  function render(el) {
    const { S, esc, avatar, waUrl } = A();
    const list = upcoming();
    const when = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`);
    const yearsText = (e) => { const n = e.date.getFullYear() - e.year; if (n <= 0) return '';
      return e.kind === 'birthday' ? ` · turns ${n}` : e.kind === 'anniversary' ? ` · ${ordinal(n)}` : ` · ${n} year${n > 1 ? 's' : ''}`; };
    const row = (e) => { const p = S.byId.get(e.ids[0]);
      return `<li class="date-item kind-${e.kind}"><button class="date-who" data-open="${p.id}">${avatar(p, 'sm')}</button>
        <div class="date-main"><b>${esc(e.title)}</b><span>${e.date.toLocaleDateString('en-US', { weekday: 'short' })} ${FT.io.dobForInput(ymd(e.date))} · ${when(e.days)}${yearsText(e)}</span>
        <small>${esc(e.detail || '')}</small></div>
        ${e.phone ? `<a class="btn small" href="${waUrl(e.phone)}?text=${encodeURIComponent(e.wish)}" target="_blank" rel="noopener">Send wishes</a>` : ''}</li>`; };
    const soon = list.filter((e) => e.days <= 30), later = list.filter((e) => e.days > 30);
    const noDate = S.people.filter((p) => !full(p.dob)).length;
    el.innerHTML = `<div class="tl-top"><button class="btn primary" data-ics ${list.length ? '' : 'disabled'}>Add all to calendar (.ics)</button>
      <p class="hint">Repeats every year, with a reminder at 9 AM the day before. Only names and dates go in the file. No phone numbers or addresses.</p></div>
      ${soon.length ? `<h3>Next 30 days</h3><ul class="date-list">${soon.map(row).join('')}</ul>` : ''}
      ${later.length ? `<h3>Later this year</h3><ul class="date-list">${later.map(row).join('')}</ul>` : ''}
      ${!list.length ? '<div class="empty"><p class="lede">No dates yet.</p></div>' : ''}
      <p class="hint">${noDate} of ${S.people.length} people have no full birth date. Add one under Born on their card (MM/DD/YYYY). For anniversaries, type the full wedding date in the "Married to" year box.</p>`;
    el.onclick = (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.open) A().openSheet(t.dataset.open);
      if ('ics' in t.dataset) A().download(new Blob([ics()], { type: 'text/calendar;charset=utf-8' }), A().fname('ics', 'calendar'));
    };
    return soon.length;
  }
  const z = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; // local date, not UTC

  // ---------- .ics (RFC 5545) ----------
  const escT = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  // Lines longer than 75 bytes are folded: CRLF + one space, without splitting a character
  function fold(line) {
    const enc = new TextEncoder(); const out = []; let cur = '', bytes = 0;
    for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > 74) { out.push(cur); cur = ' '; bytes = 1; } cur += ch; bytes += b; }
    out.push(cur); return out.join('\r\n');
  }
  function ics() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paribar//Family dates//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Paribar family dates'];
    events().forEach((e) => {
      const [y, m, d] = e.iso.split('-').map(Number);
      const end = new Date(Date.UTC(y, m - 1, d + 1)); // all-day events end the next day
      const leapDay = m === 2 && d === 29;
      lines.push('BEGIN:VEVENT', `UID:${e.uid}@paribar`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${y}${z(m)}${z(d)}`, `DTEND;VALUE=DATE:${end.getUTCFullYear()}${z(end.getUTCMonth() + 1)}${z(end.getUTCDate())}`,
        leapDay ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY', // Feb 29 → last day of February
        `SUMMARY:${escT(e.title)}`, `DESCRIPTION:${escT([e.who, e.detail].filter(Boolean).join(' · '))}`, 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escT(e.title)} tomorrow`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  return { events, upcoming, render, ics, nextOccurrence };
})();
