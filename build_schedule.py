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
     nations_league.json: UEFA Nations League matches, entered by hand the same way.
  Both league sources also give every result of the season so far, from which a backup league table is
  worked out (standings() below) for when ESPN's tables cannot be reached.
  4. Formula 1: every session from Jolpica-F1, cross-checked against OpenF1 (both free, no key).
     F1 is left out of soccer.ics. Track outlines for the race weekend panel come from
     bacinger/f1-circuits on GitHub (MIT licence).

Watch links: cazetv.py adds CazéTV's YouTube live-stream link to the matches it
streams (remembered in streams.json between runs).

Examples
  python3 build_schedule.py
  python3 build_schedule.py --teams "Arsenal,Real Madrid,Brazil" --leagues EPL,BRA
"""
import argparse, json, hashlib, math, os, re, sys, urllib.error
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
import cazetv, publish_site
from common import fetch, fetch_json, load_json, save_text

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
    return fetch_json(url, headers)

def record(comp, code, home, away, day, utc=None, rnd="", venue=None, note=None, uid=None):
    """One match in a common shape. utc is an ISO string, or None when the time is not known."""
    return {"comp": comp, "code": code, "round": rnd, "home": home, "away": away,
            "date": day, "utc": utc, "venue": venue, "note": note, "uid": uid}

# ---------- source 1: football-data.org ----------
def from_football_data(code, name, fd_code, tz, start, token):
    """Returns (records, results): the matches to list, and every finished match of the season for standings()."""
    data = get_json(f"{FD_API}/competitions/{fd_code}/matches", {"X-Auth-Token": token})
    out, results = [], []
    recent = start - timedelta(days=KEEP_DAYS)
    for m in data["matches"]:
        played = m["status"] in ("IN_PLAY", "PAUSED", "FINISHED")
        ft = (m.get("score") or {}).get("fullTime") or {}
        if m["status"] == "FINISHED" and ft.get("home") is not None:
            results.append((m["homeTeam"]["name"], m["awayTeam"]["name"], ft["home"], ft["away"]))
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
        if m["status"] == "FINISHED" and ft.get("home") is not None:
            r["result"] = {"home": ft["home"], "away": ft["away"]}
        elif played:
            r["started"] = True           # on now: the site gets the live score from ESPN
        out.append(r)
    return out, results

# ---------- source 2: openfootball ----------
def from_openfootball(code, name, filename, style, tz, start):
    """Returns (records, results), like from_football_data. Results come only from this season's file: when it
    does not exist yet, the last season's file still gives the matches, but its results are not this season's table."""
    data = None
    folders = season_folders(style, start)
    for folder in folders:
        try:
            data = get_json(f"{OPENFOOTBALL}/{folder}/{filename}"); break
        except urllib.error.HTTPError as e:
            if e.code != 404: raise                     # only "file not there yet" means try the older season
    if data is None:
        print(f"{code}: no openfootball file found"); return [], []
    current = folder == folders[0]
    out, results, recent = [], [], start - timedelta(days=KEEP_DAYS)
    for m in data["matches"]:
        ft = _ft(m.get("score"))
        played = ft is not None
        if played and current:
            results.append((m["team1"], m["team2"], ft[0], ft[1]))
        if date.fromisoformat(m["date"]) < (recent if played else start):
            continue
        utc = None
        if m.get("time"):
            local = datetime.fromisoformat(f"{m['date']}T{m['time']}").replace(tzinfo=ZoneInfo(tz))
            utc = local.astimezone(timezone.utc).isoformat()
        # the feed has no match ids: this key is the one ics() used for these matches before they had a uid, so
        # calendar entries keep their ids (the page hides a match's "Match details" button when it has no uid)
        rnd = m.get("round", "")
        r = record(name, code, m["team1"], m["team2"], m["date"], utc, rnd, m.get("ground"),
                   uid=f"{code}|{m['team1']}|{m['team2']}|{rnd or m['date']}")
        if played:
            r["result"] = {"home": ft[0], "away": ft[1]}
        out.append(r)
    mark_provisional([r for r in out if "result" not in r])
    return out, results

# ---------- backup league tables ----------
def standings(results):
    """A league table worked out from finished matches, given as (home, away, home goals, away goals):
    3 points a win and 1 a draw, then goal difference, then goals scored. Leagues break exact ties in
    their own ways (head-to-head, number of wins) and the feeds do not carry points deductions, so the
    page uses this only when ESPN's table cannot be reached, and says it is worked out from results."""
    rows = {}
    for home, away, hg, ag in results:
        if not (isinstance(hg, int) and isinstance(ag, int)):
            continue
        for team, f, a in ((home, hg, ag), (away, ag, hg)):
            t = rows.setdefault(team, {"team": team, "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0})
            t["p"] += 1; t["gf"] += f; t["ga"] += a
            t["w" if f > a else "d" if f == a else "l"] += 1
    for t in rows.values():
        t["gd"] = t["gf"] - t["ga"]
        t["pts"] = 3 * t["w"] + t["d"]
    table = sorted(rows.values(), key=lambda t: (-t["pts"], -t["gd"], -t["gf"], t["team"]))
    for i, t in enumerate(table, 1):
        t["rank"] = i
    return table

def _ft(score):
    """The full-time score from an openfootball match as [home, away], or None when it has not been played.
    The feed usually writes {"ft": [2, 1], "ht": [1, 0]}, but some results (often 0-0) as a bare [0, 0],
    and matches not yet played as null or with no score at all."""
    ft = score.get("ft") if isinstance(score, dict) else score
    if isinstance(ft, list) and len(ft) == 2 and all(isinstance(x, int) for x in ft):
        return ft
    return None

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
    if not dates:
        raise ValueError("every match needs at least one report with a date")
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

# ---------- source 3: national-team matches (hand-maintained, cross-checked) ----------
# code: file, competition name. Each file lists matches as team1, team2, venue, note, round and reports.
HAND_KEPT = {
    "INTL": ("friendlies.json", "International friendly"),
    "UNL":  ("nations_league.json", "UEFA Nations League"),
}

def from_hand_kept(start, code, path=None):
    """The matches in one hand-kept file from `start` on, each timed through resolve()."""
    default, comp = HAND_KEPT[code]
    out = []
    for f in load_json(path or default):
        day, utc, check = resolve(f["reports"])
        if date.fromisoformat(day) < start:
            continue
        r = record(comp, code, f["team1"], f["team2"], day, utc, rnd=f.get("round", ""), venue=f.get("venue"),
                   note=f.get("note"), uid=f"{code.lower()}|{f['team1']}|{f['team2']}|{f['reports'][0]['date']}")
        r["check"] = check
        out.append(r)
    return out

# ---------- league corrections: fills times the main feed has not caught up with ----------
def apply_overrides(recs, path="overrides.json"):
    for o in load_json(path, []):
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

# Track outlines: the f1-circuits project (https://github.com/bacinger/f1-circuits, MIT licence,
# Copyright (c) 2019-2025 Tomislav Bacinger) draws each circuit as a line of map points that starts on the
# start/finish line. Each race gets its circuit's outline as a small SVG path (north up, fitted into a
# 1000-unit square), so the site can draw it without another download.
F1_LAYOUTS = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"

def _point(p):
    """A GeoJSON position as (longitude, latitude), or None when it is not one (an altitude, if any, is dropped)."""
    if not isinstance(p, (list, tuple)) or len(p) < 2:
        return None
    x, y = p[0], p[1]
    ok = all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (x, y))
    return (x, y) if ok and -180 <= x <= 180 and -90 <= y <= 90 else None

def _f1_layouts():
    """Every well-formed outline in the f1-circuits file, as {"points", "props"}, or [] when it cannot be read
    (the site then shows a map instead). An outline with a malformed position is skipped, never matched."""
    try:
        out = []
        for f in get_json(F1_LAYOUTS)["features"]:
            g = (f or {}).get("geometry") or {}
            pts = [_point(p) for p in g.get("coordinates") or []] if g.get("type") == "LineString" else []
            if len(pts) > 3 and None not in pts:
                out.append({"points": pts, "props": f.get("properties") or {}})
        return out
    except Exception as e:
        print(f"F1 track outlines could not be read ({e}); race weekends show a map instead this run")
        return []

# The second source of track outlines, used for a race the first one has no outline for: julesr0y/f1-circuits-svg
# (CC BY 4.0, Copyright (c) 2024-2026 ROY Jules; unofficial). Its index gives each circuit's position and which
# layout was used in which seasons; each layout is an SVG drawing, north up, with the start/finish line marked.
F1_SVG = "https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/"
SVG_TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
SVG_ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}

