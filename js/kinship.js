/* =========================================================
   kinship.js — Works out how anyone is related to "Me"
   1. Graph search (BFS) from Me → person over the stored links
      (parent_of, spouse_of, sibling_of) + derived siblings.
      Friend links (friend_of: friend, colleague, neighbor, classmate)
      are a separate layer: family paths always win, friends are
      only used for people you aren't related to.
   2. Turns the path into English words: ["mother","brother","son"]
   3. Looks up the Bengali term: মামাতো ভাই (Mamato Bhai)
   ========================================================= */
window.FT = window.FT || {};

FT.kin = (() => {
  // ---- Word for one step, based on the gender of the person you land on
  const STEP_WORD = {
    parent:  { m: 'father',  f: 'mother',   x: 'parent'  },
    child:   { m: 'son',     f: 'daughter', x: 'child'   },
    spouse:  { m: 'husband', f: 'wife',     x: 'spouse'  },
    sibling: { m: 'brother', f: 'sister',   x: 'sibling' },
  };
  const PARENTS = ['father', 'mother', 'parent'];
  const CHILDREN = ['son', 'daughter', 'child'];
  const SIBS = ['brother', 'sister', 'sibling'];

  // ---- Friends layer: kinds of link, with the Bengali word for each
  const FRIEND_KINDS = {
    friend: { en: 'friend', bn: 'Bondhu', bnScript: 'বন্ধু' },
    colleague: { en: 'colleague', bn: 'Sohokormi', bnScript: 'সহকর্মী' },
    neighbor: { en: 'neighbor', bn: 'Protibeshi', bnScript: 'প্রতিবেশী' },
    classmate: { en: 'classmate', bn: 'Sohopathi', bnScript: 'সহপাঠী' },
  };
  const FRIEND_ALIASES = { friend: 'friend', friends: 'friend', bondhu: 'friend', 'বন্ধু': 'friend', bestfriend: 'friend', 'best friend': 'friend',
    colleague: 'colleague', coworker: 'colleague', 'co-worker': 'colleague', 'work friend': 'colleague', sohokormi: 'colleague', 'সহকর্মী': 'colleague',
    neighbor: 'neighbor', neighbour: 'neighbor', protibeshi: 'neighbor', 'প্রতিবেশী': 'neighbor',
    classmate: 'classmate', 'school friend': 'classmate', 'college friend': 'classmate', sohopathi: 'classmate', 'সহপাঠী': 'classmate' };
  const friendKindOf = (w) => FRIEND_ALIASES[String(w || '').toLowerCase().trim()] || null;
  // "colleague" -> { kind, owner: null };  "Priya's colleague" -> { kind, owner: 'Priya' }
  function friendKind(text) {
    const t = String(text || '').trim().replace(/^my\s+/i, '');
    if (friendKindOf(t)) return { kind: friendKindOf(t), owner: null };
    const m = t.match(/^(.+?)['’]s\s+(.+)$/);
    return m && friendKindOf(m[2]) ? { kind: friendKindOf(m[2]), owner: m[1].trim() } : null;
  }

  // ---- Build an adjacency list from the relationship records
  function buildGraph(people, rels) {
    const adj = new Map();
    people.forEach((p) => adj.set(p.id, []));
    const add = (a, b, step, rel) => adj.has(a) && adj.has(b) && adj.get(a).push({ to: b, step, rel });
    rels.forEach((r) => {
      if (r.type === 'parent_of') { add(r.from, r.to, 'child', r); add(r.to, r.from, 'parent', r); }
      else if (r.type === 'spouse_of') { add(r.from, r.to, 'spouse', r); add(r.to, r.from, 'spouse', r); }
      else if (r.type === 'sibling_of') { add(r.from, r.to, 'sibling', r); add(r.to, r.from, 'sibling', r); }
      else if (r.type === 'friend_of') { add(r.from, r.to, 'friend', r); add(r.to, r.from, 'friend', r); }
    });
    // Derived siblings: two people who share a parent (1 step instead of parent→child)
    people.forEach((p) => {
      const parents = (adj.get(p.id) || []).filter((e) => e.step === 'parent').map((e) => e.to);
      parents.forEach((par) => {
        (adj.get(par) || []).filter((e) => e.step === 'child' && e.to !== p.id).forEach((e) => {
          if (!adj.get(p.id).some((x) => x.to === e.to && x.step === 'sibling')) add(p.id, e.to, 'sibling', null);
        });
      });
    });
    return adj;
  }

  // ---- Shortest path from one person to every other person.
  //      Fewest friend links first, then fewest steps: so your cousin who is also your
  //      colleague stays "Mamato Bhai", and only non-relatives are reached through friends.
  function pathsFrom(rootId, adj) {
    const prev = new Map([[rootId, null]]);
    let frontier = [rootId];
    while (frontier.length) {
      const reached = [...frontier]; const queue = [...frontier];
      while (queue.length) {                       // family steps from this tier
        const cur = queue.shift();
        for (const e of adj.get(cur) || []) {
          if (e.step === 'friend' || prev.has(e.to)) continue;
          prev.set(e.to, { from: cur, step: e.step }); queue.push(e.to); reached.push(e.to);
        }
      }
      const next = [];                             // then one friend link out, to start the next tier
      reached.forEach((cur) => (adj.get(cur) || []).forEach((e) => {
        if (e.step !== 'friend' || prev.has(e.to)) return;
        prev.set(e.to, { from: cur, step: 'friend', kind: (e.rel && e.rel.kind) || 'friend' }); next.push(e.to);
      }));
      frontier = next;
    }
    // Rebuild each path as [{id, step, kind?}, ...]
    const out = new Map();
    for (const id of prev.keys()) {
      const steps = [];
      let cur = id;
      while (prev.get(cur)) { const s = prev.get(cur); steps.unshift({ id: cur, step: s.step, ...(s.kind ? { kind: s.kind } : {}) }); cur = s.from; }
      out.set(id, steps);
    }
    return out;
  }

  // ---- Compare ages using birth year (null = unknown)
  // Uses full DOB when both people have one, otherwise birth year (old records only have birthYear)
  const yearOf = (p) => (p && p.dob ? +String(p.dob).slice(0, 4) : p && p.birthYear ? +p.birthYear : null);
  function isElder(a, b) {
    if (!a || !b) return null;
    const full = (p) => p.dob && /^\d{4}-\d{2}-\d{2}$/.test(p.dob);
    if (full(a) && full(b)) return a.dob === b.dob ? null : a.dob < b.dob;
    const ya = yearOf(a), yb = yearOf(b);
    if (!ya || !yb || ya === yb) return null;
    return ya < yb;
  }
  // Pick elder / younger / both variants
  // "Mamato Dada", "Mamato Bhai" → "Mamato Dada / Bhai"
  const compact = (list) => {
    const u = [...new Set(list)];
    if (u.length < 2) return u[0] || '';
    const first = u.map((t) => t.split(' '));
    const pre = first[0][0];
    return first.every((w) => w.length > 1 && w[0] === pre) ? pre + ' ' + first.map((w) => w.slice(1).join(' ')).join(' / ') : u.join(' / ');
  };
  const ey = (elder, e, y) => (elder === true ? e : elder === false ? y : [compact([e[0], y[0]]), compact([e[1], y[1]])]);

  // ---- Bengali term table. key = English words joined with "."
  //      value = [romanized, Bengali script] or fn(ctx) returning that
  const T = {
    'father': ['Baba', 'বাবা'], 'mother': ['Ma', 'মা'],
    'son': ['Chhele', 'ছেলে'], 'daughter': ['Meye', 'মেয়ে'],
    'husband': ['Swami', 'স্বামী'], 'wife': ['Bou', 'বউ'],
    'brother': (c) => ey(c.elderThanMe(1), ['Dada', 'দাদা'], ['Bhai', 'ভাই']),
    'sister':  (c) => ey(c.elderThanMe(1), ['Didi', 'দিদি'], ['Bon', 'বোন']),
    'brother.wife':  (c) => ey(c.elderThanMe(1), ['Boudi', 'বৌদি'], ['Bhai-bou', 'ভাইবউ']),
    'sister.husband': (c) => ey(c.elderThanMe(1), ['Jamaibabu', 'জামাইবাবু'], ['Bhagnipoti', 'ভগ্নিপতি']),

    // Mother's side (মামার বাড়ি)
    'mother.mother': ['Didima', 'দিদিমা'], 'mother.father': ['Dadu', 'দাদু'],
    'mother.brother': ['Mama', 'মামা'], 'mother.brother.wife': ['Mami', 'মামি'],
    'mother.sister': ['Mashi', 'মাসি'], 'mother.sister.husband': ['Meshomoshai', 'মেসোমশাই'],
    'mother.brother.son': (c) => ey(c.elderThanMe(3), ['Mamato Dada', 'মামাতো দাদা'], ['Mamato Bhai', 'মামাতো ভাই']),
    'mother.brother.daughter': (c) => ey(c.elderThanMe(3), ['Mamato Didi', 'মামাতো দিদি'], ['Mamato Bon', 'মামাতো বোন']),
    'mother.sister.son': (c) => ey(c.elderThanMe(3), ['Mashtuto Dada', 'মাসতুতো দাদা'], ['Mashtuto Bhai', 'মাসতুতো ভাই']),
    'mother.sister.daughter': (c) => ey(c.elderThanMe(3), ['Mashtuto Didi', 'মাসতুতো দিদি'], ['Mashtuto Bon', 'মাসতুতো বোন']),
    'mother.mother.sister': ['Mashi-Didima', 'মাসি-দিদিমা'], 'mother.mother.brother': ['Mama-Dadu', 'মামা-দাদু'],
    'mother.father.sister': ['Pishi-Didima', 'পিসি-দিদিমা'], 'mother.father.brother': ['Dadu (Ma\'s kaka/jethu)', 'দাদু'],
    'mother.mother.mother': ['Boro-Didima', 'বড়দিদিমা'], 'mother.mother.father': ['Boro-Dadu', 'বড়দাদু'],

    // Father's side
    'father.mother': ['Thakuma', 'ঠাকুমা'], 'father.father': ['Thakurda', 'ঠাকুরদা'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Jethu', 'জেঠু'], ['Kaku', 'কাকু']),
    'father.brother.wife': (c) => ey(c.elder(2, 1), ['Jethima', 'জেঠিমা'], ['Kakima', 'কাকিমা']),
    'father.sister': ['Pishi', 'পিসি'], 'father.sister.husband': ['Pishemoshai', 'পিসেমশাই'],
    'father.brother.son': (c) => ey(c.elderThanMe(3), ['Khurtuto/Jethtuto Dada', 'খুড়তুতো/জেঠতুতো দাদা'], ['Khurtuto/Jethtuto Bhai', 'খুড়তুতো/জেঠতুতো ভাই']),
    'father.brother.daughter': (c) => ey(c.elderThanMe(3), ['Khurtuto/Jethtuto Didi', 'খুড়তুতো/জেঠতুতো দিদি'], ['Khurtuto/Jethtuto Bon', 'খুড়তুতো/জেঠতুতো বোন']),
    'father.sister.son': (c) => ey(c.elderThanMe(3), ['Pishtuto Dada', 'পিসতুতো দাদা'], ['Pishtuto Bhai', 'পিসতুতো ভাই']),
    'father.sister.daughter': (c) => ey(c.elderThanMe(3), ['Pishtuto Didi', 'পিসতুতো দিদি'], ['Pishtuto Bon', 'পিসতুতো বোন']),

    // Younger generations
    'brother.son': ['Bhaipo', 'ভাইপো'], 'brother.daughter': ['Bhaijhi', 'ভাইঝি'],
    'sister.son': ['Bhagne', 'ভাগ্নে'], 'sister.daughter': ['Bhagni', 'ভাগ্নি'],
    'son.son': ['Nati', 'নাতি'], 'daughter.son': ['Nati', 'নাতি'],
    'son.daughter': ['Natni', 'নাতনি'], 'daughter.daughter': ['Natni', 'নাতনি'],
    'son.wife': ['Bouma', 'বউমা'], 'daughter.husband': ['Jamai', 'জামাই'],

    // In-laws
    'wife.father': ['Shoshur-moshai', 'শ্বশুরমশাই'], 'husband.father': ['Shoshur-moshai', 'শ্বশুরমশাই'],
    'wife.mother': ['Shashuri-ma', 'শাশুড়িমা'], 'husband.mother': ['Shashuri-ma', 'শাশুড়িমা'],
    'wife.brother': ['Shala', 'শালা'], 'wife.sister': ['Shali', 'শালী'],
    'husband.brother': (c) => ey(c.elder(2, 1), ['Bhashur', 'ভাসুর'], ['Deor', 'দেওর']),
    'husband.sister': ['Nanad', 'ননদ'],
  };

  // Ma's / Baba's cousins: male → Mama / Kaku, female → Mashi / Pishi
  ['mother', 'father'].forEach((side) => {
    ['mother', 'father'].forEach((gp) => {
      ['brother', 'sister'].forEach((sib) => {
        const base = `${side}.${gp}.${sib}`;
        if (side === 'mother') {
          T[`${base}.son`] = ['Mama (Ma\'s cousin)', 'মামা'];
          T[`${base}.daughter`] = ['Mashi (Ma\'s cousin)', 'মাসি'];
          T[`${base}.son.wife`] = ['Mami', 'মামি'];
          T[`${base}.daughter.husband`] = ['Meshomoshai', 'মেসোমশাই'];
        } else {
          T[`${base}.son`] = ['Kaku/Jethu (Baba\'s cousin)', 'কাকু/জেঠু'];
          T[`${base}.daughter`] = ['Pishi (Baba\'s cousin)', 'পিসি'];
        }
      });
    });
  });

  // Grandparents' siblings' spouses
  Object.assign(T, {
    'mother.father.sister.husband': ['Pishe-Dadu', 'পিসে-দাদু'], 'mother.mother.sister.husband': ['Mesho-Dadu', 'মেসো-দাদু'],
    'mother.mother.brother.wife': ['Mami-Didima', 'মামি-দিদিমা'], 'mother.father.brother.wife': ['Didima (Dadu\'s brother\'s wife)', 'দিদিমা'],
    'father.father.sister': ['Pishi-Thakuma', 'পিসি-ঠাকুমা'], 'father.father.brother': ['Thakurda (Baba\'s kaka/jethu)', 'ঠাকুরদা'],
    'father.mother.brother': ['Mama-Thakurda', 'মামা-ঠাকুরদা'], 'father.mother.sister': ['Mashi-Thakuma', 'মাসি-ঠাকুমা'],
  });
  // Cousins' children and spouses, and second cousins (Ma's/Baba's cousins' children)
  {
    const PRE = { 'mother.son': ['Mamato', 'মামাতো'], 'mother.daughter': ['Mashtuto', 'মাসতুতো'], 'father.son': ['Khurtuto', 'খুড়তুতো'], 'father.daughter': ['Pishtuto', 'পিসতুতো'] };
    const cousinKeys = ['mother.brother.son', 'mother.brother.daughter', 'mother.sister.son', 'mother.sister.daughter',
      'father.brother.son', 'father.brother.daughter', 'father.sister.son', 'father.sister.daughter'];
    ['mother', 'father'].forEach((side) => ['mother', 'father'].forEach((gp) => ['brother', 'sister'].forEach((sib) => ['son', 'daughter'].forEach((par) => {
      const [pr, prB] = PRE[`${side}.${par}`];
      const base = `${side}.${gp}.${sib}.${par}`; // Ma's cousin (Mama/Mashi) or Baba's cousin (Kaku/Pishi)
      const ci = 5;
      T[`${base}.son`] = (c) => ey(c.elderThanMe(ci), [`${pr} Dada`, `${prB} দাদা`], [`${pr} Bhai`, `${prB} ভাই`]);
      T[`${base}.daughter`] = (c) => ey(c.elderThanMe(ci), [`${pr} Didi`, `${prB} দিদি`], [`${pr} Bon`, `${prB} বোন`]);
      cousinKeys.push(`${base}.son`, `${base}.daughter`);
    }))));
    cousinKeys.forEach((k) => {
      const male = k.endsWith('.son'); const ci = k.split('.').length;
      if (!T[`${k}.son`]) T[`${k}.son`] = male ? ['Bhaipo', 'ভাইপো'] : ['Bhagne', 'ভাগ্নে'];
      if (!T[`${k}.daughter`]) T[`${k}.daughter`] = male ? ['Bhaijhi', 'ভাইঝি'] : ['Bhagni', 'ভাগ্নি'];
      if (male && !T[`${k}.wife`]) T[`${k}.wife`] = (c) => ey(c.elderThanMe(ci), ['Boudi', 'বৌদি'], ['Bhai-bou', 'ভাইবউ']);
      if (!male && !T[`${k}.husband`]) T[`${k}.husband`] = (c) => ey(c.elderThanMe(ci), ['Jamaibabu', 'জামাইবাবু'], ['Bhagnipoti', 'ভগ্নিপতি']);
    });
  }

  // ---- Collapse "parent→child" into sibling, "sibling→sibling" into sibling
  function normalize(steps, byId) {
    const out = [];
    steps.forEach((s) => {
      const g = (byId.get(s.id) || {}).gender || 'x';
      const word = STEP_WORD[s.step][g];
      const last = out[out.length - 1];
      if (last && PARENTS.includes(last.word) && CHILDREN.includes(word)) {
        out[out.length - 1] = { id: s.id, word: STEP_WORD.sibling[g] };
      } else if (last && SIBS.includes(last.word) && SIBS.includes(word)) {
        out[out.length - 1] = { id: s.id, word: STEP_WORD.sibling[g] };
      } else out.push({ id: s.id, word });
    });
    return out;
  }

  // ---- Main entry: describe how `personId` is related to Me
  function describe(personId, ctx) {
    const { byId, meId, paths } = ctx;
    if (personId === meId) { const cm = ctx.cultureOf ? ctx.cultureOf(personId, 'me') : 'bengali';
      return cm === 'bengali' ? { bn: 'Ami', bnScript: 'আমি', en: 'You', side: 'me', words: [], culture: cm, lang: 'bn-IN', alt: [] }
        : { bn: '', bnScript: '', en: 'You', side: 'me', words: [], culture: cm, lang: FT.cultures.get(cm).lang, alt: [] }; }
    const steps = paths.get(personId);
    if (!steps) return { bn: '', bnScript: '', en: 'Not linked to you yet', side: 'unlinked', words: [] };
    if (steps.some((s) => s.step === 'friend')) return describeFriend(steps, ctx);

    const norm = normalize(steps, byId);
    const words = norm.map((n) => n.word);
    const chainIds = [meId, ...norm.map((n) => n.id)];
    const key = words.join('.');

    // ctx helpers for elder/younger checks
    const c = {
      // is chain person i elder than Me?
      elderThanMe: (i) => isElder(byId.get(chainIds[i]), byId.get(meId)),
      // is chain person i elder than chain person j?
      elder: (i, j) => isElder(byId.get(chainIds[i]), byId.get(chainIds[j])),
      meGender: (byId.get(meId) || {}).gender || 'x',
    };
    // English chain: "Mother's brother's son"
    const en = words.map((w, i) => (i < words.length - 1 ? w + "'s" : w)).join(' ');
    const first = words[0];
    const side = first === 'mother' ? 'maternal'
      : first === 'father' ? 'paternal'
      : ['wife', 'husband', 'spouse'].includes(first) ? 'inlaw'
      : 'close';
    // Which heritage's words to use: the person's own setting, else the side of the family (v2)
    const cid = ctx.cultureOf ? ctx.cultureOf(personId, side) : 'bengali';
    let culture = cid, term = termIn(cid, words, c);
    // No term in that culture? The English (American) term always has one: "Second cousin", "Great-aunt"
    if (!term && cid !== 'english') { const g = FT.cultures.englishTerm(words); if (g) { term = [g, g]; culture = 'english'; } }
    // Mixed heritage: what the other sides of the family would call them (shown on the card)
    const alt = (ctx.altCultures || []).filter((x) => x !== cid && x !== 'english').map((x) => {
      const t = termIn(x, words, c); const pk = FT.cultures.get(x);
      return t && { culture: x, name: pk.name, roman: t[0] === t[1] ? '' : t[0], script: t[1], lang: pk.lang };
    }).filter(Boolean);
    if (term && culture === 'english' && term[0].toLowerCase() === en.toLowerCase()) term = null; // "Brother · Brother"
    return {
      bn: term ? (term[0] === term[1] ? '' : term[0]) : '',
      bnScript: term ? term[1] : '',
      culture, lang: FT.cultures.get(culture).lang, alt, enTerm: FT.cultures.englishTerm(words) || '',
      en: en.charAt(0).toUpperCase() + en.slice(1),
      side, words, chainIds,
    };
  }

  // Look up a path in one culture's pack: table first (with unknown genders tried both ways), then its generic rules
  function termIn(cid, words, c) {
    const pack = FT.cultures.get(cid);
    const look = (k) => { const t = pack.T[k]; return typeof t === 'function' ? t(c) : t; };
    let term = look(words.join('.'));
    // Gender unknown somewhere on the path? Try both genders and show "Mamato Bhai / Mamato Bon"
    if (!term && words.some((w) => ['parent', 'child', 'spouse', 'sibling'].includes(w))) {
      const swap = { parent: ['father', 'mother'], child: ['son', 'daughter'], spouse: ['husband', 'wife'], sibling: ['brother', 'sister'] };
      let keys = [[]];
      words.forEach((w) => { keys = keys.flatMap((k) => (swap[w] || [w]).map((x) => [...k, x])); });
      const found = keys.map((k) => look(k.join('.'))).filter(Boolean);
      if (found.length && found.length === keys.length) {
        const parts = (i) => found.flatMap((f) => { const [h, ...rest] = f[i].split(' '); return f[i].includes(' / ') && rest.length ? f[i].split(' / ').map((x, j) => (j ? h + ' ' + x : x)) : [f[i]]; });
        term = [compact(parts(0)), compact(parts(1))];
      }
    }
    if (!term && pack.generic) { const g = pack.generic(words, c); if (g) term = [g, g]; }
    return term || null;
  }

  // ---- Friends layer: "Colleague", "Priya's husband", "Ma's neighbor"
  //      Courtesy terms for a friend's family: their mother Mashima, father Kaku, elder brother Dada, elder sister Didi.
  function describeFriend(steps, ctx) {
    const { byId, meId } = ctx;
    const bengali = !ctx.cultureOf || ctx.cultureOf(steps[steps.length - 1].id, 'friend') === 'bengali';
    const name = (id) => { const p = byId.get(id) || {}; return p.nickname || (p.name || '').split(' ')[0] || 'Someone'; };
    let last = -1; steps.forEach((s, i) => { if (s.step === 'friend') last = i; });
    const f = steps[last], kind = FRIEND_KINDS[f.kind] || FRIEND_KINDS.friend;
    const ownerId = last === 0 ? meId : steps[last - 1].id;
    const tail = normalize(steps.slice(last + 1), byId).map((n) => n.word);
    const words = ['friend', ...tail];
    let en, bn = '', bnScript = '';
    if (!tail.length) {
      en = ownerId === meId ? kind.en : `${name(ownerId)}'s ${kind.en}`;
      if (ownerId === meId && bengali) ({ bn, bnScript } = kind);
    } else {
      en = `${name(f.id)}'s ${tail.map((w, i) => (i < tail.length - 1 ? w + "'s" : w)).join(' ')}`;
      const me = byId.get(meId), who = byId.get(steps[steps.length - 1].id);
      const elder = isElder(who, me);
      const COURTESY = { mother: ['Mashima', 'মাসিমা'], father: ['Kaku', 'কাকু'],
        brother: elder === true ? ['Dada', 'দাদা'] : null, sister: elder === true ? ['Didi', 'দিদি'] : null };
      const c = ownerId === meId && tail.length === 1 && COURTESY[tail[0]];
      if (c && bengali) [bn, bnScript] = c;
    }
    return { bn, bnScript, en: en.charAt(0).toUpperCase() + en.slice(1), side: 'friend', words, chainIds: [meId, ...steps.map((s) => s.id)], friendKind: f.kind, culture: bengali ? 'bengali' : 'english', lang: bengali ? 'bn-IN' : 'en-US', alt: [] };
  }

  // ---- Quick-add presets: Bengali term → path from Me
  //      Missing people along the path get created as placeholders.
  const PRESETS = [
    { label: 'Ma (মা) — mother', path: ['mother'] },
    { label: 'Baba (বাবা) — father', path: ['father'] },
    { label: 'Didima (দিদিমা) — Ma\'s mother', path: ['mother', 'mother'] },
    { label: 'Dadu (দাদু) — Ma\'s father', path: ['mother', 'father'] },
    { label: 'Mama (মামা) — Ma\'s brother', path: ['mother', 'brother'] },
    { label: 'Mashi (মাসি) — Ma\'s sister', path: ['mother', 'sister'] },
    { label: 'Mashi-Didima (মাসি-দিদিমা) — Didima\'s sister', path: ['mother', 'mother', 'sister'] },
    { label: 'Mama-Dadu (মামা-দাদু) — Didima\'s brother', path: ['mother', 'mother', 'brother'] },
    { label: 'Thakuma (ঠাকুমা) — Baba\'s mother', path: ['father', 'mother'] },
    { label: 'Thakurda (ঠাকুরদা) — Baba\'s father', path: ['father', 'father'] },
    { label: 'Jethu / Kaku (জেঠু / কাকু) — Baba\'s brother', path: ['father', 'brother'] },
    { label: 'Pishi (পিসি) — Baba\'s sister', path: ['father', 'sister'] },
    { label: 'Dada / Bhai (দাদা / ভাই) — brother', path: ['brother'] },
    { label: 'Didi / Bon (দিদি / বোন) — sister', path: ['sister'] },
    // friends layer (not family)
    { label: 'Friend (বন্ধু)', path: ['friend'] },
    { label: 'Colleague (সহকর্মী)', path: ['colleague'] },
    { label: 'Neighbor (প্রতিবেশী)', path: ['neighbor'] },
    { label: 'Classmate (সহপাঠী)', path: ['classmate'] },
  ];

  // Placeholder names when we have to create someone in the middle of a path
  const PLACEHOLDER = { 'mother': 'Ma', 'father': 'Baba', 'mother.mother': 'Didima', 'mother.father': 'Dadu',
    'father.mother': 'Thakuma', 'father.father': 'Thakurda' };

  // v2: presets in whichever heritage each side uses. All-Bengali families keep the original list.
  const PRESET_PATHS = [
    [['mother'], 'mother'], [['father'], 'father'], [['mother', 'mother'], "mother's mother"], [['mother', 'father'], "mother's father"],
    [['mother', 'brother'], "mother's brother"], [['mother', 'sister'], "mother's sister"], [['mother', 'mother', 'sister'], "mother's mother's sister"],
    [['mother', 'mother', 'brother'], "mother's mother's brother"], [['father', 'mother'], "father's mother"], [['father', 'father'], "father's father"],
    [['father', 'brother'], "father's brother"], [['father', 'sister'], "father's sister"], [['brother'], 'brother'], [['sister'], 'sister'],
  ];
  function presets(cultureOfSide) {
    const sideOf = (w) => (w === 'mother' ? 'maternal' : w === 'father' ? 'paternal' : 'close');
    const cids = PRESET_PATHS.map(([p]) => cultureOfSide(sideOf(p[0])));
    if (cids.every((x) => x === 'bengali')) return PRESETS;
    const fam = PRESET_PATHS.map(([path, desc], i) => {
      const t = termIn(cids[i], path, fake(null)) || [FT.cultures.englishTerm(path), FT.cultures.englishTerm(path)];
      return { label: `${t[0]}${t[1] !== t[0] ? ` (${t[1]})` : ''} — ${desc}`, path };
    });
    return [...fam, ...['friend', 'colleague', 'neighbor', 'classmate'].map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), path: [k] }))];
  }
  // Name for someone created in the middle of a path ("Ma", or "Po Po" on a Cantonese side)
  function placeholder(path, cid) {
    const k = path.join('.');
    if (!cid || cid === 'bengali') return PLACEHOLDER[k];
    const t = termIn(cid, path, fake(null)); return t ? t[0] : null;
  }

  // ---- Reverse lookup: "Mashi" / "মাসি" / "Chhoto Mama" / "mother's sister" → ['mother','sister']
  const MODIFIERS = /^(boro|baro|bor|mejo|mej|sejo|sej|ranga|rangа|notun|natun|chhoto|choto|chotto|phul|ful|nana|kuchi|dhol|বড়|বড়|মেজো|মেজ|সেজো|সেজ|রাঙা|নতুন|ছোট|ছোটো|ফুল)[\s-]+/i;
  const SPELL = [[/\bmamatuto\b|\bmamatto\b/g, 'mamato'], [/\bpishatuto\b|\bpisatuto\b|\bpistuto\b|\bpisthuto\b/g, 'pishtuto'],
    [/\bmasatuto\b|\bmastuto\b|\bmashtutto\b/g, 'mashtuto'], [/\bkhurtutto\b|\bkhurtuto\b/g, 'khurtuto'], [/\bmasi\b/g, 'mashi'],
    [/\bpise\b/g, 'pishe'], [/\bpisi\b/g, 'pishi'], [/\bdidu\b/g, 'didima'], [/\bdida\b/g, 'didima'], [/\bthakurma\b/g, 'thakuma'],
    [/\bmeso\b/g, 'mesho'], [/\bbhaipo\b/g, 'bhaipo'], [/\bbhagni\b/g, 'bhagni'], [/\bbonai\b/g, 'bhagnipoti']];
  const norm = (t) => {
    let x = String(t || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    SPELL.forEach(([re, to]) => (x = x.replace(re, to)));
    return x;
  };
  const INDEX = new Map();
  const addTerm = (t, key) => {
    const n = norm(t);
    if (!n) return;
    if (!INDEX.has(n)) INDEX.set(n, key);
    const m = n.match(/^(\S+)\/(\S+) (.*)$/); // "khurtuto/jethtuto dada" → both spellings
    if (m) { addTerm(m[1] + ' ' + m[3], key); addTerm(m[2] + ' ' + m[3], key); }
  };
  // common short forms
  [['pishe dadu', 'mother.father.sister.husband'], ['pishi didima', 'mother.father.sister'], ['pishe didima', 'mother.father.sister'],
   ['mesho dadu', 'mother.mother.sister.husband'], ['mashi didima', 'mother.mother.sister'], ['mama dadu', 'mother.mother.brother'],
   ['pishtuto mama', 'mother.father.sister.son'], ['mamato mama', 'mother.mother.brother.son'], ['mashtuto mama', 'mother.mother.sister.son'],
   ['pishtuto mashi', 'mother.father.sister.daughter'], ['mamato mashi', 'mother.mother.brother.daughter'], ['mashtuto mashi', 'mother.mother.sister.daughter'],
   ['mesho', 'mother.sister.husband'], ['মেসো', 'mother.sister.husband'], ['pisho', 'father.sister.husband'], ['pishe', 'father.sister.husband'],
   ['পিসে', 'father.sister.husband'], ['thakurdada', 'father.father'], ['dida', 'mother.mother'], ['দিদা', 'mother.mother'],
   ['mamima', 'mother.brother.wife'], ['mashimoni', 'mother.sister'], ['kaka', 'father.brother'], ['jetha', 'father.brother'],
   ['jethamoshai', 'father.brother'], ['kakababu', 'father.brother']].forEach(([t, k]) => INDEX.set(t, k));
  const fake = (v, g = 'm') => ({ elderThanMe: () => v, elder: () => v, meGender: g });
  Object.entries(T).forEach(([key, val]) => {
    const variants = typeof val === 'function' ? [val(fake(true)), val(fake(false)), val(fake(null))] : [val];
    variants.forEach(([roman, script]) => {
      addTerm(roman, key); addTerm(script, key);
      roman.split(' / ').forEach((r) => addTerm(r, key));
      script.split(' / ').forEach((r) => addTerm(r, key));
    });
  });
  // Great-grandparents: said descriptively ("Thakurdar Baba" = Thakurda's father), only where not already set
  [['father.father', 'Thakurdar', 'ঠাকুরদার'], ['father.mother', 'Thakumar', 'ঠাকুমার'], ['mother.father', 'Dadur', 'দাদুর'], ['mother.mother', 'Didimar', 'দিদিমার']].forEach(([k, r, b]) => {
    if (!T[k + '.father']) T[k + '.father'] = [`${r} Baba`, `${b} বাবা`];
    if (!T[k + '.mother']) T[k + '.mother'] = [`${r} Ma`, `${b} মা`];
  });
  // Bengali is the original pack; register it with the other cultures
  FT.cultures.register({ id: 'bengali', name: 'Bengali', native: 'বাংলা', lang: 'bn-IN', wish: 'শুভ জন্মদিন', T });
  // Other cultures' terms: only add ones that point to a single path across every pack ("Gūgu" yes, "Tío" no)
  (() => {
    const seen = new Map();
    FT.cultures.list().filter((p) => p.id !== 'bengali').forEach((pack) => Object.entries(pack.T).forEach(([key, val]) => {
      const vs = typeof val === 'function' ? [true, false, null].flatMap((v) => ['m', 'f'].map((g) => val(fake(v, g)))) : [val];
      vs.filter(Boolean).forEach(([roman, script]) => [roman, script, ...roman.split(' / '), ...script.split(' / ')].forEach((t) => {
        const n = norm(t); if (!n) return; if (!seen.has(n)) seen.set(n, new Set()); seen.get(n).add(key);
      }));
    }));
    seen.forEach((keys, n) => { if (keys.size === 1 && !INDEX.has(n)) INDEX.set(n, [...keys][0]); });
  })();
  const ALIASES = { ma: 'mother', mom: 'mother', mum: 'mother', maa: 'mother', baba: 'father', dad: 'father', papa: 'father',
    bro: 'brother', sis: 'sister', mother: 'mother', father: 'father' };
  const VOCAB = ['father', 'mother', 'parent', 'son', 'daughter', 'child', 'husband', 'wife', 'spouse', 'brother', 'sister', 'sibling'];
  const SELF = ['me', 'self', 'myself', 'you', 'ami', 'আমি', 'i'];

  // "Mamato Dada / Bhai" → every distinct path the options point to
  function termOptions(raw) {
    const n = norm(raw);
    const opts = n.split('/').map((x) => x.trim()).filter(Boolean);
    const head = opts[0] && opts[0].split(' ').length > 1 ? opts[0].split(' ')[0] + ' ' : '';
    const seen = new Map();
    opts.forEach((o) => { const r = termToPath(o) || (head && termToPath(head + o)); if (r) seen.set(r.join('.'), r); });
    return [...seen.values()];
  }
  // Returns: [] for Me, ['mother','sister'] for a match, or null if not understood
  function termToPath(raw) {
    let n = norm(raw);
    if (!n) return null;
    if (SELF.includes(n)) return [];
    if (INDEX.has(n)) return INDEX.get(n).split('.');
    const stripped = n.replace(MODIFIERS, '');
    if (INDEX.has(stripped)) return INDEX.get(stripped).split('.');
    // English chain: "mother's sister's daughter", "mother.sister.daughter", "ma sister daughter"
    const words = n.replace(/['’]s\b/g, ' ').split(/[\s.>,→]+/).filter(Boolean).filter((w) => w !== 'of' && w !== 'my')
      .map((w) => ALIASES[w] || w);
    if (words.length && words.every((w) => VOCAB.includes(w))) return words;
    // "Mamato Dada / Bhai" or "Dada/Bhai" → try each option
    if (n.includes('/')) {
      const found = termOptions(n);
      if (found.length === 1) return found[0];
      return null; // options disagree (e.g. "Kaku / Mesho") — too ambiguous to link automatically
    }
    return null;
  }

  /* ---------- Relation groups: "my cousins", "my aunts & uncles" … (for filters and map highlights) ----------
     From the path of steps: count how far up (parents, plus one per sibling step) and down (children,
     plus one per sibling step). A spouse at the very end keeps aunts/uncles and grandparents in their
     group (Mesho is an uncle) but makes anyone else an in-law (a brother's wife). A spouse at the start
     means the spouse's family: in-laws. A spouse in the middle: relatives by marriage. */
  const REL_GROUPS = [
    ['spouse', 'Husband / wife', 'স্বামী-স্ত্রী'], ['parents', 'Parents', 'মা-বাবা'], ['siblings', 'Brothers & sisters', 'ভাই-বোন'],
    ['children', 'Children', 'ছেলে-মেয়ে'], ['grandparents', 'Grandparents', 'দাদু-দিদিমা'], ['greatgrand', 'Great-grandparents', 'বড়দাদু-দিদিমা'],
    ['grandchildren', 'Grandchildren', 'নাতি-নাতনি'], ['auntsuncles', 'Aunts & uncles', 'মামা-মাসি-কাকা-পিসি'],
    ['grandauntsuncles', "Grandparents' brothers & sisters", 'দাদু-দিদিমার ভাই-বোন'], ['cousins', 'Cousins', 'তুতো ভাই-বোন'],
    ['cousinfamily', "Cousins' kids & parents' cousins", ''], ['nieces', 'Nieces & nephews', 'ভাইপো-ভাগ্নে'],
    ['inlaws', 'In-laws', 'শ্বশুরবাড়ি'], ['bymarriage', 'Relatives by marriage', 'আত্মীয়'], ['friends', 'Friends & circles', 'বন্ধু-বান্ধব'],
  ].map(([id, en, bn]) => ({ id, en, bn }));
  function relGroup(steps) {
    if (!steps) return null;            // not linked
    if (!steps.length) return 'me';
    if (steps.some((s) => s.step === 'friend')) return 'friends';
    const st = steps.map((s) => s.step).filter((x, i, a) => !(x === 'sibling' && a[i - 1] === 'sibling')); // a sibling's sibling is a sibling
    if (st.length === 1 && st[0] === 'spouse') return 'spouse';
    if (st[0] === 'spouse') return 'inlaws';
    const endSpouse = st[st.length - 1] === 'spouse';
    const core = endSpouse ? st.slice(0, -1) : st;
    if (core.includes('spouse')) return 'bymarriage';
    let up = 0, down = 0;
    core.forEach((x) => { if (x === 'parent') up++; else if (x === 'child') down++; else if (x === 'sibling') { up++; down++; } });
    // a parent step after a child step (my child's other parent, etc.) isn't a blood line
    if (core.indexOf('parent') > core.indexOf('child') && core.includes('child') && core.lastIndexOf('parent') > core.indexOf('child')) return 'bymarriage';
    let g;
    if (!down) g = up === 1 ? 'parents' : up === 2 ? 'grandparents' : 'greatgrand';
    else if (!up) g = down === 1 ? 'children' : 'grandchildren';
    else if (up === 1 && down === 1) g = 'siblings';
    else if (down === 1) g = up === 2 ? 'auntsuncles' : 'grandauntsuncles';
    else if (up === 1) g = 'nieces';
    else g = up === down ? 'cousins' : 'cousinfamily';
    if (endSpouse && !['parents', 'grandparents', 'greatgrand', 'auntsuncles', 'grandauntsuncles'].includes(g)) return 'inlaws';
    return g;
  }

  return { buildGraph, pathsFrom, describe, termIn, normalize, presets, placeholder, termToPath, termOptions, yearOf, isElder, PRESETS, PLACEHOLDER, STEP_WORD, FRIEND_KINDS, friendKind, friendKindOf, REL_GROUPS, relGroup };
})();
