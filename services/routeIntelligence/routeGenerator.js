function interpolateGreatCircle(origin, destination, ratio) {
  return {
    lat: origin.lat + ((destination.lat - origin.lat) * ratio),
    lng: origin.lng + ((destination.lng - origin.lng) * ratio)
  };
}

function buildInterpolatedPath(origin, destination, steps = 42) {
  const safeSteps = Math.max(12, Math.min(120, Number(steps) || 42));
  const points = [];
  for (let i = 0; i <= safeSteps; i += 1) {
    const ratio = i / safeSteps;
    const point = interpolateGreatCircle(origin, destination, ratio);
    points.push({
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6))
    });
  }
  return points;
}

function findClosestIndex(path, currentPosition) {
  if (!currentPosition || path.length === 0) return 0;
  let bestIdx = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    const dLat = point.lat - currentPosition.lat;
    const dLng = point.lng - currentPosition.lng;
    const score = (dLat * dLat) + (dLng * dLng);
    if (score < bestDistance) {
      bestDistance = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function generateShipRouteModel(ship, options = {}) {
  const destination = ship?.destination || options.destination;
  const currentPosition = { lat: ship.lat, lng: ship.lng };
  const origin = options.origin || ship.origin || {
    lat: Number((ship.lat - (Math.cos(((ship.heading || 0) * Math.PI) / 180) * 0.85)).toFixed(6)),
    lng: Number((ship.lng - (Math.sin(((ship.heading || 0) * Math.PI) / 180) * 0.85)).toFixed(6))
  };

  if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
    return {
      id: ship.id,
      name: ship.name,
      origin,
      destination: currentPosition,
      currentPosition,
      route: { fullPath: [currentPosition], completed: [], remaining: [currentPosition] }
    };
  }

  const fullPath = buildInterpolatedPath(origin, destination, options.steps || 48);
  const currentIdx = findClosestIndex(fullPath, currentPosition);

  return {
    id: ship.id,
    name: ship.name,
    origin,
    destination,
    currentPosition,
    route: {
      fullPath,
      completed: fullPath.slice(0, currentIdx + 1),
      remaining: fullPath.slice(currentIdx)
    }
  };
}

export function generateAlternativeRoute(routeModel, offset = 0.2) {
  const fullPath = routeModel?.route?.fullPath || [];
  if (fullPath.length === 0) return routeModel;

  const detoured = fullPath.map((point, index) => {
    const normalized = index / Math.max(1, fullPath.length - 1);
    const bend = Math.sin(normalized * Math.PI) * offset;
    return {
      lat: Number((point.lat + bend).toFixed(6)),
      lng: Number((point.lng + (bend * 0.75)).toFixed(6))
    };
  });

  const currentIdx = findClosestIndex(detoured, routeModel.currentPosition);
  return {
    ...routeModel,
    route: {
      fullPath: detoured,
      completed: detoured.slice(0, currentIdx + 1),
      remaining: detoured.slice(currentIdx)
    }
  };
}