def _svg_points(d, steps=8, step=5):
    """The points along an SVG path's first shape (up to its first Z): curves sampled at `steps` points each,
    straight lines every `step` units (so a start/finish line on a long straight is found where it is, not at
    the straight's end). Arcs are followed as straight lines to their end point. Raises ValueError on anything
    malformed."""
    toks, i, out = SVG_TOKEN.findall(d), 0, []
    x = y = 0.0
    cmd, last_ctrl = None, None
    if not toks or toks[0] not in "Mm":
        raise ValueError("path does not start with a move")
    def line(nx, ny):
        n = max(1, math.ceil(math.hypot(nx - x, ny - y) / step))
        out.extend((x + (nx - x) * k / n, y + (ny - y) * k / n) for k in range(1, n + 1))
    def bez(p0, *ctrl):
        for k in range(1, steps + 1):
            t = k / steps
            if len(ctrl) == 3:    # cubic
                (x1, y1), (x2, y2), (x3, y3) = ctrl
                a, b, c, e = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                out.append((a * p0[0] + b * x1 + c * x2 + e * x3, a * p0[1] + b * y1 + c * y2 + e * y3))
            else:                 # quadratic
                (x1, y1), (x2, y2) = ctrl
                a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
                out.append((a * p0[0] + b * x1 + c * x2, a * p0[1] + b * y1 + c * y2))
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in "Zz":
                if out:
                    line(*out[0])                  # the closing side, back to where the shape began
                break                          # one closed shape: the track
        if cmd is None:
            raise ValueError("path does not start with a command")
        n, rel = SVG_ARGS[cmd.upper()], cmd.islower()
        v = [float(t) for t in toks[i:i + n]]
        if len(v) < n or not all(math.isfinite(t) for t in v):
            raise ValueError("path ends early")
        i += n
        U, ox, oy = cmd.upper(), (x if rel else 0), (y if rel else 0)
        ctrl = None
        if U == "M":
            if out:
                break                          # a second shape: stop at the first
            x, y = v[0] + ox, v[1] + oy; out.append((x, y))
            cmd = "l" if rel else "L"          # numbers after a move are lines
        elif U in "LT":
            line(v[0] + ox, v[1] + oy); x, y = v[0] + ox, v[1] + oy
        elif U == "H":
            line(v[0] + ox, y); x = v[0] + ox
        elif U == "V":
            line(x, v[0] + oy); y = v[0] + oy
        elif U == "A":
            line(v[5] + ox, v[6] + oy); x, y = v[5] + ox, v[6] + oy
        elif U == "C":
            c1, c2, e = (v[0] + ox, v[1] + oy), (v[2] + ox, v[3] + oy), (v[4] + ox, v[5] + oy)
            bez((x, y), c1, c2, e); ctrl, (x, y) = c2, e
        elif U == "S":
            c1 = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
            c2, e = (v[0] + ox, v[1] + oy), (v[2] + ox, v[3] + oy)
            bez((x, y), c1, c2, e); ctrl, (x, y) = c2, e
        elif U == "Q":
            c1, e = (v[0] + ox, v[1] + oy), (v[2] + ox, v[3] + oy)
            bez((x, y), c1, e); (x, y) = e
        last_ctrl = ctrl
    return out

