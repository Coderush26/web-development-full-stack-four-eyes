import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { FeatureGroup, MapContainer, TileLayer, useMap } from 'react-leaflet';
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

export default function FleetMap({ ships, zones, role, onAddZone, onIssueDirective }) {
  useEffect(() => {
    console.log('[PHASE 7 COMPLETE]');
  }, []);

  return (
    <MapContainer center={[25.0, 57.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {ships.map((ship) => (
        <ShipMarker key={ship.id} ship={ship} onIssueDirective={role === 'command' ? onIssueDirective : undefined} />
      ))}
      <ZoneLayer zones={zones} />
      {role === 'command' ? <DrawToolbar onAddZone={onAddZone} /> : null}
    </MapContainer>
  );
}
