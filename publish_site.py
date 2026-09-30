"""
publish_site.py
Puts the website together for visitors. The page is edited as separate files (index.html, styles.css and the
scripts in js/), so that two changes to different parts of the site do not collide; visitors still get one
file, as before the split:
  - the stylesheet link becomes a <style> block holding styles.css,
  - the script tags become one <script> holding the files in js/, in the order index.html lists them,
  - the Content-Security-Policy's script-src becomes a fingerprint (SHA-256 hash) of each script in the page,
    so a visitor's browser runs exactly those scripts and refuses any other, including one slipped into the
    page by an attacker.
One file means one download (no extra wait before the page appears), and a browser can never mix an old
script with a new page.

  python3 publish_site.py _site    writes the published site into the folder _site (the workflow does this)
  python3 publish_site.py --page   prints only the published page (the test server uses this)
The "site" value in fixtures.json is fingerprint(): it tells a page left open that the site changed.
build_schedule.py writes it, and publish() writes it again into the published copy of fixtures.json, from the
page it publishes, so the two always match even if newer files arrived between the build and publishing.
"""
import base64, hashlib, json, os, re, shutil, sys
from common import save_text

HERE = os.path.dirname(os.path.abspath(__file__))
COPY = ["fixtures.json", "soccer.ics", "fonts", "sitemap.xml", "og-image.png", "manifest.webmanifest", "icons"]   # published as they are, next to the page

STYLE_LINK = re.compile(r'<link rel="stylesheet" href="([^"]*)">\n')
SCRIPT_RUN = re.compile(r'(?:<script src="[^"]*"></script>\n)+')   # script tags one after another
SCRIPT_SRC = re.compile(r'<script src="([^"]*)"></script>')
INLINE = re.compile(r"<script>(.*?)</script>", re.S)
CSP = re.compile(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)')
LOCAL = re.compile(r"[a-z0-9][a-z0-9._/-]*\.(css|js)")   # a file of this site: no "..", no address, no leading /
# Google Search Console's "HTML file" proof that the site is ours: published only when it is exactly what Google hands
# out (its name, and one line naming it), because an HTML file beside the page is not covered by the page's security
# policy, so any other HTML there could run scripts on the site's address
VERIFY_NAME = re.compile(r"google[0-9a-f]{8,32}\.html")

def _read(root, name, closing):
    """A file the page includes. Only files inside the site folder, and never text that would end the
    <style> or <script> block early (the browser would read the rest as page markup)."""
    if not LOCAL.fullmatch(name) or ".." in name:
        raise ValueError(f"{name}: index.html may only include the site's own .css and .js files")
    with open(os.path.join(root, name), encoding="utf-8") as f:
        text = f.read()
    for bad in (closing, "<!--"):
        if bad in text.lower():
            raise ValueError(f"{name} contains {bad!r}, which would break the published page")
    return text.rstrip("\n")

def _hash(script):
    return "'sha256-" + base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode() + "'"

def build_page(root=HERE):
    """The page visitors get, as text."""
    with open(os.path.join(root, "index.html"), encoding="utf-8") as f:
        page = f.read()
    left = SCRIPT_RUN.sub("", STYLE_LINK.sub("", page))
    if re.search(r"<script(?!>)", left, re.I) or re.search(r"rel\s*=\s*[\"']?stylesheet", left, re.I):
        # anything else would be published as a separate file the policy below blocks, or not published at all
        raise ValueError("index.html has a script or stylesheet tag in another form; write them exactly as "
                         '<script src="js/name.js"></script> and <link rel="stylesheet" href="styles.css">, one per line')
    page = STYLE_LINK.sub(lambda m: "<style>\n" + _read(root, m.group(1), "</style") + "\n</style>\n", page)
    page = SCRIPT_RUN.sub(lambda m: "<script>\n" + "\n\n".join(
        _read(root, src, "</script") for src in SCRIPT_SRC.findall(m.group(0))) + "\n</script>\n", page)
    csp = CSP.search(page)
    if not csp or not re.search(r"(^|;)\s*script-src ", csp.group(2)):
        raise ValueError("index.html needs its Content-Security-Policy <meta> with a script-src")
    hashes = " ".join(_hash(s) for s in INLINE.findall(page))
    policy = re.sub(r"(^|;)(\s*)script-src [^;]*", lambda m: m.group(1) + m.group(2) + "script-src " + hashes, csp.group(2))
    return page[:csp.start(2)] + policy + page[csp.end(2):]

