import { Polygon } from 'react-leaflet';

export default function ZoneLayer({ zones }) {
  return (
    <>
      {zones.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.coords}
          pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.15 }}
        />
      ))}
    </>
  );
}
