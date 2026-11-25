# Code Block: bundle index.html + CSS + JS into ONE file (paribar-standalone.html)
# Use: python3 build-standalone.py   → good for emailing/keeping a copy; the hosted
# version is still preferred on Android (voice + offline install need https).
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
html = re.sub(r'\?v=\d+"', '"', html)  # cache-busting version tags aren't needed in one file
import base64 as _b64
def _fonts_css():
    css = (root / 'css/fonts.css').read_text()
    return re.sub(r"url\(\.\./fonts/([^)]+)\)", lambda m: "url(data:font/woff2;base64," + _b64.b64encode((root / 'fonts' / m.group(1)).read_bytes()).decode() + ")", css)
html = html.replace('<link rel="stylesheet" href="css/fonts.css" />', '<style>\n' + _fonts_css() + '\n</style>')
# one-file copy: everything is inline, and nothing may be fetched from anywhere
html = re.sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*" />',
              '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src data: blob:; media-src data: blob:; base-uri \'none\'; form-action \'none\'; object-src \'none\'; frame-src \'none\'" />', html)
html = html.replace('<link rel="stylesheet" href="css/styles.css" />',
                    '<style>\n' + (root / 'css/styles.css').read_text() + '\n</style>')
def inline(m):
    return '<script>\n' + (root / m.group(1)).read_text().replace('</script>', '<\\/script>') + '\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', '', html)  # no PWA in single-file mode
html = html.replace('<head>', '<head>\n  <script>window.FT_STANDALONE = true; /* one-file copy: no service worker */</script>', 1)
html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', html)
import base64
icon = base64.b64encode((root / 'icons/icon.svg').read_bytes()).decode()
html = html.replace('href="icons/icon.svg"', f'href="data:image/svg+xml;base64,{icon}"')
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/paribar-standalone.html').write_text(html)
print('wrote dist/paribar-standalone.html', len(html) // 1024, 'KB')
