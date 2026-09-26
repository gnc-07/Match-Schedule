<!--
Fill in every applicable section. Lines between these arrow brackets are hidden once the pull request is posted,
so they can stay. Write in plain words; no em dashes.
-->

## What changes
<!--
What a visitor (or the owner) will notice, in a few bullet points. Group by screen size or feature when it helps.
If nothing changes for visitors, say so and say what changes instead (data, workflow, tests, documentation).
-->
-

## Before and after
<!--
REQUIRED for anything a visitor can see or feel. A pull request that changes the site without these is not ready.

1. Looks different (layout, colours, text, a new button, a new panel): add a BEFORE and an AFTER picture of each
   screen that changed. Show a phone width (390px) and a desktop width (1280px), and dark theme or Portuguese
   when the change touches them.
2. Behaves or feels different, even when nothing looks different (the site loads faster, a bug is fixed, an
   animation, a menu that opens or closes): add a BEFORE and an AFTER video recording the same steps both times.
   For a speed fix, record both on the same machine and connection, and add the numbers (for example Lighthouse
   Performance before and after).
3. Nothing a visitor can see or feel (tests, workflow, README, data sources only): write "No visible change"
   and one sentence saying why.

To add a file: drag it into this box while editing on GitHub. GitHub accepts pictures (PNG, JPG, GIF)
and videos (MP4, MOV, WebM).
-->

| | Before | After |
| --- | --- | --- |
| Phone (390px) | | |
| Desktop (1280px) | | |

**Video** (for behaviour or speed changes):
- Before:
- After:

## How it works
<!-- The main idea of the fix or feature, and the functions or files involved. Skip for very small changes. -->

## Accessibility
<!--
New or changed controls: height (44px, 32px for small inline icons), focus ring, spoken name.
New text: in the I18N table in English and Portuguese. New colours: tokens in all three theme blocks
(and the high contrast blocks when needed). Write "No change" if none of this applies.
-->

## Checks
<!--
What was run and what came back, with numbers:
- npm test: Python tests, security, axe (how many combinations passed), Lighthouse scores (mobile and desktop, both languages)
- Anything checked by hand (keyboard only, phone width, dark theme, Portuguese)
- For a bug fix: how the problem was reproduced before the fix
-->
- `npm test`:

## Not tested
<!-- Be honest: browsers, devices, outside services or real data that could not be tried. Write "Nothing" only if true. -->
-

## Files
<!-- Each changed file and, in a few words, what changed in it. -->
-