def _svg_circuits():
    """The second source's index: [{"lat", "lon", "layouts", "firstgp"}], or [] when it cannot be read."""
    try:
        out = []
        for c in get_json(F1_SVG + "circuits.json"):
            lat, lon = c.get("latitude"), c.get("longitude")
            if _point([lon, lat]) is None:
                continue
            ls = [l for l in c.get("layouts") or [] if isinstance(l, dict) and re.fullmatch(r"[a-z0-9-]{1,60}", str(l.get("layoutId", "")))
                  and isinstance(l.get("seasons"), str)]
            years = [int(y) for l in ls for y in re.findall(r"\d{4}", l["seasons"])]
            if ls:
                out.append({"lat": lat, "lon": lon, "layouts": ls, "firstgp": min(years) if years else None,
                            "words": _name_words(str(c.get("name", "")) + " " + str(c.get("id", "")))})
        return out
    except Exception as e:
        print(f"Second F1 track source could not be read ({e})")
        return []

NAME_STOP = {"circuit", "circuito", "street", "international", "internacional", "internazionale", "autodromo", "autódromo",
             "racing", "raceway", "speedway", "motor", "grand", "prix", "course", "park", "city"}

def _name_words(name):
    """The distinctive words of a circuit's name, for telling apart two circuits in the same city."""
    return {w for w in re.findall(r"\w+", name.lower().replace("-", " ")) if len(w) > 3 and w not in NAME_STOP}

def _last_year(seasons):
    return max((int(y) for y in re.findall(r"\d{4}", seasons)), default=0)

def _in_seasons(seasons, year):
    """True when `year` is in a seasons string such as "2003-2019,2021-2026" or "2021,2023-2026"."""
    for part in seasons.split(","):
        a, _, b = part.strip().partition("-")
        if a.isdigit() and (int(a) == year if not b else b.isdigit() and int(a) <= year <= int(b)):
            return True
    return False

def _svg_drawing(circuits, lat, lon, year, name=""):
    """The second source's drawing of the circuit at (lat, lon), as (points, circuit): the points of the lap in
    drawing units, starting at the start/finish line; or None. A circuit within 3 km is taken; one up to 10 km
    away only when its name shares a word with `name` (that index places some street circuits in the town
    centre: Las Vegas, 7 km from the Strip). Only the detailed drawings mark the start/finish line, so a layout
    without one gives None rather than a start in the wrong place."""
    k = math.cos(math.radians(lat))
    near = lambda c: math.hypot((c["lon"] - lon) * k, c["lat"] - lat) * 111.2   # km
    words = _name_words(name)
    fits = [c for c in circuits if near(c) <= 3 or (near(c) <= 10 and c["words"] & words)]
    best = min(fits, key=lambda c: (not (c["words"] & words), near(c)), default=None)   # a name match first
    if best is None:
        return None
    ls = best["layouts"]
    layout = next((l for l in ls if _in_seasons(l["seasons"], year)), None) or max(ls, key=lambda l: _last_year(l["seasons"]))
    try:
        svg = fetch(F1_SVG + f"circuits/detailed/white/{layout['layoutId']}.svg").decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None                        # drawn without the start/finish line only
        raise
    paths = re.findall(r'<path\b[^>]*?\sd="([^"]*)"', svg)
    if len(paths) < 2:
        return None
    pts = _svg_points(paths[0])
    if len(pts) < 20:
        return None
    if math.dist(pts[0], pts[-1]) < 1e-6:
        pts.pop()                              # the loop is closed with "Z" instead
    # the detailed drawing's second shape is a short bar across the track: the start/finish line
    bar = _svg_points(paths[1], 1)
    cx, cy = sum(p[0] for p in bar) / len(bar), sum(p[1] for p in bar) / len(bar)
    at = min(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - cx, pts[i][1] - cy))
    return pts[at:] + pts[:at], best

def _svg_outline(circuits, lat, lon, year, name=""):
    """The outline of the circuit at (lat, lon) from the second source, or None."""
    got = _svg_drawing(circuits, lat, lon, year, name)
    return _svg_layout(got) if got else None

def _svg_layout(got):
    """A drawing from _svg_drawing() in the same form as _f1_outline gives (without the lap length, which that
    source does not have)."""
    pts, best = got
    x0, y0 = min(x for x, _ in pts), min(y for _, y in pts)
    scale = 1000 / max(max(x for x, _ in pts) - x0, max(y for _, y in pts) - y0)
    pts = _simplify([(round((x - x0) * scale), round((y - y0) * scale)) for x, y in pts], 2)
    pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    return {"path": "M" + "L".join(f"{x} {y}" for x, y in pts) + "Z",
            "w": max(x for x, _ in pts), "h": max(y for _, y in pts),
            "length": None, "firstgp": str(best["firstgp"]) if best["firstgp"] else None, "src": "julesr0y"}

