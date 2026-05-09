export default function ShipSelector({
  ships,
  onSelectShip,
  selectedStatusFilter,
  onChangeStatusFilter,
  search,
  onChangeSearch
}) {
  return (
    <section className="captain-selector">
      <div className="captain-selector-head">
        <h1>Select Your Vessel</h1>
        <p>Choose a ship to access the Captain Cockpit Console.</p>
      </div>
      <div className="captain-selector-controls">
        <input
          value={search}
          onChange={(event) => onChangeSearch(event.target.value)}
          placeholder="Search ship name or id..."
        />
        <select
          value={selectedStatusFilter}
          onChange={(event) => onChangeStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="normal">Normal</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="emergency">Emergency</option>
        </select>
      </div>
      <div className="captain-selector-grid">
        {ships.map((ship) => (
          <article key={ship.id} className={`captain-ship-card severity-${ship.riskLevel}`}>
            <div className="captain-ship-top">
              <strong>{ship.name}</strong>
              <span>{ship.id}</span>
            </div>
            <div className="captain-ship-meta">
              <span>Status: {ship.status}</span>
              <span>Fuel: {ship.fuelPct}%</span>
              <span>Risk: {ship.riskLevel}</span>
              <span>Destination: {ship.destination?.name || 'N/A'}</span>
            </div>
            <button className="btn-primary" onClick={() => onSelectShip(ship.id)}>
              Access Captain Console
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
