#!/usr/bin/env python3
"""
research.py
Fills kick-off-time gaps automatically by asking Claude (with web search) for sourced reports,
then adds them to friendlies.json and overrides.json. build_schedule.py decides afterwards
whether the reports are enough to count as verified.

Runs only when the ANTHROPIC_API_KEY environment variable is set (a GitHub secret).
It never deletes a report; it only adds new ones.

Safeguards
  - A report is kept only if its URL appeared in that run's actual web search results,
    so an invented link cannot get in.
  - "official" is never taken from the model. It is set only when the URL's domain is on
    the OFFICIAL_DOMAINS list below.
  - A time is kept only with a valid IANA time zone; otherwise it becomes a comment.
  - Spending is capped: at most MAX_CALLS requests per run and MAX_SEARCHES searches each.

Settings (optional environment variables)
  RESEARCH_MODEL         default claude-sonnet-5
  RESEARCH_MAX_CALLS     default 4
  RESEARCH_MAX_SEARCHES  default 5
"""
import json, os, re, sys
from datetime import datetime, date, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, available_timezones

MODEL = os.environ.get("RESEARCH_MODEL", "claude-sonnet-5")
MAX_CALLS = int(os.environ.get("RESEARCH_MAX_CALLS", "4"))
MAX_SEARCHES = int(os.environ.get("RESEARCH_MAX_SEARCHES", "5"))
LEAGUE_WINDOW_DAYS = 21      # look for missing league times up to three weeks ahead
FRIENDLY_WINDOW_DAYS = 45    # look for friendlies up to about six weeks ahead
HOME_TZ = ZoneInfo("America/Edmonton")
TZS = available_timezones()

# Sites whose word counts as official. Everything else can still verify a time
# by agreeing with a second independent source.
OFFICIAL_DOMAINS = {
    "premierleague.com", "laliga.com", "bundesliga.com", "dfl.de", "cbf.com.br",
    "afa.com.ar", "canadasoccer.com", "ussoccer.com", "the-aiff.com", "uefa.com", "fifa.com",
    "englandfootball.com", "thefa.com", "rfef.es", "dfb.de", "fff.fr", "figc.it", "fpf.pt",
    "knvb.nl", "rbfa.be", "football.ch", "oefb.at", "scottishfa.co.uk", "faw.cymru",
    "irishfa.com", "fai.ie", "dbu.dk", "svenskfotboll.se", "fotball.no", "pzpn.pl", "hns-cff.hr",
    "fa.org.au", "footballaustralia.com.au", "conmebol.com", "concacaf.com",
}

def is_official(url):
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in OFFICIAL_DOMAINS)

def norm_url(u):
    return u.split("#")[0].rstrip("/").lower()

# ---------- finding the gaps ----------
def find_gaps(today):
    """Matches that need research, from the last build's fixtures.json."""
    try:
        matches = json.load(open("fixtures.json", encoding="utf-8"))["matches"]
    except FileNotFoundError:
        return [], []
    league_end = (today + timedelta(days=LEAGUE_WINDOW_DAYS)).isoformat()
    friendly_end = (today + timedelta(days=FRIENDLY_WINDOW_DAYS)).isoformat()
    league, friendlies = {}, []
    for m in matches:
        if m["date"] < today.isoformat():
            continue
        if m["code"] == "INTL":
            if m["date"] <= friendly_end and (m.get("check") or {}).get("status") != "confirmed":
                friendlies.append(m)
        elif m["date"] <= league_end and (not m["utc"] or m.get("provisional")):
            league.setdefault((m["code"], m["round"]), []).append(m)
    # soonest rounds first, so the spending cap is used where it matters most
    rounds = sorted(league.items(), key=lambda kv: min(x["date"] for x in kv[1]))
    return rounds, friendlies

