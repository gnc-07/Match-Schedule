"""
common.py
Small helpers shared by build_schedule.py, cazetv.py and research.py: downloading
with a size limit, and reading and saving the data files safely.
"""
import json, os, tempfile, urllib.parse, urllib.request

MAX_BYTES = 16 * 1024 * 1024   # no feed this site reads is anywhere near this; a bigger answer is refused
TIMEOUT = 30                   # seconds to wait for a server before giving up
SECRET_HEADERS = {"x-auth-token", "authorization"}   # keys that must only ever reach the server they were meant for

def _origin(url):
    """(scheme, host, port) of an address, with the scheme's usual port filled in: two addresses are the
    same site only if all three match."""
    u = urllib.parse.urlsplit(url)
    return u.scheme, u.hostname, u.port or {"https": 443, "http": 80}.get(u.scheme)

class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    """Python follows redirects and copies every header along, API keys included, to wherever the redirect
    points. This refuses a redirect to anything but https://, and drops the keys if it leaves the original
    site (another host, or the same host on another port)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith("https://"):
            raise ValueError(f"refusing a redirect to a non-HTTPS address: {newurl}")
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and _origin(newurl) != _origin(req.full_url):
            for k in [k for k in new.headers if k.lower() in SECRET_HEADERS]:
                del new.headers[k]
        return new

_OPENER = urllib.request.build_opener(_SafeRedirect)

def fetch(url, headers=None):
    """The body of an HTTPS answer as bytes. Refuses plain http:// (also as a redirect target) and answers
    over MAX_BYTES, so a broken or hostile server cannot fill the build machine's memory."""
    if not url.startswith("https://"):
        raise ValueError(f"refusing to download from a non-HTTPS address: {url}")
    req = urllib.request.Request(url, headers=headers or {})
    with _OPENER.open(req, timeout=TIMEOUT) as r:
        body = r.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError(f"answer from {url} is larger than {MAX_BYTES} bytes")
    return body

def fetch_json(url, headers=None):
    return json.loads(fetch(url, headers))

def load_json(path, default=None):
    """The parsed file, or `default` when the file does not exist (a broken file still raises)."""
    if default is not None and not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save_text(path, text, newline=None):
    """Writes the whole file at once: the text goes to a temporary file that then replaces the old one,
    so a build that stops halfway never leaves a half-written file behind to be committed."""
    folder = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".tmp-", suffix=os.path.basename(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline=newline) as f:
            f.write(text)
        os.chmod(tmp, 0o644)           # temporary files start private; published files must be readable
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise

def save_json(path, data):
    """The layout the hand-edited data files use: one space of indent, accents kept as they are."""
    save_text(path, json.dumps(data, ensure_ascii=False, indent=1))
