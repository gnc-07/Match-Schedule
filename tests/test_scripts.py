"""
Checks for the Python build scripts. They use made-up data and never touch the network,
so they give the same result every time.

Run from the project folder:
  python3 -m unittest discover -s tests
"""
import copy, io, json, math, os, re, sys, tempfile, unittest, urllib.error, urllib.request
from contextlib import redirect_stdout
from datetime import date, datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_schedule as bs
import cazetv
import common
import publish_site
import research


def report(source, time=None, tz="Europe/London", day="2026-10-03", **extra):
    r = {"source": source, "url": f"https://{source.lower().replace(' ', '')}.example/match", "date": day}
    if time:
        r.update(time=time, tz=tz)
    r.update(extra)
    return r


class Resolve(unittest.TestCase):
    """The verification rule (CLAUDE.md, rule 5): a time is verified only if an official source gives it
    or at least two independent sources agree. These tests fail if that rule is ever weakened."""

    def test_official_source_alone_verifies(self):
        day, utc, check = bs.resolve([report("League", "15:00", official=True)])
        self.assertEqual(check["status"], "confirmed")
        self.assertEqual(utc, "2026-10-03T14:00:00+00:00")     # 15:00 in London during summer time
        self.assertEqual(check["basis"], "official source")

    def test_one_unofficial_source_is_not_enough(self):
        _, utc, check = bs.resolve([report("Paper", "15:00")])
        self.assertIsNone(utc)
        self.assertEqual(check["status"], "unconfirmed")

    def test_two_independent_sources_agree(self):
        _, utc, check = bs.resolve([report("Paper", "15:00"), report("Radio", "16:00", tz="Europe/Paris")])
        self.assertEqual(check["status"], "confirmed")           # the same moment, written in two zones
        self.assertEqual(utc, "2026-10-03T14:00:00+00:00")

    def test_the_same_source_twice_counts_once(self):
        _, utc, check = bs.resolve([report("Paper", "15:00"), report("Paper", "15:00")])
        self.assertIsNone(utc)
        self.assertEqual(check["status"], "unconfirmed")

    def test_a_tie_between_two_pairs_is_conflicting(self):
        _, utc, check = bs.resolve([report("A", "15:00"), report("B", "15:00"), report("C", "17:30"), report("D", "17:30")])
        self.assertIsNone(utc)
        self.assertEqual(check["status"], "conflicting")
        self.assertEqual(len(check["reported"]), 2)

    def test_a_majority_verifies_and_notes_the_dissent(self):
        _, utc, check = bs.resolve([report("A", "15:00"), report("B", "15:00"), report("C", "17:30")])
        self.assertEqual(check["status"], "confirmed")
        self.assertIn("note", check)

    def test_date_only_reports(self):
        day, utc, check = bs.resolve([report("A", day="2026-10-04")])
        self.assertEqual((day, utc, check["status"]), ("2026-10-04", None, "no time reported"))

    def test_no_dates_at_all_is_a_clear_error(self):
        with self.assertRaises(ValueError):
            bs.resolve([{"source": "A"}])


class Calendar(unittest.TestCase):
    def test_escaping_keeps_feed_text_on_one_line(self):
        self.assertEqual(bs.esc("a,b;c\\d"), "a\\,b\\;c\\\\d")
        for brk in ("\n", "\r\n", "\r"):
            self.assertNotIn("\r", bs.esc("x" + brk + "DTSTART:1"))
            self.assertNotIn("\n", bs.esc("x" + brk + "DTSTART:1"))

    def test_folding_keeps_lines_short_and_characters_whole(self):
        line = "SUMMARY:" + "Grêmio x São Paulo " * 12
        folded = bs.fold(line)
        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode()), 75)
        self.assertEqual(folded.replace("\r\n ", ""), line)       # unfolding gives the original back

    def test_ics_file_shape(self):
        recs = [bs.record("Premier League", "EPL", "Arsenal", "Chelsea", "2026-10-03", "2026-10-03T14:00:00+00:00",
                          "Matchday 7", "Emirates Stadium, London", uid="t1"),
                bs.record("Premier League", "EPL", "Spurs", "Fulham", "2026-10-04", None, "Matchday 7", uid="t2")]
        out = bs.ics(recs)
        self.assertTrue(out.startswith("BEGIN:VCALENDAR\r\n") and out.endswith("END:VCALENDAR\r\n"))
        self.assertEqual(out.count("BEGIN:VEVENT"), 2)
        self.assertIn("DTSTART:20261003T140000Z", out)
        self.assertIn("DTSTART;VALUE=DATE:20261004", out)
        self.assertIn("[time TBC]", out)
        self.assertNotIn("\n", out.replace("\r\n", ""))           # every line ends in CRLF


class HandKept(unittest.TestCase):
    """friendlies.json and nations_league.json go through the same loader and the same verification rule."""

    def load(self, code, matches, start=date(2026, 10, 1)):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "matches.json")
            common.save_json(path, matches)
            return bs.from_hand_kept(start, code, path)

    def test_nations_league_matches_get_their_own_code_and_name(self):
        recs = self.load("UNL", [{"team1": "Belgium", "team2": "France", "venue": "King Baudouin Stadium, Brussels",
                                  "round": "Group A1, Matchday 3", "reports": [
                                      report("UEFA", "20:45", tz="Europe/Paris", official=True, day="2026-10-02")]}])
        self.assertEqual(len(recs), 1)
        r = recs[0]
        self.assertEqual((r["code"], r["comp"], r["round"]), ("UNL", "UEFA Nations League", "Group A1, Matchday 3"))
        self.assertEqual(r["utc"], "2026-10-02T18:45:00+00:00")        # 20:45 Central European summer time
        self.assertEqual(r["check"]["status"], "confirmed")
        self.assertTrue(r["uid"].startswith("unl|Belgium|France|"))

    def test_friendlies_keep_their_code_and_an_empty_round(self):
        r = self.load("INTL", [{"team1": "Canada", "team2": "Peru", "reports": [report("Paper", "19:00")]}])[0]
        self.assertEqual((r["code"], r["comp"], r["round"]), ("INTL", "International friendly", ""))
        self.assertIsNone(r["utc"])                                    # one unofficial report is not enough
        self.assertTrue(r["uid"].startswith("intl|"))

    def test_matches_before_the_start_are_left_out(self):
        recs = self.load("UNL", [{"team1": "Italy", "team2": "Belgium", "reports": [report("UEFA", day="2026-09-25")]}])
        self.assertEqual(recs, [])

    def test_hand_kept_matches_never_count_towards_the_safety_check(self):
        recs = [bs.record("UEFA Nations League", "UNL", "Spain", "England", "2026-11-15"),
                bs.record("International friendly", "INTL", "Canada", "Peru", "2026-10-10"),
                bs.record("Formula 1", "F1", "", "", "2026-10-11"),
                bs.record("Premier League", "EPL", "Arsenal", "Chelsea", "2026-10-03")]
        self.assertEqual(bs.upcoming_league_matches(recs), 1)

    def test_the_real_nations_league_file_is_verified_by_uefa(self):
        """Every match in nations_league.json has an official UEFA report with a real time zone."""
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        matches = common.load_json(os.path.join(root, "nations_league.json"))
        self.assertTrue(matches)
        for m in matches:
            official = [r for r in m["reports"] if r.get("official")]
            self.assertEqual([r["source"] for r in official], ["UEFA"], m)
            self.assertTrue(official[0]["url"].startswith("https://www.uefa.com/"), m)
            _, utc, check = bs.resolve(m["reports"])
            self.assertEqual(check["status"], "confirmed", m)
            self.assertNotIn("note", check, m)                         # the other reports agree with UEFA
            self.assertRegex(m["round"], r"^Group A[1-4], Matchday [1-6]$")


