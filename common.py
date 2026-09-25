"""
common.py
Small helpers shared by build_schedule.py, cazetv.py and research.py: downloading
with a size limit, and reading and saving the data files safely.
"""
import json, os, tempfile, urllib.request

MAX_BYTES = 16 * 1024 * 1024   # no feed this site reads is anywhere near this; a bigger answer is refused
TIMEOUT = 30                   # seconds to wait for a server before giving up

def fetch(url, headers=None):
    """The body of an HTTPS answer as bytes. Refuses plain http:// and answers over MAX_BYTES,
    so a broken or hostile server cannot fill the build machine's memory."""
    if not url.startswith("https://"):
        raise ValueError(f"refusing to download from a non-HTTPS address: {url}")
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
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
