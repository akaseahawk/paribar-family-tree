# Code Block: bundle index.html + CSS + JS into ONE file (paribar-standalone.html)
# Use: python3 build-standalone.py   → good for emailing/keeping a copy; the hosted
# version is still preferred on Android (voice + offline install need https).
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
html = re.sub(r'\?v=\d+"', '"', html)  # cache-busting version tags aren't needed in one file
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
