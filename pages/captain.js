import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useFleetSocket } from '../hooks/useFleetSocket';
import ShipSelector from '../components/captain/ShipSelector';

export default function CaptainPage() {
  const router = useRouter();
  const {
    ships,
    alerts,
    routeIntelligenceByShip
  } = useFleetSocket();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vesselsync_role', 'captain');
  }, [router]);

  const shipsForSelector = useMemo(() => ships.map((ship) => {
    const shipAlerts = alerts.filter((alert) => alert.status === 'active' && (
      alert.shipId === ship.id || alert.ship1Id === ship.id || alert.ship2Id === ship.id
    ));
    const riskScore = routeIntelligenceByShip[ship.id]?.routeAnalysis?.riskScore
      ?? (shipAlerts.some((alert) => Number(alert.severity) >= 4) ? 75 : 18);
    const riskLevel = riskScore >= 85 ? 'emergency' : riskScore >= 65 ? 'critical' : riskScore >= 35 ? 'warning' : 'normal';
    const fuelPct = ship.fuelCapacity ? Math.round((ship.fuel / ship.fuelCapacity) * 100) : 0;
    return { ...ship, riskLevel, fuelPct };
  }), [ships, alerts, routeIntelligenceByShip]);

  const filteredShips = useMemo(() => shipsForSelector.filter((ship) => {
    const matchesSearch = `${ship.name} ${ship.id}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ship.riskLevel === statusFilter;
    return matchesSearch && matchesStatus;
  }), [shipsForSelector, search, statusFilter]);

  return (
    <main className="captain-selector-page">
      <ShipSelector
        ships={filteredShips}
        onSelectShip={(id) => router.push(`/captain/${id}`)}
        selectedStatusFilter={statusFilter}
        onChangeStatusFilter={setStatusFilter}
        search={search}
        onChangeSearch={setSearch}
      />
    </main>
  );
}
