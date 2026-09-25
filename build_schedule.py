#!/usr/bin/env python3
"""
build_schedule.py
Builds a soccer (and Formula 1) schedule and writes:
  - fixtures.json  (the merged dataset, used by the web page)
  - soccer.ics     (iCalendar feed for Proton Calendar or any calendar app)

Data sources, in order of preference
  1. football-data.org API (free tier). Used when the environment variable
     FOOTBALL_DATA_TOKEN is set. Kick-off times are UTC, and each match has a
     status: TIMED = exact kick-off confirmed, SCHEDULED = date only, time not final.
  2. openfootball/football.json on GitHub (public domain, volunteer-maintained,
     no key needed). Used when there is no token. Times are LOCAL to each league.
  3. friendlies.json: national-team friendlies entered by hand. No free feed
     covers friendlies, so this file has to be edited when matches are announced.
  4. Formula 1: every session from Jolpica-F1, cross-checked against OpenF1 (both free, no key).
     F1 is left out of soccer.ics.

Watch links: cazetv.py adds CazéTV's YouTube live-stream link to the matches it
streams (remembered in streams.json between runs).

Examples
  python3 build_schedule.py
  python3 build_schedule.py --teams "Arsenal,Real Madrid,Brazil" --leagues EPL,BRA
"""
import argparse, json, hashlib, os, sys, urllib.error, urllib.request
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
import cazetv

HOME_TZ = ZoneInfo("America/Edmonton")   # all human-readable times are shown in this zone
OPENFOOTBALL = "https://raw.githubusercontent.com/openfootball/football.json/master"
FD_API = "https://api.football-data.org/v4"

# code: display name, football-data.org code, openfootball file name, season style, league's local time zone
# "split" seasons run August to May (folder "2026-27"); "calendar" seasons run within one year (folder "2026").
LEAGUES = {
    "EPL":  ("Premier League", "PL",  "en.1.json", "split",    "Europe/London"),
    "LIGA": ("La Liga",        "PD",  "es.1.json", "split",    "Europe/Madrid"),
    "BUN":  ("Bundesliga",     "BL1", "de.1.json", "split",    "Europe/Berlin"),
    "BRA":  ("Brasileirão",    "BSA", "br.1.json", "calendar", "America/Sao_Paulo"),
}
MIN_MATCHES = 20   # fewer upcoming league matches than this means something broke: do not publish
KEEP_DAYS = 1      # matches from this many days back stay listed, so the site can show their final score

def season_folders(style, today):
    """Openfootball folder names to try, newest first, so new seasons are picked up automatically."""
    y = today.year
    if style == "calendar":
        return [str(y), str(y - 1)]
    start = y if today.month >= 7 else y - 1          # a split season starting in year `start`
    return [f"{s}-{str(s + 1)[2:]}" for s in (start, start - 1)]

def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def record(comp, code, home, away, day, utc=None, rnd="", venue=None, note=None, uid=None):
    """One match in a common shape. utc is an ISO string, or None when the time is not known."""
    return {"comp": comp, "code": code, "round": rnd, "home": home, "away": away,
            "date": day, "utc": utc, "venue": venue, "note": note, "uid": uid}

# ---------- source 1: football-data.org ----------
def from_football_data(code, name, fd_code, tz, start, token):
    data = get_json(f"{FD_API}/competitions/{fd_code}/matches", {"X-Auth-Token": token})
    out = []
    recent = start - timedelta(days=KEEP_DAYS)
    for m in data["matches"]:
        played = m["status"] in ("IN_PLAY", "PAUSED", "FINISHED")
        if m["status"] not in ("SCHEDULED", "TIMED", "POSTPONED") and not played:
            continue                      # skip cancelled, suspended
        kick = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
        day = kick.astimezone(ZoneInfo(tz)).date()
        if day < (recent if played else start):
            continue
        confirmed = m["status"] == "TIMED" or played
        note = "Postponed; new date not set." if m["status"] == "POSTPONED" else None
        r = record(name, code, m["homeTeam"]["name"], m["awayTeam"]["name"], day.isoformat(),
                   kick.isoformat() if confirmed else None,
                   f"Matchday {m['matchday']}" if m.get("matchday") else "",
                   m.get("venue"), note, uid=f"fd-{m['id']}")
        ft = (m.get("score") or {}).get("fullTime") or {}
        if m["status"] == "FINISHED" and ft.get("home") is not None:
            r["result"] = {"home": ft["home"], "away": ft["away"]}
        elif played:
            r["started"] = True           # on now: the site gets the live score from ESPN
        out.append(r)
    return out