class BackupTables(unittest.TestCase):
    """The league tables the page falls back to when ESPN does not answer (standings() in build_schedule.py)."""

    def test_points_goal_difference_then_goals(self):
        table = bs.standings([("A", "B", 2, 0), ("C", "D", 1, 1), ("B", "C", 3, 1), ("D", "A", 0, 0)])
        self.assertEqual([(t["team"], t["pts"]) for t in table], [("A", 4), ("B", 3), ("D", 2), ("C", 1)])
        a = table[0]
        self.assertEqual((a["p"], a["w"], a["d"], a["l"], a["gf"], a["ga"], a["gd"], a["rank"]), (2, 1, 1, 0, 2, 0, 2, 1))

    def test_level_teams_are_split_by_goal_difference_and_goals(self):
        table = bs.standings([("A", "X", 1, 0), ("B", "Y", 3, 2), ("C", "Z", 2, 1)])
        self.assertEqual([t["team"] for t in table[:3]], ["B", "C", "A"])   # all +1: 3 goals, then 2, then 1

    def test_a_score_that_is_not_a_number_is_skipped(self):
        table = bs.standings([("A", "B", "2", 0), ("A", "B", None, None), ("A", "B", 1, 0)])
        self.assertEqual(table[0]["p"], 1)

    def test_openfootball_score_shapes(self):
        self.assertEqual(bs._ft({"ft": [2, 1], "ht": [1, 0]}), [2, 1])
        self.assertEqual(bs._ft([0, 0]), [0, 0])            # the feed writes some results this way
        for unplayed in (None, {}, {"ht": [0, 0]}, [1], ["1", 0], "2-1"):
            self.assertIsNone(bs._ft(unplayed))

    def test_openfootball_results_include_the_whole_season(self):
        feed = {"matches": [
            {"date": "2026-08-20", "time": "15:00", "team1": "A", "team2": "B", "score": {"ft": [2, 1]}},
            {"date": "2026-08-27", "team1": "B", "team2": "A", "score": [0, 0]},
            {"date": "2026-10-03", "time": "15:00", "team1": "A", "team2": "C", "score": None},
        ]}
        with mock.patch.object(bs, "get_json", return_value=feed):
            recs, results = bs.from_openfootball("EPL", "Premier League", "en.1.json", "split", "Europe/London", date(2026, 9, 27))
        self.assertEqual(results, [("A", "B", 2, 1), ("B", "A", 0, 0)])   # old results count for the table
        self.assertEqual([(r["home"], r["away"]) for r in recs], [("A", "C")])   # but only the upcoming match is listed

    def test_openfootball_matches_get_a_uid_that_keeps_calendar_ids(self):
        feed = {"matches": [
            {"date": "2026-10-03", "time": "15:00", "team1": "A", "team2": "C", "round": "Matchday 7"},
            {"date": "2026-10-04", "team1": "B", "team2": "D"},
        ]}
        with mock.patch.object(bs, "get_json", return_value=feed):
            recs, _ = bs.from_openfootball("EPL", "Premier League", "en.1.json", "split", "Europe/London", date(2026, 9, 27))
        self.assertEqual([r["uid"] for r in recs], ["EPL|A|C|Matchday 7", "EPL|B|D|2026-10-04"])
        # the same calendar UID as before these matches had a uid, so subscribers see no duplicate events
        old = dict(recs[0], uid=None)
        uid_line = lambda r: next(l for l in bs.ics([r]).splitlines() if l.startswith("UID:"))
        self.assertEqual(uid_line(recs[0]), uid_line(old))


    def test_last_seasons_results_are_not_this_seasons_table(self):
        old = {"matches": [{"date": "2026-05-20", "time": "15:00", "team1": "A", "team2": "B", "score": {"ft": [2, 1]}}]}
        def get_json(url):
            if "/2026-27/" in url:
                raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)   # this season's file not there yet
            return old
        with mock.patch.object(bs, "get_json", get_json):
            recs, results = bs.from_openfootball("EPL", "Premier League", "en.1.json", "split", "Europe/London", date(2026, 8, 1))
        self.assertEqual(results, [])


class CazeTV(unittest.TestCase):
    def test_teams_from_title(self):
        self.assertEqual(cazetv.teams_from_title("AO VIVO E COM IMAGENS: FLAMENGO X PALMEIRAS | BRASILEIRÃO 2026"),
                         ("FLAMENGO", "PALMEIRAS"))
        self.assertIsNone(cazetv.teams_from_title("MELHORES MOMENTOS: FLAMENGO X PALMEIRAS"))   # not live

    def test_only_youtube_links_are_kept(self):
        self.assertEqual(cazetv.youtube_url("https://youtu.be/abcdefghijk"), "https://www.youtube.com/watch?v=abcdefghijk")
        self.assertEqual(cazetv.youtube_url('https://www.youtube.com/watch?v=abcdefghijk"><script>'),
                         "https://www.youtube.com/watch?v=abcdefghijk")
        for bad in ("https://evil.example/watch?v=abcdefghijk", "javascript:alert(1)", "", None):
            self.assertIsNone(cazetv.youtube_url(bad))

    def test_cache_entries_with_a_bad_id_get_no_link(self):
        entry = {"id": 'x"><img src=x>', "title": "AO VIVO: FLAMENGO X PALMEIRAS"}
        self.assertEqual(cazetv.watch_link(entry), (None, None))
        self.assertFalse(cazetv.is_video_id("éabcdefghij"))                 # 11 characters, but not a YouTube id
        self.assertTrue(cazetv.is_video_id("aB3_-xYz09Q"))

    def test_feed_with_a_doctype_is_refused(self):
        with self.assertRaises(ValueError):
            cazetv.parse_feed('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "a">]><feed/>')

    def test_a_stream_is_linked_to_its_match(self):
        recs = [bs.record("Brasileirão", "BRA", "CR Flamengo", "SE Palmeiras", "2026-10-03", "2026-10-03T21:00:00+00:00"),
                bs.record("Brasileirão", "BRA", "Santos FC", "Grêmio", "2026-10-03", "2026-10-03T21:00:00+00:00")]
        cache = [{"id": "abcdefghijk", "title": "AO VIVO: FLAMENGO X PALMEIRAS", "start": "2026-10-03T20:30:00+00:00"}]
        self.assertEqual(cazetv.attach(recs, cache), 1)
        self.assertEqual(recs[0]["watch"]["url"], "https://www.youtube.com/watch?v=abcdefghijk")
        self.assertNotIn("watch", recs[1])


