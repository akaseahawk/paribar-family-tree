/* site.js — landing page extras: sticky button on phones, and the share button */
(() => {
  // Sticky "See the sample family" bar once the hero button scrolls away (hidden again near the footer)
  const hero = document.getElementById('heroCta'), bar = document.getElementById('sticky'), foot = document.querySelector('footer');
  if (hero && bar && 'IntersectionObserver' in window) {
    let heroGone = false, footIn = false;
    const set = () => { const on = heroGone && !footIn; bar.classList.toggle('show', on); document.body.classList.toggle('has-sticky', on); };
    new IntersectionObserver(([e]) => { heroGone = !e.isIntersecting && e.boundingClientRect.top < 0; set(); }).observe(hero);
    new IntersectionObserver(([e]) => { footIn = e.isIntersecting; set(); }).observe(foot);
  }
  // Share: the phone's share sheet, or copy the link
  const btn = document.getElementById('shareBtn');
  if (btn) btn.addEventListener('click', async () => {
    const url = 'https://akaseahawk.github.io/paribar-family-tree/';
    const data = { title: 'Paribar', text: 'See how everyone in the family is connected, in our own words. Free, no account, stays on your phone.', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(url); btn.textContent = 'Link copied';
    } catch (e) { if (e && e.name !== 'AbortError') { btn.textContent = url; } }
  });
})();