# ---------- asking Claude ----------
INSTRUCTIONS = """You are checking soccer kick-off dates and times for a fixture website. Today is {today}.

For each match below, search the web for its kick-off date and time. Aim for at least two independent
sources per match, from different kinds of site: the official league, federation or club site or its
official ticketing; established news outlets in the country concerned (in its language); and fixture
sites such as ESPN, FotMob or Soccerway.

Rules:
- Report only what a page actually states. Never guess or convert.
- "time" is the local kick-off time exactly as the page gives it (24-hour HH:MM), and "tz" is the IANA
  time zone the page means (e.g. Europe/Madrid, America/Sao_Paulo, America/Argentina/Buenos_Aires).
  Give a time only if the page states the zone or it is unambiguous from context (e.g. a Spanish outlet's
  schedule is peninsular Spanish time). Otherwise set time and tz to null and describe what the page
  shows in "comment".
- Every "url" must be a page that appeared in your search results.
- If sources disagree, report each of them separately.
{extra}
Reply with ONLY a JSON object, no other text:
{{"reports": [{{"match": "<id from the list>", "source": "<site name>", "url": "<page url>",
  "date": "YYYY-MM-DD", "time": "HH:MM" or null, "tz": "<IANA zone>" or null, "comment": "<optional>"}}],
  "new_friendlies": [{{"team1": "<home>", "team2": "<away>", "venue": "<stadium, city>",
  "reports": [<reports as above, without "match">]}}]}}

Matches:
{matches}"""

FRIENDLY_EXTRA = """- Also look for men's senior international friendlies in the next {days} days involving Brazil, Argentina,
  Canada or any UEFA member nation that are NOT in the list, and put them in "new_friendlies". Friendlies
  only: never Nations League, World Cup or other qualifiers. Leave "new_friendlies" empty if none."""

