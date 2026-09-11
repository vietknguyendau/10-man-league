// The completed draft for this league. This never needs to change unless
// you run a new draft for a future season — in which case, just edit this
// file with the new managers/picks and push.

export const MANAGERS = [
  { id: 'm0', name: 'Chris' },
  { id: 'm1', name: 'Oje' },
  { id: 'm2', name: 'Marshall' },
  { id: 'm3', name: 'Louis' },
  { id: 'm4', name: 'Vinny' },
  { id: 'm5', name: 'Bui' },
  { id: 'm6', name: 'Viet' },
  { id: 'm7', name: 'Eric' },
  { id: 'm8', name: 'Lan' },
  { id: 'm9', name: 'Johnny' },
];

export const DRAFT_ORDER = MANAGERS.map((m) => m.id);

const ROUNDS = [
  ['LAR', 'ATL', 'BAL', 'BUF', 'MIA', 'ARI', 'SEA', 'NYJ', 'KC', 'PHI'],
  ['DET', 'NO', 'NE', 'IND', 'LV', 'WAS', 'SF', 'CLE', 'GB', 'DEN'],
  ['CIN', 'CAR', 'TB', 'JAX', 'TEN', 'NYG', 'LAC', 'PIT', 'DAL', 'CHI'],
];

export const ROUNDS_PER_MANAGER = ROUNDS.length;

export const PICKS = (() => {
  const picks = [];
  let pickNumber = 1;
  ROUNDS.forEach((round) => {
    round.forEach((abbr, i) => {
      picks.push({ pickNumber, managerId: MANAGERS[i].id, team: abbr });
      pickNumber++;
    });
  });
  return picks;
})();

export const LEAGUE_NAME = '10 Man League';
export const BUY_IN = 100;