def _simplify(pts, tol):
    """Ramer-Douglas-Peucker: keep only the points that bend the line by more than tol, so the path stays small."""
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        seg = math.hypot(bx - ax, by - ay)
        far, far_d = None, tol
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / seg if seg else math.hypot(px - ax, py - ay)
            if d > far_d:
                far, far_d = i, d
        if far is not None:
            keep.add(far); stack += [(a, far), (far, b)]
    return [pts[i] for i in sorted(keep)]

def _resample(pts, n):
    """n points evenly spaced along a closed loop, starting at its first point."""
    loop = pts + [pts[0]]
    seg = [math.dist(loop[i], loop[i + 1]) for i in range(len(pts))]
    total, out, i, done = sum(seg), [], 0, 0.0
    for k in range(n):
        d = total * k / n
        while i < len(seg) - 1 and done + seg[i] < d:
            done += seg[i]; i += 1
        t = (d - done) / seg[i] if seg[i] else 0
        (ax, ay), (bx, by) = loop[i], loop[i + 1]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out

def _centred(pts):
    """The points moved to their centre and scaled to an average distance of 1 from it, and how."""
    cx, cy = sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts)
    r = math.sqrt(sum((x - cx) ** 2 + (y - cy) ** 2 for x, y in pts) / len(pts)) or 1
    return [((x - cx) / r, (y - cy) / r) for x, y in pts], (cx, cy, r)

# How closely a drawing must fit an outline (average gap to the outline, in track radii) to lend it its
# start/finish line. Measured on the 2026 circuits: Silverstone 0.004, Monaco 0.012, the others that fit well
# 0.014 or less; Baku's drawing has other proportions (0.043) and would put the line in the wrong place, and
# the fits from Austin (0.026) up could not be confirmed, so those keep the outline's own first point.
MATCH_LIMIT = 0.015

def _start_index(track, drawing):
    """Where on `track` (outline points, y pointing south) the start/finish line is, taken from `drawing` (points
    starting at the start/finish line, in any size, turn or mirror image): the index of the outline point
    nearest the drawing's start once the drawing is turned, flipped and scaled to fit the outline best.
    None when no fit is close enough (for example two different layouts of the same circuit)."""
    fit, at = _fit(track, drawing)
    return at if fit <= MATCH_LIMIT else None

def _fit(track, drawing, n=100):
    """(average gap between the best-fitting drawing and the outline, in track radii; the index for _start_index)."""
    A, (cx, cy, r) = _centred(_resample(track, n))
    B, _ = _centred(_resample(drawing, n))
    segs = [(ax, ay, bx - ax, by - ay, (bx - ax) ** 2 + (by - ay) ** 2 or 1e-12)
            for (ax, ay), (bx, by) in zip(A, A[1:] + A[:1])]
    def to_line(u, v):                         # squared distance from (u, v) to the outline, a closed line
        best = math.inf
        for ax, ay, dx, dy, dd in segs:
            t = min(1.0, max(0.0, ((u - ax) * dx + (v - ay) * dy) / dd))
            best = min(best, (u - ax - t * dx) ** 2 + (v - ay - t * dy) ** 2)
        return best
    def gap(turn, flip):
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        total = 0.0
        for x, y in B:
            x = -x if flip else x
            total += to_line(x * c - y * s, x * s + y * c)
        return total / n
    fits = [(gap(t, f), t, f) for f in (False, True) for t in range(0, 360, 10)]
    _, t0, f0 = min(fits)
    best = min((gap(t, f0), t, f0) for t in range(t0 - 9, t0 + 10))     # then to the nearest degree
    x, y = B[0]
    x = -x if best[2] else x
    c, s = math.cos(math.radians(best[1])), math.sin(math.radians(best[1]))
    sx, sy = (x * c - y * s) * r + cx, (x * s + y * c) * r + cy          # the drawing's start, on the outline's scale
    return math.sqrt(best[0]), min(range(len(track)), key=lambda i: math.hypot(track[i][0] - sx, track[i][1] - sy))

