# Matchday Planner

A public website listing upcoming Premier League, La Liga, Bundesliga, Brasileirão and national-team friendly fixtures, with kick-off times cross-checked against official and press sources, and a calendar feed people can subscribe to.

## How the pieces fit together

| Piece | What it does |
|---|---|
| `index.html` | The whole website: layout, styles and the script that draws the list. It has no fixture data of its own; it loads `fixtures.json`. |
| `build_schedule.py` | Downloads league fixtures, applies `overrides.json` and `friendlies.json`, and writes `fixtures.json` (for the site) and `soccer.ics` (for calendar apps). |
| `friendlies.json` | National-team friendlies, with every source report kept. |
| `overrides.json` | League kick-offs the main feed has not caught up with, with sources. |
| `research.py` | Once a day, asks Claude (with web search) to find sources for missing kick-off times and new friendlies, and adds them to the two files above. Optional: runs only if you add an Anthropic API key. |
| `.github/workflows/build-and-deploy.yml` | Instructions for GitHub Actions: four times a day, run the script, save any changed data, and publish the site to GitHub Pages; once a day, run the research first. |

This is a *static site*: GitHub Pages only hands out files, it never runs code on request. The fixture list stays current because GitHub Actions rebuilds the files on a timer. Live scores work differently: the visitor's own browser asks ESPN's public scoreboard for the score every 30 seconds while a listed match is on, so no server of ours is involved.
