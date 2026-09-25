"""
cazetv.py
Finds CazéTV's YouTube live streams and links them to matches in the schedule.

CazéTV streams many (not all) matches free on YouTube, usually for viewers in
Brazil only. Its channel page hides Brazil-only streams from visitors elsewhere
(including GitHub's servers), but the channel's public RSS feed still lists them,
with the title, as soon as a stream is scheduled. The feed only holds the 15
newest uploads, so every stream seen is remembered in streams.json until a few
days after its match; the four daily builds catch each one while it is in the feed.

A stream is linked to a match only when both team names in its title match the
fixture and the dates fit. Anything uncertain is left unlinked.
"""
import json, os, re, unicodedata, urllib.request
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

CHANNEL_ID = "UCZiYbVptd3PVPf4f6eR6UaQ"     # youtube.com/@CazeTV
FEED = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
CACHE = "streams.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36"
KEEP_DAYS = 3                                  # forget a stream this long after its start

# Words that carry no identity ("FC", "de", "Clube"...), removed before comparing names
FILLER = set("fc cf afc sc ec ca cr se rc rcd ud cd fbc fbpa af fr sad club clube de da do del la "
             "the 1 04 05 07 1899 fsv tsg sv vfb bsc".split())

# How CazéTV (in Portuguese) names teams, mapped to words found in the fixture names.
# Keys and values are already in normalised form (lower case, no accents).
ALIASES = {
    # national teams
    "brasil": "brazil", "estados unidos": "united states", "eua": "united states", "alemanha": "germany",
    "espanha": "spain", "franca": "france", "inglaterra": "england", "italia": "italy", "japao": "japan",
    "coreia do sul": "south korea", "coreia do norte": "north korea", "uruguai": "uruguay",
    "paraguai": "paraguay", "equador": "ecuador", "marrocos": "morocco", "holanda": "netherlands",
    "paises baixos": "netherlands", "belgica": "belgium", "croacia": "croatia", "suica": "switzerland",
    "noruega": "norway", "suecia": "sweden", "dinamarca": "denmark", "escocia": "scotland",
    "pais de gales": "wales", "irlanda": "ireland", "polonia": "poland", "turquia": "turkey",
    "egito": "egypt", "arabia saudita": "saudi arabia", "catar": "qatar", "gana": "ghana",
    "camaroes": "cameroon", "costa do marfim": "ivory coast", "africa do sul": "south africa",
    "nova zelandia": "new zealand", "ira": "iran", "iraque": "iraq", "tunisia": "tunisia",
    "argelia": "algeria", "cabo verde": "cape verde", "mexico": "mexico", "canada": "canada",
    "australia": "australia", "india": "india", "benin": "benin", "bolivia": "bolivia",
    "republica tcheca": "czech republic", "grecia": "greece", "hungria": "hungary", "servia": "serbia",
    "ucrania": "ukraine", "romenia": "romania", "eslovaquia": "slovakia", "eslovenia": "slovenia",
    "islandia": "iceland", "finlandia": "finland", "jamaica": "jamaica", "panama": "panama",
    # Brasileirão
    "atletico mg": "mineiro", "atletico mineiro": "mineiro", "galo": "mineiro",
    "athletico pr": "paranaense", "athletico paranaense": "paranaense", "athletico": "paranaense",
    "vasco": "vasco gama", "bragantino": "bragantino", "red bull bragantino": "bragantino",
    "inter": "internacional", "sao paulo": "sao paulo", "vitoria": "vitoria", "remo": "remo",
    # La Liga
    "atletico de madrid": "atletico madrid", "atletico": "atletico madrid", "athletic bilbao": "athletic",
    "barca": "barcelona", "sevilha": "sevilla", "betis": "betis", "real betis": "betis",
    "celta": "celta vigo", "celta de vigo": "celta vigo", "deportivo": "deportivo coruna",
    "deportivo la coruna": "deportivo coruna", "racing": "racing santander", "racing santander": "racing santander",
    "rayo": "rayo vallecano", "alaves": "alaves", "real sociedad": "real sociedad",
    # Bundesliga
    "bayern de munique": "bayern munchen", "bayern munique": "bayern munchen", "bayern": "bayern munchen",
    "colonia": "koln", "leverkusen": "leverkusen", "bayer leverkusen": "leverkusen",
    "gladbach": "monchengladbach", "borussia monchengladbach": "monchengladbach",
    "hamburgo": "hamburger", "hamburg": "hamburger", "frankfurt": "frankfurt", "mainz": "mainz",
    "werder bremen": "werder bremen", "bremen": "werder bremen", "union berlin": "union berlin",
    "dortmund": "dortmund", "borussia dortmund": "dortmund",
    # Premier League
    "manchester united": "manchester united", "man united": "manchester united",
    "manchester city": "manchester city", "man city": "manchester city", "tottenham": "tottenham",
    "newcastle": "newcastle", "brighton": "brighton", "nottingham forest": "nottingham forest",
    "wolves": "wolverhampton", "west ham": "west ham",
}

