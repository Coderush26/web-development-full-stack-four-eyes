const { generateAlternativeRoute, generateRouteModel } = require('./routeGenerator');
const { annotateWeatherRisk } = require('./weatherAnalyzer');
const { evaluateRisk } = require('./riskEngine');

function buildIntelligenceSnapshot({
  ship,
  ships,
  zones,
  getWeatherRiskAt,
  forcedRoutePoints,
  mode = 'standard'
}) {
  const routeModel = generateRouteModel(ship, forcedRoutePoints, {
    steps: mode === 'deepScan' ? 96 : 56
  });
  const weatherAnnotated = annotateWeatherRisk(routeModel.route.fullPath, getWeatherRiskAt);
  const risk = evaluateRisk({
    ship,
    ships,
    zones,
    weatherAnnotatedPoints: weatherAnnotated
  });

  return {
    shipId: ship.id,
    timestamp: Date.now(),
    routeAnalysis: {
      riskScore: risk.riskScore,
      threatLevel: risk.threatLevel,
      confidence: risk.confidence,
      threats: risk.threats,
      recommendation: risk.recommendation
    },
    updatedRoute: {
      fullPath: routeModel.route.fullPath,
      completed: routeModel.route.completed,
      remaining: routeModel.route.remaining,
      riskAnnotatedPoints: risk.riskAnnotatedPoints
    }
  };
}

function buildAlternativeRoutePoints(baseSnapshot) {
  const routeModel = {
    route: {
      fullPath: baseSnapshot?.updatedRoute?.fullPath || []
    }
  };
  return generateAlternativeRoute(routeModel, 0.18);
}

module.exports = {
  buildIntelligenceSnapshot,
  buildAlternativeRoutePoints
};
