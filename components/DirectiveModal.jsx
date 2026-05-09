import { useMemo, useState } from 'react';

export default function DirectiveModal({ open, ship, ports, onClose, onSend }) {
  const [action, setAction] = useState('hold');
  const [portName, setPortName] = useState(ports[0]?.name || '');
  const [waypointLat, setWaypointLat] = useState('');
  const [waypointLng, setWaypointLng] = useState('');

  const selectedPort = useMemo(
    () => ports.find((port) => port.name === portName),
    [portName, ports]
  );

  if (!open || !ship) {
    return null;
  }

  const submit = () => {
    if (action === 'reroute' && selectedPort) {
      onSend('reroute', { destination: selectedPort });
    } else if (action === 'divert' && waypointLat && waypointLng) {
      onSend('divert', {
        waypoint: {
          lat: Number(waypointLat),
          lng: Number(waypointLng)
        }
      });
    } else {
      onSend('hold');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Issue Directive - {ship.id}</h3>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="hold">Hold Position</option>
            <option value="reroute">Reroute to Port</option>
            <option value="divert">Divert to Waypoint</option>
          </select>
        </label>

        {action === 'reroute' ? (
          <label>
            Port
            <select value={portName} onChange={(e) => setPortName(e.target.value)}>
              {ports.map((port) => (
                <option key={port.name} value={port.name}>
                  {port.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {action === 'divert' ? (
          <>
            <label>
              Latitude
              <input value={waypointLat} onChange={(e) => setWaypointLat(e.target.value)} placeholder="25.1" />
            </label>
            <label>
              Longitude
              <input value={waypointLng} onChange={(e) => setWaypointLng(e.target.value)} placeholder="56.3" />
            </label>
          </>
        ) : null}

        <div className="modal-actions">
          <button className="btn-primary" type="button" onClick={submit}>
            Send
          </button>
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