def _f1_outline(layouts, lat, lon, drawing=None):
    """The outline of the circuit at (lat, lon): {"path", "w", "h", "length" (metres), "firstgp"}, or None
    when no outline lies within 3 km (a new circuit the project has not drawn yet). The outline starts where
    the start/finish line is: f1-circuits does not say where its outlines begin, so the line is taken from
    `drawing` (from _svg_drawing()) when one is given and fits; otherwise the outline's own first point is used."""
    k = math.cos(math.radians(lat))
    near = lambda f: min(math.hypot((x - lon) * k, y - lat) for x, y in f["points"]) * 111.2   # km
    best = min(layouts, key=near, default=None)
    if best is None or near(best) > 3:
        return None
    pts = [((x - lon) * k * 111320, (lat - y) * 110574) for x, y in best["points"]]   # metres, y pointing south
    if pts[0] == pts[-1]:
        pts.pop()                            # the loop is closed with "Z" instead
    at = _start_index(pts, drawing) if drawing else None
    if at:
        pts = pts[at:] + pts[:at]
    x0, y0 = min(x for x, _ in pts), min(y for _, y in pts)
    scale = 1000 / max(max(x for x, _ in pts) - x0, max(y for _, y in pts) - y0)
    pts = _simplify([(round((x - x0) * scale), round((y - y0) * scale)) for x, y in pts], 2)
    props = best["props"]
    return {"path": "M" + "L".join(f"{x} {y}" for x, y in pts) + "Z",
            "w": max(x for x, _ in pts), "h": max(y for _, y in pts),
            "length": props.get("length"), "firstgp": props.get("firstgp")}

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
    # OpenF1 groups sessions by race weekend ("meeting"). Each Grand Prix is paired with the meeting whose race starts
    # closest to it (weekends are at least a week apart), so sessions are then matched by name alone, however far apart
    # the two sources' times are: a big disagreement still reaches resolve() and shows as conflicting.
    meetings = {}
    for o in other:
        if o.get("meeting_key") is not None and o.get("date_start"):
            meetings.setdefault(o["meeting_key"], []).append(o)
    def meeting_of(race):
        when = _f1_time(race["date"], race.get("time")) or datetime.fromisoformat(race["date"] + "T12:00:00+00:00")
        best = None
        for key, ss in meetings.items():
            rs = [datetime.fromisoformat(o["date_start"]) for o in ss if (o.get("session_name") or "").lower() == "race"]
            gap = min((abs(t - when) for t in rs), default=None)
            if gap is not None and gap < timedelta(days=4) and (best is None or gap < best[0]):
                best = (gap, ss)
        return best[1] if best else []
    layouts, saved, svg = _f1_layouts(), previous_layouts(), None
    out = []
    for race in races:
        season, rnd, c = race["season"], race["round"], race["Circuit"]
        weekend = meeting_of(race)
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
                # The diagram is optional: a problem with it never holds up the F1 sessions. Outlines in order:
                # f1-circuits, starting at the start/finish line marked on the f1-circuits-svg drawing when the two
                # fit; else the one this race had at the last build (always north up); else the f1-circuits-svg
                # drawing itself (not always north up); else none, and the site shows a map.
                layout = drawing = None
                if loc.get("lat"):
                    lat, lon = float(loc["lat"]), float(loc["long"])
                    try:
                        svg = _svg_circuits() if svg is None else svg
                        drawing = _svg_drawing(svg, lat, lon, int(season), c["circuitName"]) if svg else None
                    except Exception as e:
                        print(f"No f1-circuits-svg drawing for {c['circuitName']} ({e})")
                    try:
                        layout = _f1_outline(layouts, lat, lon, drawing and drawing[0]) if layouts else None
                    except (ValueError, ZeroDivisionError) as e:
                        print(f"No f1-circuits outline for {c['circuitName']} ({e})")
                    layout = layout or saved.get(f"f1|{season}|{rnd}")
                    if not layout and drawing:
                        try:
                            layout = _svg_layout(drawing)
                            layout = layout if _valid_layout(layout) else None
                        except (ValueError, ZeroDivisionError) as e:
                            print(f"No f1-circuits-svg outline for {c['circuitName']} ({e}); the site shows a map instead")
                if layout:
                    r["circuit"]["layout"] = layout
            if utc:
                match = [o for o in weekend if (o.get("session_name") or "").lower() in OPENF1_NAMES[code]]
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
                and isinstance(r.get("gp"), str) and str(r.get("wk", "")).startswith("f1|") and r.get("uid") == f"{r['wk']}|{r['sess']}")
    except (KeyError, TypeError, ValueError, AttributeError):
        return False

def _valid_layout(L):
    """True for an outline the page can draw: whole-number points only, a sensible size, and plain extras."""
    return (isinstance(L, dict) and isinstance(L.get("path"), str) and re.fullmatch(r"M[\d LZ]+", L["path"]) is not None
            and len(L["path"]) < 20000 and all(isinstance(L.get(k), int) and 0 < L[k] <= 1000 for k in ("w", "h"))
            and L.get("src") in (None, "julesr0y")
            and all(L.get(k) is None or isinstance(L[k], (int, str)) and len(str(L[k])) < 20 for k in ("length", "firstgp")))

def previous_layouts(path="fixtures.json"):
    """Track outlines from the last published fixtures.json, by race weekend ("f1|2026|18"): used when neither
    outline source can give one this run. Checked like everything else read back from that file."""
    try:
        old = load_json(path)["matches"]
    except Exception:
        return {}
    out = {}
    for r in old:
        L = ((r or {}).get("circuit") or {}).get("layout") if isinstance(r, dict) and isinstance(r.get("circuit"), dict) else None
        if r and r.get("sess") == "R" and isinstance(r.get("wk"), str) and _valid_layout(L):
            out[r["wk"]] = L
    return out

def previous_f1(start, path="fixtures.json"):
    """The F1 sessions from the last published fixtures.json: used when Jolpica-F1 cannot be reached."""
    try:
        old = load_json(path)["matches"]
    except Exception:
        return []
    recent = (start - timedelta(days=KEEP_DAYS)).isoformat()
    return [r for r in old if isinstance(r, dict) and _valid_f1(r) and r["date"] >= recent]

