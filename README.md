# Matchday Planner
<img width="1200" height="630" alt="og-image" src="https://github.com/user-attachments/assets/6890b411-fe5d-402d-bd52-d82162902db3" />

**Football and Formula 1 fixtures in your own time zone, with kick-off times you can trust.**

Open the site: **https://gnc-07.github.io/Match-Schedule/** (em português: [`?lang=pt`](https://gnc-07.github.io/Match-Schedule/?lang=pt))

Matchday Planner is a free website that lists upcoming matches from the **Premier League, La Liga, Bundesliga, Brasileirão**, the **CONMEBOL Libertadores**, the **UEFA Nations League** (League A) and **national-team friendlies**, together with every **Formula 1** session. It shows each kick-off in the time zone you choose, follows live scores while matches are on, and offers a calendar feed so the fixtures appear in your own calendar app. There is nothing to install and no account to create.

## What you can do with it

- **See what is on, and when.** Matches are grouped by day. Filter by league, by date (today, this weekend, the next seven days or your own range) or by team name.
- **Follow your teams.** Tap the star next to a team. Its next matches then appear under **Your teams** at the top of the list, and "Starred teams only" shows just its matches. In Formula 1, a star next to a driver highlights that driver in results and standings. Stars are remembered on your device.
- **Follow live scores.** While a match is on, its score updates every 30 seconds without reloading the page.
- **Open the match details.** Each match has a **Match details** button with the score, goals, cards and substitutions, the line-ups, the league table and a map of the stadium. You can share a link to one match or add it to your calendar. For clubs, **News** opens each club's page on ESPN (ESPN Brasil in Portuguese) in a new tab.
- **Follow a Formula 1 weekend.** Every practice, qualifying, sprint and race session is listed. The **Race weekend** button shows the schedule, results, the championship standings and a drawing of the track.
- **Check the league tables** with the **Tables** button: all four leagues, the Libertadores and Nations League (League A) groups, plus the F1 drivers' and teams' championships.
- **Keep it on your home screen.** On an Android phone, open the site in Chrome, tap the menu (three dots) and choose **Add to Home screen** (or **Install app**). On an iPhone, open it in Safari, tap **Share** and choose **Add to Home Screen**. The site then opens from its own icon, like an app.
- **Put the fixtures in your calendar.** The **Calendar** button gives you a feed you can subscribe to in Google Calendar, Apple Calendar, Outlook, Proton Calendar and most other apps. Subscribed calendars update by themselves when a time changes. (The feed covers football only.)
- **See where to watch.** Match details and Race weekend name the official broadcasters in Canada and Brazil, only when an official source names them or two sources agree.
- **Watch on CazéTV.** When the Brazilian YouTube channel CazéTV is streaming a match, the card shows a link to the stream. These streams are usually only available in Brazil.

## How kick-off times are checked

Friendly and early-season kick-off times are often announced late, and different websites sometimes disagree. Matchday Planner therefore marks a time as **verified** only when an official source (a league, federation, club or official ticket seller) gives it, or when **at least two independent sources agree**. Until then, the match is shown as "time to be confirmed", together with the times that have been reported and where each one came from. Every match card has a **Sources** section, so you can always see where a time came from.

The fixture list is refreshed automatically at least four times a day.

## Languages, time zones and accessibility

- Available in **English** and **Brazilian Portuguese**. The site follows your browser's language; you can change it under **Settings**.
- Times can be shown in Edmonton, São Paulo (Brasília), Toronto, London, Madrid, Berlin, UTC or your device's own time zone.
- **Settings** also offers larger text (Large or Extra large), a high-contrast mode, and a switch for the short animations (they start switched off if your device asks for reduced motion). The sun and moon button switches between the light and dark theme.
- The site is designed to be easy to use for everyone: large buttons with written labels, full keyboard support, and screen reader support. It is tested against the WCAG 2.2 AA accessibility standard in both languages, both themes, and at phone, laptop and monitor widths.

## Privacy

The site has no accounts, no advertising and no cookies. Your preferences (stars, language, theme, filters) are stored only in your own browser. Visits are counted with [GoatCounter](https://www.goatcounter.com/), as totals only: how many people open the page, match details, race weekends and news links, and in which language. Nothing about your teams, stars or settings is sent. To count a person once rather than at every reload, GoatCounter uses your internet address and browser details for up to 8 hours, in memory only, and never saves them. If your browser asks sites not to track you (Global Privacy Control or Do Not Track), nothing is counted. To show live scores, match details, tables, club crests and maps, your browser contacts the services listed below directly.

## Where the data comes from

| What | Source |
| --- | --- |
| League fixtures | [football-data.org](https://www.football-data.org/) (or [openfootball](https://github.com/openfootball/football.json), public domain, when it is unavailable). Each final kick-off time is checked against openfootball and ESPN's public scoreboard: verified when they agree, marked "conflicting reports" when they do not |
| Friendlies and corrected kick-off times | Official announcements and press reports, each one recorded with its link |
| CONMEBOL Libertadores | ESPN's public scoreboard, each kick-off time cross-checked against the match listings on English [Wikipedia](https://en.wikipedia.org/), which cite CONMEBOL's fixture lists |
| UEFA Nations League (League A) | UEFA's published fixture list, cross-checked against ESPN |
| Live scores, match details and league tables | ESPN's public scoreboard (unofficial; it could change without notice) |
| Club crests beside team names | ESPN's public team lists and picture server (unofficial). Crests are the clubs' own marks, shown only to identify each club |
| Competition emblems | The Libertadores button shows the emblem of CONMEBOL's logo and the Nations League button the flag from UEFA's logo, both the organisers' trademarks, redrawn without their lettering and shown only to identify the competition |
| National team flags | [flag-icons](https://github.com/lipis/flag-icons) by Panayiotis Lipiridis (MIT licence), kept with the site |
| Backup when ESPN does not answer | Bundesliga scores, goals and table: [OpenLigaDB](https://www.openligadb.de/) (free, community-run). Other leagues' tables: worked out by the site from the league fixtures source's results, four times a day |
| Formula 1 sessions, results and standings | [Jolpica-F1](https://github.com/jolpica/jolpica-f1), cross-checked with [OpenF1](https://openf1.org/) |
| F1 track drawings | [f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger (MIT licence; unofficial). Backup: the drawing from the previous update, else [f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg) by Jules Roy (CC BY 4.0; unofficial; adapted, and not always drawn with north at the top) |
| Stadium locations and maps | [Wikidata](https://www.wikidata.org/) and [OpenStreetMap](https://www.openstreetmap.org/copyright) |
| CazéTV streams | CazéTV's public YouTube feed, and the fan-made schedule at agendacazetv.com (used only to find streams, never for kick-off times) |

Matchday Planner is an independent project and is not affiliated with any league, club, broadcaster, Formula 1 or the FIA.

## How it works (for the curious)

The site is a single web page hosted free on GitHub Pages, put together from `index.html`, `styles.css` and the scripts in `js/` each time it is published. Several times a day, a GitHub Actions workflow runs `build_schedule.py`, which gathers the fixtures, applies the verification rule above, and saves the result as `fixtures.json` (read by the page) and `soccer.ics` (the calendar feed). Live information such as scores and tables is fetched by each visitor's browser when it is needed, so there is no server to maintain.

The owner's setup and maintenance notes are in [MAINTAINING.md](MAINTAINING.md).

## Licence

The code is released under the [MIT Licence](LICENSE). The fonts in `fonts/` (Big Shoulders Display, Instrument Sans and Azeret Mono) are under the SIL Open Font Licence 1.1; their licence files are included.