# ---------- source 2: openfootball ----------
def from_openfootball(code, name, filename, style, tz, start):
    data = None
    for folder in season_folders(style, start):
        try:
            data = get_json(f"{OPENFOOTBALL}/{folder}/{filename}"); break
        except urllib.error.HTTPError as e:
            if e.code != 404: raise                     # only "file not there yet" means try the older season
    if data is None:
        print(f"{code}: no openfootball file found"); return []
    out, recent = [], start - timedelta(days=KEEP_DAYS)
    for m in data["matches"]:
        played = "score" in m
        if date.fromisoformat(m["date"]) < (recent if played else start):
            continue
        utc = None
        if m.get("time"):
            local = datetime.fromisoformat(f"{m['date']}T{m['time']}").replace(tzinfo=ZoneInfo(tz))
            utc = local.astimezone(timezone.utc).isoformat()
        r = record(name, code, m["team1"], m["team2"], m["date"], utc, m.get("round", ""), m.get("ground"))
        ft = (m.get("score") or {}).get("ft")
        if played and ft:
            r["result"] = {"home": ft[0], "away": ft[1]}
        out.append(r)
    mark_provisional([r for r in out if "result" not in r])
    return out

def mark_provisional(recs):
    """openfootball fills unannounced kick-offs with a placeholder (e.g. every EPL match
    'Sat 15:00'). If every match in a round shares the identical kick-off, flag it."""
    rounds = {}
    for r in recs:
        if r["utc"]:
            rounds.setdefault(r["round"], []).append(r)
    for group in rounds.values():
        if len(group) >= 5 and len({r["utc"][11:16] for r in group}) == 1:
            for r in group:
                r["provisional"] = True

# ---------- cross-checking: reports from several sources ----------
# friendlies.json and overrides.json store every report found, with its source.
# A kick-off time is CONFIRMED only when an official source (federation, league or club)
# gives it, or when at least two independent sources agree on the same moment.
# One report = "unconfirmed"; reports that disagree = "conflicting". Unconfirmed and
# conflicting matches stay "time TBC" in the calendar, with the reported times listed.

def _utc(date_s, time_s, tz):
    local = datetime.fromisoformat(f"{date_s}T{time_s}").replace(tzinfo=ZoneInfo(tz))
    return local.astimezone(timezone.utc).isoformat()

def resolve(reports):
    """Returns (date, utc or None, check) from a list of reports."""
    dates = [r["date"] for r in reports if r.get("date")]
    official_dates = [r["date"] for r in reports if r.get("official") and r.get("date")]
    day = official_dates[0] if official_dates else max(set(dates), key=dates.count)
    timed = [(r, _utc(r["date"], r["time"], r["tz"])) for r in reports if r.get("time") and r.get("tz")]
    groups = {}
    for r, u in timed:
        groups.setdefault(u, set()).add(r["source"])
    official = [u for r, u in timed if r.get("official")]
    check = {"sources": [{k: r[k] for k in ("source", "url", "time", "tz", "date", "official", "comment") if r.get(k) is not None}
                         for r in reports]}
    if official:
        utc, check["status"] = official[0], "confirmed"
        check["basis"] = "official source"
    elif groups:
        best = max(groups, key=lambda u: len(groups[u]))
        if len(groups[best]) >= 2 and all(len(v) < len(groups[best]) for u, v in groups.items() if u != best):
            utc, check["status"] = best, "confirmed"
            check["basis"] = f"{len(groups[best])} independent sources agree"
        else:
            utc = None
            check["status"] = "conflicting" if len(groups) > 1 else "unconfirmed"
            check["reported"] = sorted(groups)
    else:
        utc, check["status"] = None, "no time reported"
    if len(groups) > 1 and utc:
        check["note"] = "Some sources report a different time; see the source list."
    return day, utc, check