class Research(unittest.TestCase):
    today = date(2026, 10, 1)
    seen = {"https://news.example/match", "https://www.premierleague.com/match/1"}

    def test_a_link_not_in_the_search_results_is_dropped(self):
        rep = {"source": "News", "url": "https://invented.example/x", "date": "2026-10-03", "time": "15:00", "tz": "Europe/London"}
        self.assertIsNone(research.clean(rep, self.seen, self.today))

    def test_official_comes_from_the_domain_list_only(self):
        rep = {"source": "PL", "url": "https://www.premierleague.com/match/1", "date": "2026-10-03", "time": "15:00", "tz": "Europe/London"}
        self.assertTrue(research.clean(rep, self.seen, self.today)["official"])
        rep = {"source": "News", "url": "https://news.example/match", "date": "2026-10-03", "official": True}
        self.assertNotIn("official", research.clean(rep, self.seen, self.today))

    def test_a_time_needs_a_real_zone_and_a_real_clock_time(self):
        base = {"source": "News", "url": "https://news.example/match", "date": "2026-10-03"}
        self.assertNotIn("time", research.clean({**base, "time": "15:00", "tz": "Mars/Base"}, self.seen, self.today))
        self.assertNotIn("time", research.clean({**base, "time": "25:61", "tz": "Europe/London"}, self.seen, self.today))
        self.assertEqual(research.clean({**base, "time": "15:00", "tz": "Europe/London"}, self.seen, self.today)["time"], "15:00")

    def test_odd_replies_are_skipped_not_fatal(self):
        self.assertIsNone(research.clean("not a report", self.seen, self.today))
        self.assertIsNone(research.clean({"source": ["x"], "url": 5}, self.seen, self.today))
        self.assertEqual(research.items({"reports": ["x", {"a": 1}, 3]}, "reports"), [{"a": 1}])
        self.assertEqual(research.items({"reports": "x"}, "reports"), [])
        with self.assertRaises(ValueError):
            research.parse_json("[1, 2]")

    def test_long_text_is_cut(self):
        self.assertEqual(len(research.plain("x" * 500, 60)), 60)
        self.assertEqual(research.plain("a\nb\tc", 60), "a b c")
        self.assertEqual(research.plain(None, 60), "")


class FakeReply:
    """Stands in for the SDK's reply object: the two things research.py uses are .model_dump() and .content."""
    def __init__(self, blocks, stop="end_turn"):
        self.content = blocks
        self._data = {"content": blocks, "stop_reason": stop, "usage": {"input_tokens": 1, "output_tokens": 1}}

    def model_dump(self):
        return copy.deepcopy(self._data)      # like the SDK: a fresh copy each time, not the reply's own objects


class FakeClaude:
    """Stands in for anthropic.Anthropic(): hands out prepared replies in order and remembers every request,
    so a test can run research.py from start to finish without an API key, a network or any cost."""
    replies = []
    requests = []

    def __init__(self):
        self.messages = self

    def create(self, **request):
        FakeClaude.requests.append(request)
        return FakeClaude.replies.pop(0)


class ResearchRun(unittest.TestCase):
    """research.main() from start to finish against FakeClaude, in a temporary folder with made-up data files.
    This checks research.py's own logic (reading the reply, the safeguards, merging, saving). It cannot check
    what only the real API can: that the request is accepted and that real replies have this shape."""

    def run_research(self, replies):
        day = (datetime.now(research.HOME_TZ).date() + timedelta(days=5)).isoformat()
        FakeClaude.replies, FakeClaude.requests = list(replies), []
        with tempfile.TemporaryDirectory() as d:
            common.save_json(os.path.join(d, "fixtures.json"), {"matches": [
                {"code": "INTL", "comp": "International friendly", "home": "Canada", "away": "Peru", "date": day,
                 "utc": None, "round": "", "venue": "Toronto"}]})
            common.save_json(os.path.join(d, "friendlies.json"), [
                {"team1": "Canada", "team2": "Peru", "reports": [{"source": "Canada Soccer", "date": day}]}])
            old = os.getcwd()
            os.chdir(d)
            try:
                with mock.patch.dict(sys.modules, {"anthropic": mock.Mock(Anthropic=FakeClaude)}), \
                     mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}), \
                     mock.patch.object(research, "MAX_CALLS", 1), redirect_stdout(io.StringIO()):
                    research.main()
                return day, common.load_json("friendlies.json")
            finally:
                os.chdir(old)

    def reply(self, day, stop="end_turn", note="I'll check."):
        results = {"type": "web_search_tool_result", "content": [{"type": "web_search_result", "url": "https://news.example/can-per"}]}
        answer = {"reports": [
            {"match": "f1", "source": "News", "url": "https://news.example/can-per", "date": day, "time": "19:30", "tz": "America/Toronto"},
            {"match": "f1", "source": "Invented", "url": "https://invented.example/", "date": day, "time": "20:00", "tz": "America/Toronto"},
            "not a report"],
            "new_friendlies": [{"team1": "X" * 200, "team2": "Brazil", "reports": [
                {"source": "News", "url": "https://news.example/can-per", "date": day, "time": "16:00", "tz": "America/Sao_Paulo"}]}]}
        return FakeReply([{"type": "text", "text": note + " {not json}"}, results,
                          {"type": "text", "text": json.dumps(answer)}], stop)

    def test_a_full_run(self):
        day, friendlies = self.run_research([self.reply(date.today().isoformat())])
        canada = friendlies[0]["reports"]
        self.assertEqual([r["source"] for r in canada], ["Canada Soccer", "News"])   # the invented link was dropped
        self.assertEqual(len(friendlies), 2)
        self.assertEqual(len(friendlies[1]["team1"]), 60)                            # a long name is cut
        tool = FakeClaude.requests[0]["tools"][0]
        self.assertEqual(tool["type"], "web_search_20260209")
        self.assertNotIn("response_inclusion", tool)                                 # would hide the search results

    def test_a_paused_turn_is_sent_back_unchanged(self):
        today = date.today().isoformat()
        paused = FakeReply([{"type": "text", "text": "Searching."}], stop="pause_turn")
        self.run_research([paused, self.reply(today)])
        again = FakeClaude.requests[1]["messages"]
        self.assertIs(again[-1]["content"], paused.content)                          # the very same objects


