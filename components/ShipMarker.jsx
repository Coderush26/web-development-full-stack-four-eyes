import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';

function createShipIcon(heading, status) {
  const color = status === 'rerouting' ? '#fbbf24'
    : status === 'stopped' ? '#ef4444'
    : status === 'stranded' ? '#f87171'
    : '#8b5cf6';

  const svg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <g transform="rotate(${heading || 0}, 14, 14)">
      <path d="M14 3 L21 22 L14 18 L7 22 Z" fill="${color}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
    </g>
    <circle cx="14" cy="14" r="3" fill="${color}" opacity="0.4">
      <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'ship-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

export default function ShipMarker({ ship, onIssueDirective }) {
  const markerRef = useRef(null);
  const lerpPos = useRef({ lat: ship.lat, lng: ship.lng });

  useEffect(() => {
    const start = { ...lerpPos.current };
    const end = { lat: ship.lat, lng: ship.lng };
    const startTime = performance.now();
    const duration = 900;
    let frame = null;

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      lerpPos.current = {
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t
      };
      markerRef.current?.setLatLng([lerpPos.current.lat, lerpPos.current.lng]);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    }

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ship.lat, ship.lng]);

  // Update icon when heading/status changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setIcon(createShipIcon(ship.heading, ship.status));
    }
  }, [ship.heading, ship.status]);

  const fuelPercent = useMemo(() => {
    if (!ship.fuelCapacity) return 0;
    return Math.round((ship.fuel / ship.fuelCapacity) * 100);
  }, [ship.fuel, ship.fuelCapacity]);

  const icon = useMemo(() => createShipIcon(ship.heading, ship.status), [ship.heading, ship.status]);

  return (
    <Marker
      ref={markerRef}
      position={[lerpPos.current.lat, lerpPos.current.lng]}
      icon={icon}
    >
      <Popup>
        <div style={{ minWidth: 200, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>{ship.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>{ship.id}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
            <span style={{ color: '#64748b' }}>Status</span>
            <span style={{ textTransform: 'capitalize' }}>{ship.status}</span>
            <span style={{ color: '#64748b' }}>Speed</span>
            <span>{ship.speed} kn</span>
            <span style={{ color: '#64748b' }}>Fuel</span>
            <span style={{ color: fuelPercent < 20 ? '#f87171' : '#4ade80' }}>{fuelPercent}%</span>
            <span style={{ color: '#64748b' }}>Heading</span>
            <span>{ship.heading}°</span>
            <span style={{ color: '#64748b' }}>Dest</span>
            <span>{ship.destination?.name}</span>
          </div>
          {onIssueDirective ? (
            <button
              className="btn-primary"
              type="button"
              onClick={() => onIssueDirective(ship)}
              style={{ width: '100%', marginTop: 10 }}
            >
              Issue Directive
            </button>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}