# ---------- badges beside team names: a flag for national teams, the club's crest for clubs ----------
# Flags: flag-icons (MIT), packed in flags/flags.json, found by the country's English name there or FLAG_ALIAS.
# Crests: ESPN's, by ESPN's team number, found in ESPN's team list for the club's competition. Only the flag code or
# the number is saved; the page builds the picture's address itself, so fixtures.json cannot point it elsewhere.
ESPN_TEAMS = "https://site.api.espn.com/apis/site/v2/sports/soccer/{}/teams"
ESPN_LEAGUE = {"EPL": "eng.1", "LIGA": "esp.1", "BUN": "ger.1", "BRA": "bra.1"}
NATIONAL = ("INTL", "UNL")
FLAG_ALIAS = {   # ESPN's (and FIFA's) names for teams whose flag is filed under another name
    "Bonaire": "bq", "Bosnia-Herzegovina": "ba", "British Virgin Islands": "vg", "Cape Verde": "cv", "Cabo Verde": "cv",
    "Congo DR": "cd", "Czechia": "cz", "Ivory Coast": "ci", "Kyrgyz Republic": "kg", "Palestine": "ps",
    "Republic of Ireland": "ie", "St. Kitts and Nevis": "kn", "St. Lucia": "lc", "St. Martin": "mf",
    "St. Vincent and the Grenadines": "vc", "US Virgin Islands": "vi", "United States": "us", "USA": "us",
    "Korea Republic": "kr", "Korea DPR": "kp", "North Korea": "kp", "Chinese Taipei": "tw", "IR Iran": "ir",
    "Turkey": "tr", "Congo": "cg"}
# (Tahiti is left out on purpose: its flag is not French Polynesia's, and flag-icons has no Tahiti flag.)
FLAG_CODE = re.compile(r"[a-z]{2}(-[a-z]{3})?")
# the words left out when names are compared, as when the page matches ESPN's live scores (STOP and ALIAS in js/live.js),
# plus "deportivo" (as generic as "club": Deportivo Alavés and Deportivo La Coruña) and "hamburger" (ESPN: Hamburg SV)
NAME_SKIP = {"fc", "cf", "afc", "sc", "ac", "cd", "rc", "ud", "sd", "ca", "ec", "se", "cr", "fbpa", "club", "clube", "de",
             "del", "la", "le", "the", "and", "futbol", "football", "sport", "sporting", "esporte", "regatas", "balompie",
             "calcio", "sad", "national", "team", "deportivo"}
NAME_ALIAS = {"mineiro": "atleticomg", "paranaense": "athleticopr", "munchen": "munich", "koln": "cologne",
              "wolverhampton": "wolves", "hamburger": "hamburg"}

def _plain(name):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", name) if not unicodedata.combining(c)).lower()

def team_words(name):
    """The words that identify a team: no accents, lower case, without "FC", "Clube" and the like; "Atlético-MG"
    also as "atleticomg"."""
    s = _plain(name)
    out = {a + b for a, b in re.findall(r"([a-z]+)-([a-z]+)", s)}
    for t in re.split(r"[^a-z0-9]+", s):
        if len(t) > 2 and t not in NAME_SKIP:
            out.add(t)
            if t in NAME_ALIAS:
                out.add(NAME_ALIAS[t])
    return out

def flag_codes(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "flags", "flags.json")):
    """{country name, compared without accents, spaces or punctuation: flag code}, from the names in flags/flags.json
    and FLAG_ALIAS; only codes that have a flag there."""
    key = lambda n: re.sub(r"[^a-z]", "", _plain(n))
    flags = load_json(path)["flags"]
    names = {**{name: code for code, (name, _) in flags.items()}, **FLAG_ALIAS}
    return {key(n): c for n, c in names.items() if FLAG_CODE.fullmatch(c) and c in flags}, key

def _espn_teams(league):
    """ESPN's clubs in one competition, as (words of all its names, [words of each name], ESPN team number). ESPN's
    API is unofficial: an answer that is missing or odd gives no clubs, never an error, and a team number that is not
    plain digits is left out."""
    try:
        teams = fetch_json(ESPN_TEAMS.format(league))["sports"][0]["leagues"][0]["teams"]
    except Exception as e:
        print(f"ESPN teams for {league} failed ({e}); crests from the last build")
        return []
    out = []
    for t in teams if isinstance(teams, list) else []:
        t = t.get("team") if isinstance(t, dict) else None
        if not isinstance(t, dict) or not isinstance(t.get("id"), str) or not re.fullmatch(r"\d{1,7}", t["id"]):
            continue
        names = [w for w in (team_words(t[k]) for k in ("displayName", "shortDisplayName", "name")
                             if isinstance(t.get(k), str)) if w]
        if not names and isinstance(t.get("slug"), str):   # "Deportivo" alone: its address says esp.deportivo_coruna
            names = [team_words(t["slug"].split(".")[-1].replace("_", " "))]
        names = [w for w in names if w]
        if names:
            out.append((set().union(*names), names, t["id"]))
    return out

def best_team(name, teams):
    """The ESPN team number of the club sharing the most words with `name`. Only a close match counts: the words in
    common must be all of the name's (an alias standing for the word it comes from), or all of one of ESPN's names
    for the club, so "Manchester City FC" never takes Manchester United's crest when City is missing from ESPN's list.
    Between two sharing as many, the one whose word comes first in the name ("RCD Espanyol de Barcelona" is
    Espanyol, not Barcelona). None when no club matches closely, or two still tie: better no crest than another's."""
    w = team_words(name)
    seq = [x for t in name.split() for x in team_words(t)]   # the name's words in order
    first = lambda words: min((seq.index(x) for x in words & w if x in seq), default=len(seq))
    covered = lambda common: all(x in common or NAME_ALIAS.get(x) in common for x in w)
    close = lambda words, names: covered(words & w) or any(n <= w for n in names)
    scored = [((len(w & words), -first(words)), tid) for words, names, tid in teams if w & words and close(words, names)]
    if not scored:
        return None
    best = max(k for k, _ in scored)
    found = [tid for k, tid in scored if k == best]
    return found[0] if len(found) == 1 else None

