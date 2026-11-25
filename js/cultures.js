/* =========================================================
   cultures.js — kinship terms for each heritage
   A "pack" turns a path from Me (["mother","sister"]) into what you'd call that person
   in one culture: [romanized, native script]. Latin-script languages give one string.
   - Each side of the family can have its own heritage (Baba's side Bengali, Ma's side
     Cantonese); a person can also be set to a heritage of their own.
   - Missing a term? The English (American) term is used, which always has an answer
     (first cousin once removed, great-aunt …).
   - Elder / younger and the speaker's own gender (Korean) come from the ctx `c`:
       c.elderThanMe(i)  is person i on the path older than me?
       c.elder(i, j)     is person i older than person j?   (0 = me, 1 = first step …)
       c.meGender        'm' | 'f' | 'x'
   These are starter tables: families use many local variants, so "What you call them" on a
   card always wins, and anyone can add a culture by adding one pack here.
   ========================================================= */
window.FT = window.FT || {};

FT.cultures = (() => {
  const P = (x) => (Array.isArray(x) ? x : [x, x]); // 'Tío' → ['Tío','Tío']
  // elder / younger / unknown → term (unknown shows both: "Gēge / Dìdi")
  const ey = (elder, e, y) => { e = P(e); y = P(y); if (elder === true) return e; if (elder === false) return y; return [e[0] === y[0] ? e[0] : `${e[0]} / ${y[0]}`, e[1] === y[1] ? e[1] : `${e[1]} / ${y[1]}`]; };

  /* ---------- Generic up/down engine (English, Spanish, and the fallback for everyone) ----------
     words: normalized steps, e.g. ['mother','sister','son']. Siblings count as one up + one down. */
  const MALE = ['father', 'son', 'husband', 'brother'], FEMALE = ['mother', 'daughter', 'wife', 'sister'];
  function shape(words) {
    const kind = (w) => (['father', 'mother', 'parent'].includes(w) ? 'up' : ['son', 'daughter', 'child'].includes(w) ? 'down'
      : ['brother', 'sister', 'sibling'].includes(w) ? 'sib' : 'spouse');
    const ks = words.map(kind);
    const startSpouse = ks[0] === 'spouse', endSpouse = ks.length > 1 && ks[ks.length - 1] === 'spouse';
    const core = ks.slice(startSpouse ? 1 : 0, endSpouse ? -1 : undefined);
    if (core.includes('spouse')) return null; // spouse in the middle: describe as a chain instead
    let up = 0, down = 0, wentDown = false, bad = false;
    core.forEach((k) => { if (k === 'up') { if (wentDown) bad = true; up++; } else if (k === 'down') { down++; wentDown = true; } else if (!wentDown) { up++; down++; wentDown = true; } /* a cousin's brother is a cousin too: no change */ });
    if (bad) return null;
    const last = words[words.length - 1];
    const g = MALE.includes(last) ? 'm' : FEMALE.includes(last) ? 'f' : 'x';
    // gender of the blood relative a trailing spouse is married to (an uncle's wife is still "aunt")
    return { up, down, g, startSpouse, endSpouse, onlySpouse: !core.length && startSpouse };
  }
  const G = (g, m, f, x) => (g === 'm' ? m : g === 'f' ? f : x || `${m} / ${f}`);
  const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  const TIMES = ['', 'once', 'twice', 'three times', 'four times'];
  const greats = (n) => (n > 0 ? 'Great-'.repeat(n) : '');

  function englishTerm(words) {
    const s = shape(words); if (!s) return null;
    const { up, down, g } = s;
    if (s.onlySpouse) return G(g, 'Husband', 'Wife', 'Spouse');
    let t = null;
    if (!up && !down) t = null;
    else if (!down) t = up === 1 ? G(g, 'Dad', 'Mom', 'Parent') : greats(up - 2) + G(g, 'Grandpa', 'Grandma', 'Grandparent');
    else if (!up) t = down === 1 ? G(g, 'Son', 'Daughter', 'Child') : greats(down - 2) + G(g, 'Grandson', 'Granddaughter', 'Grandchild');
    else if (up === 1 && down === 1) t = G(g, 'Brother', 'Sister', 'Sibling');
    else if (down === 1) t = greats(up - 2) + G(g, 'Uncle', 'Aunt', 'Uncle / Aunt');
    else if (up === 1) t = (down === 3 ? 'Grand' : down > 3 ? greats(down - 3) + 'Grand' : '') + G(g, 'nephew', 'niece', 'nephew / niece').replace(/^./, (c) => (down === 2 ? c.toUpperCase() : c));
    else { const deg = Math.min(up, down) - 1, rem = Math.abs(up - down); t = `${ORD[deg] || deg + 'th'} cousin${rem ? ' ' + (TIMES[rem] || rem + ' times') + ' removed' : ''}`; }
    if (s.startSpouse && !s.onlySpouse) {
      if (up === 1 && !down) t = G(g, 'Father-in-law', 'Mother-in-law', 'Parent-in-law');
      else if (up === 1 && down === 1) t = G(g, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law');
      else return null; // "wife's aunt": the English chain says it better
    }
    if (s.endSpouse) {
      if (!down || (down === 1 && up >= 2)) t = t && t.replace(/Grandpa|Grandma|Grandparent/, G(g, 'Grandpa', 'Grandma', 'Grandparent')).replace(/Uncle \/ Aunt|Uncle|Aunt/, G(g, 'Uncle', 'Aunt', 'Uncle / Aunt')).replace(/Dad|Mom|Parent/, G(g, 'Stepdad', 'Stepmom', 'Step-parent'));
      else if (up === 1 && down === 1) t = G(g, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law');
      else if (!up && down === 1) t = G(g, 'Son-in-law', 'Daughter-in-law', 'Child-in-law');
      else return null; // "cousin's husband": chain
    }
    return t && t.replace(/(Great-|Grand)([A-Z])/g, (m, x, y) => x + y.toLowerCase());
  }

  function spanishTerm(words, c) {
    const s = shape(words); if (!s) return null;
    const { up, down, g } = s;
    if (s.onlySpouse) return G(g, 'Esposo', 'Esposa', 'Esposo / Esposa');
    const anc = ['', G(g, 'Papá', 'Mamá'), G(g, 'Abuelo', 'Abuela'), G(g, 'Bisabuelo', 'Bisabuela'), G(g, 'Tatarabuelo', 'Tatarabuela')];
    const des = ['', G(g, 'Hijo', 'Hija'), G(g, 'Nieto', 'Nieta'), G(g, 'Bisnieto', 'Bisnieta'), G(g, 'Tataranieto', 'Tataranieta')];
    let t = null;
    if (!down) t = anc[up] || null;
    else if (!up) t = des[down] || null;
    else if (up === 1 && down === 1) { const e = c ? c.elderThanMe(1) : null; t = G(g, 'Hermano', 'Hermana') + (e === true ? ' mayor' : e === false ? ' menor' : ''); }
    else if (down === 1) t = up === 2 ? G(g, 'Tío', 'Tía') : up === 3 ? G(g, 'Tío abuelo', 'Tía abuela') : up === 4 ? G(g, 'Tío bisabuelo', 'Tía bisabuela') : null;
    else if (up === 1) t = down === 2 ? G(g, 'Sobrino', 'Sobrina') : down === 3 ? G(g, 'Sobrino nieto', 'Sobrina nieta') : null;
    else if (up === down) t = up === 2 ? G(g, 'Primo', 'Prima') : up === 3 ? G(g, 'Primo segundo', 'Prima segunda') : up === 4 ? G(g, 'Primo tercero', 'Prima tercera') : null;
    else if (up === down + 1) t = down === 2 ? G(g, 'Tío segundo', 'Tía segunda') : null;   // a parent's cousin
    else if (down === up + 1) t = up === 2 ? G(g, 'Sobrino segundo', 'Sobrina segunda') : null; // a cousin's child
    if (s.startSpouse && !s.onlySpouse) {
      if (up === 1 && !down) t = G(g, 'Suegro', 'Suegra');
      else if (up === 1 && down === 1) t = G(g, 'Cuñado', 'Cuñada');
      else return null;
    }
    if (s.endSpouse) {
      if (up >= 2 && down <= 1) t = t; // a tío's wife is still tía, a grandparent's spouse abuelo/a
      else if (up === 1 && down === 1) t = G(g, 'Cuñado', 'Cuñada');
      else if (!up && down === 1) t = G(g, 'Yerno', 'Nuera');
      else return null;
    }
    return t;
  }

  /* ---------- European engine (French, German, Irish, Italian, Swedish) ----------
     One table per language of up/down shapes → word; side-specific words (Swedish morbror) go in the pack table.
     L: { spouse, anc[n], des[n], sib, uncle[n], nephew[n], cousin[n], parentCousin, cousinChild,
          pil (parent-in-law), sil (sibling-in-law), cil (child-in-law) } — each value [male, female] */
  function euroTerm(L, words, c) {
    const s = shape(words); if (!s) return null;
    const { up, down, g } = s;
    const pick = (v) => (v ? G(g, v[0], v[1], `${v[0]} / ${v[1]}`) : null);
    if (s.onlySpouse) return pick(L.spouse);
    let t = null;
    if (!down) t = pick(L.anc[up]);
    else if (!up) t = pick(L.des[down]);
    else if (up === 1 && down === 1) { t = pick(L.sib); const e = c ? c.elderThanMe(1) : null; if (t && L.elder && e !== null) t = L.elder(t, e, g); }
    else if (down === 1) t = pick(L.uncle[up]);
    else if (up === 1) t = pick(L.nephew[down]);
    else if (up === down) t = pick(L.cousin[up]);
    else if (up === down + 1 && down === 2) t = pick(L.parentCousin);
    else if (down === up + 1 && up === 2) t = pick(L.cousinChild);
    if (s.startSpouse && !s.onlySpouse) {
      if (up === 1 && !down) return pick(L.pil);
      if (up === 1 && down === 1) return pick(L.sil);
      return null;
    }
    if (s.endSpouse) {
      if (up >= 2 && down <= 1) return t;          // an uncle's wife is an aunt, a grandparent's spouse a grandparent
      if (up === 1 && down === 1) return pick(L.sil);
      if (!up && down === 1) return pick(L.cil);
      return null;
    }
    return t;
  }

  /* ---------- Table helpers ---------- */
  // Fill the 8 great-grandparent keys from a rule: (first step, second step, gender) → term
  const greatGrand = (T, fn) => ['father', 'mother'].forEach((a) => ['father', 'mother'].forEach((b) => ['father', 'mother'].forEach((x) => (T[`${a}.${b}.${x}`] = fn(a, b, x === 'father' ? 'm' : 'f')))));
  // Fill grandparents' siblings: (side, grandparent, sibling) → term
  const grandSibs = (T, fn) => ['father', 'mother'].forEach((a) => ['father', 'mother'].forEach((b) => ['brother', 'sister'].forEach((x) => { const v = fn(a, b, x === 'brother' ? 'm' : 'f'); if (v) T[`${a}.${b}.${x}`] = v; })));

  /* ---------- Packs (alphabetical by English name) ---------- */
  const packs = [];
  const add = (p) => packs.push(p);

  // Arabic — Modern Standard / Levantine everyday forms. ʿamm/ʿamma = father's side, khāl/khāla = mother's side.
  add({ id: 'arabic', name: 'Arabic', native: 'العربية', lang: 'ar', wish: 'عيد ميلاد سعيد', T: (() => { const T = {
    father: ['Baba', 'بابا'], mother: ['Mama', 'ماما'], son: ['Ibn', 'ابن'], daughter: ['Bint', 'بنت'], husband: ['Zawj', 'زوج'], wife: ['Zawja', 'زوجة'],
    brother: ['Akh', 'أخ'], sister: ['Ukht', 'أخت'], 'brother.wife': ['Zawjat al-akh', 'زوجة الأخ'], 'sister.husband': ['Zawj al-ukht', 'زوج الأخت'],
    'father.father': ['Jiddo', 'جدو'], 'father.mother': ['Teta', 'تيتا'], 'mother.father': ['Jiddo', 'جدو'], 'mother.mother': ['Teta', 'تيتا'],
    'father.brother': ['ʿAmmo', 'عمو'], 'father.brother.wife': ['Zawjat al-ʿamm', 'زوجة العم'], 'father.sister': ['ʿAmmto', 'عمتو'], 'father.sister.husband': ['Zawj al-ʿamma', 'زوج العمة'],
    'mother.brother': ['Khalo', 'خالو'], 'mother.brother.wife': ['Zawjat al-khal', 'زوجة الخال'], 'mother.sister': ['Khalto', 'خالتو'], 'mother.sister.husband': ['Zawj al-khala', 'زوج الخالة'],
    'father.brother.son': ['Ibn ʿamm', 'ابن عم'], 'father.brother.daughter': ['Bint ʿamm', 'بنت عم'], 'father.sister.son': ['Ibn ʿamma', 'ابن عمة'], 'father.sister.daughter': ['Bint ʿamma', 'بنت عمة'],
    'mother.brother.son': ['Ibn khal', 'ابن خال'], 'mother.brother.daughter': ['Bint khal', 'بنت خال'], 'mother.sister.son': ['Ibn khala', 'ابن خالة'], 'mother.sister.daughter': ['Bint khala', 'بنت خالة'],
    'brother.son': ['Ibn akh', 'ابن أخ'], 'brother.daughter': ['Bint akh', 'بنت أخ'], 'sister.son': ['Ibn ukht', 'ابن أخت'], 'sister.daughter': ['Bint ukht', 'بنت أخت'],
    'son.son': ['Hafid', 'حفيد'], 'son.daughter': ['Hafida', 'حفيدة'], 'daughter.son': ['Hafid', 'حفيد'], 'daughter.daughter': ['Hafida', 'حفيدة'],
    'son.wife': ['Kanna', 'كنة'], 'daughter.husband': ['Sihr', 'صهر'],
    'wife.father': ['Hamu', 'حمو'], 'husband.father': ['Hamu', 'حمو'], 'wife.mother': ['Hamat', 'حماة'], 'husband.mother': ['Hamat', 'حماة'],
    'wife.brother': ['Akhu zawjati', 'أخو زوجتي'], 'wife.sister': ['Ukht zawjati', 'أخت زوجتي'], 'husband.brother': ['Akhu zawji', 'أخو زوجي'], 'husband.sister': ['Ukht zawji', 'أخت زوجي'],
  };
  greatGrand(T, (a, b, g) => (g === 'm' ? (b === 'father' ? ['Abu al-jadd', 'أبو الجد'] : ['Abu al-jadda', 'أبو الجدة']) : (b === 'father' ? ['Umm al-jadd', 'أم الجد'] : ['Umm al-jadda', 'أم الجدة'])));
  grandSibs(T, (a, b, g) => { const par = a === 'father' ? ['al-ab', 'الأب'] : ['al-umm', 'الأم'];
    const base = b === 'father' ? (g === 'm' ? ['ʿAmm', 'عم'] : ['ʿAmmat', 'عمة']) : (g === 'm' ? ['Khal', 'خال'] : ['Khalat', 'خالة']);
    return [`${base[0]} ${par[0]}`, `${base[1]} ${par[1]}`]; });
  return T; })() });

  // Bengali — the original table lives in kinship.js (FT.kin.BENGALI); registered there.

  // Cantonese — Hong Kong / Guangdong usage, Jyutping without tone numbers. 外 (ngoi) = mother's side.
  add({ id: 'cantonese', name: 'Cantonese', native: '廣東話', lang: 'yue', langAlt: ['zh-hk', 'zh-HK'], wish: '生日快樂', T: (() => { const T = {
    father: ['Baa Baa', '爸爸'], mother: ['Maa Maa', '媽媽'], son: ['Zai', '仔'], daughter: ['Neoi', '女'], husband: ['Lou Gung', '老公'], wife: ['Lou Po', '老婆'],
    brother: (c) => ey(c.elderThanMe(1), ['Go Go', '哥哥'], ['Sai Lou', '細佬']), sister: (c) => ey(c.elderThanMe(1), ['Gaa Ze', '家姐'], ['Mui Mui', '妹妹']),
    'brother.wife': (c) => ey(c.elderThanMe(1), ['Aa Sou', '阿嫂'], ['Dai Fu', '弟婦']), 'sister.husband': (c) => ey(c.elderThanMe(1), ['Ze Fu', '姐夫'], ['Mui Fu', '妹夫']),
    'father.father': ['Je Je', '爺爺'], 'father.mother': ['Maa Maa', '嫲嫲'], 'mother.father': ['Gung Gung', '公公'], 'mother.mother': ['Po Po', '婆婆'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Baak Fu', '伯父'], ['Suk Suk', '叔叔']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Baak Noeng', '伯娘'], ['Sam Sam', '嬸嬸']),
    'father.sister': (c) => ey(c.elder(2, 1), ['Gu Maa', '姑媽'], ['Gu Ze', '姑姐']), 'father.sister.husband': ['Gu Zoeng', '姑丈'],
    'mother.brother': ['Kau Fu', '舅父'], 'mother.brother.wife': ['Kam Mou', '舅母'],
    'mother.sister': (c) => ey(c.elder(2, 1), ['Ji Maa', '姨媽'], ['Aa Ji', '阿姨']), 'mother.sister.husband': ['Ji Zoeng', '姨丈'],
    'brother.son': ['Zat Zai', '姪仔'], 'brother.daughter': ['Zat Neoi', '姪女'], 'sister.son': ['Ngoi Saang', '外甥'], 'sister.daughter': ['Ngoi Saang Neoi', '外甥女'],
    'son.son': ['Syun Zai', '孫仔'], 'son.daughter': ['Syun Neoi', '孫女'], 'daughter.son': ['Ngoi Syun', '外孫'], 'daughter.daughter': ['Ngoi Syun Neoi', '外孫女'],
    'son.wife': ['San Pou', '新抱'], 'daughter.husband': ['Neoi Sai', '女婿'],
    'wife.father': ['Ngoi Fu', '外父'], 'wife.mother': ['Ngoi Mou', '外母'], 'husband.father': ['Lou Je', '老爺'], 'husband.mother': ['Naai Naai', '奶奶'],
    'wife.brother': (c) => ey(c.elderThanMe(2), ['Daai Kau', '大舅'], ['Kau Zai', '舅仔']), 'wife.sister': (c) => ey(c.elderThanMe(2), ['Daai Ji', '大姨'], ['Ji Zai', '姨仔']),
    'husband.brother': (c) => ey(c.elderThanMe(2), ['Daai Baak', '大伯'], ['Suk Zai', '叔仔']), 'husband.sister': (c) => ey(c.elderThanMe(2), ['Daai Gu', '大姑'], ['Gu Zai', '姑仔']),
  };
  // cousins: 堂 (tong) = father's brother's children, 表 (biu) = everyone else
  [['father.brother', 'Tong', '堂'], ['father.sister', 'Biu', '表'], ['mother.brother', 'Biu', '表'], ['mother.sister', 'Biu', '表']].forEach(([k, r, s]) => {
    T[`${k}.son`] = (c) => ey(c.elderThanMe(3), [`${r} Go`, `${s}哥`], [`${r} Dai`, `${s}弟`]);
    T[`${k}.daughter`] = (c) => ey(c.elderThanMe(3), [`${r} Ze`, `${s}姐`], [`${r} Mui`, `${s}妹`]);
  });
  greatGrand(T, (a, b, g) => (g === 'm' ? ['Taai Gung', '太公'] : a === 'father' && b === 'father' ? ['Taai Maa', '太嫲'] : ['Taai Po', '太婆']));
  grandSibs(T, (a, b, g) => (b === 'father' ? (g === 'm' ? null : ['Gu Po', '姑婆']) : (g === 'm' ? ['Kau Gung', '舅公'] : ['Ji Po', '姨婆'])));
  ['father.father.brother', 'mother.father.brother'].forEach((k) => (T[k] = (c) => ey(c.elder(3, 2), ['Baak Gung', '伯公'], ['Suk Gung', '叔公'])));
  return T; })() });

  // English (American) — the generic engine: Grandma, Great-aunt, First cousin once removed …
  add({ id: 'english', name: 'English (American)', native: 'English', lang: 'en-US', wish: 'Happy birthday!', latin: true, T: {}, generic: (w) => englishTerm(w) });

  // Gujarati
  add({ id: 'gujarati', name: 'Gujarati', native: 'ગુજરાતી', lang: 'gu', wish: 'જન્મદિવસની શુભેચ્છા', T: (() => { const T = {
    father: ['Pappa', 'પપ્પા'], mother: ['Mummy', 'મમ્મી'], son: ['Dikro', 'દીકરો'], daughter: ['Dikri', 'દીકરી'], husband: ['Pati', 'પતિ'], wife: ['Patni', 'પત્ની'],
    brother: (c) => ey(c.elderThanMe(1), ['Motabhai', 'મોટાભાઈ'], ['Bhai', 'ભાઈ']), sister: (c) => ey(c.elderThanMe(1), ['Motiben', 'મોટીબેન'], ['Ben', 'બેન']),
    'brother.wife': ['Bhabhi', 'ભાભી'], 'sister.husband': ['Banevi', 'બનેવી'],
    'father.father': ['Dada', 'દાદા'], 'father.mother': ['Dadi', 'દાદી'], 'mother.father': ['Nana', 'નાના'], 'mother.mother': ['Nani', 'નાની'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Mota Kaka', 'મોટા કાકા'], ['Kaka', 'કાકા']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Moti Kaki', 'મોટી કાકી'], ['Kaki', 'કાકી']),
    'father.sister': ['Foi', 'ફોઈ'], 'father.sister.husband': ['Fua', 'ફુઆ'],
    'mother.brother': ['Mama', 'મામા'], 'mother.brother.wife': ['Mami', 'મામી'], 'mother.sister': ['Masi', 'માસી'], 'mother.sister.husband': ['Masa', 'માસા'],
    'father.brother.son': ['Pitrai Bhai', 'પિતરાઈ ભાઈ'], 'father.brother.daughter': ['Pitrai Ben', 'પિતરાઈ બેન'],
    'father.sister.son': ['Foi no dikro', 'ફોઈનો દીકરો'], 'father.sister.daughter': ['Foi ni dikri', 'ફોઈની દીકરી'],
    'mother.brother.son': ['Mama no dikro', 'મામાનો દીકરો'], 'mother.brother.daughter': ['Mama ni dikri', 'મામાની દીકરી'],
    'mother.sister.son': ['Masiyai Bhai', 'મસિયાઈ ભાઈ'], 'mother.sister.daughter': ['Masiyai Ben', 'મસિયાઈ બેન'],
    'brother.son': ['Bhatrijo', 'ભત્રીજો'], 'brother.daughter': ['Bhatriji', 'ભત્રીજી'], 'sister.son': ['Bhanej', 'ભાણેજ'], 'sister.daughter': ['Bhani', 'ભાણી'],
    'son.son': ['Pautra', 'પૌત્ર'], 'son.daughter': ['Pautri', 'પૌત્રી'], 'daughter.son': ['Dohitra', 'દોહિત્ર'], 'daughter.daughter': ['Dohitri', 'દોહિત્રી'],
    'son.wife': ['Vahu', 'વહુ'], 'daughter.husband': ['Jamai', 'જમાઈ'],
    'wife.father': ['Sasra', 'સસરા'], 'husband.father': ['Sasra', 'સસરા'], 'wife.mother': ['Sasu', 'સાસુ'], 'husband.mother': ['Sasu', 'સાસુ'],
    'wife.brother': ['Salo', 'સાળો'], 'wife.sister': ['Sali', 'સાળી'], 'husband.brother': (c) => ey(c.elderThanMe(2), ['Jeth', 'જેઠ'], ['Diyar', 'દિયર']), 'husband.sister': ['Nanand', 'નણંદ'],
    'father.father.sister': ['Fai Dadi', 'ફઈ દાદી'], 'father.father.sister.husband': ['Fua Dada', 'ફુઆ દાદા'],
  };
  greatGrand(T, (a, b, g) => (a === 'father' ? (g === 'm' ? ['Pardada', 'પરદાદા'] : ['Pardadi', 'પરદાદી']) : (g === 'm' ? ['Parnana', 'પરનાના'] : ['Parnani', 'પરનાની'])));
  return T; })() });

  // Hindi / North Indian
  add({ id: 'hindi', name: 'Hindi / North Indian', native: 'हिन्दी', lang: 'hi', wish: 'जन्मदिन मुबारक हो', T: (() => { const T = {
    father: ['Papa', 'पापा'], mother: ['Maa', 'माँ'], son: ['Beta', 'बेटा'], daughter: ['Beti', 'बेटी'], husband: ['Pati', 'पति'], wife: ['Patni', 'पत्नी'],
    brother: (c) => ey(c.elderThanMe(1), ['Bhaiya', 'भैया'], ['Bhai', 'भाई']), sister: (c) => ey(c.elderThanMe(1), ['Didi', 'दीदी'], ['Behen', 'बहन']),
    'brother.wife': ['Bhabhi', 'भाभी'], 'sister.husband': (c) => ey(c.elderThanMe(1), ['Jijaji', 'जीजाजी'], ['Behnoi', 'बहनोई']),
    'father.father': ['Dada', 'दादा'], 'father.mother': ['Dadi', 'दादी'], 'mother.father': ['Nana', 'नाना'], 'mother.mother': ['Nani', 'नानी'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Tauji', 'ताऊजी'], ['Chacha', 'चाचा']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Taiji', 'ताईजी'], ['Chachi', 'चाची']),
    'father.sister': ['Bua', 'बुआ'], 'father.sister.husband': ['Phupha', 'फूफा'],
    'mother.brother': ['Mama', 'मामा'], 'mother.brother.wife': ['Mami', 'मामी'], 'mother.sister': ['Mausi', 'मौसी'], 'mother.sister.husband': ['Mausa', 'मौसा'],
    'brother.son': ['Bhatija', 'भतीजा'], 'brother.daughter': ['Bhatiji', 'भतीजी'], 'sister.son': ['Bhanja', 'भांजा'], 'sister.daughter': ['Bhanji', 'भांजी'],
    'son.son': ['Pota', 'पोता'], 'son.daughter': ['Poti', 'पोती'], 'daughter.son': ['Nati', 'नाती'], 'daughter.daughter': ['Natin', 'नातिन'],
    'son.wife': ['Bahu', 'बहू'], 'daughter.husband': ['Damad', 'दामाद'],
    'wife.father': ['Sasurji', 'ससुरजी'], 'husband.father': ['Sasurji', 'ससुरजी'], 'wife.mother': ['Saasuma', 'सासुमाँ'], 'husband.mother': ['Saasuma', 'सासुमाँ'],
    'wife.brother': ['Sala', 'साला'], 'wife.sister': ['Sali', 'साली'], 'husband.brother': (c) => ey(c.elderThanMe(2), ['Jeth', 'जेठ'], ['Devar', 'देवर']), 'husband.sister': ['Nanad', 'ननद'],
    'father.father.sister': ['Bua Dadi', 'बुआ दादी'], 'mother.mother.sister': ['Mausi Nani', 'मौसी नानी'], 'mother.mother.brother': ['Mama Nana', 'मामा नाना'],
  };
  // cousins: chachera (father's brother), phuphera (father's sister), mamera (mother's brother), mausera (mother's sister)
  [['father.brother', 'Chachera', 'चचेरा', 'Chacheri', 'चचेरी'], ['father.sister', 'Phuphera', 'फुफेरा', 'Phupheri', 'फुफेरी'],
   ['mother.brother', 'Mamera', 'ममेरा', 'Mameri', 'ममेरी'], ['mother.sister', 'Mausera', 'मौसेरा', 'Mauseri', 'मौसेरी']].forEach(([k, m, ms, f, fs]) => {
    T[`${k}.son`] = (c) => ey(c.elderThanMe(3), [`${m} Bhaiya`, `${ms} भैया`], [`${m} Bhai`, `${ms} भाई`]);
    T[`${k}.daughter`] = (c) => ey(c.elderThanMe(3), [`${f} Didi`, `${fs} दीदी`], [`${f} Behen`, `${fs} बहन`]);
  });
  greatGrand(T, (a, b, g) => (a === 'father' ? (g === 'm' ? ['Pardada', 'परदादा'] : ['Pardadi', 'परदादी']) : (g === 'm' ? ['Parnana', 'परनाना'] : ['Parnani', 'परनानी'])));
  return T; })() });

  // Punjabi — Gurmukhi script. Father's brothers split by age (Taya older, Chacha younger); cousins are bhra / bhain
  // with the branch in front (chachera, phuphera, mamera, masera). Its own language, not Hindi.
  add({ id: 'punjabi', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', lang: 'pa-IN', wish: 'ਜਨਮਦਿਨ ਮੁਬਾਰਕ', T: (() => { const T = {
    father: ['Papa', 'ਪਾਪਾ'], mother: ['Maa', 'ਮਾਂ'], son: ['Putt', 'ਪੁੱਤ'], daughter: ['Dhee', 'ਧੀ'], husband: ['Pati', 'ਪਤੀ'], wife: ['Patni', 'ਪਤਨੀ'],
    brother: (c) => ey(c.elderThanMe(1), ['Veer ji', 'ਵੀਰ ਜੀ'], ['Chhota Bhra', 'ਛੋਟਾ ਭਰਾ']), sister: (c) => ey(c.elderThanMe(1), ['Bhain ji', 'ਭੈਣ ਜੀ'], ['Chhoti Bhain', 'ਛੋਟੀ ਭੈਣ']),
    'brother.wife': ['Bhabi', 'ਭਾਬੀ'], 'sister.husband': ['Jija', 'ਜੀਜਾ'],
    'father.father': ['Dada', 'ਦਾਦਾ'], 'father.mother': ['Dadi', 'ਦਾਦੀ'], 'mother.father': ['Nana', 'ਨਾਨਾ'], 'mother.mother': ['Nani', 'ਨਾਨੀ'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Taya', 'ਤਾਇਆ'], ['Chacha', 'ਚਾਚਾ']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Tai', 'ਤਾਈ'], ['Chachi', 'ਚਾਚੀ']),
    'father.sister': ['Bhua', 'ਭੂਆ'], 'father.sister.husband': ['Phuphar', 'ਫੁੱਫੜ'],
    'mother.brother': ['Mama', 'ਮਾਮਾ'], 'mother.brother.wife': ['Mami', 'ਮਾਮੀ'], 'mother.sister': ['Masi', 'ਮਾਸੀ'], 'mother.sister.husband': ['Masar', 'ਮਾਸੜ'],
    'brother.son': ['Bhatija', 'ਭਤੀਜਾ'], 'brother.daughter': ['Bhatiji', 'ਭਤੀਜੀ'], 'sister.son': ['Bhanja', 'ਭਾਣਜਾ'], 'sister.daughter': ['Bhanji', 'ਭਾਣਜੀ'],
    'son.son': ['Pota', 'ਪੋਤਾ'], 'son.daughter': ['Poti', 'ਪੋਤੀ'], 'daughter.son': ['Dohta', 'ਦੋਹਤਾ'], 'daughter.daughter': ['Dohti', 'ਦੋਹਤੀ'],
    'son.wife': ['Nooh', 'ਨੂੰਹ'], 'daughter.husband': ['Jawai', 'ਜਵਾਈ'],
    'wife.father': ['Sohra', 'ਸਹੁਰਾ'], 'husband.father': ['Sohra', 'ਸਹੁਰਾ'], 'wife.mother': ['Sass', 'ਸੱਸ'], 'husband.mother': ['Sass', 'ਸੱਸ'],
    'wife.brother': ['Sala', 'ਸਾਲਾ'], 'wife.sister': ['Sali', 'ਸਾਲੀ'], 'wife.brother.wife': ['Salehar', 'ਸਾਲੇਹਾਰ'], 'wife.sister.husband': ['Sandhu', 'ਸਾਂਢੂ'],
    'husband.brother': (c) => ey(c.elderThanMe(2), ['Jeth', 'ਜੇਠ'], ['Deor', 'ਦਿਉਰ']), 'husband.sister': ['Nanad', 'ਨਣਦ'], 'husband.sister.husband': ['Nandoiya', 'ਨਣਦੋਈਆ'],
  };
  [['father.brother', 'Chachera', 'ਚਚੇਰਾ', 'Chacheri', 'ਚਚੇਰੀ'], ['father.sister', 'Phuphera', 'ਫੁਫੇਰਾ', 'Phupheri', 'ਫੁਫੇਰੀ'],
   ['mother.brother', 'Mamera', 'ਮਮੇਰਾ', 'Mameri', 'ਮਮੇਰੀ'], ['mother.sister', 'Masera', 'ਮਸੇਰਾ', 'Maseri', 'ਮਸੇਰੀ']].forEach(([k, m, ms, f, fs]) => {
    T[`${k}.son`] = [`${m} Bhra`, `${ms} ਭਰਾ`]; T[`${k}.daughter`] = [`${f} Bhain`, `${fs} ਭੈਣ`];
  });
  greatGrand(T, (a, b, g) => (a === 'father' ? (g === 'm' ? ['Pardada', 'ਪੜਦਾਦਾ'] : ['Pardadi', 'ਪੜਦਾਦੀ']) : (g === 'm' ? ['Parnana', 'ਪੜਨਾਨਾ'] : ['Parnani', 'ਪੜਨਾਨੀ'])));
  return T; })() });

  // Japanese — kanji/kana with polite forms; uncle/aunt kanji show older (伯) or younger (叔) than the parent
  add({ id: 'japanese', name: 'Japanese', native: '日本語', lang: 'ja', wish: 'お誕生日おめでとう', T: (() => { const T = {
    father: ['Otōsan', 'お父さん'], mother: ['Okāsan', 'お母さん'], son: ['Musuko', '息子'], daughter: ['Musume', '娘'], husband: ['Otto', '夫'], wife: ['Tsuma', '妻'],
    brother: (c) => ey(c.elderThanMe(1), ['Onīsan', 'お兄さん'], ['Otōto', '弟']), sister: (c) => ey(c.elderThanMe(1), ['Onēsan', 'お姉さん'], ['Imōto', '妹']),
    'brother.wife': (c) => ey(c.elderThanMe(1), ['Gishi', '義姉'], ['Gimai', '義妹']), 'sister.husband': (c) => ey(c.elderThanMe(1), ['Gikei', '義兄'], ['Gitei', '義弟']),
    'son.wife': ['Yome', '嫁'], 'daughter.husband': ['Muko', '婿'],
    'wife.father': ['Gifu', '義父'], 'husband.father': ['Gifu', '義父'], 'wife.mother': ['Gibo', '義母'], 'husband.mother': ['Gibo', '義母'],
  };
  ['father', 'mother'].forEach((s) => {
    T[`${s}.father`] = ['Ojīsan', 'おじいさん']; T[`${s}.mother`] = ['Obāsan', 'おばあさん'];
    T[`${s}.brother`] = (c) => ey(c.elder(2, 1), ['Ojisan', '伯父さん'], ['Ojisan', '叔父さん']);
    T[`${s}.sister`] = (c) => ey(c.elder(2, 1), ['Obasan', '伯母さん'], ['Obasan', '叔母さん']);
    T[`${s}.brother.wife`] = ['Obasan', 'おばさん']; T[`${s}.sister.husband`] = ['Ojisan', 'おじさん'];
    ['brother', 'sister'].forEach((x) => {
      T[`${s}.${x}.son`] = (c) => ey(c.elderThanMe(3), ['Itoko', '従兄'], ['Itoko', '従弟']);
      T[`${s}.${x}.daughter`] = (c) => ey(c.elderThanMe(3), ['Itoko', '従姉'], ['Itoko', '従妹']);
    });
  });
  ['brother', 'sister'].forEach((x) => { T[`${x}.son`] = ['Oi', '甥']; T[`${x}.daughter`] = ['Mei', '姪']; });
  ['son', 'daughter'].forEach((x) => { T[`${x}.son`] = ['Mago', '孫']; T[`${x}.daughter`] = ['Mago', '孫']; });
  ['wife', 'husband'].forEach((s) => { T[`${s}.brother`] = (c) => ey(c.elderThanMe(2), ['Gikei', '義兄'], ['Gitei', '義弟']); T[`${s}.sister`] = (c) => ey(c.elderThanMe(2), ['Gishi', '義姉'], ['Gimai', '義妹']); });
  greatGrand(T, (a, b, g) => (g === 'm' ? ['Hiijīsan', 'ひいおじいさん'] : ['Hiibāsan', 'ひいおばあさん']));
  grandSibs(T, (a, b, g) => (g === 'm' ? ['Ōoji', '大おじ'] : ['Ōoba', '大おば']));
  return T; })() });

  // Korean — sibling words depend on the speaker's own gender (형/오빠, 누나/언니)
  add({ id: 'korean', name: 'Korean', native: '한국어', lang: 'ko', wish: '생일 축하해요', T: (() => {
    const elderBro = (c) => (c.meGender === 'f' ? ['Oppa', '오빠'] : ['Hyeong', '형']);
    const elderSis = (c) => (c.meGender === 'f' ? ['Eonni', '언니'] : ['Nuna', '누나']);
    const T = {
      father: ['Abeoji', '아버지'], mother: ['Eomeoni', '어머니'], son: ['Adeul', '아들'], daughter: ['Ttal', '딸'], husband: ['Nampyeon', '남편'], wife: ['Anae', '아내'],
      brother: (c) => ey(c.elderThanMe(1), elderBro(c), ['Namdongsaeng', '남동생']), sister: (c) => ey(c.elderThanMe(1), elderSis(c), ['Yeodongsaeng', '여동생']),
      'brother.wife': (c) => ey(c.elderThanMe(1), c.meGender === 'f' ? ['Saeeonni', '새언니'] : ['Hyeongsu', '형수'], c.meGender === 'f' ? ['Olke', '올케'] : ['Jesu', '제수']),
      'sister.husband': (c) => ey(c.elderThanMe(1), c.meGender === 'f' ? ['Hyeongbu', '형부'] : ['Maehyeong', '매형'], c.meGender === 'f' ? ['Jebu', '제부'] : ['Maeje', '매제']),
      'father.father': ['Harabeoji', '할아버지'], 'father.mother': ['Halmeoni', '할머니'], 'mother.father': ['Oeharabeoji', '외할아버지'], 'mother.mother': ['Oehalmeoni', '외할머니'],
      'father.brother': (c) => ey(c.elder(2, 1), ['Keunabeoji', '큰아버지'], ['Jageunabeoji', '작은아버지']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Keuneomeoni', '큰어머니'], ['Jageuneomeoni', '작은어머니']),
      'father.sister': ['Gomo', '고모'], 'father.sister.husband': ['Gomobu', '고모부'],
      'mother.brother': ['Oesamchon', '외삼촌'], 'mother.brother.wife': ['Oesungmo', '외숙모'], 'mother.sister': ['Imo', '이모'], 'mother.sister.husband': ['Imobu', '이모부'],
      'son.son': ['Sonja', '손자'], 'son.daughter': ['Sonnyeo', '손녀'], 'daughter.son': ['Oesonja', '외손자'], 'daughter.daughter': ['Oesonnyeo', '외손녀'],
      'son.wife': ['Myeoneuri', '며느리'], 'daughter.husband': ['Sawi', '사위'],
      'wife.father': ['Jangin', '장인'], 'wife.mother': ['Jangmo', '장모'], 'husband.father': ['Siabeoji', '시아버지'], 'husband.mother': ['Sieomeoni', '시어머니'],
      'wife.brother': ['Cheonam', '처남'], 'wife.sister': (c) => ey(c.elderThanMe(2), ['Cheohyeong', '처형'], ['Cheoje', '처제']),
      'husband.brother': (c) => ey(c.elderThanMe(2), ['Ajubeonim', '아주버님'], ['Doryeonnim', '도련님']), 'husband.sister': (c) => ey(c.elderThanMe(2), ['Hyeongnim', '형님'], ['Agassi', '아가씨']),
      'father.father.brother': (c) => ey(c.elder(3, 2), ['Keunharabeoji', '큰할아버지'], ['Jageunharabeoji', '작은할아버지']),
      'father.father.sister': ['Gomohalmeoni', '고모할머니'], 'mother.mother.sister': ['Imohalmeoni', '이모할머니'], 'father.mother.sister': ['Imohalmeoni', '이모할머니'],
    };
    ['brother', 'sister'].forEach((x) => { T[`${x}.son`] = ['Joka', '조카']; T[`${x}.daughter`] = ['Jokattal', '조카딸']; });
    // cousins: 사촌 (father's brother), 고종사촌 (father's sister), 외사촌 (mother's brother), 이종사촌 (mother's sister) + elder/younger word
    [['father.brother', 'Sachon', '사촌'], ['father.sister', 'Gojong sachon', '고종사촌'], ['mother.brother', 'Oesachon', '외사촌'], ['mother.sister', 'Ijong sachon', '이종사촌']].forEach(([k, r, s]) => {
      T[`${k}.son`] = (c) => { const t = ey(c.elderThanMe(3), elderBro(c), ['Dongsaeng', '동생']); return [`${r} ${t[0]}`, `${s} ${t[1]}`]; };
      T[`${k}.daughter`] = (c) => { const t = ey(c.elderThanMe(3), elderSis(c), ['Dongsaeng', '동생']); return [`${r} ${t[0]}`, `${s} ${t[1]}`]; };
    });
    greatGrand(T, (a, b, g) => (a === 'father' && b === 'father' ? (g === 'm' ? ['Jeungjoharabeoji', '증조할아버지'] : ['Jeungjohalmeoni', '증조할머니']) : (g === 'm' ? ['Oejeungjoharabeoji', '외증조할아버지'] : ['Oejeungjohalmeoni', '외증조할머니'])));
    return T; })() });

  // Mandarin — Pinyin with tone marks. 堂 = father's brother's side, 表 = the rest.
  add({ id: 'mandarin', name: 'Mandarin', native: '普通话', lang: 'zh-CN', wish: '生日快乐', T: (() => { const T = {
    father: ['Bàba', '爸爸'], mother: ['Māma', '妈妈'], son: ['Érzi', '儿子'], daughter: ['Nǚ\'ér', '女儿'], husband: ['Zhàngfu', '丈夫'], wife: ['Qīzi', '妻子'],
    brother: (c) => ey(c.elderThanMe(1), ['Gēge', '哥哥'], ['Dìdi', '弟弟']), sister: (c) => ey(c.elderThanMe(1), ['Jiějie', '姐姐'], ['Mèimei', '妹妹']),
    'brother.wife': (c) => ey(c.elderThanMe(1), ['Sǎozi', '嫂子'], ['Dìxí', '弟媳']), 'sister.husband': (c) => ey(c.elderThanMe(1), ['Jiěfu', '姐夫'], ['Mèifu', '妹夫']),
    'father.father': ['Yéye', '爷爷'], 'father.mother': ['Nǎinai', '奶奶'], 'mother.father': ['Wàigōng', '外公'], 'mother.mother': ['Wàipó', '外婆'],
    'father.brother': (c) => ey(c.elder(2, 1), ['Bóbo', '伯伯'], ['Shūshu', '叔叔']), 'father.brother.wife': (c) => ey(c.elder(2, 1), ['Bómǔ', '伯母'], ['Shěnshen', '婶婶']),
    'father.sister': ['Gūgu', '姑姑'], 'father.sister.husband': ['Gūfu', '姑父'],
    'mother.brother': ['Jiùjiu', '舅舅'], 'mother.brother.wife': ['Jiùmā', '舅妈'], 'mother.sister': ['Yímā', '姨妈'], 'mother.sister.husband': ['Yífu', '姨父'],
    'brother.son': ['Zhízi', '侄子'], 'brother.daughter': ['Zhínǚ', '侄女'], 'sister.son': ['Wàisheng', '外甥'], 'sister.daughter': ['Wàishengnǚ', '外甥女'],
    'son.son': ['Sūnzi', '孙子'], 'son.daughter': ['Sūnnǚ', '孙女'], 'daughter.son': ['Wàisūn', '外孙'], 'daughter.daughter': ['Wàisūnnǚ', '外孙女'],
    'son.wife': ['Érxí', '儿媳'], 'daughter.husband': ['Nǚxu', '女婿'],
    'wife.father': ['Yuèfù', '岳父'], 'wife.mother': ['Yuèmǔ', '岳母'], 'husband.father': ['Gōnggong', '公公'], 'husband.mother': ['Pópo', '婆婆'],
    'wife.brother': (c) => ey(c.elderThanMe(2), ['Dàjiùzi', '大舅子'], ['Xiǎojiùzi', '小舅子']), 'wife.sister': (c) => ey(c.elderThanMe(2), ['Dàyízi', '大姨子'], ['Xiǎoyízi', '小姨子']),
    'husband.brother': (c) => ey(c.elderThanMe(2), ['Dàbǎizi', '大伯子'], ['Xiǎoshūzi', '小叔子']), 'husband.sister': (c) => ey(c.elderThanMe(2), ['Dàgūzi', '大姑子'], ['Xiǎogūzi', '小姑子']),
    'father.father.brother': (c) => ey(c.elder(3, 2), ['Bóyéye', '伯爷爷'], ['Shūyéye', '叔爷爷']), 'father.father.sister': ['Gūnǎinai', '姑奶奶'],
    'mother.mother.brother': ['Jiùgōng', '舅公'], 'mother.mother.sister': ['Yípó', '姨婆'], 'father.mother.brother': ['Jiùyéye', '舅爷爷'], 'father.mother.sister': ['Yínǎinai', '姨奶奶'],
  };
  [['father.brother', 'Táng', '堂'], ['father.sister', 'Biǎo', '表'], ['mother.brother', 'Biǎo', '表'], ['mother.sister', 'Biǎo', '表']].forEach(([k, r, s]) => {
    T[`${k}.son`] = (c) => ey(c.elderThanMe(3), [`${r}gē`, `${s}哥`], [`${r}dì`, `${s}弟`]);
    T[`${k}.daughter`] = (c) => ey(c.elderThanMe(3), [`${r}jiě`, `${s}姐`], [`${r}mèi`, `${s}妹`]);
  });
  greatGrand(T, (a, b, g) => (a === 'father' && b === 'father' ? (g === 'm' ? ['Zēngzǔfù', '曾祖父'] : ['Zēngzǔmǔ', '曾祖母']) : (g === 'm' ? ['Wài zēngzǔfù', '外曾祖父'] : ['Wài zēngzǔmǔ', '外曾祖母'])));
  return T; })() });

  // Mexican / Latino Spanish — generic engine (tío, prima segunda, cuñado …)
  add({ id: 'spanish', name: 'Mexican / Latino Spanish', native: 'Español', lang: 'es-MX', wish: '¡Feliz cumpleaños!', latin: true, T: {
    'husband.brother.wife': ['Concuña'], 'wife.sister.husband': ['Concuño'], 'wife.brother.wife': ['Concuña'], 'husband.sister.husband': ['Concuño'],
  }, generic: (w, c) => spanishTerm(w, c) });

  // Nigerian (Yoruba) — older/younger (ẹ̀gbọ́n / àbúrò) matters more than male/female
  add({ id: 'yoruba', name: 'Nigerian (Yoruba)', native: 'Yorùbá', lang: 'yo', wish: 'Ẹ kú ọjọ́ ìbí', latin: true, T: (() => { const T = {
    father: 'Bàbá', mother: 'Ìyá', son: 'Ọmọkùnrin', daughter: 'Ọmọbìnrin', husband: 'Ọkọ', wife: 'Ìyàwó',
    brother: (c) => ey(c.elderThanMe(1), 'Ẹ̀gbọ́n ọkùnrin', 'Àbúrò ọkùnrin'), sister: (c) => ey(c.elderThanMe(1), 'Ẹ̀gbọ́n obìnrin', 'Àbúrò obìnrin'),
    'brother.wife': 'Ìyàwó', 'sister.husband': 'Àna',
    'son.wife': 'Ìyàwó', 'daughter.husband': 'Àna',
    'wife.father': 'Bàbá àna', 'wife.mother': 'Ìyá àna', 'husband.father': 'Bàbá ọkọ', 'husband.mother': 'Ìyá ọkọ',
    'wife.brother': 'Àna', 'wife.sister': 'Àna', 'husband.brother': (c) => ey(c.elderThanMe(2), 'Ẹ̀gbọ́n ọkọ', 'Àbúrò ọkọ'), 'husband.sister': (c) => ey(c.elderThanMe(2), 'Ẹ̀gbọ́n ọkọ', 'Àbúrò ọkọ'),
  };
  ['father', 'mother'].forEach((s) => {
    const par = s === 'father' ? 'bàbá' : 'ìyá';
    T[`${s}.father`] = 'Bàbá àgbà'; T[`${s}.mother`] = 'Ìyá àgbà';
    ['brother', 'sister'].forEach((x) => {
      T[`${s}.${x}`] = (c) => ey(c.elder(2, 1), `Ẹ̀gbọ́n ${par}`, `Àbúrò ${par}`);
      T[`${s}.${x}.son`] = T[`${s}.${x}.daughter`] = (c) => ey(c.elder(2, 1), `Ọmọ ẹ̀gbọ́n ${par}`, `Ọmọ àbúrò ${par}`);
    });
  });
  ['brother', 'sister'].forEach((x) => (T[`${x}.son`] = T[`${x}.daughter`] = (c) => ey(c.elderThanMe(1), 'Ọmọ ẹ̀gbọ́n', 'Ọmọ àbúrò')));
  ['son', 'daughter'].forEach((x) => (T[`${x}.son`] = T[`${x}.daughter`] = 'Ọmọ ọmọ'));
  greatGrand(T, (a, b, g) => (g === 'm' ? 'Bàbá ńlá' : 'Ìyá ńlá'));
  Object.keys(T).forEach((k) => { if (typeof T[k] === 'string') T[k] = P(T[k]); else if (typeof T[k] === 'function') { const f = T[k]; T[k] = (c) => P(f(c)); } });
  return T; })() });

  // Vietnamese — Northern usage (Southern variants in brackets in the notes): nội = father's side, ngoại = mother's side
  add({ id: 'vietnamese', name: 'Vietnamese', native: 'Tiếng Việt', lang: 'vi', wish: 'Chúc mừng sinh nhật', latin: true, T: (() => { const T = {
    father: 'Bố', mother: 'Mẹ', son: 'Con trai', daughter: 'Con gái', husband: 'Chồng', wife: 'Vợ',
    brother: (c) => ey(c.elderThanMe(1), 'Anh', 'Em trai'), sister: (c) => ey(c.elderThanMe(1), 'Chị', 'Em gái'),
    'brother.wife': (c) => ey(c.elderThanMe(1), 'Chị dâu', 'Em dâu'), 'sister.husband': (c) => ey(c.elderThanMe(1), 'Anh rể', 'Em rể'),
    'father.father': 'Ông nội', 'father.mother': 'Bà nội', 'mother.father': 'Ông ngoại', 'mother.mother': 'Bà ngoại',
    'father.brother': (c) => ey(c.elder(2, 1), 'Bác', 'Chú'), 'father.brother.wife': (c) => ey(c.elder(2, 1), 'Bác gái', 'Thím'),
    'father.sister': (c) => ey(c.elder(2, 1), 'Bác', 'Cô'), 'father.sister.husband': (c) => ey(c.elder(2, 1), 'Bác', 'Chú'),
    'mother.brother': (c) => ey(c.elder(2, 1), 'Bác', 'Cậu'), 'mother.brother.wife': (c) => ey(c.elder(2, 1), 'Bác', 'Mợ'),
    'mother.sister': (c) => ey(c.elder(2, 1), 'Bác', 'Dì'), 'mother.sister.husband': (c) => ey(c.elder(2, 1), 'Bác', 'Dượng'),
    'son.son': 'Cháu nội', 'son.daughter': 'Cháu nội', 'daughter.son': 'Cháu ngoại', 'daughter.daughter': 'Cháu ngoại',
    'son.wife': 'Con dâu', 'daughter.husband': 'Con rể',
    'wife.father': 'Bố vợ', 'wife.mother': 'Mẹ vợ', 'husband.father': 'Bố chồng', 'husband.mother': 'Mẹ chồng',
    'wife.brother': (c) => ey(c.elderThanMe(2), 'Anh vợ', 'Em vợ'), 'wife.sister': (c) => ey(c.elderThanMe(2), 'Chị vợ', 'Em vợ'),
    'husband.brother': (c) => ey(c.elderThanMe(2), 'Anh chồng', 'Em chồng'), 'husband.sister': (c) => ey(c.elderThanMe(2), 'Chị chồng', 'Em chồng'),
    'father.father.brother': (c) => ey(c.elder(3, 2), 'Ông bác', 'Ông chú'), 'father.father.sister': 'Bà cô', 'mother.mother.sister': 'Bà dì', 'mother.mother.brother': 'Ông cậu',
  };
  ['father', 'mother'].forEach((s) => ['brother', 'sister'].forEach((x) => {
    T[`${s}.${x}.son`] = (c) => ey(c.elderThanMe(3), 'Anh họ', 'Em họ'); T[`${s}.${x}.daughter`] = (c) => ey(c.elderThanMe(3), 'Chị họ', 'Em họ');
  }));
  ['brother', 'sister'].forEach((x) => { T[`${x}.son`] = 'Cháu trai'; T[`${x}.daughter`] = 'Cháu gái'; });
  greatGrand(T, (a, b, g) => (g === 'm' ? (a === 'father' ? 'Cụ ông nội' : 'Cụ ông ngoại') : (a === 'father' ? 'Cụ bà nội' : 'Cụ bà ngoại')));
  Object.keys(T).forEach((k) => { if (typeof T[k] === 'string') T[k] = P(T[k]); else if (typeof T[k] === 'function') { const f = T[k]; T[k] = (c) => P(f(c)); } });
  return T; })() });

  // French
  const FR = { spouse: ['Mari', 'Femme'], anc: [, ['Papa', 'Maman'], ['Grand-père', 'Grand-mère'], ['Arrière-grand-père', 'Arrière-grand-mère'], ['Arrière-arrière-grand-père', 'Arrière-arrière-grand-mère']],
    des: [, ['Fils', 'Fille'], ['Petit-fils', 'Petite-fille'], ['Arrière-petit-fils', 'Arrière-petite-fille']], sib: ['Frère', 'Sœur'],
    elder: (t, e, g) => `${t} ${e ? (g === 'f' ? 'aînée' : 'aîné') : (g === 'f' ? 'cadette' : 'cadet')}`,
    uncle: [, , ['Oncle', 'Tante'], ['Grand-oncle', 'Grand-tante'], ['Arrière-grand-oncle', 'Arrière-grand-tante']],
    nephew: [, , ['Neveu', 'Nièce'], ['Petit-neveu', 'Petite-nièce']], cousin: [, , ['Cousin', 'Cousine'], ['Cousin issu de germain', 'Cousine issue de germain']],
    parentCousin: ['Oncle à la mode de Bretagne', 'Tante à la mode de Bretagne'], cousinChild: ['Petit-cousin', 'Petite-cousine'],
    pil: ['Beau-père', 'Belle-mère'], sil: ['Beau-frère', 'Belle-sœur'], cil: ['Gendre', 'Belle-fille'] };
  add({ id: 'french', name: 'French', native: 'Français', lang: 'fr-FR', wish: 'Joyeux anniversaire', latin: true, T: {}, generic: (w, c) => euroTerm(FR, w, c) });

  // German
  const DE = { spouse: ['Ehemann', 'Ehefrau'], anc: [, ['Papa', 'Mama'], ['Opa', 'Oma'], ['Uropa', 'Uroma'], ['Ururopa', 'Ururoma']],
    des: [, ['Sohn', 'Tochter'], ['Enkel', 'Enkelin'], ['Urenkel', 'Urenkelin']], sib: ['Bruder', 'Schwester'],
    elder: (t, e) => `${e ? 'Großer' : 'Kleiner'} ${t}`.replace(/^Großer Schwester/, 'Große Schwester').replace(/^Kleiner Schwester/, 'Kleine Schwester'),
    uncle: [, , ['Onkel', 'Tante'], ['Großonkel', 'Großtante'], ['Urgroßonkel', 'Urgroßtante']],
    nephew: [, , ['Neffe', 'Nichte'], ['Großneffe', 'Großnichte']], cousin: [, , ['Cousin', 'Cousine'], ['Cousin zweiten Grades', 'Cousine zweiten Grades']],
    parentCousin: ['Onkel zweiten Grades', 'Tante zweiten Grades'], cousinChild: ['Neffe zweiten Grades', 'Nichte zweiten Grades'],
    pil: ['Schwiegervater', 'Schwiegermutter'], sil: ['Schwager', 'Schwägerin'], cil: ['Schwiegersohn', 'Schwiegertochter'] };
  add({ id: 'german', name: 'German', native: 'Deutsch', lang: 'de-DE', wish: 'Alles Gute zum Geburtstag', latin: true, T: {}, generic: (w, c) => euroTerm(DE, w, c) });

  // Irish (Gaelic) — many Irish families use English words day to day; these are the Irish-language terms
  const GA = { spouse: ['Fear céile', 'Bean chéile'], anc: [, ['Daidí', 'Mamaí'], ['Daideo', 'Mamó'], ['Sin-seanathair', 'Sin-seanmháthair']],
    des: [, ['Mac', 'Iníon'], ['Garmhac', 'Gariníon']], sib: ['Deartháir', 'Deirfiúr'],
    uncle: [, , ['Uncail', 'Aintín'], ['Sean-uncail', 'Sean-aintín']], nephew: [, , ['Nia', 'Neacht'], ['Garnia', 'Garneacht']],
    cousin: [, , ['Col ceathrar', 'Col ceathrar'], ['Col seisear', 'Col seisear']], cousinChild: ['Nia', 'Neacht'],
    pil: ['Athair céile', 'Máthair chéile'], sil: ['Deartháir céile', 'Deirfiúr chéile'], cil: ['Mac céile', 'Iníon chéile'] };
  add({ id: 'irish', name: 'Irish (Gaelic)', native: 'Gaeilge', lang: 'ga-IE', wish: 'Breithlá sona duit', latin: true, T: {}, generic: (w, c) => euroTerm(GA, w, c) });

  // Italian — nipote covers nephew, niece and grandchild
  const IT = { spouse: ['Marito', 'Moglie'], anc: [, ['Papà', 'Mamma'], ['Nonno', 'Nonna'], ['Bisnonno', 'Bisnonna'], ['Trisnonno', 'Trisnonna']],
    des: [, ['Figlio', 'Figlia'], ['Nipote', 'Nipote'], ['Pronipote', 'Pronipote']], sib: ['Fratello', 'Sorella'],
    elder: (t, e, g) => `${t} ${e ? 'maggiore' : 'minore'}`,
    uncle: [, , ['Zio', 'Zia'], ['Prozio', 'Prozia']], nephew: [, , ['Nipote', 'Nipote'], ['Pronipote', 'Pronipote']],
    cousin: [, , ['Cugino', 'Cugina'], ['Cugino di secondo grado', 'Cugina di secondo grado']],
    pil: ['Suocero', 'Suocera'], sil: ['Cognato', 'Cognata'], cil: ['Genero', 'Nuora'] };
  add({ id: 'italian', name: 'Italian', native: 'Italiano', lang: 'it-IT', wish: 'Buon compleanno', latin: true, T: {}, generic: (w, c) => euroTerm(IT, w, c) });

  // Swedish — grandparents, aunts and uncles say which side: farmor (father's mother), moster (mother's sister)
  const SV = { spouse: ['Make', 'Fru'], anc: [, ['Pappa', 'Mamma']], des: [, ['Son', 'Dotter'], ['Barnbarn', 'Barnbarn'], ['Barnbarnsbarn', 'Barnbarnsbarn']],
    sib: ['Bror', 'Syster'], elder: (t, e, g) => (g === 'f' ? (e ? 'Storasyster' : 'Lillasyster') : (e ? 'Storebror' : 'Lillebror')),
    uncle: [], nephew: [, , ['Syskonbarn', 'Syskonbarn'], ['Syskonbarnbarn', 'Syskonbarnbarn']], cousin: [, , ['Kusin', 'Kusin'], ['Syssling', 'Syssling'], ['Tremänning', 'Tremänning']],
    cousinChild: ['Kusinbarn', 'Kusinbarn'], pil: ['Svärfar', 'Svärmor'], sil: ['Svåger', 'Svägerska'], cil: ['Svärson', 'Svärdotter'] };
  const svT = {};
  const sv = { father: 'far', mother: 'mor' };
  ['father', 'mother'].forEach((a) => {
    ['father', 'mother'].forEach((b) => { svT[`${a}.${b}`] = P(sv[a] === 'far' ? (b === 'father' ? 'Farfar' : 'Farmor') : (b === 'father' ? 'Morfar' : 'Mormor'));
      ['father', 'mother'].forEach((x) => (svT[`${a}.${b}.${x}`] = P(`${svT[`${a}.${b}`][0]}s ${x === 'father' ? 'far' : 'mor'}`)));
      ['brother', 'sister'].forEach((x) => (svT[`${a}.${b}.${x}`] = P(`${svT[`${a}.${b}`][0]}s ${x === 'brother' ? 'bror' : 'syster'}`))); });
    svT[`${a}.brother`] = P(a === 'father' ? 'Farbror' : 'Morbror'); svT[`${a}.sister`] = P(a === 'father' ? 'Faster' : 'Moster');
    svT[`${a}.brother.wife`] = P(`${a === 'father' ? 'Farbrors' : 'Morbrors'} fru`); svT[`${a}.sister.husband`] = P(`${a === 'father' ? 'Fasters' : 'Mosters'} man`);
  });
  Object.assign(svT, { 'brother.son': P('Brorson'), 'brother.daughter': P('Brorsdotter'), 'sister.son': P('Systerson'), 'sister.daughter': P('Systerdotter'),
    'son.son': P('Sonson'), 'son.daughter': P('Sondotter'), 'daughter.son': P('Dotterson'), 'daughter.daughter': P('Dotterdotter') });
  add({ id: 'swedish', name: 'Swedish', native: 'Svenska', lang: 'sv-SE', wish: 'Grattis på födelsedagen', latin: true, T: svT, generic: (w, c) => euroTerm(SV, w, c) });

  // Spanish packs list single strings; make every table value a pair
  packs.forEach((p) => Object.keys(p.T).forEach((k) => { if (Array.isArray(p.T[k]) && p.T[k].length === 1) p.T[k] = P(p.T[k][0]); }));

  const byId = new Map(packs.map((p) => [p.id, p]));
  function register(p) { if (!byId.has(p.id)) { packs.push(p); byId.set(p.id, p); } }
  const list = () => [...packs].sort((a, b) => a.name.localeCompare(b.name));
  const get = (id) => byId.get(id) || byId.get('english');
  // "Chinese (Cantonese)", "cantonese", "广东话", "Hindi" … → pack id
  function find(text) {
    const t = String(text || '').toLowerCase().trim(); if (!t) return null;
    if (byId.has(t)) return t;
    const hit = packs.find((p) => [p.name, p.native, p.id].some((x) => String(x).toLowerCase() === t))
      || packs.find((p) => t.includes(p.id) || p.name.toLowerCase().includes(t));
    if (hit) return hit.id;
    const ALIAS = { bangla: 'bengali', 'north indian': 'hindi', urdu: 'hindi', punjabi: 'punjabi', panjabi: 'punjabi', gurmukhi: 'punjabi', sikh: 'punjabi', chinese: 'mandarin', 'hong kong': 'cantonese', yue: 'cantonese',
      mexican: 'spanish', latino: 'spanish', latina: 'spanish', latinx: 'spanish', español: 'spanish', american: 'english', us: 'english', nigerian: 'yoruba', yorùbá: 'yoruba', viet: 'vietnamese', gaelic: 'irish', gaeilge: 'irish', irish: 'irish', italiano: 'italian', deutsch: 'german', français: 'french', francais: 'french', svenska: 'swedish' };
    const k = Object.keys(ALIAS).find((a) => t.includes(a));
    return k ? ALIAS[k] : null;
  }
  return { list, get, find, register, englishTerm, spanishTerm, ey, P };
})();
