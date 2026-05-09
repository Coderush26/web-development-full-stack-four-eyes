import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup } from 'react-leaflet';

const shipIcon = L.divIcon({
  html: '🚢',
  className: 'ship-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

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

  const fuelPercent = useMemo(() => {
    if (!ship.fuelCapacity) {
      return 0;
    }
    return Math.round((ship.fuel / ship.fuelCapacity) * 100);
  }, [ship.fuel, ship.fuelCapacity]);

  return (
    <Marker
      ref={markerRef}
      position={[lerpPos.current.lat, lerpPos.current.lng]}
      icon={shipIcon}
    >
      <Popup>
        <div style={{ minWidth: 220 }}>
          <strong>{ship.name}</strong>
          <div>{ship.id}</div>
          <div>Status: {ship.status}</div>
          <div>Speed: {ship.speed} knots</div>
          <div>Fuel: {fuelPercent}%</div>
          <div>Cargo: {ship.cargo}</div>
          <div>Destination: {ship.destination.name}</div>
          {onIssueDirective ? (
            <button className="btn-primary" type="button" onClick={() => onIssueDirective(ship)}>
              Issue Directive
            </button>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}
