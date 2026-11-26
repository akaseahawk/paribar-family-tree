/* =========================================================
   demo.js — the sample family (every name here is made up)
   A kid with a Bengali father's side and a Cantonese mother's side,
   three generations back, with brothers and sisters at each level.
   Phone numbers use the 555-01xx range reserved for fiction.
   Used by "Load sample family", the spreadsheet template and the docs.
   ========================================================= */
window.FT = window.FT || {};

FT.demo = (() => {
  // [key, name, gender, dob, extra]
  const PEOPLE = [
    // --- Me and my brother and sister
    ['me', 'Ishaan Mukherjee', 'm', '2014-06-21', { city: 'Austin, TX', isMe: true }],
    ['mira', 'Mira Mukherjee', 'f', '2011-09-03', { city: 'Austin, TX' }],
    ['kai', 'Kai Mukherjee', 'm', '2017-02-14', { city: 'Austin, TX' }],
    // --- Parents
    ['baba', 'Sourav Mukherjee', 'm', '1982-03-09', { nickname: 'Baba', city: 'Austin, TX', phone: '+1 512 555 0142', email: 'sourav@example.com' }],
    ['mom', 'Grace Wong', 'f', '1984-11-02', { nickname: 'Mom', city: 'Austin, TX', phone: '+1 512 555 0143', notes: 'Chinese name 黃嘉欣 (Wong Gaa-jan).' }],
    // --- Father's side (Bengali)
    ['thakurda', 'Prasanta Mukherjee', 'm', '1951', { city: 'Kolkata', phone: '+91 00000 55501', notes: 'Retired engineer. Tells the best stories about the old para.' }],
    ['thakuma', 'Swapna Mukherjee', 'f', '1956', { city: 'Kolkata', notes: 'Makes payesh for every birthday.' }],
    ['pishi', 'Rituparna Banerjee', 'f', '1979', { nickname: 'Ritu', city: 'Bengaluru', phone: '+91 00000 55502' }],
    ['pishemoshai', 'Arnab Banerjee', 'm', '1976', { city: 'Bengaluru' }],
    ['tiyasha', 'Tiyasha Banerjee', 'f', '2008', { city: 'Bengaluru' }],
    ['kaku', 'Debojyoti Mukherjee', 'm', '1986', { nickname: 'Bubai', city: 'London', phone: '+44 7700 900555' }],
    ['kakima', 'Sreemoyee Mukherjee', 'f', '1988', { city: 'London' }],
    ['ayan', 'Ayan Mukherjee', 'm', '2016', { city: 'London' }],
    ['boroThakurda', 'Sushanta Mukherjee', 'm', '1947', { city: 'Kolkata' }],
    ['pishiThakuma', 'Anima Chatterjee', 'f', '1955', { city: 'Durgapur' }],
    ['mamaThakurda', 'Tapas Ganguly', 'm', '1953', { city: 'Howrah' }],
    ['haren', 'Haren Mukherjee', 'm', '1924', { city: 'Kolkata', deceased: true, died: '1998' }],
    ['kamala', 'Kamala Mukherjee', 'f', '1929', { city: 'Kolkata', deceased: true, died: '2009' }],
    // --- Mother's side (Cantonese)
    ['gungGung', 'Wong Kwok-wai', 'm', '1954', { city: 'Hong Kong', phone: '+852 0000 0101', notes: '黃國偉. Morning tai chi in the park, then dim sum.' }],
    ['poPo', 'Lee Mei-ling', 'f', '1957', { city: 'Hong Kong', notes: '李美玲.' }],
    ['vivian', 'Vivian Leung', 'f', '1980', { city: 'Vancouver', phone: '+1 604 555 0144' }],
    ['kenneth', 'Kenneth Leung', 'm', '1978', { city: 'Vancouver' }],
    ['ethan', 'Ethan Leung', 'm', '2009', { city: 'Vancouver' }],
    ['chloe', 'Chloe Leung', 'f', '2012', { city: 'Vancouver' }],
    ['jason', 'Jason Wong', 'm', '1988', { city: 'San Francisco', phone: '+1 415 555 0145' }],
    ['michelle', 'Michelle Wong', 'f', '1990', { city: 'San Francisco' }],
    ['lucas', 'Lucas Wong', 'm', '2019', { city: 'San Francisco' }],
    ['kwokKeung', 'Wong Kwok-keung', 'm', '1950', { city: 'Vancouver' }],
    ['meiFong', 'Lee Mei-fong', 'f', '1961', { city: 'Toronto' }],
    ['chiMing', 'Wong Chi-ming', 'm', '1926', { city: 'Hong Kong', deceased: true, died: '2004' }],
    ['siuLan', 'Chan Siu-lan', 'f', '1930', { city: 'Hong Kong', deceased: true, died: '2015' }],
    // --- Friends who are family too
    ['daniel', 'Daniel Kim', 'm', '', { city: 'Austin, TX', notes: 'Next-door neighbor, carpools to school.' }],
    ['jenny', 'Jenny Kim', 'f', '1982', { city: 'Austin, TX', notes: "Daniel's mom. Hosts the neighborhood Lunar New Year." }],
    ['priya', 'Priya Shah', 'f', '1983', { nickname: 'Priya Auntie', city: 'Austin, TX', notes: "Mom's best friend since college. Like a third aunt." }],
    ['leo', 'Leo Martinez', 'm', '2014', { city: 'Austin, TX', notes: 'Best friend from school, robotics club.' }],
  ];
  // child ← [mother, father]
  const PARENTS = {
    me: ['mom', 'baba'], mira: ['mom', 'baba'], kai: ['mom', 'baba'],
    baba: ['thakuma', 'thakurda'], pishi: ['thakuma', 'thakurda'], kaku: ['thakuma', 'thakurda'],
    tiyasha: ['pishi', 'pishemoshai'], ayan: ['kakima', 'kaku'],
    thakurda: ['kamala', 'haren'], boroThakurda: ['kamala', 'haren'], pishiThakuma: ['kamala', 'haren'],
    mom: ['poPo', 'gungGung'], vivian: ['poPo', 'gungGung'], jason: ['poPo', 'gungGung'],
    ethan: ['vivian', 'kenneth'], chloe: ['vivian', 'kenneth'], lucas: ['michelle', 'jason'],
    gungGung: ['siuLan', 'chiMing'], kwokKeung: ['siuLan', 'chiMing'],
    daniel: ['jenny'],
  };
  const SPOUSES = [['mom', 'baba'], ['thakuma', 'thakurda'], ['pishi', 'pishemoshai'], ['kakima', 'kaku'], ['kamala', 'haren'],
    ['poPo', 'gungGung'], ['vivian', 'kenneth'], ['michelle', 'jason'], ['siuLan', 'chiMing']];
  const SIBLINGS = [['thakuma', 'mamaThakurda'], ['poPo', 'meiFong']]; // their parents aren't in the tree
  const FRIENDS = [['daniel', 'me', 'neighbor'], ['priya', 'mom', 'friend'], ['leo', 'me', 'classmate']];
  const HERITAGE = { me: 'english', paternal: 'bengali', maternal: 'cantonese', inlaw: 'english' };

  // Build app records. uid: id maker, now: ISO timestamp
  function build(uid, now = new Date().toISOString()) {
    const id = {};
    const people = PEOPLE.map(([k, name, gender, dob, x]) => {
      id[k] = uid();
      const { isMe, ...rest } = x;
      return { id: id[k], name, gender, dob: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : '', birthYear: dob.slice(0, 4), photos: FT.demoPhotos && FT.demoPhotos[k] ? [FT.demoPhotos[k]] : [], createdAt: now, ...rest };
    });
    const R = (type, a, b, extra = {}) => ({ id: uid(), type, from: id[a], to: id[b], createdAt: now, ...extra });
    const rels = [];
    Object.entries(PARENTS).forEach(([c, ps]) => ps.forEach((p) => rels.push(R('parent_of', p, c))));
    SPOUSES.forEach(([a, b]) => rels.push(R('spouse_of', a, b)));
    SIBLINGS.forEach(([a, b]) => rels.push(R('sibling_of', a, b)));
    FRIENDS.forEach(([a, b, kind]) => rels.push(R('friend_of', a, b, { kind })));
    const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const visits = [
      { id: uid(), date: d(40), place: 'Kolkata', peopleIds: [id.thakurda, id.thakuma, id.boroThakurda], notes: 'Durga Puja at Thakurda and Thakuma\'s.', photos: [], createdAt: now },
      { id: uid(), date: d(12), place: 'Hong Kong', peopleIds: [id.gungGung, id.poPo], notes: 'Dim sum with Gung Gung and Po Po.', photos: [], createdAt: now },
    ];
    return { people, relationships: rels, visits, meId: id.me, heritage: { ...HERITAGE } };
  }

  // Spreadsheet rows (names instead of ids) for the template
  function rows() {
    const nameOf = Object.fromEntries(PEOPLE.map(([k, n]) => [k, n]));
    const fmt = (dob) => (/^\d{4}-\d{2}-\d{2}$/.test(dob) ? `${dob.slice(5, 7)}/${dob.slice(8, 10)}/${dob.slice(0, 4)}` : dob);
    const sp = Object.fromEntries(SPOUSES.flatMap(([a, b]) => [[a, b], [b, a]]));
    return PEOPLE.filter(([k]) => k !== 'daniel').map(([k, name, gender, dob, x]) => ({
      name, nickname: x.nickname || '', relation_to_me: x.isMe ? 'me' : '', gender, dob: fmt(dob), city: x.city || '', phone: x.phone || '',
      heritage: k === 'me' ? '' : '', notes: x.notes || '',
      mother: PARENTS[k] ? nameOf[PARENTS[k][0]] : '', father: PARENTS[k] ? nameOf[PARENTS[k][1]] : '', spouse: sp[k] ? nameOf[sp[k]] : '',
      siblings: SIBLINGS.filter((s) => s.includes(k)).map((s) => nameOf[s[0] === k ? s[1] : s[0]]).join('; '),
    }));
  }
  return { build, rows, HERITAGE, PEOPLE };
})();
