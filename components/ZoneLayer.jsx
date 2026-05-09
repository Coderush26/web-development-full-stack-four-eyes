import { Polygon } from 'react-leaflet';

export default function ZoneLayer({ zones }) {
  return (
    <>
      {zones.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.coords}
          pathOptions={{
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '8 4'
          }}
        />
      ))}
    </>
  );
}
