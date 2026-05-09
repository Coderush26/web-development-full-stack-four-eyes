import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { FeatureGroup, MapContainer, TileLayer, useMap } from 'react-leaflet';
import ShipMarker from './ShipMarker';
import ZoneLayer from './ZoneLayer';

function DrawToolbar({ zones, onAddZone, onUpdateZone, onDeleteZone }) {
  const map = useMap();

  useEffect(() => {
    const featureGroup = new L.FeatureGroup();
    map.addLayer(featureGroup);
    const zoneLayers = new Map();

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
        edit: true,
        remove: true
      }
    });
    map.addControl(control);

    const syncFeatureGroup = () => {
      featureGroup.clearLayers();
      zoneLayers.clear();
      for (const zone of zones) {
        const latLngs = zone.coords || [];
        if (latLngs.length < 3) {
          continue;
        }
        const layer = L.polygon(latLngs);
        layer.options.zoneId = zone.id;
        layer.options.zoneName = zone.name;
        zoneLayers.set(zone.id, layer);
        featureGroup.addLayer(layer);
      }
    };
    syncFeatureGroup();

    const onCreated = (event) => {
      const layer = event.layer;
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

    const onEdited = (event) => {
      event.layers.eachLayer((layer) => {
        const zoneId = layer.options.zoneId;
        if (!zoneId) {
          return;
        }
        const latLngs = layer.getLatLngs()?.[0] || [];
        if (latLngs.length < 3) {
          return;
        }
        const ring = latLngs.map((point) => [point.lng, point.lat]);
        const first = ring[0];
        const closedRing = [...ring, first];
        onUpdateZone(zoneId, { type: 'Polygon', coordinates: [closedRing] }, layer.options.zoneName);
      });
    };

    const onDeleted = (event) => {
      event.layers.eachLayer((layer) => {
        const zoneId = layer.options.zoneId;
        if (zoneId) {
          onDeleteZone(zoneId);
        }
      });
    };

    map.on(L.Draw.Event.CREATED, onCreated);
    map.on(L.Draw.Event.EDITED, onEdited);
    map.on(L.Draw.Event.DELETED, onDeleted);
    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.off(L.Draw.Event.EDITED, onEdited);
      map.off(L.Draw.Event.DELETED, onDeleted);
      map.removeControl(control);
      map.removeLayer(featureGroup);
    };
  }, [map, onAddZone, onUpdateZone, onDeleteZone, zones]);

  return <FeatureGroup />;
}

export default function FleetMap({ ships, zones, role, onAddZone, onUpdateZone, onDeleteZone, onIssueDirective }) {
  useEffect(() => {
    console.log('[PHASE 7 COMPLETE]');
  }, []);

  return (
    <MapContainer center={[25.0, 57.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {ships.map((ship) => (
        <ShipMarker key={ship.id} ship={ship} onIssueDirective={role === 'command' ? onIssueDirective : undefined} />
      ))}
      {role !== 'command' ? <ZoneLayer zones={zones} /> : null}
      {role === 'command' ? <DrawToolbar zones={zones} onAddZone={onAddZone} onUpdateZone={onUpdateZone} onDeleteZone={onDeleteZone} /> : null}
    </MapContainer>
  );
}