class Common(unittest.TestCase):
    def test_only_https_is_downloaded(self):
        with self.assertRaises(ValueError):
            common.fetch("http://example.com/")
        with self.assertRaises(ValueError):
            common.fetch("file:///etc/passwd")

    def test_redirects_never_leak_the_api_key(self):
        """A server that answers "moved, go there instead" must not be able to pull the football-data key
        onto plain http:// or onto another site."""
        handler = common._SafeRedirect()
        req = lambda: urllib.request.Request("https://api.football-data.org/v4/x", headers={"X-Auth-Token": "secret"})
        with self.assertRaises(ValueError):
            handler.redirect_request(req(), None, 302, "Found", {}, "http://api.football-data.org/v4/x")
        moved = handler.redirect_request(req(), None, 302, "Found", {}, "https://elsewhere.example/x")
        self.assertNotIn("secret", moved.headers.values())
        other_port = handler.redirect_request(req(), None, 302, "Found", {}, "https://api.football-data.org:8443/x")
        self.assertNotIn("secret", other_port.headers.values())
        same = handler.redirect_request(req(), None, 301, "Moved", {}, "https://api.football-data.org/v4/y")
        self.assertIn("secret", same.headers.values())
        same_port = handler.redirect_request(req(), None, 301, "Moved", {}, "https://api.football-data.org:443/v4/y")
        self.assertIn("secret", same_port.headers.values())                  # 443 is https's usual port
        self.assertTrue(any(isinstance(h, common._SafeRedirect) for h in common._OPENER.handlers))

    def test_save_replaces_the_whole_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.json")
            common.save_json(p, {"a": "São"})
            common.save_json(p, [1])
            self.assertEqual(common.load_json(p), [1])
            self.assertEqual(os.listdir(d), ["x.json"])            # no temporary file left behind
            self.assertEqual(common.load_json(os.path.join(d, "missing.json"), []), [])


class F1Records(unittest.TestCase):
    def test_reused_sessions_are_checked(self):
        good = {"code": "F1", "kind": "f1", "sess": "Q", "gp": "Italian Grand Prix", "wk": "f1|2026|16",
                "uid": "f1|2026|16|Q", "date": "2026-09-05", "utc": "2026-09-05T14:00:00Z"}
        self.assertTrue(bs._valid_f1(dict(good)))
        self.assertFalse(bs._valid_f1({**good, "sess": "<b>"}))
        self.assertFalse(bs._valid_f1({**good, "utc": "tomorrow"}))
        self.assertFalse(bs._valid_f1({**good, "uid": "f1|2026|16|R"}))



