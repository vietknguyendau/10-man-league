'use client';

import { useState } from 'react';
import { TEAMS, TEAM_MAP } from '../lib/teams';
import { MANAGERS, DRAFT_ORDER, PICKS, ROUNDS_PER_MANAGER, LEAGUE_NAME, BUY_IN } from '../lib/draftResults';
import { WEEKLY_RESULTS } from '../lib/weeklyResults';

const TOTAL_WEEKS = 16;

function managerById(id) { return MANAGERS.find((m) => m.id === id); }
function picksForManager(id) { return PICKS.filter((p) => p.managerId === id); }
function draftedAbbrs() { return new Set(PICKS.map((p) => p.team)); }

function computeStandings() {
  return MANAGERS.map((m) => {
    const teams = picksForManager(m.id).map((p) => p.team);
    const teamStats = teams.map((abbr) => {
      let tw = 0, tl = 0, tt = 0;
      Object.values(WEEKLY_RESULTS).forEach((wk) => {
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
    const played = teamStats.filter((ts) => ts.pct !== null).map((ts) => ts.pct);
    const bestTeamPct = played.length ? Math.max(...played) : null;
    const worstTeamPct = played.length ? Math.min(...played) : null;
    return { manager: m, teams, teamStats, w, l, t, pct, bestTeamPct, worstTeamPct };
  }).sort((a, b) => b.pct - a.pct || b.w - a.w);
}

function determinePotSplits(standings) {
  if (!standings.length) return { topIds: [], bottomIds: [], topHadTie: false, bottomHadTie: false, topResolved: false, bottomResolved: false, topTeam: {}, bottomTeam: {} };
  const topPct = standings[0].pct;
  let topCandidates = standings.filter((s) => s.pct === topPct);
  const topHadTie = topCandidates.length > 1;
  let topResolved = false;
  const topTeam = {};
  if (topHadTie) {
    const withData = topCandidates.filter((s) => s.bestTeamPct !== null);
    if (withData.length) {
      const maxBest = Math.max(...withData.map((s) => s.bestTeamPct));
      const narrowed = topCandidates.filter((s) => s.bestTeamPct === maxBest);
      if (narrowed.length < topCandidates.length) { topResolved = true; topCandidates = narrowed; }
    }
  }
  topCandidates.forEach((s) => { topTeam[s.manager.id] = s.teamStats.find((ts) => ts.pct === s.bestTeamPct) || null; });

  const bottomPct = standings[standings.length - 1].pct;
  let bottomCandidates = standings.filter((s) => s.pct === bottomPct);
  const bottomHadTie = bottomCandidates.length > 1;
  let bottomResolved = false;
  const bottomTeam = {};
  if (bottomHadTie) {
    const withData = bottomCandidates.filter((s) => s.worstTeamPct !== null);
    if (withData.length) {
      const minWorst = Math.min(...withData.map((s) => s.worstTeamPct));
      const narrowed = bottomCandidates.filter((s) => s.worstTeamPct === minWorst);
      if (narrowed.length < bottomCandidates.length) { bottomResolved = true; bottomCandidates = narrowed; }
    }
  }
  bottomCandidates.forEach((s) => { bottomTeam[s.manager.id] = s.teamStats.find((ts) => ts.pct === s.worstTeamPct) || null; });

  return {
    topIds: topCandidates.map((s) => s.manager.id),
    bottomIds: bottomCandidates.map((s) => s.manager.id),
    topHadTie, bottomHadTie, topResolved, bottomResolved, topTeam, bottomTeam,
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('board');
  const pot = BUY_IN * MANAGERS.length;

  return (
    <>
      <header className="top">
        <div className="brand">
