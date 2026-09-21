'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAMS, TEAM_MAP } from '../lib/teams';
import { MANAGERS, DRAFT_ORDER, PICKS, ROUNDS_PER_MANAGER, LEAGUE_NAME, BUY_IN } from '../lib/draftResults';

const TOTAL_WEEKS = 16;
const ALL_TEAM_ABBRS = PICKS.map((p) => p.team);

// Lightweight deterrent, not real security — anyone who views the page
// source could find this. It just protects Save/Trade actions from
// accidental or casual taps by someone other than you.
const SAVE_PIN = '1234';
const UNLOCK_KEY = 'nfl10man:editUnlocked';

function managerById(id) { return MANAGERS.find((m) => m.id === id); }
function originalOwnerOf(abbr) { return PICKS.find((p) => p.team === abbr)?.managerId; }

// Trades affecting one team, sorted by when they took effect.
function tradesForTeam(abbr, trades) {
  return trades.filter((t) => t.team === abbr).sort((a, b) => a.effectiveWeek - b.effectiveWeek);
}

// Who owns this team right now (after all recorded trades)?
function currentOwnerOf(abbr, trades) {
  let owner = originalOwnerOf(abbr);
  tradesForTeam(abbr, trades).forEach((t) => { owner = t.toManagerId; });
  return owner;
}

// Who owned this team during a specific week (accounting for trade timing)?
function ownerAtWeek(abbr, week, trades) {
  let owner = originalOwnerOf(abbr);
  tradesForTeam(abbr, trades).forEach((t) => { if (t.effectiveWeek <= week) owner = t.toManagerId; });
  return owner;
}

// The week the CURRENT owner's stretch with this team began (1 if never
// traded into them, or the effectiveWeek of the trade that brought it to them).
// Walks every trade in order rather than stopping at the first match, so a
// team traded more than once in a season still attributes credit correctly.
function ownershipStartWeek(abbr, managerId, trades) {
  const sorted = tradesForTeam(abbr, trades);
  let owner = originalOwnerOf(abbr);
  let lastStart = (owner === managerId) ? 1 : null;
  for (const t of sorted) {
    owner = t.toManagerId;
    lastStart = (owner === managerId) ? t.effectiveWeek : null;
  }
  return owner === managerId ? lastStart : null;
}

function recordForTeams(teams, weekData) {
  let w = 0, l = 0, t = 0;
  teams.forEach((abbr) => {
    const r = weekData[abbr];
    if (r === 'W') w++; else if (r === 'L') l++; else if (r === 'T') t++;
  });
  return { w, l, t };
}