# a small square track, drawn the way f1-circuits-svg draws them: the lap, then a bar across it at the
# start/finish line (here halfway along the bottom side), then an arrow
SQUARE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
<path d="M100 100h300v300H100z" style="fill:none"/>
<path d="m245 390 10 0 0 20-10 0z" style="fill:#fff"/>
<path d="m1 1 2 2" style="fill:none"/></svg>"""
SVG_INDEX = [
    {"id": "square", "name": "Square Ring", "latitude": 45.0, "longitude": 9.0,
     "layouts": [{"layoutId": "square-1", "seasons": "1990-1999"}, {"layoutId": "square-2", "seasons": "2000-2025"}]},
    {"id": "las-vegas", "name": "Las Vegas Street Circuit", "latitude": 36.175, "longitude": -115.136389,
     "layouts": [{"layoutId": "las-vegas-1", "seasons": "2023-2026"}]},
    {"id": "caesars-palace", "name": "Caesars Palace", "latitude": 36.117, "longitude": -115.176,
     "layouts": [{"layoutId": "caesars-palace-1", "seasons": "1981-1982"}]},
    {"id": "bad", "name": "Broken", "latitude": "north", "longitude": 1, "layouts": [{"layoutId": "x", "seasons": "2026"}]},
    {"id": "evil", "name": "Evil", "latitude": 10, "longitude": 10, "layouts": [{"layoutId": "../../x", "seasons": "2026"}]},
]


class TrackOutlines(unittest.TestCase):
    """The second source of F1 track outlines (f1-circuits-svg) and the outlines kept from the last build."""

    def test_svg_paths_are_followed(self):
        self.assertEqual(bs._svg_points("M10 10h5v5H10z"), [(10, 10), (15, 10), (15, 15), (10, 15), (10, 10)])
        self.assertEqual(bs._svg_points("m1 2 3 4 5 6", step=10), [(1, 2), (4, 6), (9, 12)])   # after a move: lines
        self.assertEqual(bs._svg_points("M0 0H10", step=5), [(0, 0), (5, 0), (10, 0)])   # straights in short steps
        pts = bs._svg_points("M0 0c0 10 10 10 10 0s10-10 10 0", steps=2)
        self.assertEqual(pts[0], (0, 0))
        self.assertEqual(pts[2], (10, 0))
        self.assertEqual(pts[4], (20, 0))
        self.assertEqual(pts[3], (15, -7.5))                  # s mirrors the last control point
        self.assertEqual(bs._svg_points("M0 0L1 1ZM5 5L6 6")[:2], [(0, 0), (1, 1)])   # the first shape only
        self.assertNotIn((5, 5), bs._svg_points("M0 0L1 1ZM5 5L6 6"))
        for bad in ("L1 1", "M0 0L1", "M0 0Lnan 1"):
            with self.assertRaises(ValueError):
                bs._svg_points(bad)

    def test_seasons(self):
        self.assertTrue(bs._in_seasons("2003-2019,2021-2026", 2026))
        self.assertFalse(bs._in_seasons("2003-2019,2021-2026", 2020))
        self.assertTrue(bs._in_seasons("2021,2023-2026", 2021))
        self.assertFalse(bs._in_seasons("x-y", 2026))

    def index(self):
        with mock.patch.object(bs, "get_json", return_value=SVG_INDEX):
            return bs._svg_circuits()

    def test_index_entries_are_checked(self):
        self.assertEqual(len(self.index()), 3)                # a text latitude and an odd layout name are left out

    def test_outline_starts_at_the_start_finish_line(self):
        asked = []
        def fake(url):
            asked.append(url)
            return SQUARE_SVG.encode()
        with mock.patch.object(bs, "fetch", fake):
            L = bs._svg_outline(self.index(), 45.001, 9.001, 2026, "Autodromo Square")
        self.assertTrue(asked[0].endswith("/circuits/detailed/white/square-2.svg"))   # no 2026 layout: the newest
        self.assertTrue(bs._valid_layout(L))
        self.assertEqual((L["w"], L["h"], L["firstgp"], L["src"], L["length"]), (1000, 1000, "1990", "julesr0y", None))
        self.assertTrue(L["path"].startswith("M500 1000L"))   # the point nearest the bar, halfway along the bottom

    def test_street_circuit_placed_in_town_is_found_by_name(self):
        asked = []
        with mock.patch.object(bs, "fetch", lambda url: asked.append(url) or SQUARE_SVG.encode()):
            bs._svg_outline(self.index(), 36.1147, -115.173, 2026, "Las Vegas Strip Street Circuit")
        self.assertIn("las-vegas-1.svg", asked[0])            # not Caesars Palace, although that one is nearer
        self.assertIsNone(bs._svg_outline(self.index(), 50.0, 5.0, 2026, "Nowhere Ring"))

    def test_a_layout_without_the_start_line_gives_no_outline(self):
        def missing(url):
            raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
        with mock.patch.object(bs, "fetch", missing):
            self.assertIsNone(bs._svg_outline(self.index(), 45.0, 9.0, 2026))

    def test_outlines_read_back_are_checked(self):
        good = {"path": "M0 0L10 0L10 10Z", "w": 10, "h": 10, "length": 5793, "firstgp": "1950"}
        self.assertTrue(bs._valid_layout(good))
        for bad in ({**good, "path": 'M0 0" onload="x'}, {**good, "w": "10"}, {**good, "h": 0},
                    {**good, "src": "<b>"}, {**good, "firstgp": ["1950"]}, None, "M0 0Z"):
            self.assertFalse(bs._valid_layout(bad))
        race = {"sess": "R", "wk": "f1|2026|16", "circuit": {"layout": good}}
        broken = {"sess": "R", "wk": "f1|2026|17", "circuit": {"layout": {**good, "w": -1}}}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "fixtures.json")
            with open(path, "w") as f:
                json.dump({"matches": [race, broken, None, {"sess": "R", "circuit": "x"}]}, f)
            self.assertEqual(bs.previous_layouts(path), {"f1|2026|16": good})
            self.assertEqual(bs.previous_layouts(os.path.join(d, "missing.json")), {})

    def test_start_line_taken_from_a_drawing_that_fits(self):
        # an L-shaped track (no symmetry, so only one fit is right), and its drawing: turned a quarter,
        # mirrored, three times the size, and starting at point 50, where its start/finish bar is
        L = [(0, 0), (400, 0), (400, 100), (100, 100), (100, 300), (0, 300)]
        track = bs._resample(L, 200)
        drawing = [(-y * 3, x * 3) for x, y in track[50:] + track[:50]]
        self.assertLessEqual(abs(bs._start_index(track, drawing) - 50), 1)
        self.assertLess(bs._fit(track, drawing)[0], 0.01)

    def test_a_drawing_that_does_not_fit_lends_nothing(self):
        track = bs._resample([(0, 0), (400, 0), (400, 100), (100, 100), (100, 300), (0, 300)], 200)
        other = bs._resample([(0, 0), (300, 0), (300, 300), (0, 300)], 200)       # a different circuit
        self.assertIsNone(bs._start_index(track, other))

    def test_outline_starts_at_the_drawings_start_line(self):
        L = [(9.0, 45.0), (9.004, 45.0), (9.004, 45.001), (9.001, 45.001), (9.001, 45.003), (9.0, 45.003)]
        geo = [(x, y) for x, y in bs._resample(L, 120)]
        k = math.cos(math.radians(45.0))
        # the same shape in drawing units (y pointing down), starting at point 30
        metres = [((x - 9.0) * k * 111320, (45.0 - y) * 110574) for x, y in geo]
        drawing = metres[30:] + metres[:30]
        out = bs._f1_outline([{"points": geo, "props": {}}], 45.0, 9.0, drawing)
        first = tuple(int(n) for n in re.findall(r"\d+", out["path"])[:2])
        plain = bs._f1_outline([{"points": geo, "props": {}}], 45.0, 9.0)
        pts = [tuple(map(int, p)) for p in re.findall(r"(\d+) (\d+)", plain["path"])]
        self.assertGreater(math.dist(first, pts[0]), 100)                          # no longer the outline's first point
        def gap(p, a, b):                                                          # distance from p to the side a-b
            dx, dy = b[0] - a[0], b[1] - a[1]
            t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
            return math.dist(p, (a[0] + t * dx, a[1] + t * dy))
        self.assertLess(min(gap(first, a, b) for a, b in zip(pts, pts[1:] + pts[:1])), 3)   # but on the same line
        # and exactly where the drawing's start is: point 30, on the page's 1000-unit grid
        x0, y0 = min(x for x, _ in metres), min(y for _, y in metres)
        scale = 1000 / max(max(x for x, _ in metres) - x0, max(y for _, y in metres) - y0)
        want = ((metres[30][0] - x0) * scale, (metres[30][1] - y0) * scale)
        self.assertLess(math.dist(first, want), 2)

    def build_race(self, bacinger_up, saved):
        """from_f1 for one race at the square circuit, with the first outline source up or down."""
        race = {"season": "2026", "round": "20", "raceName": "Square Grand Prix", "date": "2026-10-25", "time": "19:00:00Z",
                "Circuit": {"circuitName": "Square Ring", "Location": {"lat": "45.0", "long": "9.0", "locality": "Q", "country": "R"}}}
        line = {"type": "Feature", "properties": {"length": 4000, "firstgp": 1950},
                "geometry": {"type": "LineString", "coordinates": [[9.0, 45.0], [9.01, 45.0], [9.01, 45.01], [9.0, 45.01], [9.0, 45.0]]}}
        def get_json(url, headers=None):
            if "races" in url:
                return {"MRData": {"RaceTable": {"Races": [race]}}}
            if url == bs.F1_LAYOUTS:
                if bacinger_up:
                    return {"features": [line]}
                raise OSError("down")
            if url.endswith("circuits.json"):
                return SVG_INDEX
            return []                                          # OpenF1: nothing to cross-check
        with mock.patch.object(bs, "get_json", get_json), mock.patch.object(bs, "fetch", lambda u: SQUARE_SVG.encode()), \
                mock.patch.object(bs, "previous_layouts", lambda: saved), redirect_stdout(io.StringIO()):
            recs = bs.from_f1(date(2026, 10, 20), now=datetime(2026, 10, 20, tzinfo=timezone.utc))
        return next(r for r in recs if r["sess"] == "R")["circuit"].get("layout")

    def test_outline_sources_in_order(self):
        kept = {"path": "M0 0L7 0L7 7Z", "w": 7, "h": 7, "length": None, "firstgp": "1950"}
        self.assertEqual(self.build_race(True, {"f1|2026|20": kept})["length"], 4000)       # f1-circuits first
        self.assertEqual(self.build_race(False, {"f1|2026|20": kept}), kept)               # then the last build's
        self.assertEqual(self.build_race(False, {})["src"], "julesr0y")                    # then f1-circuits-svg


class PublishSite(unittest.TestCase):
    """publish_site.py puts index.html, styles.css and js/ together into the one page visitors get. The workflow runs
    these checks before every build, so a page that would not work is never published."""
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def fake_site(self, folder, script="const a = 1;\n", style="body{color:red}\n", scripts=("js/a.js",)):
        os.makedirs(os.path.join(folder, "js"), exist_ok=True)
        tags = "".join(f'<script src="{s}"></script>\n' for s in scripts)
        with open(os.path.join(folder, "index.html"), "w", encoding="utf-8") as f:
            f.write('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' '
                    '\'unsafe-inline\'; object-src \'none\'">\n<script>\nwindow.early = 1;\n</script>\n'
                    '<link rel="stylesheet" href="styles.css">\n<body>\n' + tags + "</body>\n")
        for name, text in [("styles.css", style)] + [(s, script) for s in scripts]:
            with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
                f.write(text)

    def test_real_page_is_one_file(self):
        page = publish_site.build_page(self.ROOT)
        self.assertNotIn("<script src", page)
        self.assertNotIn('rel="stylesheet"', page)
        with open(os.path.join(self.ROOT, "styles.css"), encoding="utf-8") as f:
            self.assertIn(f.read().rstrip("\n"), page)

    def test_real_page_policy_lists_every_script_and_nothing_else(self):
        page = publish_site.build_page(self.ROOT)
        csp = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]*)">', page).group(1)
        src = re.search(r"script-src ([^;]*)", csp).group(1).split()
        scripts = re.findall(r"<script>(.*?)</script>", page, re.S)
        self.assertEqual(src, [publish_site._hash(s) for s in scripts])
        self.assertNotIn("'unsafe-inline'", src)
        self.assertNotIn("'self'", src)

    def test_every_script_file_is_in_the_page(self):
        """A file added to js/ but not listed in index.html would silently never run."""
        with open(os.path.join(self.ROOT, "index.html"), encoding="utf-8") as f:
            listed = re.findall(r'<script src="([^"]+)"></script>', f.read())
        present = sorted("js/" + n for n in os.listdir(os.path.join(self.ROOT, "js")) if n.endswith(".js"))
        self.assertEqual(sorted(listed), present)
        self.assertEqual(len(listed), len(set(listed)))

    def test_scripts_joined_in_listed_order(self):
        with tempfile.TemporaryDirectory() as d:
            self.fake_site(d, scripts=("js/b.js", "js/a.js"))
            for name, text in [("js/a.js", "const a = 1;\n"), ("js/b.js", "const b = 2;\n")]:
                with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                    f.write(text)
            page = publish_site.build_page(d)
        self.assertIn("<script>\nconst b = 2;\n\nconst a = 1;\n</script>", page)
        self.assertIn("<style>\nbody{color:red}\n</style>", page)

    def test_text_that_would_end_the_block_is_refused(self):
        for kind, text in [("script", 'const s = "</script><img src=x>";\n'), ("script", "// <!-- x\n"),
                           ("style", "body{}</style><script>alert(1)</script>\n")]:
            with tempfile.TemporaryDirectory() as d:
                self.fake_site(d, **({"script": text} if kind == "script" else {"style": text}))
                with self.assertRaises(ValueError):
                    publish_site.build_page(d)

    def test_only_the_sites_own_files_are_included(self):
        for src in ("../secret.js", "/etc/x.js", "https://evil.example/x.js", "js/a.txt"):
            with tempfile.TemporaryDirectory() as d:
                self.fake_site(d)
                with open(os.path.join(d, "index.html"), encoding="utf-8") as f:
                    html = f.read().replace("js/a.js", src)
                with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
                    f.write(html)
                with self.assertRaises(ValueError, msg=src):
                    publish_site.build_page(d)

    def test_a_script_or_stylesheet_tag_in_another_form_is_refused(self):
        """It would be published as a separate file that the policy then blocks (or not published at all)."""
        for old, new in [('<script src="js/a.js">', '<script defer src="js/a.js">'),
                         ('<script src="js/a.js">', '<script\nsrc="js/a.js">'),
                         ('<script src="js/a.js">', '<script\tsrc="js/a.js">'),
                         ('<script src="js/a.js">', '<SCRIPT src="js/a.js">'),
                         ('<link rel="stylesheet" href="styles.css">', "<link rel='stylesheet' href='styles.css'>"),
                         ('<link rel="stylesheet" href="styles.css">', '<link href="styles.css" rel=stylesheet>')]:
            with tempfile.TemporaryDirectory() as d:
                self.fake_site(d)
                with open(os.path.join(d, "index.html"), encoding="utf-8") as f:
                    html = f.read().replace(old, new)
                with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
                    f.write(html)
                with self.assertRaises(ValueError, msg=new):
                    publish_site.build_page(d)

    def test_fingerprint_follows_every_file(self):
        with tempfile.TemporaryDirectory() as d:
            self.fake_site(d)
            before = publish_site.fingerprint(d)
            self.assertEqual(before, publish_site.fingerprint(d))
            for name, extra in (("js/a.js", "/* x */\n"), ("styles.css", "/* x */\n"), ("index.html", "<p>x</p>\n")):
                with open(os.path.join(d, name), "a", encoding="utf-8") as f:
                    f.write(extra)
                after = publish_site.fingerprint(d)
                self.assertNotEqual(before, after, name)
                before = after

    def test_publish_writes_only_the_site(self):
        with tempfile.TemporaryDirectory() as d:
            self.fake_site(d)
            for name in ("soccer.ics", "fonts/x.woff2", "sitemap.xml", "og-image.png", "manifest.webmanifest", "icons/x.png",
                         "flags/x.svg", "build_schedule.py", "tests/t.py"):
                os.makedirs(os.path.dirname(os.path.join(d, name)), exist_ok=True)
                with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                    f.write("x")
            fixtures = '{"generated":"2026-09-27T19:08+00:00",\n"site":"000000000000",\n"matches":[\n]}\n'
            with open(os.path.join(d, "fixtures.json"), "w", encoding="utf-8") as f:
                f.write(fixtures)
            publish_site.publish(os.path.join(d, "_site"), d)
            # the published fixtures.json carries the fingerprint of the page published with it; the source copy is kept
            with open(os.path.join(d, "_site", "fixtures.json"), encoding="utf-8") as f:
                self.assertEqual(f.read(), fixtures.replace("000000000000", publish_site.fingerprint(d)))
            with open(os.path.join(d, "fixtures.json"), encoding="utf-8") as f:
                self.assertEqual(f.read(), fixtures)
            found = sorted(os.path.relpath(os.path.join(p, n), os.path.join(d, "_site"))
                           for p, _, names in os.walk(os.path.join(d, "_site")) for n in names)
            self.assertEqual(found, ["fixtures.json", "flags/x.svg", "fonts/x.woff2", "icons/x.png", "index.html",
                                    "manifest.webmanifest", "og-image.png", "sitemap.xml", "soccer.ics"])
            with self.assertRaises(ValueError):
                publish_site.publish(d, d)          # never over the source files

    def test_google_verification_file_is_published_only_when_it_is_one(self):
        name = "google1a2b3c4d5e6f7a8b.html"
        with tempfile.TemporaryDirectory() as d:
            self.fake_site(d)
            for extra in ("soccer.ics", "fonts/x.woff2", "sitemap.xml", "og-image.png", "manifest.webmanifest", "icons/x.png", "flags/x.svg"):
                os.makedirs(os.path.dirname(os.path.join(d, extra)), exist_ok=True)
                with open(os.path.join(d, extra), "w", encoding="utf-8") as f:
                    f.write("x")
            with open(os.path.join(d, "fixtures.json"), "w", encoding="utf-8") as f:
                f.write('{"matches":[]}\n')
            for other in ("google.html", "googleXYZ.html", "notgoogle1a2b3c4d5e6f7a8b.html"):   # not Google's names
                with open(os.path.join(d, other), "w", encoding="utf-8") as f:
                    f.write("<script>alert(1)</script>")
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write("google-site-verification: " + name)
            publish_site.publish(os.path.join(d, "_site"), d)
            self.assertEqual(sorted(n for n in os.listdir(os.path.join(d, "_site")) if n.endswith(".html")), sorted(["index.html", name]))
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write("<script>alert(1)</script>")          # the right name, other content: refused, loudly
            with self.assertRaises(ValueError):
                publish_site.publish(os.path.join(d, "_site2"), d)


class TeamBadges(unittest.TestCase):
    """Flags for national teams and ESPN crests for clubs (team_badges()): a team shown with another's flag or crest
    is worse than none, so names must match closely, ties give nothing, and only a flag code or a team number is kept."""
    @staticmethod
    def espn(*teams):
        return {"sports": [{"leagues": [{"teams": [{"team": t} for t in teams]}]}]}

    def test_national_teams_get_their_flag(self):
        flags, key = bs.flag_codes()
        got = lambda n: flags.get(key(n))
        for name, code in (("Germany", "de"), ("England", "gb-eng"), ("Wales", "gb-wls"), ("Scotland", "gb-sct"),
                           ("Türkiye", "tr"), ("Turkey", "tr"), ("Czechia", "cz"), ("United States", "us"),
                           ("Ivory Coast", "ci"), ("Curaçao", "cw"), ("Republic of Ireland", "ie"), ("Bosnia-Herzegovina", "ba")):
            self.assertEqual(got(name), code, name)
        self.assertIsNone(got("Tahiti"))      # no Tahiti flag in flag-icons, and French Polynesia's is not Tahiti's
        self.assertIsNone(got("Atlantis"))
        for code in set(flags.values()):     # every code found has its picture
            self.assertTrue(os.path.exists(os.path.join(PublishSite.ROOT, "flags", code + ".svg")), code)

    def test_club_words_and_closest_name(self):
        self.assertEqual(bs.team_words("Club Atlético de Madrid"), {"atletico", "madrid"})
        self.assertIn("atleticomg", bs.team_words("CA Mineiro"))
        self.assertIn("hamburg", bs.team_words("Hamburger SV"))
        teams = [({"manchester", "united", "man"}, "360"), ({"manchester", "city", "man"}, "382"),
                 ({"espanyol"}, "88"), ({"barcelona"}, "83")]
        self.assertEqual(bs.best_team("Manchester United FC", teams), "360")
        self.assertEqual(bs.best_team("Manchester City FC", teams), "382")
        self.assertEqual(bs.best_team("RCD Espanyol de Barcelona", teams), "88")   # the word that comes first wins a tie
        self.assertIsNone(bs.best_team("Manchester FC", teams))                    # City and United tie: no crest
        self.assertIsNone(bs.best_team("Liverpool FC", teams))

    def test_odd_espn_answers_are_left_out(self):
        answer = self.espn({"id": "359", "displayName": "Arsenal"}, {"id": "36x", "displayName": "Chelsea"},
                           {"id": 368, "displayName": "Everton"}, "not a team", {"team": 7},
                           {"id": "11826", "displayName": "Deportivo", "slug": "esp.deportivo_coruna"})
        with mock.patch.object(bs, "fetch_json", return_value=answer):
            got = bs._espn_teams("eng.1")
        self.assertEqual([(sorted(w), t) for w, t in got], [(["arsenal"], "359"), (["coruna"], "11826")])
        for bad in (ValueError("down"), {"sports": []}, {"sports": [{"leagues": [{"teams": "x"}]}]}):
            with mock.patch.object(bs, "fetch_json", side_effect=[bad] if isinstance(bad, Exception) else None, return_value=bad):
                self.assertEqual(bs._espn_teams("eng.1"), [])

    def test_badges_for_a_build(self):
        calls = []
        def fake(url, *a):
            calls.append(url)
            return self.espn({"id": "359", "displayName": "Arsenal"}) if "/eng.1/" in url else self.espn()
        recs = [{"code": "EPL", "home": "Arsenal FC", "away": "Chelsea FC"}, {"code": "EPL", "home": "Chelsea FC", "away": "Arsenal FC"},
                {"code": "UNL", "home": "Wales", "away": "Tahiti"}, {"code": "F1", "home": "", "away": ""}]
        with mock.patch.object(bs, "fetch_json", side_effect=fake):
            got = bs.team_badges(recs, previous={"Chelsea FC": {"crest": "363"}, "Wales": {"flag": "fr"}, "Arsenal FC": {"crest": "1"}})
        self.assertEqual(len(calls), 1)                                    # the Premier League list, once
        self.assertEqual(got["Arsenal FC"], {"crest": "359"})             # this build's answer beats the last one's
        self.assertEqual(got["Chelsea FC"], {"crest": "363"})             # not in this build's list: kept from the last
        self.assertEqual(got["Wales"], {"flag": "gb-wls"})                # flags come from the name, never the last build
        self.assertNotIn("Tahiti", got)
        self.assertTrue(all(bs.valid_badge(b) for b in got.values()))

    def test_previous_badges_are_checked(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "fixtures.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"badges": {"A": {"crest": "359"}, "B": {"flag": "de"}, "C": {"crest": "35x"}, "D": {"flag": "../x"},
                                      "E": "de", "F": {"crest": 359}, "G": {"flag": "de", "crest": "1"}}, "matches": []}, f)
            self.assertEqual(bs.previous_badges(path), {"A": {"crest": "359"}, "B": {"flag": "de"}})
            self.assertEqual(bs.previous_badges(os.path.join(d, "missing.json")), {})


class SearchAndSharing(unittest.TestCase):
    """What search engines and link previews read: the addresses in index.html, sitemap.xml and the preview picture
    must agree, since a mistake in any of them fails silently (a preview without a picture, a page left unindexed)."""
    ROOT = PublishSite.ROOT

    def setUp(self):
        with open(os.path.join(self.ROOT, "index.html"), encoding="utf-8") as f:
            self.html = f.read()
        self.alt = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', self.html))
        self.meta = dict(re.findall(r'<meta (?:property|name)="([^"]+)" content="([^"]*)">', self.html))

    def test_language_versions(self):
        self.assertEqual(set(self.alt), {"en", "pt", "x-default"})
        self.assertEqual(self.alt["x-default"], self.alt["en"])
        self.assertEqual(self.alt["pt"], self.alt["en"] + "?lang=pt")
        self.assertTrue(self.alt["en"].startswith("https://") and self.alt["en"].endswith("/"))
        # the script adds the one canonical link, for the language shown; one in the markup would apply to both
        self.assertNotIn('rel="canonical"', self.html)

    def test_sitemap_lists_exactly_the_language_versions(self):
        import xml.etree.ElementTree as ET
        root = ET.parse(os.path.join(self.ROOT, "sitemap.xml")).getroot()
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        self.assertEqual(root.tag, ns + "urlset")
        self.assertEqual([u.findtext(ns + "loc") for u in root], [self.alt["en"], self.alt["pt"]])
        self.assertIn("sitemap.xml", publish_site.COPY)

    def test_preview_picture_and_address(self):
        self.assertEqual(self.meta["og:url"], self.alt["en"])
        self.assertEqual(self.meta["og:image"], self.alt["en"] + "og-image.png")
        self.assertIn("og-image.png", publish_site.COPY)
        with open(os.path.join(self.ROOT, "og-image.png"), "rb") as f:
            head = f.read(24)
        self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n")
        size = (int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big"))
        self.assertEqual(size, (int(self.meta["og:image:width"]), int(self.meta["og:image:height"])))
        self.assertEqual(size, (1200, 630))
        self.assertLess(os.path.getsize(os.path.join(self.ROOT, "og-image.png")), 300_000)   # chat apps skip large pictures

    def png_size(self, name):
        with open(os.path.join(self.ROOT, name), "rb") as f:
            head = f.read(24)
        self.assertEqual(head[:8], b"\x89PNG\r\n\x1a\n", name + " is not a PNG picture")
        return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")

    def test_home_screen_manifest_and_icons(self):
        # "Add to Home Screen": phones read the manifest and the icons it names; a wrong size or a missing file fails
        # silently (the phone offers no install, or shows a blank icon)
        self.assertIn('<link rel="manifest" href="manifest.webmanifest">', self.html)
        self.assertIn('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', self.html)
        self.assertIn("manifest.webmanifest", publish_site.COPY)
        self.assertIn("icons", publish_site.COPY)
        with open(os.path.join(self.ROOT, "manifest.webmanifest"), encoding="utf-8") as f:
            m = json.load(f)
        self.assertEqual(m["name"], "Matchday Planner")
        self.assertLessEqual(len(m["short_name"]), 12)   # longer names are cut short under the icon
        # relative addresses: the site lives in /Match-Schedule/, not at the top of github.io
        self.assertEqual((m["start_url"], m["scope"], m["id"]), ("./", "./", "./"))
        self.assertIn(m["display"], ("standalone", "minimal-ui"))
        # no description or other text: the manifest has one language, and every visible string must exist in both
        self.assertEqual(set(m) - {"name", "short_name", "id", "start_url", "scope", "display", "background_color",
                                   "theme_color", "icons"}, set())
        sizes = {}
        for icon in m["icons"]:
            w, h = self.png_size(icon["src"])
            self.assertEqual(icon["sizes"], f"{w}x{h}", icon["src"])
            self.assertEqual(icon["type"], "image/png")
            sizes.setdefault(icon.get("purpose", "any"), set()).add(w)
        self.assertLessEqual({192, 512}, sizes["any"])   # the two sizes Chrome asks for before offering to install
        self.assertIn(512, sizes["maskable"])            # Android crops icons to its own shape
        self.assertEqual(self.png_size("icons/apple-touch-icon.png"), (180, 180))

    def test_title_and_description_match_the_english_text_the_script_sets(self):
        with open(os.path.join(self.ROOT, "js", "i18n.js"), encoding="utf-8") as f:
            i18n = f.read()
        title = re.search(r"<title>([^<]+)</title>", self.html).group(1)
        docs = re.findall(r'docTitle: "([^"]+)"', i18n)
        descs = re.findall(r'docDesc:\s*"([^"]+)"', i18n)
        self.assertEqual((docs[0], descs[0]), (title, self.meta["description"]))   # en comes first in the table
        self.assertEqual(len(docs), 2)
        self.assertEqual(len(descs), 2)
        for text in docs + descs + [self.meta["og:title"], self.meta["og:description"]]:
            self.assertNotIn("\u2014", text)                                          # no em dashes (project rule 6)


if __name__ == "__main__":
    unittest.main()
