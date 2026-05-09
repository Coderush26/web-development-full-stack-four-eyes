function interpolate(origin, destination, ratio) {
  return {
    lat: origin.lat + ((destination.lat - origin.lat) * ratio),
    lng: origin.lng + ((destination.lng - origin.lng) * ratio)
  };
}

function buildPath(origin, destination, steps = 50) {
  const safeSteps = Math.max(16, Math.min(140, Number(steps) || 50));
  const path = [];
  for (let i = 0; i <= safeSteps; i += 1) {
    const point = interpolate(origin, destination, i / safeSteps);
    path.push({
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6))
    });
  }
  return path;
}

function closestPathIndex(path, currentPosition) {
  if (!path.length) return 0;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i += 1) {
    const dLat = path[i].lat - currentPosition.lat;
    const dLng = path[i].lng - currentPosition.lng;
    const score = (dLat * dLat) + (dLng * dLng);
    if (score < bestDist) {
      bestDist = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function generateRouteModel(ship, forcedRoutePoints, options = {}) {
  const currentPosition = { lat: ship.lat, lng: ship.lng };
  const destination = ship.destination || currentPosition;
  const origin = {
    lat: Number((ship.lat - (Math.cos(((ship.heading || 0) * Math.PI) / 180) * 0.8)).toFixed(6)),
    lng: Number((ship.lng - (Math.sin(((ship.heading || 0) * Math.PI) / 180) * 0.8)).toFixed(6))
  };

  const fullPath = Array.isArray(forcedRoutePoints) && forcedRoutePoints.length > 1
    ? forcedRoutePoints
    : buildPath(origin, destination, options.steps || 56);
  const idx = closestPathIndex(fullPath, currentPosition);

  return {
    id: ship.id,
    name: ship.name,
    origin,
    destination,
    currentPosition,
    route: {
      fullPath,
      completed: fullPath.slice(0, idx + 1),
      remaining: fullPath.slice(idx)
    }
  };
}

function generateAlternativeRoute(routeModel, lateralOffset = 0.18) {
  const basePath = routeModel?.route?.fullPath || [];
  const detoured = basePath.map((point, index) => {
    const ratio = index / Math.max(1, basePath.length - 1);
    const bend = Math.sin(ratio * Math.PI) * lateralOffset;
    return {
      lat: Number((point.lat + bend).toFixed(6)),
      lng: Number((point.lng + (bend * 0.75)).toFixed(6))
    };
  });
  return detoured;
}

module.exports = {
  generateRouteModel,
  generateAlternativeRoute
};