def ask(client, prompt):
    """One request, following 'pause_turn' continuations. Returns (text, urls seen in search results)."""
    messages = [{"role": "user", "content": prompt}]
    text, seen = "", set()
    for _ in range(4):
        resp = client.messages.create(
            model=MODEL, max_tokens=4000, messages=messages,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": MAX_SEARCHES}])
        data = resp.model_dump()
        u = data.get("usage") or {}
        print(f"  tokens in/out: {u.get('input_tokens')}/{u.get('output_tokens')}, "
              f"searches: {(u.get('server_tool_use') or {}).get('web_search_requests')}")
        for block in data["content"]:
            if block["type"] == "web_search_tool_result" and isinstance(block.get("content"), list):
                seen.update(norm_url(r["url"]) for r in block["content"] if r.get("url"))
            elif block["type"] == "text":
                text += block["text"]
        if data.get("stop_reason") != "pause_turn":
            break
        messages.append({"role": "assistant", "content": data["content"]})
    return text, seen

def parse_json(text):
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object in reply")
    return json.loads(text[start:end + 1])

def clean(rep, seen, today):
    """Validate one report. Returns a tidy dict, or None to drop it."""
    url, source = str(rep.get("url") or ""), str(rep.get("source") or "").strip()[:80]
    if not source or not url.startswith(("http://", "https://")):
        return None
    if norm_url(url) not in seen:
        print(f"  dropped (URL not in search results): {url}"); return None
    try:
        d = date.fromisoformat(str(rep.get("date")))
    except ValueError:
        return None
    if abs((d - today).days) > 400:
        return None
    out = {"source": source, "url": url, "date": d.isoformat()}
    t, tz = rep.get("time"), rep.get("tz")
    comment = str(rep.get("comment") or "").strip()[:300]
    if t and tz and re.fullmatch(r"\d{2}:\d{2}", str(t)) and tz in TZS:
        out["time"], out["tz"] = str(t), tz
    elif t:
        comment = (comment + f" Shows {t}" + (f" ({tz})" if tz else "") + " without a usable time zone; not counted.").strip()
    if is_official(url):
        out["official"] = True
    if comment:
        out["comment"] = comment
    out["added"] = f"research.py {today.isoformat()}"
    return out

def same(a, b):
    return all(a.get(k) == b.get(k) for k in ("url", "date", "time", "tz"))

def add_reports(existing, new):
    added = 0
    for r in new:
        if not any(same(r, e) for e in existing):
            existing.append(r); added += 1
    return added

# ---------- main ----------
def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set; skipping research."); return
    import anthropic
    client = anthropic.Anthropic()
    today = datetime.now(HOME_TZ).date()
    rounds, friendly_gaps = find_gaps(today)
    friendlies = json.load(open("friendlies.json", encoding="utf-8"))
    overrides = json.load(open("overrides.json", encoding="utf-8")) if os.path.exists("overrides.json") else []
    calls, changes = 0, []

    # 1) friendlies: fill gaps and look for new ones (one request)
    if calls < MAX_CALLS:
        ids = {f"f{i+1}": m for i, m in enumerate(friendly_gaps)}
        listing = "\n".join(f"{k}: {m['home']} v {m['away']}, {m['date']}, {m.get('venue') or ''}" for k, m in ids.items()) or "(none; only look for new friendlies)"
        print(f"Friendlies: {len(ids)} to check, plus discovery")
        try:
            text, seen = ask(client, INSTRUCTIONS.format(today=today, matches=listing,
                                                        extra=FRIENDLY_EXTRA.format(days=FRIENDLY_WINDOW_DAYS)))
            calls += 1
            reply = parse_json(text)
            for rep in reply.get("reports", []):
                m = ids.get(rep.get("match")); c = m and clean(rep, seen, today)
                if not c: continue
                entry = next((f for f in friendlies if f["team1"] == m["home"] and f["team2"] == m["away"]
                              and any(r.get("date") == m["date"] for r in f["reports"])), None)
                if entry and add_reports(entry["reports"], [c]):
                    changes.append(f"{m['home']} v {m['away']}: report from {c['source']}")
            for nf in reply.get("new_friendlies", []):
                reps = [c for c in (clean(r, seen, today) for r in nf.get("reports", [])) if c]
                t1, t2 = str(nf.get("team1") or "").strip(), str(nf.get("team2") or "").strip()
                if not (t1 and t2 and reps):
                    continue
                dup = any({f["team1"].lower(), f["team2"].lower()} == {t1.lower(), t2.lower()}
                          and any(r.get("date") == reps[0]["date"] for r in f["reports"]) for f in friendlies)
                if not dup:
                    friendlies.append({"team1": t1, "team2": t2, "venue": str(nf.get("venue") or "")[:120], "reports": reps})
                    changes.append(f"New friendly: {t1} v {t2} ({reps[0]['date']})")
        except Exception as e:
            print(f"  friendlies research failed: {e}")

    # 2) league rounds with missing or placeholder times (one request per round)
    for (code, rnd), ms in rounds:
        if calls >= MAX_CALLS:
            print(f"Spending cap reached; {code} {rnd} and later rounds wait for the next run."); break
        ids = {f"m{i+1}": m for i, m in enumerate(ms)}
        listing = "\n".join(f"{k}: {m['comp']} {rnd}, {m['home']} v {m['away']}, listed for {m['date']}" for k, m in ids.items())
        print(f"{code} {rnd}: {len(ids)} matches")
        try:
            text, seen = ask(client, INSTRUCTIONS.format(today=today, matches=listing, extra=""))
            calls += 1
            for rep in parse_json(text).get("reports", []):
                m = ids.get(rep.get("match")); c = m and clean(rep, seen, today)
                if not c: continue
                entry = next((o for o in overrides if o["code"] == code and o["home"].lower() in m["home"].lower()
                              and o["away"].lower() in m["away"].lower()), None)
                if entry is None:
                    entry = {"code": code, "home": m["home"], "away": m["away"], "reports": []}
                    overrides.append(entry)
                if add_reports(entry["reports"], [c]):
                    changes.append(f"{m['home']} v {m['away']}: report from {c['source']}")
        except Exception as e:
            print(f"  {code} {rnd} research failed: {e}")

    json.dump(friendlies, open("friendlies.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(overrides, open("overrides.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{calls} request(s) made; {len(changes)} change(s).")
    for c in changes:
        print("  " + c)

if __name__ == "__main__":
    main()