# ---------- source 3: friendlies (hand-maintained, cross-checked) ----------
def from_friendlies(start, path="friendlies.json"):
    out = []
    for f in json.load(open(path, encoding="utf-8")):
        day, utc, check = resolve(f["reports"])
        if date.fromisoformat(day) < start:
            continue
        r = record("International friendly", "INTL", f["team1"], f["team2"], day, utc, venue=f.get("venue"),
                   note=f.get("note"), uid=f"intl|{f['team1']}|{f['team2']}|{f['reports'][0]['date']}")
        r["check"] = check
        out.append(r)
    return out

# ---------- league corrections: fills times the main feed has not caught up with ----------
def apply_overrides(recs, path="overrides.json"):
    if not os.path.exists(path):
        return
    for o in json.load(open(path, encoding="utf-8")):
        hits = [r for r in recs if r["code"] == o["code"]
                and o["home"].lower() in r["home"].lower() and o["away"].lower() in r["away"].lower()]
        if len(hits) != 1:
            print(f"override not matched uniquely: {o['home']} v {o['away']} ({len(hits)} hits)"); continue
        r = hits[0]
        day, utc, check = resolve(o["reports"])
        check["feed"] = {"date": r["date"], "utc": r["utc"]}
        r["check"] = check
        if check["status"] == "confirmed":
            r["date"], r["utc"], r["provisional"] = day, utc, False

# ---------- Formula 1: every session of every race weekend ----------
# Jolpica-F1 (volunteer-run successor to the Ergast API; no key) gives each weekend's session times in UTC.
# OpenF1 lists the same sessions independently; when both agree on a time, resolve() marks it verified.
# Finished races, sprints and qualifying sessions get their top names ("top") for the list.
JOLPICA = "https://api.jolpi.ca/ergast/f1"
OPENF1 = "https://api.openf1.org/v1"
F1_SESSIONS = [("FirstPractice", "FP1"), ("SecondPractice", "FP2"), ("ThirdPractice", "FP3"),
               ("SprintQualifying", "SQ"), ("Sprint", "S"), ("Qualifying", "Q"), (None, "R")]   # None: the race's own date
OPENF1_NAMES = {"FP1": {"practice 1"}, "FP2": {"practice 2"}, "FP3": {"practice 3"},
                "SQ": {"sprint qualifying", "sprint shootout"}, "S": {"sprint"}, "Q": {"qualifying"}, "R": {"race"}}

def _f1_time(d, t):
    """A Jolpica date and time ("15:00:00Z") as a UTC datetime, or None when there is no time yet."""
    return datetime.fromisoformat(f"{d}T{t.rstrip('Z')}").replace(tzinfo=timezone.utc) if t else None

def _f1_top(season, rnd, what, key, n):
    """Family names of the first n drivers in a finished session, or None when there are no results yet."""
    races = get_json(f"{JOLPICA}/{season}/{rnd}/{what}/?limit=100")["MRData"]["RaceTable"]["Races"]
    rows = races[0].get(key, []) if races else []
    return [x["Driver"]["familyName"] for x in rows[:n]] or None

