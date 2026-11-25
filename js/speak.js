/* =========================================================
   speak.js — "Say it out loud": reads a kinship term aloud
   - Uses the phone's own text-to-speech (no internet needed
     once the voice is installed).
   - Voice for the term's language available → reads the script
     (মাসি, 姨媽, 이모 …).
   - No such voice → reads the romanized spelling (Mashi, Ji Maa)
     with an English voice and says so once per language.
   ========================================================= */
window.FT = window.FT || {};

FT.speak = (() => {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let warned = false;

  // Voices load asynchronously on Android; wait briefly for them
  function voices() {
    const now = speechSynthesis.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 800); // some browsers never fire the event
    });
  }
  const pick = (list, prefix) => list.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix));

  // term = { script: 'মাসি', roman: 'Mashi', lang: 'bn-IN' }  (either text may be empty; lang = the culture's voice)
  // Voice prefixes to try for each language, most specific first (Cantonese voices are listed as yue or zh-HK)
  const PREFIXES = { yue: ['yue', 'zh-hk'], 'zh-cn': ['zh-cn', 'cmn', 'zh'], bn: ['bn'], hi: ['hi'], gu: ['gu'], ar: ['ar'], ja: ['ja'], ko: ['ko'],
    vi: ['vi'], yo: ['yo'], 'es-mx': ['es-mx', 'es-us', 'es'], 'en-us': ['en-us', 'en'],
    fr: ['fr'], de: ['de'], ga: ['ga'], it: ['it'], sv: ['sv'], pa: ['pa'] };
  const NAMES = { yue: 'Cantonese', 'zh-cn': 'Mandarin', bn: 'Bengali', hi: 'Hindi', gu: 'Gujarati', ar: 'Arabic', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', yo: 'Yoruba', 'es-mx': 'Spanish', fr: 'French', de: 'German', ga: 'Irish', it: 'Italian', sv: 'Swedish', pa: 'Punjabi' };
  const warnedFor = new Set();
  async function say({ script = '', roman = '', lang = 'bn-IN' }, toast) {
    if (!supported) { toast && toast('Read-aloud is not available in this browser'); return; }
    const list = await voices();
    const key = String(lang || 'bn-IN').toLowerCase();
    const k = PREFIXES[key] ? key : PREFIXES[key.split('-')[0]] ? key.split('-')[0] : 'bn';
    let voice = null; for (const pre of PREFIXES[k] || []) { voice = pick(list, pre); if (voice) break; }
    const english = k === 'en-us';
    speechSynthesis.cancel(); // stop anything already speaking
    let u;
    if (voice && (script || roman)) {
      u = new SpeechSynthesisUtterance(script || roman); u.voice = voice; u.lang = voice.lang;
    } else {
      const text = roman || script; if (!text) return;
      u = new SpeechSynthesisUtterance(text);
      const en = pick(list, k === 'bn' || k === 'hi' || k === 'gu' ? 'en-in' : 'en') || pick(list, 'en');
      if (en) { u.voice = en; u.lang = en.lang; }
      if (!english && !warnedFor.has(k) && toast) {
        warnedFor.add(k);
        toast(`No ${NAMES[k] || 'matching'} voice on this phone, so reading the English spelling. Add one: Settings › Text-to-speech › Install voice data`);
      }
    }
    u.rate = 0.85; // a little slower so the term is easy to repeat
    speechSynthesis.speak(u);
  }

  // Small speaker button; app.js wires the click with data-say
  const button = (label = 'Say it out loud') => (supported
    ? `<button class="icon-btn small say-btn" type="button" data-act="say" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg></button>`
    : '');

  return { supported, say, button };
})();