def valid_box(box):
    """A crest's measured drawing (crest_box()): [left, top, width, height, reach] in thousandths of the picture's side,
    whole numbers, inside the picture."""
    return (isinstance(box, list) and len(box) == 5 and all(type(v) is int and 0 <= v <= 1000 for v in box)
            and box[2] > 0 and box[3] > 0 and box[0] + box[2] <= 1000 and box[1] + box[3] <= 1000 and box[4] > 0)

def valid_badge(b):
    if not isinstance(b, dict):
        return False
    if set(b) == {"flag"}:
        return isinstance(b["flag"], str) and bool(FLAG_CODE.fullmatch(b["flag"]))
    return (set(b) in ({"crest"}, {"crest", "box", "dark"}) and isinstance(b["crest"], str)
            and bool(re.fullmatch(r"\d{1,7}", b["crest"]))
            and ("box" not in b or (valid_box(b["box"]) and (b["dark"] is False or valid_box(b["dark"])))))

def png_alpha(data):
    """(width, height, rows of opacity 0-255) of a PNG picture, read with the standard library only; None for anything
    this does not read (not a PNG, interlaced, not 8 bits per channel, over 1000 pixels a side, broken data)."""
    import struct, zlib
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    pos, chunks, idat = 8, {}, []
    while pos + 8 <= len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IDAT":
            idat.append(body)
        else:
            chunks.setdefault(kind, body)
        pos += 12 + n
        if kind == b"IEND":
            break
    ihdr = chunks.get(b"IHDR")
    if not ihdr or len(ihdr) != 13:
        return None
    w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", ihdr)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(ctype)
    if depth != 8 or interlace or not channels or not 0 < w <= 1000 or not 0 < h <= 1000:
        return None
    try:
        raw = zlib.decompress(b"".join(idat))
    except zlib.error:
        return None
    stride = w * channels
    if len(raw) < h * (stride + 1):
        return None
    trns = chunks.get(b"tRNS", b"")
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        c = channels
        if f == 1:
            for i in range(c, stride):
                line[i] = (line[i] + line[i - c]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                line[i] = (line[i] + ((line[i - c] if i >= c else 0) + prev[i]) // 2) & 255
        elif f == 4:
            for i in range(stride):
                a, b, cc = (line[i - c] if i >= c else 0), prev[i], (prev[i - c] if i >= c else 0)
                p = a + b - cc
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - cc)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else cc)) & 255
        elif f != 0:
            return None
        prev = line
        if ctype == 6:
            rows.append(line[3::4])
        elif ctype == 4:
            rows.append(line[1::2])
        elif ctype == 3:
            rows.append(bytes(trns[i] if i < len(trns) else 255 for i in line))
        else:
            rows.append(bytes([255]) * w)          # no transparency: the whole picture is the drawing
    return w, h, rows

def crest_box(data, solid=32):
    """Where a crest is drawn in its picture (ESPN's crests sit on square transparent pictures, each with its own
    margin), as [left, top, width, height, reach] in thousandths of the picture's side: the box around every pixel at
    least `solid` opaque, and how far the farthest such pixel's far corner is from the box's centre. The page sizes and centres each crest by
    it, so every crest fills its circle alike. None when the picture cannot be read or is empty."""
    img = png_alpha(data)
    if not img:
        return None
    w, h, rows = img
    side = max(w, h)
    xs, ys = [], []
    for y, row in enumerate(rows):
        hit = [x for x, a in enumerate(row) if a >= solid]
        if hit:
            ys.append(y)
            xs += (hit[0], hit[-1])
    if not ys:
        return None
    x0, x1, y0, y1 = min(xs), max(xs) + 1, ys[0], ys[-1] + 1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    reach = max(math.hypot(abs(x + .5 - cx) + .5, abs(y + .5 - cy) + .5) for y, row in enumerate(rows)
                for x, a in enumerate(row) if a >= solid)
    k = 1000 / side
    box = [round(x0 * k), round(y0 * k), round((x1 - x0) * k), round((y1 - y0) * k), min(1000, math.ceil(reach * k))]
    return box if valid_box(box) else None

ESPN_CREST = "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/{}/{}.png&h=100&w=100"
# ESPN also draws most crests again for dark backgrounds (its "500-dark" folder: a white outline, or white in place of
# navy or black). A few of those are a club's old crest; these clubs keep their usual crest in dark theme.
OLD_DARK_CREST = {"3458": "Athletico-PR (the round crest used before 2018)", "9169": "Mirassol (an older crest)"}

def measure_crests(badges, previous=None):
    """Adds "box" (crest_box()) to each crest, and "dark": the box of ESPN's dark-background version, or False when
    there is none, it is the same picture, or it is an old crest (OLD_DARK_CREST). Kept from the last build when the
    crest is the same, else measured from ESPN's pictures. A crest that cannot be downloaded or read has neither, and
    the page shows it unmeasured."""
    old = {b["crest"]: (b["box"], b["dark"]) for b in (previous or {}).values() if "box" in b}
    for b in badges.values():
        if "crest" not in b or "box" in b:
            continue
        got = old.get(b["crest"])
        if got is None:
            try:
                light = fetch(ESPN_CREST.format("500", b["crest"]))
                box, dark = crest_box(light), False
                if box and b["crest"] not in OLD_DARK_CREST:
                    try:
                        pic = fetch(ESPN_CREST.format("500-dark", b["crest"]))
                        dark = pic != light and crest_box(pic) or False
                    except Exception:
                        pass                 # no dark version (ESPN answers 404): the usual crest in both themes
                got = (box, dark) if box else None
            except Exception as e:
                print(f"crest {b['crest']} could not be measured ({e})")
        if got:
            b["box"], b["dark"] = old[b["crest"]] = got
    return badges

