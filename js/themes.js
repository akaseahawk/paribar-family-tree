/* =========================================================
   themes.js — Heritage looks (accent color + motif strip + card corner)
   - Only the accent color, paper tone and motif change. Relationship side
     colors (mother's side, father's side, in-laws, friends) never change,
     so the legend, paths and shared screenshots keep their meaning.
   - "Default" and "Bengali" are the same look on purpose.
   - Motifs are tiny 40x24 SVG tiles drawn in the accent color ("A").
   ========================================================= */
(function () {
  const T = [
    { id: 'bengali', name: 'Bengali', motif: 'Alpana', accent: '#A61E24', paper: '#FBF6EE',
      tile: '<path d="M20 4 C26 10 26 16 20 22 C14 16 14 10 20 4Z" fill="none" stroke="A" stroke-width="1.4"/><circle cx="4" cy="13" r="1.6" fill="A"/><circle cx="36" cy="13" r="1.6" fill="A"/><path d="M8 13 Q12 9 16 13 M24 13 Q28 17 32 13" fill="none" stroke="A" stroke-width="1"/>' },
    { id: 'cantonese', name: 'Cantonese', motif: 'Window lattice', accent: '#1F6F5C', paper: '#F7F6F0',
      tile: '<path d="M2 4 H18 V20 H6 V8 H14 V16 H10" fill="none" stroke="A" stroke-width="1.5"/><path d="M22 20 H38 V4 H26 V16 H34 V8 H30" fill="none" stroke="A" stroke-width="1.5"/>' },
    { id: 'japanese', name: 'Japanese', motif: 'Seigaiha waves', accent: '#2B3A67', paper: '#F6F5F1',
      tile: '<g fill="none" stroke="A" stroke-width="1.1"><path d="M0 24 A10 10 0 0 1 20 24"/><path d="M4 24 A6 6 0 0 1 16 24"/><path d="M20 24 A10 10 0 0 1 40 24"/><path d="M24 24 A6 6 0 0 1 36 24"/><path d="M10 14 A10 10 0 0 1 30 14"/><path d="M14 14 A6 6 0 0 1 26 14"/></g>' },
    { id: 'korean', name: 'Korean', motif: 'Bojagi patchwork', accent: '#6B2D5C', paper: '#F8F5F3',
      tile: '<g fill="none" stroke="A" stroke-width="1.2"><rect x="1" y="2" width="14" height="9"/><rect x="15" y="2" width="9" height="20"/><rect x="1" y="11" width="14" height="11"/><rect x="24" y="2" width="15" height="13"/><rect x="24" y="15" width="15" height="7"/></g><rect x="17" y="5" width="5" height="5" fill="A" opacity=".25"/>' },
    { id: 'spanish', name: 'Spanish / Latino', motif: 'Papel picado', accent: '#B5532A', paper: '#FBF5EC',
      tile: '<path d="M0 2 H40" stroke="A" stroke-width="1"/><path d="M3 2 H17 V16 L10 21 L3 16Z" fill="none" stroke="A" stroke-width="1.3"/><circle cx="10" cy="9" r="2.2" fill="none" stroke="A"/><path d="M23 2 H37 V16 L30 21 L23 16Z" fill="A" opacity=".18"/><path d="M23 2 H37 V16 L30 21 L23 16Z" fill="none" stroke="A" stroke-width="1.3"/><path d="M27 8 L30 12 L33 8" fill="none" stroke="A"/>' },
    { id: 'hindi', name: 'Hindi / Gujarati', motif: 'Bandhani dots', accent: '#7A1F3D', paper: '#FBF5EF',
      tile: '<g fill="A"><circle cx="10" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="14" cy="12" r="1.4"/><circle cx="10" cy="18" r="1.4"/><circle cx="10" cy="12" r="1"/><circle cx="30" cy="6" r="1.4"/><circle cx="26" cy="12" r="1.4"/><circle cx="34" cy="12" r="1.4"/><circle cx="30" cy="18" r="1.4"/><circle cx="30" cy="12" r="1"/></g>' },
    { id: 'punjabi', name: 'Punjabi', motif: 'Phulkari', accent: '#9A3B0C', paper: '#FCF5EA',
      tile: '<g fill="none" stroke="A" stroke-width="1.3"><path d="M10 2 L18 12 L10 22 L2 12Z"/><path d="M30 2 L38 12 L30 22 L22 12Z"/><path d="M18 12 H22"/></g><g fill="A"><path d="M10 8 L14 12 L10 16 L6 12Z"/><path d="M30 8 L34 12 L30 16 L26 12Z"/></g>' },
    { id: 'arabic', name: 'Arabic', motif: 'Eight-point star', accent: '#1E4D8C', paper: '#F7F5F0',
      tile: '<g fill="none" stroke="A" stroke-width="1.2"><rect x="13" y="5" width="14" height="14"/><rect x="13" y="5" width="14" height="14" transform="rotate(45 20 12)"/><path d="M0 12 H6 M34 12 H40"/></g>' },
    { id: 'irish', name: 'Irish', motif: 'Interlace knot', accent: '#3E5C76', paper: '#F6F6F2',
      tile: '<g fill="none" stroke="A" stroke-width="1.6"><path d="M0 12 C6 2 14 2 20 12 C26 22 34 22 40 12"/><path d="M0 12 C6 22 14 22 20 12 C26 2 34 2 40 12"/></g>' },
    { id: 'swedish', name: 'Swedish', motif: 'Dala folk flower', accent: '#2F5D8A', paper: '#F8F6F0',
      tile: '<g fill="none" stroke="A" stroke-width="1.3"><path d="M20 21 V12"/><path d="M20 12 C14 12 12 6 16 4 C18 8 20 8 20 12 C20 8 22 8 24 4 C28 6 26 12 20 12Z"/><path d="M20 17 C14 17 10 14 8 18 M20 17 C26 17 30 14 32 18"/></g>' },
  ];
  const byId = new Map(T.map((t) => [t.id, t]));

  // mix a hex color with white (t > 0) or black (t < 0)
  const mix = (hex, t) => {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    const m = c.map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
    return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const tileUrl = (t) => `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 40 24">${t.tile.replace(/"A"/g, `"${t.accent}"`)}</svg>`)}")`;

  // '' or 'default' → the Bengali look
  const resolve = (id) => byId.get(id) || byId.get('bengali');

  function apply(id) {
    const t = resolve(id), r = document.documentElement.style;
    r.setProperty('--red', t.accent);
    r.setProperty('--red-ink', mix(t.accent, -0.25));
    r.setProperty('--red-soft', mix(t.accent, 0.88));
    r.setProperty('--bg', t.paper);
    r.setProperty('--motif', tileUrl(t));
    document.documentElement.dataset.theme = id && byId.has(id) ? id : 'default';
    const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = t.paper;
  }

  window.FT = window.FT || {};
  FT.themes = { list: () => T.slice(), get: resolve, apply, has: (id) => byId.has(id) };
  apply(''); // default look until saved settings load
})();
