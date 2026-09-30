# Maintaining Matchday Planner

Notes for the owner: how the project is put together, how to set it up from scratch, what runs by itself, and how to step in. Visitors do not need any of this; the [README](README.md) describes the site for them.

## How the pieces fit together

| Piece | What it does |
|---|---|
| `fonts/` | The site's typefaces, served from the site itself so visitors' browsers never contact a third-party font service (SIL Open Font Licence; licence files included) |
| `index.html` | The page's layout (its markup) and its security policy. It lists the files below that hold the rest. It has no fixture data of its own; it loads `fixtures.json`. |
| `styles.css` | How the site looks: every colour, size and animation speed. |
| `js/` | The script that makes the page work, one file per part: `i18n.js` (every sentence, in English and Portuguese), `settings.js` (language, time zone, theme, text size and other choices), `list.js` (the filters and the list of matches), `live.js` (live scores), `match.js` (match details), `race.js` (Formula 1 race weekend), `wide.js` (the layout on wide screens), `tables.js` (the Tables window) and `start.js` (loading the fixtures and keeping an open page up to date). They run in the order `index.html` lists them. |
| `publish_site.py` | Puts the page back together for visitors, as one file: fast to load, and an old part can never meet a new one. It also writes a fingerprint of the page's scripts into its security policy, so browsers refuse any other script. The workflow runs it before publishing. |
| `build_schedule.py` | Downloads league fixtures and the Formula 1 calendar, applies `overrides.json`, `friendlies.json` and `nations_league.json`, and writes `fixtures.json` (for the site) and `soccer.ics` (for calendar apps; football only). |
| `friendlies.json` | National-team friendlies, with every source report kept. |
| `nations_league.json` | UEFA Nations League (League A) matches, entered by hand in the same shape as `friendlies.json`, with the group and matchday as `round`. `research.py` does not touch it. Pushing a change to it rebuilds and republishes the site, like the other data files. |
| `sitemap.xml`, `og-image.png` | For search engines and link previews: the sitemap lists the page's two addresses (English and Portuguese) for Google Search Console, and the picture (1200 x 630 pixels) is what chat apps and social sites show when someone shares a link to the site. See "Being found in search engines" below. |
| `flags/` | The national team flags shown beside team names (from flag-icons, free to use under the MIT licence, whose terms are kept in the folder), packed into one file, `flags.json`, and unpacked when the site is published. To update them, follow the steps at the top of `flags/make.mjs`. Clubs' crests are not stored here: visitors' browsers load them from ESPN. |
| `manifest.webmanifest`, `icons/` | For "Add to Home Screen": the site's name and icons when a visitor keeps it on their phone's home screen, where it opens like an app, without the browser's address bar. |
| `overrides.json` | League kick-offs the main feed has not caught up with, with sources. |
| `cazetv.py` | Checks CazéTV's public YouTube feed on every build and adds a **Watch on CazéTV** link to matches it will stream. Matches on CazéTV's schedule whose stream does not exist yet (from the fan-made agendacazetv.com, not run by CazéTV) get a **CazéTV on YouTube** link to the channel instead. Both are remembered in `streams.json`. No key needed. |
| `common.py` | Small helpers the three scripts share: downloading (HTTPS only, with a size limit) and saving data files in one step, so a build that stops halfway never leaves a half-written file. |
| `tests/` | Checks that are never published, all run by one command, `npm test` (`run.mjs`, which ends with a summary of every group): `test_scripts.py` (the Python scripts, including the rule for when a time counts as verified), `security.mjs` (hostile data must never run in the page), `format.mjs` (lays out the page's JavaScript; run `npm run format` after editing `js/` or `index.html`), the accessibility checks, `corners.mjs` (a rounded shape sitting close inside another must have parallel corners), `layout.mjs` (on wide screens the filter sidebar and the right-hand column never cover the footer), `browsers.mjs` (the site loads and works in Chromium, Firefox and WebKit, the engines behind Chrome, Edge, Firefox and Safari), the Lighthouse checks, and two for the animations: `motion-check.mjs` (`npm run test:motion`: only smooth, cheap properties move, all at the shared speeds, and closing and gliding stay gentle frame by frame, with no jumps; add Firefox with `FIREFOX_PATH`) and `motion-videos.mjs` (records them as videos for a pull request). |
| `research.py` | Once a day, asks Claude (with web search) to find sources for missing kick-off times and new friendlies, and adds them to the two files above. Optional: runs only if you add an Anthropic API key. |
| `.github/workflows/tests.yml` | Runs the test suite on GitHub's computers, in all three browser engines, whenever you push a branch other than `main`. It only reads the code: it publishes nothing and saves nothing. |
| `.github/workflows/build-and-deploy.yml` | Instructions for GitHub Actions: four times a day, check the scripts, run them, save any changed data, and publish the site to GitHub Pages; once a day, run the research first. |

This is a *static site*: GitHub Pages only hands out files, it never runs code on request. The fixture list stays current because GitHub Actions rebuilds the files on a timer. Live scores work differently: the visitor's own browser asks ESPN's public scoreboard for the score every 30 seconds while a listed match is on, so no server of ours is involved.

Match details and league tables work the same way: when a visitor opens them, their browser asks ESPN. Stadium maps are found through Wikidata and drawn with OpenStreetMap map images. Formula 1 track diagrams are drawn from the [f1-circuits](https://github.com/bacinger/f1-circuits) project (MIT licence, Copyright (c) 2019-2025 Tomislav Bacinger; unofficial), which the rebuild reads and stores with each race. If that project cannot be read, or has no drawing for a circuit, the rebuild keeps the drawing the race had at the previous update; failing that, it uses [f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg) (CC BY 4.0, Copyright (c) 2024-2026 ROY Jules; unofficial), whose drawings mark the start/finish line but are not always turned with north at the top. The race weekend's source line credits whichever project drew the track shown.

The dot on the track diagram marks the start/finish line. f1-circuits does not say where its outlines begin (Monaco's began at Casino Square), so the rebuild also reads the f1-circuits-svg drawing, which marks the line, turns and resizes it to lie over the f1-circuits outline, and starts the outline there. It does this only when the two shapes fit closely (`MATCH_LIMIT` in `build_schedule.py`); otherwise the outline keeps its own first point. In September 2026 that moved the dot for Monaco, Silverstone, Monza, the Hungaroring, Suzuka, Barcelona, Spa, Montreal and Zandvoort.

If ESPN does not answer, the page falls back on its own. For the Bundesliga, the browser asks [OpenLigaDB](https://www.openligadb.de/) instead (free, no key, run by volunteers; it has no match clock and lists goals only, not cards or line-ups). For the league tables, every rebuild also works out each league's table from the season's results in the league fixtures source (`standings()` in `build_schedule.py`) and saves it in `fixtures.json` under `tables`. When ESPN cannot be reached, the page asks OpenLigaDB for the Bundesliga table first and shows the saved table only if that fails too; for the other leagues it shows the saved table straight away, with a note. Only this season's results count: when the fixtures source has no file for the new season yet, there is no saved table. It sorts by points, then goal difference, then goals scored, so teams level on points may be ordered differently from the official table, and it does not know about points deductions. No free source that visitors' browsers may use was found for live scores in the Premier League, La Liga, the Brasileirão or friendlies: while ESPN is down those show the final score only, from the league feed, after the next rebuild.

## Security

- **The page treats every outside answer as untrusted.** Names, venues and scores from the feeds, ESPN, OpenLigaDB, Jolpica-F1 and Wikidata are escaped before they are shown, and outside links are only used if they are ordinary web addresses. `npm run test:security` checks this with deliberately hostile data.
- **A Content-Security-Policy** (a `<meta>` tag at the top of `index.html`) tells browsers which servers the page may contact. If you add a new outside service, add its address there, or browsers will block it. When the site is published, `publish_site.py` also lists a fingerprint of each of the page's scripts in it, so browsers run those scripts and refuse any other, even one an attacker managed to slip into the page.
- **The workflow has the least access it needs.** Each job gets only its own permissions, the push key is handed to git only in the step that saves data, and the `anthropic` package is installed at a fixed version (change the version number in the workflow to update it).
- **Nothing secret is in the repository.** The optional keys live in GitHub's encrypted secrets (Settings, Secrets and variables, Actions).

## Setting it up (web browser only, about 15 minutes)

1. **Use your repository `gnc-07/Match-Schedule`.** It must be **Public** for free GitHub Pages: check under **Settings**, **General**, at the bottom (**Danger Zone**, Change visibility).

2. **Upload the files.** On the new repository's page, click **uploading an existing file**. Drag in `index.html`, `styles.css`, `publish_site.py`, `build_schedule.py`, `cazetv.py`, `common.py`, `research.py`, `friendlies.json`, `nations_league.json`, `overrides.json`, `sitemap.xml`, `og-image.png`, `manifest.webmanifest`, `README.md`, `MAINTAINING.md` and the whole `js`, `fonts`, `icons`, `flags` and `tests` folders (drag each folder itself; GitHub keeps them as folders; the workflow runs the checks in `tests` before every build), then click **Commit changes**.

3. **Add the workflow file.** Folders whose names start with a dot are hidden by most file managers (in Dolphin on Fedora KDE, press Ctrl+H to show them), and they are easy to miss when dragging. The reliable way: click **Add file**, then **Create new file**. In the name box type `.github/workflows/build-and-deploy.yml` (typing each `/` creates a folder). Paste in the contents of that file, then **Commit changes**.

4. **Turn on GitHub Pages.** Go to **Settings**, then **Pages** (left sidebar). Under **Build and deployment**, set **Source** to **GitHub Actions**.

5. **Check workflow permissions.** Go to **Settings**, **Actions**, **General**. Under **Workflow permissions**, choose **Read repository contents permission** and click **Save**. This keeps the default key read-only, so a workflow gets write access only when it asks for it; `build-and-deploy.yml` asks for exactly what each of its jobs needs.

6. **(Optional) Add the football-data.org key.** If you registered for one, go to **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Name: `FOOTBALL_DATA_TOKEN`; value: your key. Secrets are encrypted and never appear in the public files or logs. Without a key the site uses openfootball.

7. **(Optional) Turn on automatic research.** Create an API key at console.anthropic.com (this is billed separately from a Claude subscription). In the Console, set a monthly spend limit under **Billing** or **Limits** so it can never cost more than you choose. Then add a repository secret named `ANTHROPIC_API_KEY` with the key as its value, as in step 6. The research runs once a day, makes at most 4 requests of at most 5 web searches each, and prints its token and search counts in the Actions log so you can see what it costs. To change the cap, add a repository *variable* (Settings, Secrets and variables, Actions, Variables tab) named `RESEARCH_MAX_CALLS`.

8. **Run it the first time.** Open the **Actions** tab. If GitHub asks whether to enable workflows, confirm. Click **Build and deploy site** on the left, then **Run workflow**, then the green **Run workflow** button. After a minute or two both jobs (build, deploy) show a green tick.

9. **Open your site** at `https://gnc-07.github.io/Match-Schedule/`. The deploy job also shows this link.

10. **Subscribe in Proton Calendar** with `https://gnc-07.github.io/Match-Schedule/soccer.ics` (Settings, Calendars, Other calendars, Add calendar from URL). If you subscribed to an earlier feed, remove that calendar so matches do not appear twice.

If you already made a repository from the earlier calendar-only instructions, you can reuse it: delete `.github/workflows/update-calendar.yml` there (otherwise two workflows compete to commit), then do steps 2 to 9.

## What runs by itself

- **Fixture data** is rebuilt four times a day, and the site republished.
- **Missing kick-off times and new friendlies** are researched daily (with the API key), with every source kept and the verification rule applied.
- **New seasons** are picked up automatically: the script looks for the current season's openfootball folder and falls back to the previous one until the new file exists.
- **Bad data never replaces good data:** if a build finds fewer than 20 upcoming league matches, it stops and the last good version of the site stays up. GitHub emails you when a run fails.
- **The schedule stays switched on:** GitHub pauses scheduled workflows after 60 days without repository activity, so the workflow makes an empty commit after 45 quiet days.
- **Live scores** need no maintenance; they are fetched by each visitor's browser.
- **League kick-off times are cross-checked** on every rebuild: each time football-data.org gives as final is compared with openfootball and ESPN's public scoreboard. When two agree the match shows "verified"; when they disagree it keeps football-data.org's time with a "conflicting reports" warning and both times under Sources; when only one source has a time nothing changes. Rounds where every match sits at the same clock time are placeholders (football-data.org marks months of Premier League placeholders as final), so they are not checked. If football-data.org is down and openfootball is the main feed, nothing is cross-checked that run. The Actions log shows, per league, how many matches each source matched.
- **Formula 1** needs no maintenance: every session of every race weekend comes from Jolpica-F1 (free, no key), and a time is marked verified when OpenF1 lists the same time. After a race, sprint or qualifying session, the next rebuild adds the winner, podium or pole. Each race also gets its track outline from f1-circuits; a circuit that project has not drawn yet shows a map instead. If Jolpica-F1 cannot be reached, the F1 sessions already published stay up, and F1 problems never stop the football schedule from publishing.
- **Match details and league tables** need no maintenance either; they are fetched the same way when a visitor opens them.
- **Finished matches** stay on the list for a day after kick-off, with the final score.

To have the research run immediately instead of waiting for the daily run: Actions, **Build and deploy site**, **Run workflow**, tick **Also research missing kick-off times**.

## Day-to-day maintenance (only if you want to step in)

- **A new friendly is announced, or a time is confirmed:** open `friendlies.json` (or `overrides.json` for league matches, or `nations_league.json` for the Nations League) on GitHub, click the pencil icon, add a report, and **Commit changes**. The workflow rebuilds and republishes within a couple of minutes.
- **Something looks wrong:** the **Actions** tab shows every run; click one and open a step to read its log.
- **Live scores missing:** they depend on ESPN's public feed, which is unofficial and could change without notice. The rest of the site keeps working if it does. Bundesliga scores then come from OpenLigaDB (the Live now box says so); the other leagues show their final score after the next rebuild.
- **Line-ups, match events or tables missing:** they come from the same ESPN feed. When ESPN does not answer, the tables still show (from OpenLigaDB for the Bundesliga, otherwise worked out from results, with a note saying so). Line-ups usually appear about an hour before kick-off, and ESPN does not always list the coach. Friendlies often have little or no detail.
- **A stadium has no map, or the wrong one:** the stadium was not found (or was mistaken for something else) on Wikidata. The rest of the match details still show.

### Adding a report
Add an object to the match's `reports` list:

    {"source": "La Nación", "url": "https://...", "date": "2026-10-03", "time": "20:00", "tz": "America/Argentina/Buenos_Aires"}

`time` is the local kick-off time in the zone `tz` that the source uses (IANA names such as `Europe/Madrid`, `America/Sao_Paulo`). Add `"official": true` only for a federation, league, club or official ticketing source. If a source shows a time without saying which zone, write what it shows in `"comment"` instead of `time`.

A time is shown as **verified** only when an official source gives it or at least two independent sources agree. Otherwise the match stays "time TBC" and the reported times are listed.

## Being found in search engines

The page already tells search engines what they need: a title and description in each language, the English and Portuguese addresses (`hreflang` links in `index.html`, and `sitemap.xml`), and a picture and summary for link previews (the `og:` tags). Search engines still have to be told the site exists. This part only you can do, because it needs your Google account. Do it once:

1. Open [Google Search Console](https://search.google.com/search-console) and sign in.
2. Click **Add property**, choose **URL prefix** (not Domain: a github.io address cannot be verified as a domain), type `https://gnc-07.github.io/Match-Schedule/` and click **Continue**.
3. Choose the **HTML file** method and click the download button. You get a file named like `google1a2b3c4d5e6f7a8b.html`. Do not rename or open and re-save it.
4. On GitHub, open the repository, click **Add file**, then **Upload files**, drag the file in and click **Commit changes**. This starts the workflow; wait for its run in the **Actions** tab to finish (about two minutes), then click **Verify** in Search Console. Leave the file in place afterwards: removing it un-verifies the site. `publish_site.py` publishes such a file only if its name and its one line of content are exactly what Google gave; anything else stops publishing with an error in the Actions log, because a different HTML file beside the page would not be covered by its security policy.
   (Alternatively, choose the **HTML tag** method: paste the `<meta name="google-site-verification" ...>` line Google shows on its own line directly under the `<meta name="description" ...>` line in `index.html` (on GitHub: open the file, click the pencil icon, paste, **Commit changes**), wait for the Actions run, then click **Verify**.)
5. In Search Console, open **Sitemaps** (left menu), type `sitemap.xml` in the box and click **Submit**.
6. Open **URL inspection** (top search bar), paste `https://gnc-07.github.io/Match-Schedule/`, press Enter, then click **Request indexing**. Do the same for `https://gnc-07.github.io/Match-Schedule/?lang=pt`.
7. Optional: in [Bing Webmaster Tools](https://www.bing.com/webmasters), choose **Import from Google Search Console**. This also covers DuckDuckGo, which uses Bing's results.

After a few weeks, **Performance** in Search Console shows which searches found the site and how often it was clicked.

Two limits come from the address, not the page. A `robots.txt` file only works at the root of a host (`gnc-07.github.io/robots.txt`), which this repository cannot publish; the site does not need one. And Google shows a site's own name above its results only for a whole domain, not a folder such as `/Match-Schedule/`; a custom domain (Settings, Pages, Custom domain, after buying one) would allow that, and would move the address, so every `https://gnc-07.github.io/Match-Schedule/` in `index.html` and `sitemap.xml` would change with it.

To see a link preview, paste the site's address into a chat with yourself (WhatsApp, Signal, Messages). Apps remember a preview for a while, so a changed picture can take days to show there.

## Optional: working from the terminal instead

If you would rather edit on your own computer, these commands do the same as the web steps. Each part is explained.

```bash
git clone https://github.com/gnc-07/Match-Schedule.git
```
`git` is the version-control program. `clone` downloads a copy of the repository, including its full history, into a new folder named `Match-Schedule` in your current directory.

```bash
cd Match-Schedule
```
`cd` (change directory) moves your terminal into that folder, so the next commands act on it.

```bash
python3 build_schedule.py
```
Runs the build script with Python 3, exactly as the workflow does, so you can check your edits before publishing. It writes `fixtures.json` and `soccer.ics` in this folder.

```bash
python3 -m http.server 8000
```
`-m http.server` runs Python's built-in web server module; `8000` is the port. Open `http://localhost:8000` in a browser to see the site with your local data. Press Ctrl+C in the terminal to stop it. (Opening `index.html` directly as a file does not work, because browsers block a page from loading `fixtures.json` from disk.) This shows the page from its separate files. To see exactly what visitors get, one file put together by `publish_site.py`, run `python3 publish_site.py _site` and then `python3 -m http.server 8000 -d _site` (`-d` serves that folder instead of the current one). `_site` is a copy you can delete; git ignores it.

```bash
git add friendlies.json
```
`add` stages a changed file: it marks that file's current state to be included in the next commit. You can list several files, or use `git add .` for every change in the folder.

```bash
git commit -m "Add Argentina v Benin kick-off time"
```
`commit` records the staged changes as one snapshot in the history. `-m` supplies the message describing the change; keep it short and specific.

```bash
git pull --rebase
```
The workflow commits data on its own, so GitHub usually has commits you do not. `pull` fetches them; `--rebase` replays your commit on top of them, keeping the history in a straight line instead of adding a merge commit.

```bash
git push
```
Uploads your commits to GitHub. Because you changed `friendlies.json`, the push starts the workflow, which rebuilds and republishes the site.

## Running the tests

One command runs every check and ends with a table of what passed and what failed:

```bash
npm test
```
`npm` is Node.js's package tool; `test` runs the script of that name in `package.json`, which is `node tests/run.mjs`. It runs the groups (format, python, security, accessibility, design, browsers, motion) side by side, then Lighthouse (speed) on its own, because Lighthouse measures how fast the page is and would score lower while sharing the computer. It keeps going when one fails, so one run shows everything that needs attention: a check that passes prints one line, one that fails prints everything it found. It takes about two minutes (it took about seven when the checks ran one after another).

```bash
npm run test:quick
```
`run` is needed for any script other than `test`. This one runs only the fast groups (under a minute); good while working, before the full run at the end.

```bash
npm test -- browsers
```
The `--` tells npm that what follows is for the test runner, not for npm. Name one or more groups to run only those; `npm test -- --skip speed` runs all but those named; `npm test -- --list` shows every group and what it checks; `--verbose` prints every line each check writes; `--serial` runs one check at a time with its output as it happens, which is slower but easier to follow when chasing one problem.

**First time only**, after `npm install`, download the two test browsers Playwright uses for Firefox and Safari:

```bash
npx playwright install firefox webkit
```
`npx` runs a tool from the project's `node_modules` folder; `playwright install` downloads its own copies of the browsers (they do not replace the Firefox you browse with). Chromium comes from your system, as for the other tests; on Fedora, `sudo dnf install chromium` if it is missing. WebKit is Safari's engine; Playwright supports it officially on Ubuntu and Debian, so on Fedora it may refuse to start for want of a system library. The browser group then shows **PART**, meaning it passed in the browsers that ran. The test run on GitHub (below) always has all three.

**On GitHub:** every push to a branch other than `main` runs the whole suite except Lighthouse (whose speed score varies on GitHub's shared computers) in all three browsers. Open the **Actions** tab, click **Tests** on the left, and open the newest run: a green tick means everything passed. If a check fails, the run's page has a **test-screenshots** download at the bottom with the pictures the tests took.

## Test results

Last measured with Lighthouse 12 on a local copy (mobile and desktop, both languages): performance 91 to 100, accessibility 100, SEO 100, best practices 96. The test server compresses the page the way GitHub Pages does, so these scores reflect what visitors actually download. Best practices loses points there only because the test machine could not reach ESPN, which Lighthouse counts as an error. An axe-core scan (WCAG 2.2 AA plus best practices) found no violations in 128 combinations: light and dark themes, both languages, phone, laptop and monitor widths, with the filter sidebar hidden, the Settings and Calendar menus open, the league tables (a league and the F1 championship), the match details, the F1 race weekend, and high contrast.

To add a language, copy the `en` block in the `I18N` table in `js/i18n.js`, translate the values, and add an option to the language list in the Settings menu.