def previous_badges(path="fixtures.json"):
    """Badges from the last published fixtures.json, checked like everything read back from that file."""
    try:
        old = load_json(path).get("badges")
    except Exception:
        return {}
    return {k: v for k, v in (old.items() if isinstance(old, dict) else []) if isinstance(k, str) and valid_badge(v)}

def team_badges(recs, previous=None):
    """{team name: {"flag": code}} for national teams, {team name: {"crest": ESPN team number}} for clubs, each club
    looked up among the clubs of its own competition (each list downloaded once). A club ESPN does not give this
    time keeps its crest from the last build."""
    flags, key = flag_codes()
    lists, out = {}, {}
    for r in recs:
        for name in (r["home"], r["away"]):
            if not name or name in out:
                continue
            if r["code"] in NATIONAL:
                if key(name) in flags:
                    out[name] = {"flag": flags[key(name)]}
            elif r["code"] in ESPN_LEAGUE:
                if r["code"] not in lists:
                    lists[r["code"]] = _espn_teams(ESPN_LEAGUE[r["code"]])
                tid = best_team(name, lists[r["code"]])
                if tid:
                    out[name] = {"crest": tid}
    for name, b in (previous or {}).items():
        if "crest" in b:
            out.setdefault(name, {"crest": b["crest"]})
    return measure_crests(out, previous)

def load_all(start):
    """Every match and session from `start` on. Returns (records, sources, tables, f1_stale): which source each
    league came from (shown on the site), each league's backup table (standings()), and whether the F1 sessions
    had to be reused from the last build."""
    sources, tables, f1_stale = {}, {}, False
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    out = []
    for code, (name, fd_code, filename, style, tz) in LEAGUES.items():
        if token:
            try:
                recs, results = from_football_data(code, name, fd_code, tz, start, token)
                out += recs
                tables[code] = standings(results)
                sources[code] = "football-data.org"; continue
            except Exception as e:           # API down or rate-limited: fall back rather than fail
                print(f"football-data.org failed for {code} ({e}); using openfootball")
        recs, results = from_openfootball(code, name, filename, style, tz, start)
        out += recs
        tables[code] = standings(results)
        sources[code] = "openfootball"
    apply_overrides(out)
    out = [r for r in out if date.fromisoformat(r["date"]) >= start or "result" in r or r.get("started")]
    for code, (path, _) in HAND_KEPT.items():
        out += from_hand_kept(start, code)
        sources[code] = f"{path} (hand-maintained, cross-checked)"
    try:
        f1 = from_f1(start)
        sources["F1"] = "Jolpica-F1" + (" and OpenF1" if any(r.get("check") for r in f1) else "")
    except Exception as e:                   # F1 must never stop the football schedule from publishing
        print(f"Jolpica-F1 failed ({e}); keeping the F1 sessions already published")
        f1_stale = True
        f1 = previous_f1(start)
        sources["F1"] = "Jolpica-F1"
    out += f1
    out.sort(key=lambda r: (r["utc"] or r["date"] + "T99"))
    return out, sources, tables, f1_stale

def apply_filters(recs, leagues=None, teams=None):
    if leagues:
        recs = [r for r in recs if r["code"] in leagues]
    if teams:
        t = [x.lower() for x in teams]
        recs = [r for r in recs if any(x in r["home"].lower() or x in r["away"].lower() for x in t)]
    return recs

# ---------- iCalendar writer (RFC 5545) ----------
def esc(s):
    """Text for an iCalendar value: backslash, comma and semicolon escaped, and every kind of line break
    (a lone carriage return too) written as \\n, so no text from a feed can start a line of its own."""
    s = s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
    return s.replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n")

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
    save_text(path, "{" + ",\n".join(head) + ',\n"matches":[\n' + ",\n".join(rows) + "\n]}\n")

def upcoming_league_matches(recs):
    """Upcoming matches from the league feeds only: hand-kept matches and F1 must not hide a broken feed."""
    return sum(1 for r in recs if r["code"] in LEAGUES and "result" not in r and not r.get("started"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=datetime.now(HOME_TZ).date().isoformat())
    ap.add_argument("--leagues", help="comma list of EPL,LIGA,BUN,BRA,INTL,UNL,F1")
    ap.add_argument("--teams", help="comma list of team-name fragments")
    ap.add_argument("--out", default="soccer.ics")
    a = ap.parse_args()
    recs, sources, tables, f1_stale = load_all(date.fromisoformat(a.start))
    league_count = upcoming_league_matches(recs)
    if league_count < MIN_MATCHES:
        # exiting with an error stops the workflow before it publishes, so the last good site stays up
        sys.exit(f"Only {league_count} upcoming league matches found; refusing to publish. Check the data sources.")
    cazetv.add_streams([r for r in recs if r["code"] != "F1"])   # CazéTV links are for football matches
    recs = apply_filters(recs, a.leagues and a.leagues.split(","), a.teams and a.teams.split(","))
    # "site" fingerprints the published page (index.html with styles.css and js/ inside it), so a page left open can
    # tell the site itself was updated and reload
    meta = {"generated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "site": publish_site.fingerprint(),
            "sources": sources, "tables": {c: t for c, t in tables.items() if t},
            "badges": team_badges(recs, previous_badges()), "matches": recs}
    if f1_stale:
        meta["f1stale"] = True
    write_fixtures(meta)
    save_text(a.out, ics([r for r in recs if r["code"] != "F1"]), newline="")   # the calendar stays football-only
    print(f"{len(recs)} matches -> {a.out}")

if __name__ == "__main__":
    main()