def norm(s):
    """Lower case, no accents, no punctuation, single spaces."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())

def tokens(name):
    return {w for w in norm(name).split() if w not in FILLER}

def side_tokens(side):
    n = norm(side)
    n = ALIASES.get(n, n)
    return {w for w in n.split() if w not in FILLER}

def teams_from_title(title):
    """'AO VIVO E COM IMAGENS: FLAMENGO X PALMEIRAS | BRASILEIRÃO 2026' -> ('FLAMENGO', 'PALMEIRAS')."""
    if "AO VIVO" not in title.upper():
        return None
    for seg in title.split("|"):
        seg = seg.split(":")[-1]
        parts = re.split(r"\s+[Xx]\s+", seg.strip())
        if len(parts) == 2 and all(parts):
            clean = [re.sub(r"\s+\d+$", "", re.sub(r"^\d+\s+", "", p)).strip() for p in parts]   # drop scores
            return tuple(clean)
    return None

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def scheduled_start(video_id):
    """The stream's scheduled start (UTC ISO string) from its watch page, or None if YouTube will not say."""
    try:
        m = re.search(r'"startTimestamp":"([^"]+)"', get(f"https://www.youtube.com/watch?v={video_id}"))
        return datetime.fromisoformat(m.group(1)).astimezone(timezone.utc).isoformat() if m else None
    except Exception:
        return None

def update_cache(now, path=CACHE):
    """Reads the feed, adds new live-match streams to the cache, drops old ones, saves it."""
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
    known = {s["id"]: s for s in cache}
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    root = ET.fromstring(get(FEED))
    for e in root.findall("a:entry", ns):
        vid, title = e.findtext("yt:videoId", namespaces=ns), e.findtext("a:title", namespaces=ns)
        if not teams_from_title(title):
            continue
        s = known.get(vid)
        if s is None:
            s = known[vid] = {"id": vid, "title": title, "published": e.findtext("a:published", namespaces=ns)}
        s["title"] = title
        if not s.get("start"):
            s["start"] = scheduled_start(vid)
    def keep(s):
        if s.get("start"):
            return datetime.fromisoformat(s["start"]) > now - timedelta(days=KEEP_DAYS)
        return datetime.fromisoformat(s["published"]) > now - timedelta(days=21)
    cache = sorted((s for s in known.values() if keep(s)), key=lambda s: s.get("start") or s["published"])
    json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return cache

def fit(side, team):
    """How well a title side matches a fixture team: 0 (no) up to 1 (same words)."""
    a, b = side_tokens(side), tokens(team)
    if not a or not a <= b:
        return 0
    return len(a) / len(b)

def attach(recs, cache):
    """Adds r['watch'] = {'url', 'title'} to each match a stream belongs to. Returns the count linked."""
    linked = 0
    for s in cache:
        sides = teams_from_title(s["title"])
        if not sides:
            continue
        start = datetime.fromisoformat(s["start"]) if s.get("start") else None
        pub = datetime.fromisoformat(s["published"])
        best = None
        for r in recs:
            kick = datetime.fromisoformat(r["utc"]) if r["utc"] else datetime.fromisoformat(r["date"] + "T15:00:00+00:00")
            if start:
                # streams open up to a few hours before kick-off; a date-only match needs the same day, roughly
                if not timedelta(hours=-1) <= kick - start <= timedelta(hours=4 if r["utc"] else 20):
                    continue
            elif not timedelta(hours=-12) <= kick - pub <= timedelta(days=21):
                continue
            score = min(fit(sides[0], r["home"]), fit(sides[1], r["away"]))
            score = max(score, min(fit(sides[0], r["away"]), fit(sides[1], r["home"])))
            if score and (best is None or score > best[0] or (score == best[0] and kick < best[2])):
                best = (score, r, kick)
        if best and not best[1].get("watch"):
            best[1]["watch"] = {"url": f"https://www.youtube.com/watch?v={s['id']}", "title": s["title"]}
            linked += 1
    return linked

def add_streams(recs, now=None):
    """Called by build_schedule.py. Never stops the build: a problem only means no links this time."""
    now = now or datetime.now(timezone.utc)
    try:
        cache = update_cache(now)
    except Exception as e:
        print(f"CazéTV feed could not be read ({e}); using the streams already known")
        cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else []
    n = attach(recs, cache)
    print(f"CazéTV: {len(cache)} upcoming streams known, {n} linked to matches")
