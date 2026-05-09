import { useMemo, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import AlertPanel from '../components/AlertPanel';
import DirectiveModal from '../components/DirectiveModal';
import { useFleetSocket } from '../hooks/useFleetSocket';
import { formatOperationalTime } from '../lib/timeFormat';

const FleetMap = dynamic(() => import('../components/FleetMap'), { ssr: false });

const PORTS = [
  { name: 'Port of Fujairah', lat: 25.11, lng: 56.34 },
  { name: 'Port of Jebel Ali', lat: 25.01, lng: 55.06 },
  { name: 'Bandar Abbas Port', lat: 27.14, lng: 56.21 },
  { name: 'Port of Khasab', lat: 26.2, lng: 56.25 },
  { name: 'Sohar Port', lat: 24.41, lng: 56.63 },
  { name: 'Port of Muscat', lat: 23.62, lng: 58.59 }
];

function severityLabelFromScore(score) {
  if (score >= 5) return 'emergency';
  if (score >= 4) return 'critical';
  if (score >= 2) return 'warning';
  return 'normal';
}

function scoreFromAlert(alert) {
  if (typeof alert.severity === 'number') return alert.severity;
  if (alert.severity === 'high') return 4;
  return 1;
}

function formatLocalTime(timestamp) {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleTimeString();
}

export default function CommandPage() {
  const router = useRouter();
  const {
    ships,
    alerts,
    distressEvents,
    zones,
    connected,
    ackAlert,
    addZone,
    sendDirective,
    routeIntelligenceByShip,
    emergencyBroadcast,
    selectShipForIntelligence,
    applyAiReroute,
    prisTrackedShips,
    prisSystemMetrics,
    audioSeverity,
    pausePrisShip,
    resumePrisShip,
    deepScanPrisShip,
    forceRecomputePrisShip
  } = useFleetSocket();
  const [selectedShip, setSelectedShip] = useState(null);
  const [inspectedShip, setInspectedShip] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [panelOffsets, setPanelOffsets] = useState({
    ai: { x: 0, y: 0 },
    pris: { x: 0, y: 0 }
  });
  const [draggingPanel, setDraggingPanel] = useState(null);
  const [clientClock, setClientClock] = useState('--');

  useEffect(() => { console.log('[PHASE 9 COMPLETE]'); }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const role = window.localStorage.getItem('vesselsync_role');
      if (role !== 'command') {
        router.replace('/');
      }
    }
  }, [router]);

  useEffect(() => {
    const updateClock = () => setClientClock(new Date().toLocaleTimeString());
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/playback');
        if (res.ok) setSnapshots(await res.json());
      } catch (e) { /* silent */ }
    };
    const id = setInterval(load, 15000);
    load();
    return () => clearInterval(id);
  }, []);

  const sortedShips = useMemo(
    () => [...ships]
      .map((ship) => {
        const shipAlerts = alerts.filter((alert) => (
          alert.status === 'active'
          && (alert.shipId === ship.id || alert.ship1Id === ship.id || alert.ship2Id === ship.id)
        ));
        const topAlertScore = shipAlerts.length ? Math.max(...shipAlerts.map(scoreFromAlert)) : 1;
        const severe = severityLabelFromScore(topAlertScore);
        const type = ship.cargo?.toLowerCase().includes('oil') ? 'tanker'
          : ship.cargo?.toLowerCase().includes('patrol') ? 'patrol'
            : 'cargo';
        return {
          ...ship,
          severityLevel: severe,
          collisionRisk: shipAlerts.some((a) => a.type === 'proximity') ? 0.8 : 0.1,
          signalQuality: ship.status === 'stopped' ? 'low' : topAlertScore >= 4 ? 'degraded' : 'stable',
          etaMinutes: ship.path?.length ? Math.round((ship.path.length / Math.max(ship.speed, 5)) * 10) : 0,
          routeProgress: ship.path?.length ? Math.max(5, 100 - Math.min(ship.path.length * 5, 92)) : 100,
          type
        };
      })
      .sort((a, b) => {
        const diff = ['normal', 'warning', 'critical', 'emergency'].indexOf(b.severityLevel)
          - ['normal', 'warning', 'critical', 'emergency'].indexOf(a.severityLevel);
        return diff || a.id.localeCompare(b.id);
      }),
    [ships, alerts]
  );

  const displayShips = playbackIndex === -1 ? sortedShips : (snapshots[playbackIndex]?.ships || []);
  const renderedShips = displayShips;

  // Keep inspected ship data fresh
  const liveInspected = useMemo(() => {
    if (!inspectedShip) return null;
    return renderedShips.find(s => s.id === inspectedShip.id) || inspectedShip;
  }, [inspectedShip, renderedShips]);

  const fuelPct = useCallback((ship) => {
    if (!ship?.fuelCapacity) return 0;
    return Math.round((ship.fuel / ship.fuelCapacity) * 100);
  }, []);

  const fuelClass = useCallback((pct) => {
    if (pct > 50) return 'high';
    if (pct > 20) return 'medium';
    return 'low';
  }, []);

  const unackedAlerts = useMemo(
    () => alerts.filter((a) => a.status === 'active'),
    [alerts]
  );

  const activeIncident = useMemo(() => {
    const mostSevereAlert = [...unackedAlerts]
      .sort((a, b) => scoreFromAlert(b) - scoreFromAlert(a))[0];
    if (!mostSevereAlert) return null;
    const ship = sortedShips.find((s) => s.id === mostSevereAlert.shipId || s.id === mostSevereAlert.ship1Id);
    return {
      ...mostSevereAlert,
      severityLevel: severityLabelFromScore(scoreFromAlert(mostSevereAlert)),
      ship
    };
  }, [unackedAlerts, sortedShips]);

  const aiFeed = useMemo(() => {
    const streamFeed = Object.values(routeIntelligenceByShip || {}).map((update) => {
      const riskScore = update?.routeAnalysis?.riskScore ?? 0;
      const severity = riskScore >= 75 ? 'critical' : riskScore >= 45 ? 'warning' : 'normal';
      return {
        id: `stream-${update.shipId}-${update.timestamp}`,
        timestamp: update.timestamp || Date.now(),
        severity,
        threat: `${update.shipId}: ${update.routeAnalysis?.threatLevel || 'LOW'} predictive risk`,
        confidence: update.routeAnalysis?.confidence ?? 0,
        recommendation: update.routeAnalysis?.recommendation?.reason || 'Maintain active monitoring corridor.'
      };
    });

    const synthesizedFromAlerts = unackedAlerts.slice(0, 6).map((alert) => ({
      id: alert.id,
      timestamp: alert.createdAt || alert.timestamp || Date.now(),
      severity: severityLabelFromScore(scoreFromAlert(alert)),
      threat: alert.type === 'proximity' ? 'Collision Probability Rising'
        : alert.type === 'geofence' ? 'Restricted Zone Violation'
          : alert.type === 'distress' ? `Distress: ${alert.incidentType || 'unknown'}`
            : 'Operational anomaly',
      confidence: Math.min(97, 72 + scoreFromAlert(alert) * 5),
      recommendation: alert.type === 'proximity'
        ? 'Reduce vessel speed by 15% and increase separation corridor.'
        : alert.type === 'geofence'
          ? 'Reroute eastbound outside geofence and acknowledge zone breach.'
          : 'Escalate emergency protocol and dispatch nearest support vessel.'
    }));

    const distressFeed = distressEvents.map((event, index) => ({
      id: `${event.shipId}-${event.incidentType}-${index}`,
      timestamp: Date.now() - (index * 15000),
      severity: severityLabelFromScore(event.severity || 3),
      threat: `${event.shipId}: ${event.incidentType || 'distress'} escalation`,
      confidence: Math.min(99, 70 + (event.severity || 3) * 6),
      recommendation: event.immediateRisk
        ? 'Immediate speed reduction, reroute, and emergency support dispatch.'
        : 'Monitor telemetry and apply captain guidance protocol.'
    }));

    return [...streamFeed, ...distressFeed, ...synthesizedFromAlerts]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  }, [unackedAlerts, distressEvents, routeIntelligenceByShip]);

  const tacticalInspection = useMemo(() => {
    if (!liveInspected) return { enabled: false };
    const update = routeIntelligenceByShip[liveInspected.id];
    if (!update) {
      return { enabled: true, shipId: liveInspected.id, ship: liveInspected, pending: true };
    }
    const routeModel = {
      id: liveInspected.id,
      name: liveInspected.name,
      origin: update.updatedRoute?.fullPath?.[0] || { lat: liveInspected.lat, lng: liveInspected.lng },
      destination: liveInspected.destination,
      currentPosition: { lat: liveInspected.lat, lng: liveInspected.lng },
      route: {
        fullPath: update.updatedRoute?.fullPath || [],
        completed: update.updatedRoute?.completed || [],
        remaining: update.updatedRoute?.remaining || []
      }
    };
    const riskIntelligence = {
      points: update.updatedRoute?.riskAnnotatedPoints || [],
      overallRouteRisk: update.routeAnalysis?.riskScore || 0,
      threatLevel: (update.routeAnalysis?.threatLevel || 'LOW').toLowerCase(),
      confidence: update.routeAnalysis?.confidence || 0,
      threats: update.routeAnalysis?.threats || [],
      recommendation: update.routeAnalysis?.recommendation?.reason || 'Continue monitoring',
      dangerousSegments: (update.updatedRoute?.riskAnnotatedPoints || [])
        .filter((point) => point.risk?.totalRisk >= 70)
        .map((point) => point.sequence)
    };
    return {
      enabled: true,
      shipId: liveInspected.id,
      ship: liveInspected,
      routeModel,
      riskIntelligence
    };
  }, [liveInspected, routeIntelligenceByShip]);

  const aiRouteCard = useMemo(() => {
    if (!tacticalInspection.enabled || tacticalInspection.pending) return null;
    const remainingPoints = tacticalInspection.routeModel?.route?.remaining;
    if (!Array.isArray(remainingPoints)) return null;
    const risk = tacticalInspection.riskIntelligence;
    const etaMinutes = Math.max(6, Math.round((remainingPoints.length / Math.max(tacticalInspection.ship.speed || 8, 6)) * 4));
    return {
      threatLevel: risk.threatLevel.toUpperCase(),
      routeRiskPct: risk.overallRouteRisk,
      threats: risk.threats.length ? risk.threats : ['No major threats detected'],
      recommendation: risk.recommendation,
      confidence: risk.confidence,
      etaMinutes
    };
  }, [tacticalInspection]);

  const prisTrackedRows = useMemo(() => (
    Object.entries(prisTrackedShips || {}).map(([shipId, state]) => {
      const ship = sortedShips.find((item) => item.id === shipId);
      const intelligence = routeIntelligenceByShip[shipId];
      return {
        shipId,
        shipName: ship?.name || shipId,
        mode: state.mode || 'standard',
        active: Boolean(state.active),
        routeStatus: state.routeStatus || 'monitoring',
        riskScore: intelligence?.routeAnalysis?.riskScore ?? null,
        lastUpdate: state.lastUpdate || intelligence?.timestamp || null
      };
    })
  ), [prisTrackedShips, sortedShips, routeIntelligenceByShip]);

  useEffect(() => {
    if (!liveInspected) return;
    selectShipForIntelligence(liveInspected.id);
  }, [liveInspected, selectShipForIntelligence]);

  useEffect(() => {
    if (!isReplaying || snapshots.length === 0) return undefined;
    const id = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = prev < 0 ? 0 : prev + 1;
        if (next >= snapshots.length) {
          setIsReplaying(false);
          return snapshots.length - 1;
        }
        return next;
      });
    }, Math.max(300, 1300 / playbackSpeed));
    return () => clearInterval(id);
  }, [isReplaying, snapshots, playbackSpeed]);

  useEffect(() => {
    if (!draggingPanel) return undefined;

    const onMove = (event) => {
      setPanelOffsets((prev) => ({
        ...prev,
        [draggingPanel.key]: {
          x: prev[draggingPanel.key].x + (event.clientX - draggingPanel.lastX),
          y: prev[draggingPanel.key].y + (event.clientY - draggingPanel.lastY)
        }
      }));
      setDraggingPanel((prev) => (prev
        ? { ...prev, lastX: event.clientX, lastY: event.clientY }
        : prev));
    };

    const onUp = () => setDraggingPanel(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingPanel]);

  const startDrag = useCallback((key, event) => {
    setDraggingPanel({ key, lastX: event.clientX, lastY: event.clientY });
  }, []);

  return (
    <div className={`layout ${isSidebarExpanded ? '' : 'collapsed'} op-${activeIncident?.severityLevel || 'normal'} ${emergencyBroadcast ? 'system-emergency' : ''}`}>
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div 
              className="sidebar-brand-icon" 
              onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
              style={{ cursor: 'pointer' }}
              title="Toggle Sidebar"
            >
              <img src="/favicon.ico?v=2" alt="Logo" width="22" height="22" />
            </div>
            <h1>VesselSync</h1>
          </div>
          <div className="sidebar-status">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            {connected ? 'System Online' : 'Disconnected'} • {ships.length} vessels
          </div>
          <div className={`audio-state-badge ${String(audioSeverity || 'NORMAL').toLowerCase()}`}>
            Audio State: {audioSeverity || 'NORMAL'}
          </div>
        </div>

        <div className="sidebar-ships">
          <div className="sidebar-section-title">Fleet Vessels</div>
          {sortedShips.map((ship) => (
            <div
              key={ship.id}
              className={`ship-card ${inspectedShip?.id === ship.id ? 'active' : ''} severity-${ship.severityLevel}`}
              onClick={() => setInspectedShip(ship)}
            >
              <div className={`ship-card-icon ${ship.status} ${ship.severityLevel}`}>
                {ship.severityLevel === 'emergency' ? '🚨' : ship.type === 'tanker' ? '🛢' : ship.type === 'patrol' ? '🛡' : '🚢'}
              </div>
              <div className="ship-card-info">
                <div className="ship-card-name">{ship.name}</div>
                <div className="ship-card-meta">
                  <span>{ship.speed} kn</span>
                  <span>{fuelPct(ship)}% fuel</span>
                  <span>{ship.heading}°</span>
                </div>
                <div className="ship-card-meta">
                  <span>ETA {ship.etaMinutes}m</span>
                  <span>SIG {ship.signalQuality}</span>
                </div>
                <div className="ship-progress">
                  <div className="ship-progress-fill" style={{ width: `${ship.routeProgress}%` }} />
                </div>
              </div>
              <span className={`ship-card-status ${ship.severityLevel}`}>{ship.severityLevel}</span>
            </div>
          ))}
        </div>

        {unackedAlerts.length > 0 && (
          <div className="sidebar-alerts">
            <div className="sidebar-section-title">⚠ Alerts ({unackedAlerts.length})</div>
            <AlertPanel alerts={alerts} onAck={ackAlert} />
          </div>
        )}
      </aside>

      {/* ─── MAIN MAP AREA ─── */}
      <main className="main-content">
        {emergencyBroadcast ? (
          <div className="global-emergency-banner">
            🚨 GLOBAL INTELLIGENCE ALERT • {emergencyBroadcast.shipId} • Risk {emergencyBroadcast.riskScore}% • {emergencyBroadcast.message}
          </div>
        ) : null}
        <div className="map-container">
          <FleetMap
            ships={renderedShips}
            zones={zones}
            role="command"
            onAddZone={addZone}
            onSelectShip={(ship) => {
              setInspectedShip(ship);
              selectShipForIntelligence(ship.id);
            }}
            emergencyBroadcast={emergencyBroadcast}
            tacticalInspection={tacticalInspection}
            onIssueDirective={(ship) => {
              setInspectedShip(ship);
              setSelectedShip(ship);
            }}
          />
        </div>

        {activeIncident && (
          <section className={`incident-focus-panel severity-${activeIncident.severityLevel}`}>
            <div className="incident-focus-title">ACTIVE INCIDENT</div>
            <div className="incident-focus-main">
              <strong>{activeIncident.shipId || activeIncident.ship1Id}</strong>
              <span>{activeIncident.type || 'threat'}</span>
            </div>
            <div className="incident-focus-meta">
              <span>Severity: {activeIncident.severityLevel.toUpperCase()}</span>
              <span suppressHydrationWarning>{activeIncident.createdAt ? formatOperationalTime(activeIncident.createdAt) : '--'}</span>
            </div>
            <p>{activeIncident.message || 'An anomaly requires immediate command action.'}</p>
            <div className="incident-focus-actions">
              <button className="btn-primary" onClick={() => activeIncident.ship && setSelectedShip(activeIncident.ship)}>
                Reroute Vessel
              </button>
              <button className="btn-danger" onClick={() => ackAlert(activeIncident.id)}>
                Acknowledge Alert
              </button>
            </div>
          </section>
        )}

        <section className="ai-command-panel" style={{ transform: `translate(${panelOffsets.ai.x}px, ${panelOffsets.ai.y}px)` }}>
          <div className="ai-command-header panel-drag-handle" onMouseDown={(event) => startDrag('ai', event)}>
            <strong>AI Command Intelligence</strong>
            <span>live telemetry analysis</span>
          </div>
          <div className="ai-streaming">AI analyzing telemetry...</div>
          {aiRouteCard ? (
            <article className={`ai-route-analysis severity-${aiRouteCard.routeRiskPct >= 75 ? 'critical' : aiRouteCard.routeRiskPct >= 45 ? 'warning' : 'normal'}`}>
              <h4>AI ROUTE ANALYSIS</h4>
              <div className="ai-route-threat">Threat Level: {aiRouteCard.threatLevel} ({aiRouteCard.routeRiskPct}%)</div>
              <ul>
                {aiRouteCard.threats.map((threat) => (
                  <li key={threat}>{threat}{threat === 'Storm ahead' ? ` (ETA ${aiRouteCard.etaMinutes} min)` : ''}</li>
                ))}
              </ul>
              <p>{aiRouteCard.recommendation}</p>
              <div className="ai-route-footer">
                <span>Confidence: {aiRouteCard.confidence}%</span>
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (!tacticalInspection.ship) return;
                    applyAiReroute(tacticalInspection.ship.id);
                  }}
                >
                  Apply AI Reroute
                </button>
              </div>
            </article>
          ) : null}
          <div className="ai-feed-list">
            {aiFeed.length === 0 ? (
              <article className="ai-feed-card severity-normal">
                <div className="ai-feed-top">
                  <span>No immediate threat signals</span>
                  <span>--</span>
                </div>
                <p>Select a vessel to start PRIS route intelligence analysis.</p>
                <small>{clientClock}</small>
              </article>
            ) : (
              aiFeed.map((item) => (
                <article key={item.id} className={`ai-feed-card severity-${item.severity}`}>
                  <div className="ai-feed-top">
                    <span>{item.threat}</span>
                    <span>{item.confidence}%</span>
                  </div>
                  <p>{item.recommendation}</p>
                  <small suppressHydrationWarning>{formatOperationalTime(item.timestamp)}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="pris-ops-panel" style={{ transform: `translate(${panelOffsets.pris.x}px, ${panelOffsets.pris.y}px)` }}>
          <div className="pris-ops-header panel-drag-handle" onMouseDown={(event) => startDrag('pris', event)}>
            <strong>PRIS Intelligence Control</strong>
            <span>OPERATOR CONTROL + WORKLOAD MGMT</span>
          </div>
          <div className="pris-ops-stats">
            <div><span>Active</span><strong>{prisSystemMetrics?.activePrisShips ?? 0}</strong></div>
            <div><span>Avg Risk</span><strong>{prisSystemMetrics?.averageRiskScore ?? 0}%</strong></div>
            <div><span>Emergencies</span><strong>{prisSystemMetrics?.emergencyEventsToday ?? 0}</strong></div>
            <div>
              <span>Load</span>
              <strong className={`load-${prisSystemMetrics?.backendLoad || 'low'}`}>
                {(prisSystemMetrics?.backendLoad || 'low').toUpperCase()}
              </strong>
            </div>
          </div>
          <div className="pris-ops-list">
            {prisTrackedRows.length === 0 ? (
              <p className="pris-empty">No tracked ships yet. Select a ship to activate PRIS monitoring.</p>
            ) : (
              prisTrackedRows.map((row) => (
                <article key={row.shipId} className={`pris-ship-card ${row.active ? 'active' : 'paused'}`}>
                  <div className="pris-ship-top">
                    <strong>{row.shipName}</strong>
                    <span>{row.riskScore == null ? '--' : `${row.riskScore}%`}</span>
                  </div>
                  <div className="pris-ship-meta">
                    <span>{row.mode}</span>
                    <span>{row.routeStatus}</span>
                    <span suppressHydrationWarning>{row.lastUpdate ? formatOperationalTime(row.lastUpdate) : 'No update'}</span>
                  </div>
                  <div className="pris-ship-actions">
                    {row.active ? (
                      <button className="btn-secondary" onClick={() => pausePrisShip(row.shipId)}>Pause</button>
                    ) : (
                      <button className="btn-secondary" onClick={() => resumePrisShip(row.shipId)}>Resume</button>
                    )}
                    <button className="btn-secondary" onClick={() => forceRecomputePrisShip(row.shipId)}>Recompute</button>
                    <button className="btn-primary" onClick={() => deepScanPrisShip(row.shipId)}>AI Deep Scan</button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* ─── FLOATING TELEMETRY CARD ─── */}
        {liveInspected && (
          <div className="telemetry-card">
            <div className="telemetry-card-header">
              <div>
                <div className="telemetry-ship-name">{liveInspected.name}</div>
                <div className="telemetry-ship-id">{liveInspected.id} • {liveInspected.cargo}</div>
              </div>
              <button className="telemetry-close" onClick={() => setInspectedShip(null)}>✕</button>
            </div>

            <div className="telemetry-grid">
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Speed</div>
                <div className="telemetry-stat-value speed">
                  {liveInspected.speed} <span className="telemetry-stat-unit">knots</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Heading</div>
                <div className="telemetry-stat-value heading">
                  {liveInspected.heading}° <span className="telemetry-stat-unit">bearing</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Fuel</div>
                <div className={`telemetry-stat-value fuel ${fuelPct(liveInspected) < 20 ? 'low' : ''}`}>
                  {Math.round(liveInspected.fuel)} <span className="telemetry-stat-unit">L</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Status</div>
                <div className="telemetry-stat-value status">{liveInspected.status}</div>
              </div>
            </div>

            <div className="telemetry-fuel-section">
              <div className="telemetry-fuel-header">
                <span className="telemetry-fuel-label">Fuel Level</span>
                <span className={`telemetry-fuel-pct ${fuelClass(fuelPct(liveInspected)) === 'low' ? 'fuel low' : ''}`}
                  style={{ color: fuelPct(liveInspected) > 50 ? '#4ade80' : fuelPct(liveInspected) > 20 ? '#fbbf24' : '#f87171' }}>
                  {fuelPct(liveInspected)}%
                </span>
              </div>
              <div className="fuel-bar">
                <div
                  className={`fuel-bar-fill ${fuelClass(fuelPct(liveInspected))}`}
                  style={{ width: `${fuelPct(liveInspected)}%` }}
                />
              </div>
            </div>

            <div className="telemetry-details">
              <div className="telemetry-detail-row">
                <span>Destination</span>
                <span>{liveInspected.destination?.name}</span>
              </div>
              <div className="telemetry-detail-row">
                <span>Position</span>
                <span>{liveInspected.lat?.toFixed(4)}, {liveInspected.lng?.toFixed(4)}</span>
              </div>
              <div className="telemetry-detail-row">
                <span>Weather</span>
                <span style={{ color: liveInspected.inWeather ? '#f87171' : '#4ade80' }}>
                  {liveInspected.inWeather ? '⛈ Adverse' : '☀ Clear'}
                </span>
              </div>
            </div>

            <div className="telemetry-actions">
              <button className="btn-primary" onClick={() => setSelectedShip(liveInspected)}>
                Issue Directive
              </button>
              <button className="btn-secondary" onClick={() => setInspectedShip(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ─── PLAYBACK PANEL ─── */}
        {snapshots.length > 0 && (
          <footer className="playback-panel">
            <div className="playback-control">
              <span className="playback-label">
                ⏱ {playbackIndex === -1
                  ? <strong>LIVE</strong>
                  : <strong suppressHydrationWarning>{formatOperationalTime(snapshots[playbackIndex]?.timestamp)}</strong>}
              </span>
              <button className="btn-secondary" onClick={() => {
                setPlaybackIndex(Math.max(0, snapshots.length - 8));
                setIsReplaying(true);
              }}>
                Replay Incident
              </button>
              <button className="btn-secondary" onClick={() => setIsReplaying((prev) => !prev)}>
                {isReplaying ? 'Pause' : 'Play'}
              </button>
              <input
                type="range"
                min="-1"
                max={snapshots.length - 1}
                value={playbackIndex}
                onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                className="playback-slider"
              />
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                style={{ maxWidth: 84 }}
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
              <button className="btn-secondary" onClick={() => setPlaybackIndex(-1)}>Go Live</button>
            </div>
            <div className="playback-markers">
              {snapshots.slice(-16).map((snapshot, idx) => (
                <span
                  key={snapshot.timestamp}
                  className={`playback-marker ${idx % 5 === 0 ? 'alert' : ''}`}
                  title={formatOperationalTime(snapshot.timestamp)}
                  suppressHydrationWarning
                />
              ))}
            </div>
          </footer>
        )}
      </main>

      <DirectiveModal
        open={Boolean(selectedShip)}
        ship={selectedShip}
        ports={PORTS}
        onClose={() => setSelectedShip(null)}
        onSend={(action, params) => {
          if (selectedShip) sendDirective(selectedShip.id, action, params);
          setSelectedShip(null);
        }}
      />
    </div>
  );
}
