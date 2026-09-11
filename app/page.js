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
  const [weeklyResults, setWeeklyResults] = useState({});
  const [syncStatus, setSyncStatus] = useState('connecting');
  const lastJsonRef = useRef('{}');
  const pot = BUY_IN * MANAGERS.length;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/weekly-results', { cache: 'no-store' });
      const data = await res.json();
      const json = JSON.stringify(data.results || {});
      if (json !== lastJsonRef.current) {
        lastJsonRef.current = json;
        setWeeklyResults(data.results || {});
      }
      setSyncStatus(data.error ? 'error' : 'synced');
    } catch (e) {
      setSyncStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [load]);

  const saveResults = useCallback(async (nextResults) => {
    setSyncStatus('connecting');
    try {
      const res = await fetch('/api/weekly-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: nextResults }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      lastJsonRef.current = JSON.stringify(data.results);
      setWeeklyResults(data.results);
      setSyncStatus('synced');
      return { ok: true };
    } catch (e) {
      setSyncStatus('error');
      return { error: true };
    }
  }, []);

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="eyebrow">10 Man League</span>
          <h1>{LEAGUE_NAME}</h1>
        </div>
        <div className="status-pill">
          <span className={`dot ${syncStatus === 'synced' ? 'live' : ''}`}></span>
          <span>{syncStatus === 'synced' ? 'synced' : syncStatus === 'error' ? 'sync issue' : 'connecting'}</span>
        </div>
      </header>

      <div className="wrap">
        <div className="empty-state" style={{ padding: '18px 0 2px' }}>
          <div className="big">🏈 Season in progress</div>
          <div style={{ color: 'var(--sub)', fontSize: 13 }}>Weekly results and live standings below.</div>
        </div>

        <div className="tabbar">
          <button className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>Draft Board</button>
          <button className={`tab-btn ${activeTab === 'scores' ? 'active' : ''}`} onClick={() => setActiveTab('scores')}>Weekly Scores</button>
          <button className={`tab-btn ${activeTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveTab('standings')}>Standings</button>
        </div>

        {activeTab === 'board' && (
          <>
            <div className="board-scroll"><BoardTable /></div>
            <RemainingBox />
          </>
        )}
        {activeTab === 'scores' && <ScoresTab weeklyResults={weeklyResults} saveResults={saveResults} onRefresh={load} />}
        {activeTab === 'standings' && <StandingsTab weeklyResults={weeklyResults} />}

        <p className="footer-note">
          Pot: <span className="pot">${pot}</span> · Best record &amp; worst record split the pot (ties broken by best/worst single-team record) · No head-to-head · 16 week season
        </p>
      </div>
    </>
  );
}

function BoardTable() {
  return (
    <table className="board">
      <thead>
        <tr>{DRAFT_ORDER.map((id, i) => <th key={id}><span className="n">{i + 1}</span>{managerById(id)?.name}</th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: ROUNDS_PER_MANAGER }).map((_, r) => (
          <tr key={r}>
            {DRAFT_ORDER.map((id) => {
              const p = picksForManager(id)[r];
              if (!p) return <td key={id}><span className="empty-slot">—</span></td>;
              const t = TEAM_MAP[p.team];
              return <td key={id}><span className="team-tag"><span className="sw" style={{ background: t.color }}></span>{t.abbr}</span></td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RemainingBox() {
  const drafted = draftedAbbrs();
  const remaining = TEAMS.filter((t) => !drafted.has(t.abbr));
  if (!remaining.length) return null;
  return (
    <div className="remaining-box">
      <div className="lbl">Untouched teams ({remaining.length})</div>
      <div className="tags">
        {remaining.map((t) => <span key={t.abbr} className="team-tag"><span className="sw" style={{ background: t.color }}></span>{t.abbr}</span>)}
      </div>
    </div>
  );
}

function ScoresTab({ weeklyResults, saveResults, onRefresh }) {
  const [activeWeek, setActiveWeek] = useState(1);
  const weekMap = weeklyResults[String(activeWeek)] || {};
  const [pending, setPending] = useState({ ...weekMap });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPending({ ...(weeklyResults[String(activeWeek)] || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeek]);

  const draftedList = PICKS.slice().sort((a, b) => a.team.localeCompare(b.team));

  function toggle(abbr, r) {
    setPending((prev) => {
      const next = { ...prev };
      if (next[abbr] === r) delete next[abbr]; else next[abbr] = r;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const nextResults = { ...weeklyResults, [String(activeWeek)]: { ...pending } };
    await saveResults(nextResults);
    setSaving(false);
  }

  return (
    <>
      <div className="week-pager">
        <button className="nav-arrow" onClick={() => setActiveWeek((w) => Math.max(1, w - 1))}>‹</button>
        <select value={activeWeek} onChange={(e) => setActiveWeek(parseInt(e.target.value))}>
          {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
        <button className="nav-arrow" onClick={() => setActiveWeek((w) => Math.min(TOTAL_WEEKS, w + 1))}>›</button>
        <span style={{ color: 'var(--sub)', fontSize: 12, marginLeft: 6 }}>Tap W / L / T for each team, then Save</span>
      </div>
      <div className="card">
        {draftedList.map((p) => {
          const t = TEAM_MAP[p.team];
          const cur = pending[p.team] || '';
          return (
            <div className="score-row" key={p.team}>
              <span className="team-tag">
                <span className="sw" style={{ background: t.color }}></span>{t.abbr}
                <span style={{ color: 'var(--sub)', fontWeight: 400 }}> — {managerById(p.managerId)?.name}</span>
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                {['W', 'L', 'T'].map((r) => (
                  <button
                    key={r}
                    data-r={r}
                    data-active={cur === r}
                    className="rlt-btn"
                    onClick={() => toggle(p.team, r)}
                  >{r}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          className="btn primary"
          style={{ flex: 1 }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : `Save Week ${activeWeek}`}
        </button>
        <button className="btn" onClick={onRefresh}>↻</button>
      </div>
    </>
  );
}

function StandingsTab({ weeklyResults }) {
  const standings = computeStandings(weeklyResults);
  const anyGames = standings.some((s) => s.w + s.l + s.t > 0);
  const splits = anyGames ? determinePotSplits(standings) : { topIds: [], bottomIds: [] };

  function badgeAndNote(s) {
    const isTop = splits.topIds.includes(s.manager.id);
    const isBottom = splits.bottomIds.includes(s.manager.id);
    let badge = null, note = '', cls = '';
    if (isTop) {
      cls = 'top';
      if (splits.topResolved && splits.topIds.length === 1) {
        badge = 'Best · wins tiebreaker';
        const t = splits.topTeam[s.manager.id];
        if (t) note = `Tied on combined record — won on best single team (${t.abbr} ${t.w}-${t.l}${t.t ? '-' + t.t : ''}).`;
      } else {
        badge = 'Best · splits pot';
        if (splits.topHadTie) note = 'Tied on combined record and best single team — splitting this half of the pot.';
      }
    } else if (isBottom) {
      cls = 'bottom';
      if (splits.bottomResolved && splits.bottomIds.length === 1) {
        badge = 'Worst · wins tiebreaker';
        const t = splits.bottomTeam[s.manager.id];
        if (t) note = `Tied on combined record — "won" on worst single team (${t.abbr} ${t.w}-${t.l}${t.t ? '-' + t.t : ''}).`;
      } else {
        badge = 'Worst · splits pot';
        if (splits.bottomHadTie) note = 'Tied on combined record and worst single team — splitting this half of the pot.';
      }
    }
    return { cls, badge, note };
  }

  return (
    <>
      {!anyGames && <p style={{ color: 'var(--sub)', fontSize: 13, marginBottom: 14 }}>No results entered yet.</p>}
      <div className="standings-list">
        {standings.map((s, i) => {
          const { cls, badge, note } = anyGames ? badgeAndNote(s) : { cls: '', badge: null, note: '' };
          return (
            <div className={`standing-item ${cls}`} key={s.manager.id}>
              <span className="rank">{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div className="name">{s.manager.name}{badge && <span className="badge">{badge}</span>}</div>
                <div className="teams">
                  {s.teams.map((abbr) => {
                    const t = TEAM_MAP[abbr];
                    return <span key={abbr} className="team-tag" style={{ padding: '2px 6px', fontSize: 10.5 }}><span className="sw" style={{ background: t.color }}></span>{abbr}</span>;
                  })}
                </div>
                {note && <div className="note">{note}</div>}
              </div>
              <div>
                <div className="record">{s.w}-{s.l}{s.t ? `-${s.t}` : ''}</div>
                <div className="pct">{(s.pct * 100).toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ color: 'var(--sub)', fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>
        Combined win % across each manager's teams. Best record and worst record split the pot — no head-to-head. Ties are broken by best/worst single-team record; still tied splits evenly.
      </p>
    </>
  );
}
