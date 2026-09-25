# Matchday Planner

A public website listing upcoming Premier League, La Liga, Bundesliga, Brasileirão and national-team friendly fixtures, plus every Formula 1 session, with kick-off times cross-checked against official and press sources, and a calendar feed people can subscribe to.

## How the pieces fit together

| Piece | What it does |
|---|---|
| `fonts/` | The site's typefaces, served from the site itself so visitors' browsers never contact a third-party font service (SIL Open Font Licence; licence files included) |
| `index.html` | The whole website: layout, styles and the script that draws the list, the match details and the league tables. It has no fixture data of its own; it loads `fixtures.json`. |
| `build_schedule.py` | Downloads league fixtures and the Formula 1 calendar, applies `overrides.json` and `friendlies.json`, and writes `fixtures.json` (for the site) and `soccer.ics` (for calendar apps; football only). |
| `friendlies.json` | National-team friendlies, with every source report kept. |
| `overrides.json` | League kick-offs the main feed has not caught up with, with sources. |
| `cazetv.py` | Checks CazéTV's public YouTube feed on every build and adds a **Watch on CazéTV** link to matches it will stream. Matches on CazéTV's schedule whose stream does not exist yet (from the fan-made agendacazetv.com, not run by CazéTV) get a **CazéTV on YouTube** link to the channel instead. Both are remembered in `streams.json`. No key needed. |
| `research.py` | Once a day, asks Claude (with web search) to find sources for missing kick-off times and new friendlies, and adds them to the two files above. Optional: runs only if you add an Anthropic API key. |
| `.github/workflows/build-and-deploy.yml` | Instructions for GitHub Actions: four times a day, run the script, save any changed data, and publish the site to GitHub Pages; once a day, run the research first. |

This is a *static site*: GitHub Pages only hands out files, it never runs code on request. The fixture list stays current because GitHub Actions rebuilds the files on a timer. Live scores work differently: the visitor's own browser asks ESPN's public scoreboard for the score every 30 seconds while a listed match is on, so no server of ours is involved.

Match details and league tables work the same way: when a visitor opens them, their browser asks ESPN. Stadium maps are found through Wikidata and drawn with OpenStreetMap map images.

## Setting it up (web browser only, about 15 minutes)

1. **Use your repository `gnc-07/Match-Schedule`.** It must be **Public** for free GitHub Pages: check under **Settings**, **General**, at the bottom (**Danger Zone**, Change visibility).

2. **Upload the files.** On the new repository's page, click **uploading an existing file**. Drag in `index.html`, `build_schedule.py`, `research.py`, `friendlies.json`, `overrides.json`, `README.md` and the whole `fonts` folder (drag the folder itself; GitHub keeps it as a folder), then click **Commit changes**.

3. **Add the workflow file.** Folders whose names start with a dot are hidden by most file managers (in Dolphin on Fedora KDE, press Ctrl+H to show them), and they are easy to miss when dragging. The reliable way: click **Add file**, then **Create new file**. In the name box type `.github/workflows/build-and-deploy.yml` (typing each `/` creates a folder). Paste in the contents of that file, then **Commit changes**.

4. **Turn on GitHub Pages.** Go to **Settings**, then **Pages** (left sidebar). Under **Build and deployment**, set **Source** to **GitHub Actions**.

5. **Check workflow permissions.** Go to **Settings**, **Actions**, **General**. Under **Workflow permissions**, choose **Read and write permissions** and click **Save**. The workflow asks for write access itself, but this makes sure nothing overrides it.

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
- **Formula 1** needs no maintenance: every session of every race weekend comes from Jolpica-F1 (free, no key), and a time is marked verified when OpenF1 lists the same time. After a race, sprint or qualifying session, the next rebuild adds the winner, podium or pole. If Jolpica-F1 cannot be reached, the F1 sessions already published stay up, and F1 problems never stop the football schedule from publishing.
- **Match details and league tables** need no maintenance either; they are fetched the same way when a visitor opens them.
- **Finished matches** stay on the list for a day after kick-off, with the final score.

