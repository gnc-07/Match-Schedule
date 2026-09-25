"""
Checks for the Python build scripts. They use made-up data and never touch the network,
so they give the same result every time.

Run from the project folder:
  python3 -m unittest discover -s tests
"""
import os, sys, tempfile, unittest
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_schedule as bs
import cazetv
import common
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


class Common(unittest.TestCase):
    def test_only_https_is_downloaded(self):
        with self.assertRaises(ValueError):
            common.fetch("http://example.com/")
        with self.assertRaises(ValueError):
            common.fetch("file:///etc/passwd")

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


if __name__ == "__main__":
    unittest.main()