def _fingerprint(page):
    return hashlib.sha256(page.encode("utf-8")).hexdigest()[:12]

def fingerprint(root=HERE):
    """12 characters that change whenever anything in the published page changes."""
    return _fingerprint(build_page(root))

def verification_files(root=HERE):
    """The Google Search Console verification files at the top of the site folder. A file with such a name but any
    other content stops publishing, so a mistake is noticed rather than silently leaving the site unverified."""
    found = sorted(n for n in os.listdir(root) if VERIFY_NAME.fullmatch(n))
    for name in found:
        with open(os.path.join(root, name), encoding="utf-8") as f:
            text = f.read()
        if text.strip() != "google-site-verification: " + name:
            raise ValueError(f"{name} is not a Google verification file (it must hold only the line Google gives)")
    return found

FLAG = re.compile(r"[a-z]{2}(-[a-z]{3})?")

def publish_flags(root, out):
    """The national team flags: flags/flags.json holds them packed (one line per flag, so the repository stays small);
    each is published as flags/<code>.webp, with flag-icons' licence. Only a proper flag code and a WebP picture
    under 20 KB is written."""
    src = os.path.join(root, "flags", "flags.json")
    if not os.path.exists(src):
        return
    with open(src, encoding="utf-8") as f:
        flags = json.load(f)["flags"]
    os.makedirs(os.path.join(out, "flags"), exist_ok=True)
    for code, (_, b64) in flags.items():
        pic = base64.b64decode(b64, validate=True)
        if not FLAG.fullmatch(code) or pic[:4] != b"RIFF" or pic[8:12] != b"WEBP" or len(pic) > 20_000:
            raise ValueError(f"flags/flags.json: {code!r} is not a flag code with a WebP picture under 20 KB")
        with open(os.path.join(out, "flags", code + ".webp"), "wb") as f:
            f.write(pic)
    shutil.copyfile(os.path.join(root, "flags", "LICENSE"), os.path.join(out, "flags", "LICENSE"))

def publish(folder, root=HERE):
    """Writes the published site into `folder`: the page, the data files, the fonts, the sitemap, the link-preview
    picture, the home-screen manifest and icons, the flags and any Google verification file, nothing else."""
    out = os.path.abspath(folder)
    if out == os.path.abspath(root) or os.path.abspath(root).startswith(out + os.sep):
        raise ValueError("publish into a folder of its own (such as _site), never over the source files")
    page = build_page(root)
    os.makedirs(out, exist_ok=True)
    for name in COPY + verification_files(root):
        src, dst = os.path.join(root, name), os.path.join(out, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copyfile(src, dst)
    publish_flags(root, out)
    # the published fixtures.json carries the fingerprint of the page published with it (see the top of this file)
    path = os.path.join(out, "fixtures.json")
    with open(path, encoding="utf-8") as f:
        data = f.read()
    data, found = re.subn(r'(?m)^"site":"[0-9a-f]*"', '"site":"' + _fingerprint(page) + '"', data, count=1)
    if found:
        json.loads(data)                               # still valid JSON, or nothing is published
        save_text(path, data, newline="")
    save_text(os.path.join(out, "index.html"), page, newline="")

if __name__ == "__main__":
    if sys.argv[1:] == ["--page"]:
        sys.stdout.buffer.write(build_page().encode("utf-8"))
    elif len(sys.argv) == 2 and not sys.argv[1].startswith("-"):
        publish(sys.argv[1])
        print(f"Published site written to {sys.argv[1]}/")
    else:
        sys.exit(__doc__)
