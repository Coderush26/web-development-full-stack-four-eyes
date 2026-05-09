import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { Circle, FeatureGroup, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import ShipMarker from './ShipMarker';
import ZoneLayer from './ZoneLayer';

function DrawToolbar({ onAddZone }) {
  const map = useMap();

  useEffect(() => {
    const featureGroup = new L.FeatureGroup();
    map.addLayer(featureGroup);

    const control = new L.Control.Draw({
      draw: {
        polygon: true,
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false
      },
      edit: {
        featureGroup,
        edit: false,
        remove: false
      }
    });
    map.addControl(control);

    const onCreated = (event) => {
      const layer = event.layer;
      featureGroup.addLayer(layer);
      const latLngs = layer.getLatLngs()?.[0] || [];
      if (latLngs.length < 3) {
        return;
      }

      const ring = latLngs.map((point) => [point.lng, point.lat]);
      const first = ring[0];
      const closedRing = [...ring, first];
      onAddZone(
        { type: 'Polygon', coordinates: [closedRing] },
        `Restricted Zone ${new Date().toISOString().slice(11, 19)}`
      );
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.removeControl(control);
      map.removeLayer(featureGroup);
    };
  }, [map, onAddZone]);

  return <FeatureGroup />;
}

function TacticalFocus({ tacticalInspection }) {
  const map = useMap();
  const lastSignatureRef = useRef('');

  useEffect(() => {
    if (!tacticalInspection?.enabled || !tacticalInspection?.routeModel?.route?.fullPath?.length) return;
    const path = tacticalInspection.routeModel.route.fullPath;
    const signature = `${path.length}:${path[0]?.lat?.toFixed(3)}:${path[0]?.lng?.toFixed(3)}:${path[path.length - 1]?.lat?.toFixed(3)}:${path[path.length - 1]?.lng?.toFixed(3)}`;
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    const latLngBounds = L.latLngBounds(path.map((point) => [point.lat, point.lng]));
    map.fitBounds(latLngBounds.pad(0.22), { animate: true, duration: 0.9 });
  }, [map, tacticalInspection]);

  return null;
}

function CaptainAutoFocus({ role, ships, tacticalInspection, emergencyBroadcast }) {
  const map = useMap();
  const lastCenterRef = useRef(null);

  useEffect(() => {
    if (role !== 'captain' || ships.length === 0) return;
    const ship = ships[0];
    if (!ship) return;

    if (emergencyBroadcast?.shipId && emergencyBroadcast.shipId === ship.id) {
      map.flyTo([ship.lat, ship.lng], Math.max(map.getZoom(), 10), { animate: true, duration: 0.7 });
      return;
    }

    const route = tacticalInspection?.routeModel?.route?.remaining || [];
    if (route.length > 1) {
      const bounds = L.latLngBounds(route.slice(0, 12).map((point) => [point.lat, point.lng]));
      map.fitBounds(bounds.pad(0.18), { animate: true, duration: 0.65, maxZoom: 10 });
      return;
    }

    const center = [ship.lat, ship.lng];
    const prev = lastCenterRef.current;
    if (!prev || Math.abs(prev[0] - center[0]) > 0.02 || Math.abs(prev[1] - center[1]) > 0.02) {
      lastCenterRef.current = center;
      map.flyTo(center, 9, { animate: true, duration: 0.6 });
    }
  }, [role, ships, tacticalInspection, emergencyBroadcast, map]);

  return null;
}

function riskPointIcon(label) {
  return L.divIcon({
    html: `<div class="risk-pin">${label}</div>`,
    className: 'risk-pin-wrap',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

export default function FleetMap({ ships, zones, role, onAddZone, onIssueDirective, onSelectShip, tacticalInspection, emergencyBroadcast }) {
  const shippingLanes = useMemo(() => [
    [[24.8, 56.1], [25.2, 57.1], [25.6, 58.2]],
    [[23.9, 56.7], [24.4, 57.7], [24.9, 58.8]],
    [[24.3, 55.5], [24.9, 56.5], [25.3, 57.5]]
  ], []);

  const stormCells = useMemo(() => {
    const now = Date.now();
    return [
      { id: 'storm-alpha', center: [24.72 + (Math.sin(now / 45000) * 0.06), 57.78], radius: 22000, level: 'warning' },
      { id: 'storm-bravo', center: [25.46, 56.63 + (Math.cos(now / 55000) * 0.08)], radius: 16000, level: 'critical' }
    ];
  }, [ships]);

  const projectedSegments = useMemo(() => ships
    .filter((ship) => Array.isArray(ship.path) && ship.path.length > 0)
    .map((ship) => ({
      id: ship.id,
      severity: ship.severityLevel || 'normal',
      points: [[ship.lat, ship.lng], ...ship.path.slice(0, 5).map((point) => [point.lat, point.lng])]
    })), [ships]);
  const [routeRenderCount, setRouteRenderCount] = useState(8);

  useEffect(() => {
    if (!tacticalInspection?.enabled) return undefined;
    setRouteRenderCount(8);
    const timer = setInterval(() => {
      setRouteRenderCount((prev) => Math.min(prev + 3, tacticalInspection.routeModel?.route?.fullPath?.length || prev));
    }, 110);
    return () => clearInterval(timer);
  }, [tacticalInspection?.enabled, tacticalInspection?.routeModel?.route?.fullPath?.length]);

  const tacticalRoute = tacticalInspection?.routeModel?.route;
  const tacticalRisk = tacticalInspection?.riskIntelligence;
  const animatedFuturePath = useMemo(() => {
    const remaining = tacticalRoute?.remaining || [];
    return remaining.slice(0, routeRenderCount).map((p) => [p.lat, p.lng]);
  }, [tacticalRoute, routeRenderCount]);
  const dangerMarkers = useMemo(() => {
    if (!tacticalRisk?.points) return [];
    return tacticalRisk.points.filter((point) => point.risk.totalRisk >= 70).slice(0, 10);
  }, [tacticalRisk]);
  const emergencyShip = useMemo(
    () => ships.find((ship) => ship.id === emergencyBroadcast?.shipId),
    [ships, emergencyBroadcast]
  );

  useEffect(() => {
    console.log('[PHASE 7 COMPLETE]');
  }, []);

  return (
    <MapContainer center={[25.0, 57.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {shippingLanes.map((lane, idx) => (
        <Polyline
          key={`lane-${idx}`}
          positions={lane}
          pathOptions={{
            color: '#0ea5e9',
            opacity: 0.35,
            weight: 1.5,
            dashArray: '8 8'
          }}
        />
      ))}
      {stormCells.map((storm) => (
        <Circle
          key={storm.id}
          center={storm.center}
          radius={storm.radius}
          pathOptions={{
            color: storm.level === 'critical' ? '#ef4444' : '#f59e0b',
            fillColor: storm.level === 'critical' ? '#ef4444' : '#f59e0b',
            fillOpacity: storm.level === 'critical' ? 0.13 : 0.1,
            weight: 1.2,
            dashArray: '5 6'
          }}
        />
      ))}
      {projectedSegments.map((segment) => (
        <Polyline
          key={`projection-${segment.id}`}
          positions={segment.points}
          pathOptions={{
            color: segment.severity === 'critical' || segment.severity === 'emergency' ? '#f87171' : '#38bdf8',
            opacity: 0.7,
            weight: 2,
            dashArray: '4 8'
          }}
        />
      ))}
      {ships
        .filter((ship) => ship.collisionRisk)
        .map((ship) => (
          <Circle
            key={`risk-${ship.id}`}
            center={[ship.lat, ship.lng]}
            radius={ship.collisionRisk > 0.7 ? 2000 : 1200}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.07,
              weight: 1.5,
              dashArray: '4 4'
            }}
          />
        ))}
      {ships.map((ship) => (
        <ShipMarker
          key={ship.id}
          ship={ship}
          dimmed={Boolean(
            (tacticalInspection?.enabled && tacticalInspection?.shipId !== ship.id)
            || (emergencyBroadcast?.shipId && emergencyBroadcast.shipId !== ship.id)
          )}
          onIssueDirective={role === 'command' ? onIssueDirective : undefined}
          onSelectShip={onSelectShip}
        />
      ))}
      {emergencyShip?.path?.length ? (
        <Polyline
          positions={[[emergencyShip.lat, emergencyShip.lng], ...emergencyShip.path.slice(0, 8).map((point) => [point.lat, point.lng])]}
          pathOptions={{ color: '#ef4444', opacity: 0.85, weight: 4, className: 'danger-segment-pulse' }}
        />
      ) : null}
      {tacticalInspection?.enabled && tacticalRoute ? (
        <>
          <Polyline
            positions={(tacticalRoute.completed || []).map((p) => [p.lat, p.lng])}
            pathOptions={{ color: '#94a3b8', opacity: 0.45, weight: 4 }}
          />
          <Polyline
            positions={animatedFuturePath}
            pathOptions={{ color: '#22d3ee', opacity: 0.95, weight: 4, className: 'future-route-glow' }}
          />
          {dangerMarkers.map((marker) => (
            <Circle
              key={`danger-${marker.sequence}`}
              center={[marker.lat, marker.lng]}
              radius={1100}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1.5, className: 'danger-segment-pulse' }}
            />
          ))}
          {dangerMarkers.slice(0, 3).map((marker, idx) => (
            <Marker
              key={`pin-${marker.sequence}`}
              position={[marker.lat, marker.lng]}
              icon={riskPointIcon(idx === 0 ? '🌩' : idx === 1 ? '⚠' : '🚫')}
            >
              <Tooltip direction="top" opacity={0.9}>
                Total Risk: {marker.risk.totalRisk}%
              </Tooltip>
            </Marker>
          ))}
        </>
      ) : null}
      <ZoneLayer zones={zones} />
      <Circle
        center={[25.0, 57.0]}
        radius={95000}
        pathOptions={{ color: '#22d3ee', fillOpacity: 0, opacity: 0.05, weight: 1 }}
      />
      <Circle
        center={[25.0, 57.0]}
        radius={60000}
        pathOptions={{ color: '#22d3ee', fillOpacity: 0, opacity: 0.07, weight: 1, dashArray: '5 8' }}
      />
      {tacticalInspection?.enabled ? <TacticalFocus tacticalInspection={tacticalInspection} /> : null}
      <CaptainAutoFocus
        role={role}
        ships={ships}
        tacticalInspection={tacticalInspection}
        emergencyBroadcast={emergencyBroadcast}
      />
      {role === 'command' ? <DrawToolbar onAddZone={onAddZone} /> : null}
    </MapContainer>
  );
}