def from_f1(start, now=None):
    """Every F1 session from yesterday on, as records like the football ones (no teams; kind "f1")."""
    now = now or datetime.now(timezone.utc)
    recent = start - timedelta(days=KEEP_DAYS)
    races = get_json(f"{JOLPICA}/{start.year}/races/?limit=100")["MRData"]["RaceTable"]["Races"]
    if not any(date.fromisoformat(r["date"]) >= start for r in races):     # season over: add next year's calendar,
        races = [r for r in races if date.fromisoformat(r["date"]) >= recent] + \
                get_json(f"{JOLPICA}/{start.year + 1}/races/?limit=100")["MRData"]["RaceTable"]["Races"]   # keeping the finale a day
    other = []
    for season in sorted({r["season"] for r in races}):
        try:
            other += get_json(f"{OPENF1}/sessions?year={season}")
        except Exception as e:               # the cross-check is optional: without it times simply stay unverified
            print(f"OpenF1 could not be read for {season} ({e}); those F1 times are not cross-checked this run")
    out = []
    for race in races:
        season, rnd, c = race["season"], race["round"], race["Circuit"]
        loc = c.get("Location", {})
        for key, code in F1_SESSIONS:
            s = race if key is None else race.get(key)
            if not s:
                continue                     # sprint sessions only exist on sprint weekends, FP2 and FP3 only on others
            d, t = s["date"], s.get("time")
            if date.fromisoformat(d) < recent:
                continue
            utc = _f1_time(d, t)
            r = record("Formula 1", "F1", "", "", d, utc.isoformat() if utc else None, rnd,
                       f"{c['circuitName']}, {loc.get('locality', '')}".rstrip(", "), uid=f"f1|{season}|{rnd}|{code}")
            r.update(kind="f1", sess=code, gp=race["raceName"], wk=f"f1|{season}|{rnd}")
            if code == "R":
                r["sprint"] = "Sprint" in race
                r["circuit"] = {"name": c["circuitName"], "locality": loc.get("locality"), "country": loc.get("country"),
                                "lat": float(loc["lat"]), "lon": float(loc["long"])} if loc.get("lat") else {"name": c["circuitName"]}
            if utc:
                match = [o for o in other if (o.get("session_name") or "").lower() in OPENF1_NAMES[code]
                         and o.get("date_start") and abs(datetime.fromisoformat(o["date_start"]) - utc) < timedelta(hours=12)]
                if match:
                    o = datetime.fromisoformat(match[0]["date_start"]).astimezone(timezone.utc)
                    r["check"] = resolve([
                        {"source": "Jolpica-F1", "url": f"{JOLPICA}/{season}/{rnd}/races/", "date": d, "time": t[:5], "tz": "UTC"},
                        {"source": "OpenF1", "url": f"{OPENF1}/sessions?session_key={match[0].get('session_key')}",
                         "date": o.date().isoformat(), "time": o.strftime("%H:%M"), "tz": "UTC"}])[2]
            out.append(r)
    # names for sessions that have finished (only the last weekend or two, so a few requests)
    for r in out:
        done = r["utc"] and datetime.fromisoformat(r["utc"]) + timedelta(hours=1) < now
        if done and r["sess"] in ("R", "S", "Q"):
            season, rnd = r["wk"].split("|")[1:]
            try:
                what, key, n = {"R": ("results", "Results", 3), "S": ("sprint", "SprintResults", 3),
                                "Q": ("qualifying", "QualifyingResults", 1)}[r["sess"]]
                top = _f1_top(season, rnd, what, key, n)
                if top: r["top"] = top
            except Exception as e:
                print(f"F1 results for round {rnd} could not be read ({e})")
    return out

F1_CODES = {code for _, code in F1_SESSIONS}

def _valid_f1(r):
    """True for a well-formed F1 record: reused records are checked, not trusted, before they are published again."""
    try:
        date.fromisoformat(r["date"])
        if r.get("utc") is not None:
            r["utc"] = datetime.fromisoformat(r["utc"]).astimezone(timezone.utc).isoformat()   # normalised, as from_f1 writes it
        return (r.get("code") == "F1" and r.get("kind") == "f1" and r.get("sess") in F1_CODES
                and isinstance(r.get("gp"), str) and str(r.get("wk", "")).startswith("f1|") and r.get("uid", "").startswith(r["wk"]))
    except (KeyError, TypeError, ValueError, AttributeError):
        return False

