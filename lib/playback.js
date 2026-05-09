const SNAPSHOT_INTERVAL = 30; // seconds
const MAX_SNAPSHOTS = 120;     // 60 minutes worth

let snapshots = [];
let tickCount = 0;

function maybeSnapshot(ships) {
  tickCount++;
  if (tickCount % SNAPSHOT_INTERVAL === 0) {
    snapshots.push({
      timestamp: Date.now(),
      ships: JSON.parse(JSON.stringify(ships)) // deep clone
    });
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.shift();
    }
  }
}

function getSnapshots() {
  return snapshots;
}

console.log('[PHASE 5 COMPLETE]');

module.exports = {
  maybeSnapshot,
  getSnapshots
};
