/* =========================================================
   io.js — Import / export helpers (JSON + CSV), all lenient
   Rule: only `name` is required. Missing columns/fields are
   fine, unknown columns are kept in `extra`, bad dates go to
   notes instead of failing, and every problem becomes a
   warning in the import report — never a crash.
   ========================================================= */
window.FT = window.FT || {};

FT.io = (() => {
  /* ---------- Header / key normalisation ---------- */
  // camelCase / spaces / dashes → snake_case, lower-case
  const snake = (k) => String(k || '').replace(/^\uFEFF/, '').trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s\-./]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').replace(/_+/g, '_').replace(/^_|_$/g, '');

  // canonical field ← accepted spellings
  const ALIASES = {
    id: ['id', 'person_id', 'uid', 'key'],
    name: ['name', 'full_name', 'fullname', 'person', 'নাম'],
    nickname: ['nickname', 'nick', 'nick_name', 'called', 'what_i_call_them', 'what_you_call_them', 'dak_naam', 'daknaam', 'dak_nam', 'pet_name', 'ডাকনাম'],
    gender: ['gender', 'sex', 'লিঙ্গ'],
    dob: ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday', 'born', 'birth_year', 'year_of_birth', 'birthyear', 'জন্মদিন', 'জন্ম'],
    phone: ['phone', 'mobile', 'cell', 'phone_number', 'mobile_number', 'contact', 'number', 'tel', 'ফোন'],
    whatsapp: ['whatsapp', 'wa', 'on_whatsapp', 'whats_app'],
    email: ['email', 'e_mail', 'mail'],
    city: ['city', 'place', 'location', 'town', 'para', 'lives_in', 'শহর'],
    address: ['address', 'street', 'street_address', 'full_address', 'home_address', 'flat', 'ঠিকানা'],
    met_on: ['met_on', 'met', 'date_met', 'met_date', 'metdate'],
    notes: ['notes', 'note', 'comments', 'comment', 'info', 'details'],
    heritage: ['heritage', 'culture', 'heritage_culture', 'person_heritage', 'their_heritage', 'ethnicity', 'background'],
    called_term: ['called_term', 'calledterm', 'term_i_use', 'my_term'],
    bengali_nuance: ['bengali_nuance', 'nuance', 'term_nuance', 'term_note', 'term_notes', 'bengali_note', 'bengali_notes', 'kinship_note'],
    relation_to_me: ['relation_to_me', 'relation', 'relationship', 'relationship_to_me', 'how_related', 'সম্পর্ক'],
    bengali_roman: ['bengali_roman', 'relation_bengali_roman', 'bengali_relation', 'native_roman', 'term_roman'],
    bengali_term: ['bengali_term', 'relation_bengali', 'bengali', 'native_term'],
    relation_english: ['relation_english', 'english_relation'],
    mother: ['mother', 'mother_id', 'mother_name', 'mom', 'ma'],
    father: ['father', 'father_id', 'father_name', 'dad', 'baba'],
    parents: ['parents', 'parent', 'parent_ids', 'parent_names', 'other_parent_ids'],
    spouses: ['spouse', 'spouses', 'spouse_id', 'spouse_ids', 'spouse_name', 'spouse_names', 'husband', 'wife', 'married_to'],
    siblings: ['sibling', 'siblings', 'sibling_id', 'sibling_ids', 'sibling_name', 'sibling_names'],
    friends: ['friends', 'friend', 'friend_of', 'friend_ids', 'friend_names', 'colleagues', 'neighbors', 'neighbours', 'বন্ধু'], // "Priya (colleague); Ma (neighbor)"
    deceased: ['deceased', 'late', 'passed_away', 'is_late', 'স্বর্গীয়'],
    died: ['died', 'death', 'date_of_death', 'death_date', 'death_year', 'dod', 'year_died'],
    is_me: ['is_me', 'me', 'self', 'this_is_me'],
    photos: ['photos'],
    photo_files: ['photo_files', 'photo_file', 'photo', 'picture', 'pictures', 'image', 'images', 'ছবি'],
    placeholder: ['placeholder'],
    created_at: ['created_at'], updated_at: ['updated_at'],
    // computed on export — accepted and ignored
    _ignore: ['side', 'term_heritage', 'photo_count', 'relation_to_me_computed', 'relationtome', 'relation_to_me_obj'],
  };
  const KEYMAP = new Map();
  Object.entries(ALIASES).forEach(([canon, list]) => list.forEach((a) => KEYMAP.set(a, canon)));
  const canonKey = (k) => KEYMAP.get(snake(k)) || null;
  const REF_FIELDS = ['mother', 'father', 'parents', 'spouses', 'siblings', 'friends'];

  /* ---------- Small value parsers ---------- */
  const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);
  const str = (v) => (isBlank(v) ? '' : String(v).trim());
  // Safety: ids and photos from an imported file end up inside HTML attributes, so only accept
  // plain ids and real base64 image data (a crafted file can't sneak script in this way)
  const safeId = (v) => { const t = str(v); return /^[A-Za-z0-9_.:-]{1,80}$/.test(t) ? t : ''; };
  const safePhoto = (p) => typeof p === 'string' && /^data:image\/(png|jpe?g|gif|webp|bmp|heic|heif);base64,[A-Za-z0-9+\/=]+$/i.test(p);
  const cleanVisit = (v) => {
    const id = safeId(v.id), date = typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : '';
    if (!id || !date) return null;
    const out = { id, date, place: str(v.place), notes: str(v.notes), giftsGiven: str(v.giftsGiven), giftsReceived: str(v.giftsReceived),
      peopleIds: (Array.isArray(v.peopleIds) ? v.peopleIds : []).map(safeId).filter(Boolean),
      photos: (Array.isArray(v.photos) ? v.photos : []).filter(safePhoto) };
    ['createdAt', 'updatedAt'].forEach((k) => { if (!isBlank(v[k])) out[k] = str(v[k]); });
    return out;
  };
  const cleanHeritage = (h) => {
    if (!h || typeof h !== 'object') return null;
    const out = {}; ['me', 'paternal', 'maternal', 'inlaw'].forEach((k) => { const c = h[k] && FT.cultures && FT.cultures.find(h[k]); if (c) out[k] = c; });
    return Object.keys(out).length ? out : null;
  };
  const splitList = (v) => (Array.isArray(v) ? v : str(v).split(/\s*[;|]\s*/)).map(str).filter(Boolean);

  function parseGender(v) {
    const s = str(v).toLowerCase();
    if (!s) return null;
    if (['m', 'male', 'man', 'boy', 'পুরুষ', 'ছেলে'].includes(s)) return 'm';
    if (['f', 'female', 'woman', 'girl', 'মহিলা', 'মেয়ে', 'নারী'].includes(s)) return 'f';
    return 'x';
  }
  function parseBool(v) {
    const s = str(v).toLowerCase();
    if (!s) return null;
    if (['y', 'yes', 'true', '1', 'হ্যাঁ', 'x', '✓'].includes(s)) return true;
    if (['n', 'no', 'false', '0', 'না'].includes(s)) return false;
    return null;
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const validYMD = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
  const fixYear = (y) => (y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y);

  // → 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | null. Slashes/dashes are read as MM/DD/YYYY (US style)
  // unless that's impossible (e.g. 25/04/1962 → read as DD/MM).
  function parseDate(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) v = String(v); // Excel serial date
    const s = str(v);
    if (!s) return null;
    let m;
    if (/^\d{5}$/.test(s) && +s > 20000 && +s < 80000) { // Excel serial (days since 1899-12-30)
      const d = new Date(Date.UTC(1899, 11, 30) + +s * 864e5);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    if ((m = s.match(/^(\d{4})$/))) return +m[1] > 1850 && +m[1] < 2100 ? m[1] : null;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? `${m[2]}-${pad(m[1])}` : null;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${pad(m[2])}` : null;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
      let [a, b, y] = [+m[1], +m[2], fixYear(+m[3])];
      let [mo, d] = [a, b];                    // default MM/DD
      if (a > 12 && b <= 12) [mo, d] = [b, a]; // only possible as DD/MM
      return validYMD(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
    // "14 Apr 1962", "14 April, 1962", "April 14 1962", "Apr 1962"
    const t = s.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
    if ((m = t.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/)) && MONTHS[m[2].slice(0, 3)]) {
      const mo = MONTHS[m[2].slice(0, 3)]; return validYMD(+m[3], mo, +m[1]) ? `${m[3]}-${pad(mo)}-${pad(m[1])}` : null;
    }
    if ((m = t.match(/^([a-z]+) (\d{1,2}) (\d{4})$/)) && MONTHS[m[1].slice(0, 3)]) {
      const mo = MONTHS[m[1].slice(0, 3)]; return validYMD(+m[3], mo, +m[2]) ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null;
    }
    if ((m = t.match(/^([a-z]+) (\d{4})$/)) && MONTHS[m[1].slice(0, 3)]) return `${m[2]}-${pad(MONTHS[m[1].slice(0, 3)])}`;
    return null;
  }

  // Display helpers for DOB
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatDob(dob) {
    if (!dob) return '';
    const [y, m, d] = dob.split('-');
    return d ? `${MON[+m - 1]} ${+d}, ${y}` : m ? `${MON[+m - 1]} ${y}` : y;
  }
  function dobForInput(dob) { // stored → what the form shows (MM/DD/YYYY)
    if (!dob) return '';
    const [y, m, d] = dob.split('-');
    return d ? `${m}/${d}/${y}` : m ? `${m}/${y}` : y;
  }
  function age(dob) {
    if (!dob) return null;
    const [y, m, d] = dob.split('-').map(Number);
    const now = new Date();
    let a = now.getFullYear() - y;
    if (m && d && (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d))) a--;
    return { years: a, approx: !(m && d) };
  }

  /* ---------- CSV ---------- */
  // RFC-4180-ish parser: quotes, escaped quotes, newlines in quotes, BOM, auto delimiter (, ; tab)
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of firstLine) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
    const rows = []; let row = []; let field = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"' && field === '') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (!nonEmpty.length) return { headers: [], records: [] };
    const headers = nonEmpty[0].map((h) => h.trim());
    const records = nonEmpty.slice(1).map((r, idx) => {
      const o = { __line: idx + 2 };
      headers.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
      return o;
    });
    return { headers, records, delim };
  }

  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=@]/.test(s)) s = "'" + s;             // stop spreadsheets running it as a formula
    return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(headers, rows) {
    // BOM so Excel shows Bengali correctly; CRLF line endings for Excel/Sheets
    return '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\r\n');
  }

  /* ---------- Normalise one record (from CSV row OR JSON person) ---------- */
  function normalizeRecord(raw, label, warnings) {
    const out = { photoFiles: [], person: {}, links: { mother: [], father: [], parents: [], spouses: [], siblings: [], friends: [] }, relationText: '', isMe: false, srcId: '', extra: {} };
    const relCandidates = {};
    let hasCalledCol = false;
    Object.entries(raw || {}).forEach(([k, v]) => {
      if (k === '__line') return;
      // JSON exports carry relationToMe as an object — use its terms as a fallback relation
      if (snake(k) === 'relation_to_me' && v && typeof v === 'object' && !Array.isArray(v)) {
        relCandidates.bengali_roman = v.bengaliRoman || v.bengali_roman || v.termRoman; relCandidates.bengali_term = v.bengali || v.term; relCandidates.relation_english = v.english;
        return;
      }
      const c = canonKey(k);
      if (c === 'called_term') hasCalledCol = true;
      if (!c) { if (!isBlank(v)) out.extra[str(k)] = typeof v === 'object' ? JSON.stringify(v) : str(v); return; }
      if (c === '_ignore' || isBlank(v)) return;
      if (REF_FIELDS.includes(c)) { out.links[c].push(...splitList(v)); return; }
      if (['relation_to_me', 'bengali_roman', 'bengali_term', 'relation_english'].includes(c)) { relCandidates[c] = str(v); return; }
      switch (c) {
        case 'id': out.srcId = safeId(v); break;
        case 'called_term': out.person.calledTerm = str(v); break;
        case 'heritage': { const h = FT.cultures && FT.cultures.find(v); if (h) out.person.heritage = h; else if (str(v) && warnings) warnings.push(`${label}: heritage "${str(v)}" isn't one the app knows yet — their terms follow their side of the family`); break; }
        case 'deceased': out.person.deceased = parseBool(v) === true || v === true; break;
        case 'died': { const d = parseDate(v); out.person.died = d ? formatDob(d) : str(v); out.person.deceased = true; break; }
        case 'bengali_nuance': out.person.termNuance = str(v); break;
        case 'name': case 'nickname': case 'phone': case 'email': case 'city': case 'address': case 'notes': out.person[c] = str(v); break;
        case 'gender': out.person.gender = parseGender(v); break;
        case 'whatsapp': { const b = parseBool(v); if (b !== null) out.person.whatsapp = b; break; }
        case 'is_me': out.isMe = parseBool(v) === true; break;
        case 'placeholder': out.person.placeholder = parseBool(v) === true || v === true; break;
        case 'photo_files': out.photoFiles.push(...splitList(v)); break;
        case 'photos': out.person.photos = (Array.isArray(v) ? v : splitList(v)).filter(safePhoto); break;
        case 'created_at': out.person.createdAt = str(v); break;
        case 'updated_at': out.person.updatedAt = str(v); break;
        case 'met_on': { const d = parseDate(v); if (d) out.person.metOn = d; else warnings.push(`${label}: couldn't read "met on" date "${str(v)}" — kept it in notes`), (out.person.notes = [out.person.notes, `Met on: ${str(v)}`].filter(Boolean).join('\n')); break; }
        case 'dob': {
          const dec = str(v).match(/^(?:~|about |circa )?(\d{3})0'?s$/i);
          if (dec) { out.person.birthDecade = dec[1] + '0'; break; }
          const d = parseDate(v);
          if (d) { if (!out.person.dob || d.length > out.person.dob.length) out.person.dob = d; }
          else { warnings.push(`${label}: couldn't read date of birth "${str(v)}" — kept it in notes`); out.person.notes = [out.person.notes, `DOB: ${str(v)}`].filter(Boolean).join('\n'); }
          break;
        }
      }
    });
    if (out.person.dob) out.person.birthYear = out.person.dob.slice(0, 4); // keeps older app versions working
    // The term typed in relation_to_me is kept as "what you call them" (our own exports carry it in called_term instead)
    const typed = relCandidates.relation_to_me;
    // ...but not friend words ("colleague", "Priya's neighbor"): those become friend links, not a name you call them
    const isFriendWord = FT.kin && FT.kin.friendKind(typed);
    if (!hasCalledCol && typed && !isFriendWord && !['me', 'self', 'myself', 'you', 'ami', 'আমি'].includes(typed.toLowerCase())) out.person.calledTerm = typed;
    out.relationText = relCandidates.relation_to_me || relCandidates.bengali_roman || relCandidates.bengali_term || relCandidates.relation_english || '';
    if (Object.keys(out.extra).length) out.person.extra = out.extra;
    return out;
  }


  /* ---------- Contacts: vCard (.vcf) and pasted text ---------- */
  // Quoted-printable (old Android vCard 2.1 exports Bengali names this way)
  function decodeQP(str, charset = 'utf-8') {
    const bytes = [];
    const s = str.replace(/=\r?\n/g, '');
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(s.charCodeAt(i) & 0xff);
    }
    try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch { return new TextDecoder().decode(new Uint8Array(bytes)); }
  }
  const unescapeV = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const digits = (v) => String(v || '').replace(/[^\d]/g, '');

  // Returns [{ name, nickname, phone, email, address, city, dob, notes, photos }]
  function parseVCards(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '');
    // unfold: v2.1 QP soft breaks ("=" at line end) and v3/v4 folded lines (leading space/tab)
    const lines = [];
    raw.split(/\r?\n/).forEach((ln) => {
      const prev = lines[lines.length - 1];
      if (prev !== undefined && /^[ \t]/.test(ln)) lines[lines.length - 1] = prev + ln.replace(/^[ \t]/, '');
      else if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev.split(':')[0]) && prev.endsWith('=')) lines[lines.length - 1] = prev + '\n' + ln;
      else lines.push(ln);
    });
    const cards = []; let cur = null;
    lines.forEach((ln) => {
      if (/^BEGIN:VCARD/i.test(ln)) { cur = { tel: [], email: [], adr: [], photos: [], notes: [] }; return; }
      if (/^END:VCARD/i.test(ln)) { if (cur) cards.push(cur); cur = null; return; }
      if (!cur || !ln.includes(':')) return;
      const idx = ln.indexOf(':');
      const head = ln.slice(0, idx), valueRaw = ln.slice(idx + 1);
      const [propRaw, ...params] = head.split(';');
      const prop = propRaw.replace(/^item\d+\./i, '').toUpperCase();
      const P = params.join(';').toUpperCase();
      const charset = (params.find((x) => /^CHARSET=/i.test(x)) || 'CHARSET=utf-8').split('=')[1];
      let value = /QUOTED-PRINTABLE/.test(P) ? decodeQP(valueRaw, charset) : valueRaw;
      const type = (P.match(/TYPE=([^;:]+)/g) || []).join(',') + ',' + params.filter((x) => !x.includes('=')).join(',').toUpperCase();
      switch (prop) {
        case 'FN': cur.fn = unescapeV(value).trim(); break;
        case 'N': { const [last, first, mid] = value.split(';').map(unescapeV); cur.n = [first, mid, last].filter(Boolean).join(' ').trim(); break; }
        case 'NICKNAME': cur.nickname = unescapeV(value).split(',')[0].trim(); break;
        case 'TEL': if (value.trim()) cur.tel.push({ v: value.replace(/^tel:/i, '').trim(), cell: /CELL|MOBILE/.test(type), pref: /PREF/.test(type) }); break;
        case 'EMAIL': if (value.trim()) cur.email.push(unescapeV(value).trim()); break;
        case 'ADR': { const a = value.split(';').map(unescapeV); cur.adr.push({ street: [a[0], a[1], a[2]].filter(Boolean).join(', '), city: a[3] || '', rest: [a[4], a[5], a[6]].filter(Boolean).join(', ') }); break; }
        case 'BDAY': cur.bday = value.trim(); break;
        case 'NOTE': cur.notes.push(unescapeV(value).trim()); break;
        case 'ORG': cur.org = unescapeV(value).replace(/;/g, ' ').trim(); break;
        case 'TITLE': cur.title = unescapeV(value).trim(); break;
        case 'PHOTO': {
          if (/^data:image\//i.test(value)) cur.photos.push(value.replace(/\s+/g, ''));
          else if (/ENCODING=(B|BASE64)/.test(P) || /^[A-Za-z0-9+/=\s]{200,}$/.test(value)) {
            const t = (P.match(/TYPE=(\w+)/) || [, 'JPEG'])[1].toLowerCase().replace('jpg', 'jpeg');
            cur.photos.push(`data:image/${t};base64,${value.replace(/\s+/g, '')}`);
          }
          break;
        }
      }
    });
    return cards.map((c) => {
      const tels = [...c.tel].sort((a, b) => (b.pref - a.pref) || (b.cell - a.cell));
      const a = c.adr[0] || {};
      let dob = null;
      const notes = [...c.notes];
      if (c.bday) {
        const b = c.bday.replace(/T.*$/, '');
        if (/^\d{8}$/.test(b)) dob = parseDate(`${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6)}`);
        else if (/^--\d{2}-?\d{2}$/.test(b)) { const m = b.replace(/-/g, ''); notes.push(`Birthday: ${MON[+m.slice(0, 2) - 1]} ${+m.slice(2)} (year unknown)`); }
        else dob = parseDate(b);
      }
      if (tels.length > 1) notes.push('Other numbers: ' + tels.slice(1).map((t) => t.v).join(', '));
      if (c.email.length > 1) notes.push('Other emails: ' + c.email.slice(1).join(', '));
      if (c.org || c.title) notes.push([c.title, c.org].filter(Boolean).join(', '));
      return {
        name: c.fn || c.n || c.nickname || (tels[0] && tels[0].v) || '', nickname: c.nickname || '',
        phone: tels[0] ? tels[0].v : '', email: c.email[0] || '',
        address: [a.street, a.rest].filter(Boolean).join(', '), city: a.city || '',
        dob: dob || '', notes: notes.filter(Boolean).join('\n'), photos: c.photos.filter((x) => x.length > 100 && safePhoto(x)),
      };
    }).filter((c) => c.name);
  }

  // Free text from "Share contact as text" / WhatsApp / SMS → one contact
  function parseContactText(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/BEGIN:VCARD/i.test(t)) return parseVCards(t)[0] || null;
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = { name: '', nickname: '', phone: '', email: '', address: '', city: '', dob: '', notes: '', photos: [] };
    const extraPhones = [], rest = [];
    const PHONE = /(\+?\d[\d\s\-().]{6,}\d)/;
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    lines.forEach((ln) => {
      const lab = ln.match(/^([A-Za-z ]{2,20})\s*[:\-–]\s*(.+)$/);
      const key = lab ? lab[1].trim().toLowerCase() : '';
      const val = lab ? lab[2].trim() : ln;
      if (lab && /^(name|full name|contact)$/.test(key)) { out.name = val; return; }
      if (lab && /^(nick ?name|dak ?naam)$/.test(key)) { out.nickname = val; return; }
      const mostlyDigits = digits(val).length >= 7 && val.replace(/[\d\s+\-().]/g, '').length === 0;
      if (lab && (mostlyDigits || /(phone|mobile|cell|tel|whatsapp|number)/.test(key))) { const v = (val.match(PHONE) || [val])[0].trim(); if (!out.phone) out.phone = v; else extraPhones.push(`${v} (${key})`); return; }
      if (lab && /(address|addr|flat|home)/.test(key)) { out.address = val; return; }
      if (lab && /^(city|town|place)$/.test(key)) { out.city = val; return; }
      if (lab && /(birthday|dob|born|birth)/.test(key)) { out.dob = parseDate(val) || ''; if (!out.dob) rest.push(ln); return; }
      const em = ln.match(EMAIL);
      if (em) { if (!out.email) out.email = em[0]; else rest.push(ln); return; }
      const ph = ln.match(PHONE);
      if (ph && digits(ph[1]).length >= 7 && digits(ph[1]).length <= 15 && (lab || ln.replace(ph[1], '').replace(/[^A-Za-z\u0980-\u09FF]/g, '').length < 12)) {
        if (!out.phone) out.phone = ph[1].trim(); else extraPhones.push(ph[1].trim()); return;
      }
      if (!out.name && !/\d{3,}/.test(ln) && ln.length <= 60) { out.name = val; return; }
      rest.push(ln);
    });
    // a remaining line with digits + commas looks like an address
    if (!out.address) { const i = rest.findIndex((l) => /,/.test(l) && /\d/.test(l)); if (i >= 0) out.address = rest.splice(i, 1)[0]; }
    if (extraPhones.length) rest.push('Other numbers: ' + extraPhones.join(', '));
    out.notes = rest.join('\n');
    return out.name || out.phone || out.email ? out : null;
  }

  /* ---------- Read a whole file (JSON or CSV) into a common shape ---------- */
  const REL_TYPES = { parent_of: 'parent_of', parent: 'parent_of', parentof: 'parent_of', child_of: 'child_of', child: 'child_of',
    spouse_of: 'spouse_of', spouse: 'spouse_of', married: 'spouse_of', married_to: 'spouse_of', husband: 'spouse_of', wife: 'spouse_of',
    sibling_of: 'sibling_of', sibling: 'sibling_of', brother: 'sibling_of', sister: 'sibling_of',
    friend_of: 'friend_of', friend: 'friend_of', knows: 'friend_of' };

  function readImport(text, filename = '') {
    const warnings = [];
    let data = null; // parsed JSON, when the input is JSON
    const t = String(text || '').replace(/^\uFEFF/, '').trim();
    const looksJson = /\.json$/i.test(filename) || t.startsWith('{') || t.startsWith('[');
    let rawPeople = [], rawRels = [], meRef = '', format;
    if (/\.vcf$/i.test(filename) || /^BEGIN:VCARD/i.test(t)) {
      const cards = parseVCards(t);
      if (!cards.length) return { error: 'No contacts found in that .vcf file.' };
      const rows = cards.map((c, i) => { const rec = normalizeRecord(c, `Contact ${i + 1}`, warnings); rec.label = `Contact ${i + 1} (${c.name})`; return rec; });
      return { format: 'vcf', rows, rels: [], meRef: '', warnings };
    }

    if (looksJson) {
      format = 'json';
      try { data = JSON.parse(t); } catch (e) { return { error: `That JSON file couldn't be read (${e.message}).` }; }
      if (Array.isArray(data)) rawPeople = data;                               // bare list of people
      else if (data && typeof data === 'object') {
        rawPeople = Array.isArray(data.people) ? data.people : Array.isArray(data.persons) ? data.persons : Array.isArray(data.members) ? data.members : [];
        rawRels = Array.isArray(data.relationships) ? data.relationships : Array.isArray(data.relations) ? data.relations : Array.isArray(data.links) ? data.links : [];
        meRef = str((data.meta && (data.meta.meId || data.meta.me_id)) || data.meId || data.me_id || '');
        if (data.app && data.app !== 'paribar') warnings.push(`File says it's from "${data.app}" — imported what could be recognised.`);
      }
      if (!rawPeople.length) return { error: 'No people found in that JSON file (expected a "people" list).' };
    } else {
      format = 'csv';
      const { headers, records } = parseCSV(t);
      if (!headers.length) return { error: 'That CSV file is empty.' };
      const known = headers.filter((h) => canonKey(h));
      if (!headers.some((h) => canonKey(h) === 'name')) return { error: 'The CSV needs a "name" column (that is the only required one).' };
      const unknown = headers.filter((h) => h && !canonKey(h));
      if (unknown.length) warnings.push(`Extra columns kept as-is: ${unknown.join(', ')}`);
      rawPeople = records;
      if (!known.length) warnings.push('No recognised columns besides name.');
    }

    const rows = [];
    rawPeople.forEach((raw, i) => {
      const label = raw && raw.__line ? `Row ${raw.__line}` : `Person ${i + 1}`;
      if (!raw || typeof raw !== 'object') { warnings.push(`${label}: not a person record — skipped`); return; }
      const rec = normalizeRecord(raw, label, warnings);
      if (!rec.person.name) {
        if (rec.person.nickname) rec.person.name = rec.person.nickname;
        else { if (Object.values(rec.person).some((v) => !isBlank(v))) warnings.push(`${label}: no name — skipped`); return; }
      }
      rec.label = `${label} (${rec.person.name})`;
      rows.push(rec);
    });

    const rels = [];
    rawRels.forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const type = REL_TYPES[snake(r.type || r.relation || r.kind)];
      const from = str(r.from ?? r.source ?? r.a), to = str(r.to ?? r.target ?? r.b);
      if (!type || !from || !to) { warnings.push(`Link ${i + 1}: missing type/from/to — skipped`); return; }
      // keep marriage details (status, year, full date) so a backup round-trips without losing them
      const extra = {}; ['status', 'marriedYear', 'marriedOn'].forEach((k) => { if (!isBlank(r[k])) extra[k] = str(r[k]); });
      if (type === 'friend_of') extra.kind = (FT.kin && FT.kin.friendKindOf(r.kind)) || 'friend'; // friend / colleague / neighbor / classmate
      rels.push(type === 'child_of' ? { type: 'parent_of', from: to, to: from, id: safeId(r.id) } : { type, from, to, id: safeId(r.id), ...extra });
    });
    // visits only come from Paribar JSON backups
    const visits = format === 'json' && !Array.isArray(data) && Array.isArray(data.visits) ? data.visits.filter((v) => v && typeof v === 'object').map(cleanVisit).filter(Boolean) : [];
    return { format, rows, rels, meRef, warnings, visits, heritage: cleanHeritage(data && data.meta && data.meta.heritage),
      theme: data && data.meta && FT.themes && FT.themes.has(data.meta.theme) ? data.meta.theme : null };
  }

  /* ---------- Excel (.xlsx) → CSV text, so it goes through the same import as a .csv ----------
     An .xlsx file is a zip of XML parts. Reads the first sheet that has a "name" header (else the
     first sheet): shared strings, inline strings, numbers, true/false, and date-formatted cells
     (turned into YYYY-MM-DD). Needs fflate (bundled) and the browser's DOMParser.
     Old binary .xls files can't be read this way: the caller asks for .xlsx or .csv instead. */
  function xlsxToCsv(bytes) {
    let files;
    try { files = fflate.unzipSync(bytes); } catch (e) { return { error: "That Excel file couldn't be opened. In Excel, use File › Save As › Excel Workbook (.xlsx) or CSV." }; }
    const text = (path) => (files[path] ? fflate.strFromU8(files[path]) : '');
    const xml = (path) => (files[path] ? new DOMParser().parseFromString(text(path), 'application/xml') : null);
    const all = (doc, tag) => (doc ? [...doc.getElementsByTagNameNS('*', tag)] : []);
    const wb = xml('xl/workbook.xml');
    if (!wb) return { error: 'That doesn\'t look like an Excel workbook (.xlsx).' };
    const date1904 = all(wb, 'workbookPr').some((n) => /^(1|true)$/.test(n.getAttribute('date1904') || ''));
    // sheet name → file, via the workbook relationships
    const relsDoc = xml('xl/_rels/workbook.xml.rels');
    const target = new Map(all(relsDoc, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
    const sheets = all(wb, 'sheet').map((sh) => {
      const rid = sh.getAttribute('r:id') || [...sh.attributes].find((a) => /(^|:)id$/.test(a.name) && a.name !== 'sheetId')?.value;
      let t = target.get(rid) || ''; t = t.replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t;
      return { name: sh.getAttribute('name'), path: t };
    }).filter((x) => files[x.path]);
    if (!sheets.length) return { error: 'No sheets found in that Excel file.' };
    // shared strings (rich text: join the runs, skip phonetic guides)
    const shared = all(xml('xl/sharedStrings.xml'), 'si').map((si) => all(si, 't').filter((t) => !t.closest || !t.closest('rPh')).map((t) => t.textContent).join(''));
    // which cell styles are dates
    const st = xml('xl/styles.xml');
    const custom = new Map(all(st, 'numFmt').map((f) => [+f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '']));
    const isDateFmt = (id) => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom.has(id) && /[dy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')));
    const cellXfs = all(st, 'cellXfs')[0];
    const dateStyle = cellXfs ? all(cellXfs, 'xf').map((xf) => isDateFmt(+(xf.getAttribute('numFmtId') || 0))) : [];
    const serialToIso = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + (n + (date1904 ? 1462 : 0)) * 86400000); return d.toISOString().slice(0, 10); };
    const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const readSheet = (path) => {
      const rows = [];
      all(xml(path), 'row').forEach((r) => {
        const row = [];
        all(r, 'c').forEach((c, i) => {
          const ref = c.getAttribute('r'); const col = ref ? colIndex(ref) : row.length || i;
          const type = c.getAttribute('t') || 'n'; const v = all(c, 'v')[0]; const raw = v ? v.textContent : '';
          let val = '';
          if (type === 's') val = shared[+raw] ?? '';
          else if (type === 'inlineStr') val = all(c, 't').map((t) => t.textContent).join('');
          else if (type === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') val = raw;
          else if (raw !== '') val = dateStyle[+(c.getAttribute('s') || 0)] ? serialToIso(+raw) : String(+raw);
          row[col] = val;
        });
        const rn = +(r.getAttribute('r') || rows.length + 1) - 1;
        rows[rn] = Array.from(row, (x) => x ?? '');
      });
      return Array.from(rows, (x) => x || []).filter((r) => r.some((x) => String(x).trim() !== ''));
    };
    const parsedSheets = sheets.map((sh) => ({ ...sh, rows: readSheet(sh.path) })).filter((sh) => sh.rows.length);
    if (!parsedSheets.length) return { error: 'That Excel file is empty.' };
    const pick = parsedSheets.find((sh) => sh.rows[0].some((h) => /^\s*(full\s*)?name\s*$/i.test(String(h)))) || parsedSheets[0];
    const width = Math.max(...pick.rows.map((r) => r.length));
    const q = (v) => { const t = String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }; // plain quoting: this CSV is only read back in
    const csv = pick.rows.map((r) => Array.from({ length: width }, (_, i) => q(r[i] ?? '')).join(',')).join('\r\n');
    return { csv, sheet: pick.name, sheets: parsedSheets.length };
  }

  return { parseVCards, parseContactText, parseCSV, toCSV, readImport, xlsxToCsv, parseDate, parseGender, parseBool, formatDob, dobForInput, age, isBlank, snake };
})();
