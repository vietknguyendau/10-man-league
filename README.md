# 10 Man League

A simple, static website — no login, no database, no accounts. Draft board, weekly scores, and standings with a real tiebreaker.

## Updating scores each week

There's exactly one file you'll ever touch: **`lib/weeklyResults.js`**.

1. I'll give you a block of text each week in chat, like:
```js
   3: {
     LAR: 'W', ATL: 'L', BAL: 'W', BUF: 'L', MIA: 'W',
     ARI: 'L', SEA: 'W', NYJ: 'L', KC: 'W', PHI: 'L',
     DET: 'W', NO: 'L', NE: 'W', IND: 'L', LV: 'W',
     WAS: 'L', SF: 'W', CLE: 'L', GB: 'W', DEN: 'L',
     CIN: 'W', CAR: 'L', TB: 'W', JAX: 'L', TEN: 'W',
     NYG: 'L', LAC: 'W', PIT: 'L', DAL: 'W', CHI: 'L',
   },
```
2. Open `lib/weeklyResults.js` on GitHub, click the pencil to edit.
3. Paste the block in, right after `WEEKLY_RESULTS = {`.
4. Commit changes. The live site updates automatically in about a minute.

## Files

- `app/page.js` — the entire site
- `lib/draftResults.js` — the completed draft
- `lib/weeklyResults.js` — the file you edit weekly
- `lib/teams.js` — the 32 NFL teams
