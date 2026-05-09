import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import AlertPanel from '../components/AlertPanel';
import DirectiveModal from '../components/DirectiveModal';
import { useFleetSocket } from '../hooks/useFleetSocket';

const FleetMap = dynamic(() => import('../components/FleetMap'), { ssr: false });

const PORTS = [
  { name: 'Port of Fujairah', lat: 25.11, lng: 56.34 },
  { name: 'Port of Jebel Ali', lat: 25.01, lng: 55.06 },
  { name: 'Bandar Abbas Port', lat: 27.14, lng: 56.21 },
  { name: 'Port of Khasab', lat: 26.2, lng: 56.25 },
  { name: 'Sohar Port', lat: 24.41, lng: 56.63 },
  { name: 'Port of Muscat', lat: 23.62, lng: 58.59 }
];

export default function CommandPage() {
  const { ships, alerts, zones, connected, backendHealthy, ackAlert, addZone, updateZone, deleteZone, sendDirective } = useFleetSocket();
  const [selectedShip, setSelectedShip] = useState(null);

  useEffect(() => {
    console.log('[PHASE 9 COMPLETE]');
  }, []);

  const sortedShips = useMemo(
    () => [...ships].sort((a, b) => a.id.localeCompare(b.id)),
    [ships]
  );

  return (
    <div className="layout">
      <header className="topbar">
        <h1>VesselSync - FLEET COMMAND</h1>
        <div className={connected && backendHealthy ? 'status online' : 'status offline'}>
          {connected && backendHealthy ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="content-grid">
        <section className="map-shell">
          <FleetMap
            ships={ships}
            zones={zones}
            role="command"
            onAddZone={addZone}
            onUpdateZone={updateZone}
            onDeleteZone={deleteZone}
            onIssueDirective={setSelectedShip}
          />
        </section>

        <section className="side-shell">
          <AlertPanel alerts={alerts} onAck={ackAlert} />

          <div className="panel">
            <h3>Ships</h3>
            <div className="ship-list">
              {sortedShips.map((ship) => (
                <div key={ship.id} className="ship-row">
                  <div>
                    <strong>{ship.id}</strong>
                    <div>{ship.status}</div>
                  </div>
                  <button className="btn-primary" type="button" onClick={() => setSelectedShip(ship)}>
                    Issue Directive
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <DirectiveModal
        open={Boolean(selectedShip)}
        ship={selectedShip}
        ports={PORTS}
        onClose={() => setSelectedShip(null)}
        onSend={(action, params) => {
          if (selectedShip) {
            sendDirective(selectedShip.id, action, params);
          }
          setSelectedShip(null);
        }}
      />
    </div>
  );
}
