/* =========================================================
   treeimage.js — Save the map as a picture (PNG) or print it
   - Uses what's on screen: Mind map or Generations, current
     center person and Degrees setting. Pick Generations +
     Degrees "All" for a full family-tree poster.
   - Names and Bengali terms only. No phone numbers or addresses.
   - Share (WhatsApp, Drive…), download, or print / save as PDF.
   ========================================================= */
window.FT = window.FT || {};

FT.treeImage = (() => {
  // Styles copied onto each element, so the picture looks like the screen without the stylesheet
  const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap',
    'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'display', 'visibility'];

  // crop (optional): { x0, y0, x1, y1 } in map coordinates, e.g. just the highlighted people
  async function render(title, crop) {
    const src = FT.mindmap.svgNode();
    const root = src.querySelector(':scope > g'); // the zoomable group holding the whole map
    const bb = crop ? { x: crop.x0, y: crop.y0, width: crop.x1 - crop.x0, height: crop.y1 - crop.y0 } : root.getBBox();
    if (!bb.width) throw new Error('The map is empty');
    const pad = 40, head = 64;
    // wide enough for the title too; a narrow crop is centered
    const minW = Math.ceil(title.length * 14 + pad * 2);
    if (bb.width + pad * 2 < minW) { const extra = minW - (bb.width + pad * 2); bb.x -= extra / 2; bb.width += extra; }
    const W = Math.ceil(bb.width + pad * 2), H = Math.ceil(bb.height + pad * 2 + head);

    const clone = src.cloneNode(true);
    const a = [src, ...src.querySelectorAll('*')], b = [clone, ...clone.querySelectorAll('*')];
    a.forEach((el, i) => { const cs = getComputedStyle(el); b[i].setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')); });
    b.forEach((el) => el.classList && el.classList.remove('is-found')); // no "found" pulse in the picture
    const cRoot = clone.querySelector(':scope > g');
    cRoot.setAttribute('transform', `translate(${pad - bb.x},${pad + head - bb.y})`); // undo the on-screen pan/zoom
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W); clone.setAttribute('height', H); clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
    clone.removeAttribute('class');
    const NS = 'http://www.w3.org/2000/svg';
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', W); bg.setAttribute('height', H);
    bg.setAttribute('style', `fill:${getComputedStyle(document.body).backgroundColor || '#FBF6EE'};stroke:none`); // no inherited outline
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', pad); t.setAttribute('y', 44); t.setAttribute('style', 'font: 600 26px sans-serif; fill: #2B1D14; stroke: none');
    t.textContent = title;
    clone.insertBefore(t, cRoot); clone.insertBefore(bg, t);

    const svgText = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not draw the map')); img.src = url; });
    const scale = Math.min(2, 4096 / Math.max(W, H)); // sharp, but within phone canvas limits
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return { blob, landscape: W > H };
  }

  // Print just the picture (the browser's print dialog also offers "Save as PDF")
  // name: shown by the print dialog as the PDF file name (Paribar_family-tree_<date>_<time>)
  function print(blob, landscape, name) {
    const oldTitle = document.title; if (name) document.title = name;
    const url = URL.createObjectURL(blob);
    let area = document.getElementById('printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
    area.innerHTML = `<style>@page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }</style><img src="${url}" alt="Family tree" />`;
    const done = () => { area.innerHTML = ''; URL.revokeObjectURL(url); document.title = oldTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    area.querySelector('img').onload = () => window.print();
  }

  return { render, print };
})();