To have the research run immediately instead of waiting for the daily run: Actions, **Build and deploy site**, **Run workflow**, tick **Also research missing kick-off times**.

## Day-to-day maintenance (only if you want to step in)

- **A new friendly is announced, or a time is confirmed:** open `friendlies.json` (or `overrides.json` for league matches) on GitHub, click the pencil icon, add a report, and **Commit changes**. The workflow rebuilds and republishes within a couple of minutes.
- **Something looks wrong:** the **Actions** tab shows every run; click one and open a step to read its log.
- **Live scores missing:** they depend on ESPN's public feed, which is unofficial and could change without notice. The rest of the site keeps working if it does.
- **Line-ups, match events or tables missing:** they come from the same ESPN feed. Line-ups usually appear about an hour before kick-off, and ESPN does not always list the coach. Friendlies often have little or no detail.
- **A stadium has no map, or the wrong one:** the stadium was not found (or was mistaken for something else) on Wikidata. The rest of the match details still show.

### Adding a report
Add an object to the match's `reports` list:

    {"source": "La Nación", "url": "https://...", "date": "2026-10-03", "time": "20:00", "tz": "America/Argentina/Buenos_Aires"}

`time` is the local kick-off time in the zone `tz` that the source uses (IANA names such as `Europe/Madrid`, `America/Sao_Paulo`). Add `"official": true` only for a federation, league, club or official ticketing source. If a source shows a time without saying which zone, write what it shows in `"comment"` instead of `time`.

A time is shown as **verified** only when an official source gives it or at least two independent sources agree. Otherwise the match stays "time TBC" and the reported times are listed.

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
`-m http.server` runs Python's built-in web server module; `8000` is the port. Open `http://localhost:8000` in a browser to see the site with your local data. Press Ctrl+C in the terminal to stop it. (Opening `index.html` directly as a file does not work, because browsers block a page from loading `fixtures.json` from disk.)

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

## Match details and league tables

- Every match card has a **Match details** button. It opens a panel over the list with the score, a timeline of goals, cards and substitutions, the line-ups (formation, coach, and each player's goals, cards and substitutions), the stadium with a small map, and buttons to add that one match to a calendar, share it, or open its league table. During a match it refreshes every 30 seconds.
- The panel has its own web address (`?match=` followed by the match's code), so the browser's Back button closes it, and a shared link opens the same match.
- Each Formula 1 race card has a **Race weekend** button. It opens the same kind of panel with the weekend's schedule, the results of qualifying, the sprint and the race (podium, places gained, fastest lap, retirements), the championship (drivers or teams; star a driver to highlight them), and the circuit on a small map. Results and standings come from Jolpica-F1 when the panel opens.

- The **Tables** button in the header shows the Premier League, La Liga, Bundesliga and Brasileirão tables. Starred teams are highlighted.

## Languages, time zones and accessibility

- The site is in English and Brazilian Portuguese. It follows the visitor's browser language, remembers a choice made in the Settings menu, and can be linked directly with `?lang=pt` or `?lang=en` (for example `https://gnc-07.github.io/Match-Schedule/?lang=pt`).
- The Settings menu also has **Contrast** (Normal or High, for stronger colours and borders) and **Text size** (Normal, Large or Extra large). Both apply straight away and are remembered on the device.
- In the Settings menu, times can be shown in Edmonton, São Paulo (Brasília), Toronto, London, Madrid, Berlin, UTC, or the visitor's own zone. Portuguese defaults to São Paulo and English to Edmonton until the visitor picks a zone.
- To add a language, copy the `en` block in the `I18N` table near the top of the script in `index.html`, translate the values, and add an option to the language list in the Settings menu.
- Last measured with Lighthouse 12 on a local copy (mobile and desktop, both languages): performance 92 to 100, accessibility 100, SEO 100, best practices 96. Best practices loses points there only because the test machine could not reach ESPN, which Lighthouse counts as an error. An axe-core scan (WCAG 2.2 AA plus best practices) found no violations in 72 combinations: light and dark themes, both languages, phone and desktop widths, with the Settings and Calendar menus open, the league tables, the match details, the F1 race weekend, and high contrast.