def previous_f1(start, path="fixtures.json"):
    """The F1 sessions from the last published fixtures.json: used when Jolpica-F1 cannot be reached."""
    try:
        old = json.load(open(path, encoding="utf-8"))["matches"]
    except Exception:
        return []
    recent = (start - timedelta(days=KEEP_DAYS)).isoformat()
    return [r for r in old if isinstance(r, dict) and _valid_f1(r) and r["date"] >= recent]

SOURCES = {}   # which source each league came from, recorded in fixtures.json
F1_STALE = False   # True when Jolpica-F1 failed and the F1 sessions are the previous build's (the site says so)

def load_all(start):
    global F1_STALE
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    out = []
    for code, (name, fd_code, filename, style, tz) in LEAGUES.items():
        if token:
            try:
                out += from_football_data(code, name, fd_code, tz, start, token)
                SOURCES[code] = "football-data.org"; continue
            except Exception as e:           # API down or rate-limited: fall back rather than fail
                print(f"football-data.org failed for {code} ({e}); using openfootball")
        out += from_openfootball(code, name, filename, style, tz, start)
        SOURCES[code] = "openfootball"
    apply_overrides(out)
    out = [r for r in out if date.fromisoformat(r["date"]) >= start or "result" in r or r.get("started")]
    out += from_friendlies(start)
    SOURCES["INTL"] = "friendlies.json (hand-maintained, cross-checked)"
    try:
        f1 = from_f1(start)
        SOURCES["F1"] = "Jolpica-F1" + (" and OpenF1" if any(r.get("check") for r in f1) else "")
    except Exception as e:                   # F1 must never stop the football schedule from publishing
        print(f"Jolpica-F1 failed ({e}); keeping the F1 sessions already published")
        F1_STALE = True
        f1 = previous_f1(start)
        SOURCES["F1"] = "Jolpica-F1"
    out += f1
    out.sort(key=lambda r: (r["utc"] or r["date"] + "T99"))
    return out

def apply_filters(recs, leagues=None, teams=None):
    if leagues:
        recs = [r for r in recs if r["code"] in leagues]
    if teams:
        t = [x.lower() for x in teams]
        recs = [r for r in recs if any(x in r["home"].lower() or x in r["away"].lower() for x in t)]
    return recs

# ---------- iCalendar writer (RFC 5545) ----------
def esc(s):
    return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")

def fold(line):  # lines longer than 75 bytes must be folded
    b, out = line.encode(), []
    while len(b) > 75:
        cut = 75
        while (b[cut] & 0xC0) == 0x80: cut -= 1
        out.append(b[:cut].decode()); b = b" " + b[cut:]
    out.append(b.decode()); return "\r\n".join(out)

def edmonton(utc_iso):
    t = datetime.fromisoformat(utc_iso).astimezone(HOME_TZ)
    return t.strftime("%a %d %b %Y, %I:%M %p ") + t.tzname()   # e.g. "Sat 10 Oct 2026, 05:30 AM MDT"

