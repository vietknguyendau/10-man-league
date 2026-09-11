'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAMS, TEAM_MAP } from '../lib/teams';
import { MANAGERS, DRAFT_ORDER, PICKS, ROUNDS_PER_MANAGER, LEAGUE_NAME, BUY_IN } from '../lib/draftResults';

const TOTAL_WEEKS = 16;

function managerById(id) { return MANAGERS.find((m) => m.id === id); }
function picksForManager(id) { return PICKS.filter((p) => p.managerId === id); }
function draftedAbbrs() { return new Set(PICKS.map((p) => p.team)); }

function computeStandings(weeklyResults) {
  return MANAGERS.map((m) => {
    const teams = picksForManager(m.id).map((p) => p.team);
    const teamStats = teams.map((abbr) => {
      let tw = 0, tl = 0, tt = 0;
      Object.values(weeklyResults).forEach((wk) => {
        const r = wk[abbr];
        if (r === 'W') tw++; else if (r === 'L') tl++; else if (r === 'T') tt++;
      });
      const tgp = tw + tl + tt;
      const tpct = tgp ? (tw + 0.5 * tt) / tgp : null;
      return { abbr, w: tw, l: tl, t: tt, pct: tpct };
    });
    let w = 0, l = 0, t = 0;
    teamStats.forEach((ts) => { w += ts.w; l += ts.l; t += ts.t; });
    const gp = w + l + t;
    const pct = gp ? (w + 0.5 * t) / gp : 0;
    const played =
