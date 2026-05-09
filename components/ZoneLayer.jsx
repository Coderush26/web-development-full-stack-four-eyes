import { Polygon, Tooltip } from 'react-leaflet';

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
            fillOpacity: 0.16,
            weight: 2,
            dashArray: '8 4'
          }}
        >
          <Tooltip permanent direction="center" opacity={0.8}>
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.06em' }}>{zone.name}</span>
          </Tooltip>
        </Polygon>
      ))}
    </>
  );
}