def ics(recs, alarm_min=30):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GS//Soccer schedule//EN",
         "CALSCALE:GREGORIAN", "X-WR-CALNAME:Soccer", "X-WR-TIMEZONE:America/Edmonton"]
    for r in recs:
        key = r.get("uid") or f"{r['code']}|{r['home']}|{r['away']}|{r['round'] or r['date']}"
        uid = hashlib.sha1(key.encode()).hexdigest()
        summary = f"{r['home']} vs {r['away']} ({r['comp']})"
        desc = f"{r['comp']} {r['round']}".strip()
        if r["utc"]:
            desc += f"\nKick-off: {edmonton(r['utc'])} (Edmonton)"
        if r["note"]: desc += f"\n{r['note']}"
        c = r.get("check")
        if c:
            if c["status"] == "confirmed":
                desc += f"\nTime verified: {c['basis']}."
            elif c.get("reported"):
                desc += f"\nTime {c['status']}. Reported: " + "; ".join(edmonton(u) for u in c["reported"]) + " (Edmonton)."
            if c.get("note"): desc += "\n" + c["note"]
            for src in c["sources"]:
                if src.get("url"): desc += f"\n- {src['source']}: {src['url']}"
        if r.get("watch", {}).get("kind") == "planned":
            desc += f"\nOn CazéTV's schedule; stream link not created yet (YouTube, usually Brazil only): {r['watch']['url']}"
        elif r.get("watch"):
            desc += f"\nWatch free on CazéTV (YouTube, Brazil only): {r['watch']['url']}"
        if r.get("provisional"):
            summary = "[time provisional] " + summary
            desc += "\nLeague placeholder time; TV kick-off not announced yet."
        if not r["utc"]:
            summary = "[time TBC] " + summary
            desc += "\nKick-off time not confirmed yet. This event updates when it is."
        L += ["BEGIN:VEVENT", f"UID:{uid}@soccer-schedule", f"DTSTAMP:{stamp}", f"SUMMARY:{esc(summary)}"]
        if r["utc"]:
            s = datetime.fromisoformat(r["utc"]).astimezone(timezone.utc)
            L += [f"DTSTART:{s:%Y%m%dT%H%M%SZ}", f"DTEND:{s + timedelta(minutes=115):%Y%m%dT%H%M%SZ}"]
        else:
            d = date.fromisoformat(r["date"])
            L += [f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}"]
        if r["venue"]: L.append(f"LOCATION:{esc(r['venue'])}")
        L.append(f"DESCRIPTION:{esc(desc)}")
        if r["utc"] and alarm_min:
            L += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(summary)}",
                  f"TRIGGER:-PT{alarm_min}M", "END:VALARM"]
        L.append("END:VEVENT")
    L.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in L) + "\r\n"

def write_fixtures(meta, path="fixtures.json"):
    """Compact JSON, one match per line, leaving out empty venue and note fields: about a quarter smaller
    for visitors to download and read, while git (and the workflow's change check) still sees each match,
    and the "generated" time, on a line of its own."""
    one = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    head = [one(k) + ":" + one(v) for k, v in meta.items() if k != "matches"]
    rows = [one({k: v for k, v in r.items() if not (v is None and k in ("venue", "note"))}) for r in meta["matches"]]
    with open(path, "w", encoding="utf-8") as f:
        f.write("{" + ",\n".join(head) + ',\n"matches":[\n' + ",\n".join(rows) + "\n]}\n")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=datetime.now(HOME_TZ).date().isoformat())
    ap.add_argument("--leagues", help="comma list of EPL,LIGA,BUN,BRA,INTL,F1")
    ap.add_argument("--teams", help="comma list of team-name fragments")
    ap.add_argument("--out", default="soccer.ics")
    a = ap.parse_args()
    recs = load_all(date.fromisoformat(a.start))
    league_count = sum(1 for r in recs if r["code"] not in ("INTL", "F1") and "result" not in r and not r.get("started"))
    if league_count < MIN_MATCHES:
        # exiting with an error stops the workflow before it publishes, so the last good site stays up
        sys.exit(f"Only {league_count} upcoming league matches found; refusing to publish. Check the data sources.")
    cazetv.add_streams([r for r in recs if r["code"] != "F1"])   # CazéTV links are for football matches
    recs = apply_filters(recs, a.leagues and a.leagues.split(","), a.teams and a.teams.split(","))
    # "site" fingerprints index.html, so a page left open can tell the site itself was updated and reload
    site = hashlib.sha256(open("index.html", "rb").read()).hexdigest()[:12]
    meta = {"generated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "site": site,
            "sources": SOURCES, "matches": recs}
    if F1_STALE:
        meta["f1stale"] = True
    write_fixtures(meta)
    open(a.out, "w", newline="", encoding="utf-8").write(ics([r for r in recs if r["code"] != "F1"]))   # the calendar stays football-only
    print(f"{len(recs)} matches -> {a.out}")