function computeStandings(weeklyResults, trades) {
  return MANAGERS.map((m) => {
    const myTeams = ALL_TEAM_ABBRS.filter((abbr) => currentOwnerOf(abbr, trades) === m.id);
    const teamStats = myTeams.map((abbr) => {
      const startWeek = ownershipStartWeek(abbr, m.id, trades) || 1;
      let tw = 0, tl = 0, tt = 0;
      Object.keys(weeklyResults).forEach((wkStr) => {
        const week = Number(wkStr);
        if (week < startWeek) return; // credit only counts from when they actually owned it
        const r = weeklyResults[wkStr][abbr];
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
    return { manager: m, teams: myTeams, teamStats, w, l, t, pct, bestTeamPct, worstTeamPct };
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

function useUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(UNLOCK_KEY) === 'true') {
      setUnlocked(true);
    }
  }, []);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  function tryUnlock() {
    if (pinInput === SAVE_PIN) {
      setUnlocked(true);
      setPinError('');
      if (typeof window !== 'undefined') window.sessionStorage.setItem(UNLOCK_KEY, 'true');
    } else {
      setPinError('Wrong PIN.');
    }
  }
  return { unlocked, pinInput, setPinInput, pinError, setPinError, tryUnlock };
}

function PinGate({ pin }) {
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent-dim)' }}>
      <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 10 }}>Enter PIN to make changes. Everyone can still view without it.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="password"
          inputMode="numeric"
          value={pin.pinInput}
          onChange={(e) => { pin.setPinInput(e.target.value); pin.setPinError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') pin.tryUnlock(); }}
          placeholder="PIN"
          style={{ width: 100, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '10px 12px', borderRadius: 7, fontSize: 15 }}
        />
        <button className="btn" onClick={pin.tryUnlock}>Unlock</button>
      </div>
      {pin.pinError && <div style={{ color: '#ff8f8f', fontSize: 12, marginTop: 8 }}>{pin.pinError}</div>}
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('board');
  const [weeklyResults, setWeeklyResults] = useState({});
  const [trades, setTrades] = useState([]);
  const [syncStatus, setSyncStatus] = useState('connecting');
  const lastResultsJsonRef = useRef('{}');
  const lastTradesJsonRef = useRef('[]');
  const pot = BUY_IN * MANAGERS.length;

  const load = useCallback(async () => {
    try {
      const [resR, resT] = await Promise.all([
        fetch('/api/weekly-results', { cache: 'no-store' }),
        fetch('/api/trades', { cache: 'no-store' }),
      ]);
      const dataR = await resR.json();
      const dataT = await resT.json();

      const rJson = JSON.stringify(dataR.results || {});
      if (rJson !== lastResultsJsonRef.current) {
        lastResultsJsonRef.current = rJson;
        setWeeklyResults(dataR.results || {});
      }
      const tJson = JSON.stringify(dataT.trades || []);
      if (tJson !== lastTradesJsonRef.current) {
        lastTradesJsonRef.current = tJson;
        setTrades(dataT.trades || []);
      }
      setSyncStatus((dataR.error || dataT.error) ? 'error' : 'synced');
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
      lastResultsJsonRef.current = JSON.stringify(data.results);
      setWeeklyResults(data.results);
      setSyncStatus('synced');
      return { ok: true };
    } catch (e) {
      setSyncStatus('error');
      return { error: true };
    }
  }, []);

  const saveTrades = useCallback(async (nextTrades) => {
    setSyncStatus('connecting');
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: nextTrades }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      lastTradesJsonRef.current = JSON.stringify(data.trades);
      setTrades(data.trades);
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
          <button className={`tab-btn ${activeTab === 'trend' ? 'active' : ''}`} onClick={() => setActiveTab('trend')}>Trend</button>
          <button className={`tab-btn ${activeTab === 'trades' ? 'active' : ''}`} onClick={() => setActiveTab('trades')}>Teams &amp; Trades</button>
        </div>

        {activeTab === 'board' && (
          <>
            <div className="board-scroll"><BoardTable /></div>
            <RemainingBox />
            {trades.length > 0 && (
              <p style={{ color: 'var(--sub)', fontSize: 12, marginTop: 12 }}>
                This shows the original draft. Current ownership after trades is on the <b style={{ color: 'var(--text)' }}>Teams &amp; Trades</b> tab.
              </p>
            )}
          </>
        )}
        {activeTab === 'scores' && <ScoresTab weeklyResults={weeklyResults} saveResults={saveResults} onRefresh={load} />}
        {activeTab === 'standings' && <StandingsTab weeklyResults={weeklyResults} trades={trades} />}
        {activeTab === 'trend' && <TrendTab weeklyResults={weeklyResults} trades={trades} />}
        {activeTab === 'trades' && <TeamsTradesTab trades={trades} saveTrades={saveTrades} onRefresh={load} />}

        <p className="footer-note">
          Pot: <span className="pot">${pot}</span> · Best record &amp; worst record split the pot (ties broken by best/worst single-team record) · No head-to-head · 16 week season
        </p>
      </div>
    </>
  );
}

function BoardTable() {
  const picksForManager = (id) => PICKS.filter((p) => p.managerId === id);
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
  const drafted = new Set(ALL_TEAM_ABBRS);
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
  const pin = useUnlock();
  const { unlocked } = pin;
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
        {unlocked && <span style={{ color: 'var(--sub)', fontSize: 12, marginLeft: 6 }}>Tap W / L / T for each team, then Save</span>}
      </div>

      {!unlocked && <PinGate pin={pin} />}

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
              {unlocked ? (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                  {['W', 'L', 'T'].map((r) => (
                    <button key={r} data-r={r} data-active={cur === r} className="rlt-btn" onClick={() => toggle(p.team, r)}>{r}</button>
                  ))}
                </div>
              ) : (
                <span style={{ marginLeft: 'auto', color: 'var(--sub)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  {weekMap[p.team] || '—'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {unlocked && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : `Save Week ${activeWeek}`}
          </button>
          <button className="btn" onClick={onRefresh}>↻</button>
        </div>
      )}
    </>
  );
}

function StandingsTab({ weeklyResults, trades }) {
  const standings = computeStandings(weeklyResults, trades);
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
        Combined win % across each manager's teams (traded teams only count games since the trade took effect). Best record and worst record split the pot — no head-to-head. Ties are broken by best/worst single-team record; still tied splits evenly.
      </p>
    </>
  );
}

function TrendTab({ weeklyResults, trades }) {
  const weeksWithData = Object.keys(weeklyResults).map(Number).sort((a, b) => a - b);
  const standings = computeStandings(weeklyResults, trades);

  if (!weeksWithData.length) {
    return <p style={{ color: 'var(--sub)', fontSize: 13 }}>No results entered yet — the week-by-week trend will show up here once scores start coming in.</p>;
  }

  function cellStyle(rec) {
    if (rec.w + rec.l + rec.t === 0) return { color: 'var(--sub)' };
    if (rec.w > rec.l) return { color: '#a5ff6e' };
    if (rec.l > rec.w) return { color: '#ff8f8f' };
    return { color: '#e8e090' };
  }

  return (
    <div className="board-scroll">
      <table className="board">
        <thead>
          <tr>
            <th>Manager</th>
            {weeksWithData.map((w) => <th key={w}><span className="n">Wk</span>{w}</th>)}
            <th><span className="n">Season</span>Total</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.manager.id}>
              <td style={{ fontWeight: 700 }}>{s.manager.name}</td>
              {weeksWithData.map((w) => {
                const teamsThatWeek = ALL_TEAM_ABBRS.filter((abbr) => ownerAtWeek(abbr, w, trades) === s.manager.id);
                const rec = recordForTeams(teamsThatWeek, weeklyResults[String(w)] || {});
                return (
                  <td key={w} style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, ...cellStyle(rec) }}>
                    {rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ''}
                  </td>
                );
              })}
              <td style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent)' }}>
                {s.w}-{s.l}{s.t ? `-${s.t}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTradesTab({ trades, saveTrades, onRefresh }) {
  const pin = useUnlock();
  const { unlocked } = pin;
  const [tradingAbbr, setTradingAbbr] = useState(null);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [effectiveWeek, setEffectiveWeek] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sortedTeams = ALL_TEAM_ABBRS.slice().sort();

  function openTradeForm(abbr) {
    setTradingAbbr(abbr);
    setNewOwnerId('');
    setEffectiveWeek(1);
    setError('');
  }

  async function confirmTrade() {
    if (!newOwnerId) { setError('Pick who the team is going to.'); return; }
    const abbr = tradingAbbr;
    const fromManagerId = currentOwnerOf(abbr, trades);
    if (newOwnerId === fromManagerId) { setError('That manager already owns this team.'); return; }
    setSaving(true);
    const trade = {
      id: `${abbr}-${Date.now()}`,
      team: abbr,
      fromManagerId,
      toManagerId: newOwnerId,
      effectiveWeek: parseInt(effectiveWeek) || 1,
      createdAt: Date.now(),
    };
    await saveTrades([...trades, trade]);
    setSaving(false);
    setTradingAbbr(null);
  }

  async function undoTrade(id) {
    if (!confirm('Undo this trade?')) return;
    await saveTrades(trades.filter((t) => t.id !== id));
  }

  const history = trades.slice().sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      {!unlocked && <PinGate pin={pin} />}

      <h2 className="section-title">Teams</h2>
      <p style={{ color: 'var(--sub)', fontSize: 13, margin: '0 0 14px 0' }}>
        {unlocked ? 'Tap the trade icon to move a team to a new owner starting a given week.' : 'Current ownership after any trades. Unlock above to make a trade.'}
      </p>
      <div className="card">
        {sortedTeams.map((abbr) => {
          const t = TEAM_MAP[abbr];
          const ownerId = currentOwnerOf(abbr, trades);
          const owner = managerById(ownerId);
          return (
            <div className="score-row" key={abbr}>
              <span className="team-tag">
                <span className="sw" style={{ background: t.color }}></span>{abbr}
              </span>
              <span style={{ color: 'var(--sub)', marginLeft: 10 }}>{owner?.name}</span>
              {unlocked && (
                <button className="btn small" style={{ marginLeft: 'auto', padding: '6px 10px' }} onClick={() => openTradeForm(abbr)}>⇄ Trade</button>
              )}
            </div>
          );
        })}
      </div>

      {unlocked && tradingAbbr && (
        <div className="card" style={{ marginTop: 16, borderColor: 'var(--accent-dim)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, marginBottom: 12 }}>
            Trade <span style={{ color: 'var(--accent)' }}>{tradingAbbr}</span> from {managerById(currentOwnerOf(tradingAbbr, trades))?.name}
          </div>
          <div className="row" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">To manager</label>
              <select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)} style={{ width: '100%', background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '10px 12px', borderRadius: 7, fontSize: 15 }}>
                <option value="">— pick manager —</option>
                {MANAGERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Effective week</label>
              <input type="number" min={1} max={16} value={effectiveWeek} onChange={(e) => setEffectiveWeek(e.target.value)} style={{ width: 80, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '10px 12px', borderRadius: 7, fontSize: 15 }} />
            </div>
          </div>
          {error && <div style={{ color: '#ff8f8f', fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn primary" style={{ flex: 1 }} disabled={saving} onClick={confirmTrade}>{saving ? 'Saving…' : 'Confirm Trade'}</button>
            <button className="btn" onClick={() => setTradingAbbr(null)}>Cancel</button>
          </div>
        </div>
      )}

      <h2 className="section-title">Trade History</h2>
      {history.length === 0 ? (
        <p style={{ color: 'var(--sub)', fontSize: 13 }}>No trades yet.</p>
      ) : (
        <div className="card">
          {history.map((t) => {
            const team = TEAM_MAP[t.team];
            return (
              <div className="score-row" key={t.id}>
                <span className="team-tag"><span className="sw" style={{ background: team.color }}></span>{t.team}</span>
                <span style={{ color: 'var(--sub)', fontSize: 13, marginLeft: 10 }}>
                  {managerById(t.fromManagerId)?.name} → {managerById(t.toManagerId)?.name}, effective Week {t.effectiveWeek}
                </span>
                {unlocked && (
                  <button className="btn small danger" style={{ marginLeft: 'auto', padding: '6px 10px' }} onClick={() => undoTrade(t.id)}>Undo</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
