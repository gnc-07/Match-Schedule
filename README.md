# Matchday Planner

**Football and Formula 1 fixtures in your own time zone, with kick-off times you can trust.**

Open the site: **https://gnc-07.github.io/Match-Schedule/** (em português: [`?lang=pt`](https://gnc-07.github.io/Match-Schedule/?lang=pt))

Matchday Planner is a free website that lists upcoming matches from the **Premier League, La Liga, Bundesliga, Brasileirão** and **national-team friendlies**, together with every **Formula 1** session. It shows each kick-off in the time zone you choose, follows live scores while matches are on, and offers a calendar feed so the fixtures appear in your own calendar app. There is nothing to install and no account to create.

## What you can do with it

- **See what is on, and when.** Matches are grouped by day. Filter by league, by date (today, this weekend, the next seven days or your own range) or by team name.
- **Follow your teams.** Tap the star next to a team (or an F1 driver) and choose "Starred teams only" to see just their matches. Stars are remembered on your device.
- **Follow live scores.** While a match is on, its score updates every 30 seconds without reloading the page.
- **Open the match details.** Each match has a **Match details** button with the score, goals, cards and substitutions, the line-ups, the league table and a map of the stadium. You can share a link to one match or add it to your calendar.
- **Follow a Formula 1 weekend.** Every practice, qualifying, sprint and race session is listed. The **Race weekend** button shows the schedule, results, the championship standings and a drawing of the track.
- **Check the league tables** with the **Tables** button: all four leagues, plus the F1 drivers' and teams' championships.
- **Put the fixtures in your calendar.** The **Calendar** button gives you a feed you can subscribe to in Google Calendar, Apple Calendar, Outlook, Proton Calendar and most other apps. Subscribed calendars update by themselves when a time changes. (The feed covers football only.)
- **Watch on CazéTV.** When the Brazilian YouTube channel CazéTV is streaming a match, the card shows a link to the stream. These streams are usually only available in Brazil.

## How kick-off times are checked

Friendly and early-season kick-off times are often announced late, and different websites sometimes disagree. Matchday Planner therefore marks a time as **verified** only when an official source (a league, federation, club or official ticket seller) gives it, or when **at least two independent sources agree**. Until then, the match is shown as "time to be confirmed", together with the times that have been reported and where each one came from. Every match card has a **Sources** section, so you can always see where a time came from.

The fixture list is refreshed automatically four times a day.

## Languages, time zones and accessibility

- Available in **English** and **Brazilian Portuguese**. The site follows your browser's language; you can change it under **Settings**.
- Times can be shown in Edmonton, São Paulo (Brasília), Toronto, London, Madrid, Berlin, UTC or your device's own time zone.
- **Settings** also offers larger text (Large or Extra large) and a high-contrast mode. The sun and moon button switches between the light and dark theme.
- The site is designed to be easy to use for everyone: large buttons with written labels, full keyboard support, and screen reader support. It is tested against the WCAG 2.2 AA accessibility standard in both languages, both themes, and at phone, laptop and monitor widths.

## Privacy

The site has no accounts, no advertising and no tracking. Your preferences (stars, language, theme, filters) are stored only in your own browser. To show live scores, match details, tables and maps, your browser contacts the services listed below directly.

## Where the data comes from

| What | Source |
| --- | --- |
| League fixtures | [openfootball](https://github.com/openfootball/football.json) (public domain), or [football-data.org](https://www.football-data.org/) when a key is configured |
| Friendlies and corrected kick-off times | Official announcements and press reports, each one recorded with its link |
| Live scores, match details and league tables | ESPN's public scoreboard (unofficial; it could change without notice) |
| Formula 1 sessions, results and standings | [Jolpica-F1](https://github.com/jolpica/jolpica-f1), cross-checked with [OpenF1](https://openf1.org/) |
| F1 track drawings | [f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger (MIT licence; unofficial) |
| Stadium locations and maps | [Wikidata](https://www.wikidata.org/) and [OpenStreetMap](https://www.openstreetmap.org/copyright) |
| CazéTV streams | CazéTV's public YouTube feed, and the fan-made schedule at agendacazetv.com (used only to find streams, never for kick-off times) |

Matchday Planner is an independent project and is not affiliated with any league, club, broadcaster, Formula 1 or the FIA.

## How it works (for the curious)

The site is a single web page (`index.html`) hosted free on GitHub Pages. Several times a day, a GitHub Actions workflow runs `build_schedule.py`, which gathers the fixtures, applies the verification rule above, and saves the result as `fixtures.json` (read by the page) and `soccer.ics` (the calendar feed). Live information such as scores and tables is fetched by each visitor's browser when it is needed, so there is no server to maintain.

The owner's setup and maintenance notes are in [MAINTAINING.md](MAINTAINING.md).

## Licence

The code is released under the [MIT Licence](LICENSE). The fonts in `fonts/` (Big Shoulders Display, Instrument Sans and Azeret Mono) are under the SIL Open Font Licence 1.1; their licence files are included.
