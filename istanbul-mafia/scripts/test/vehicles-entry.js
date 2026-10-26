// Test girişi: oyunu (main.js) olduğu gibi yükler ve araç/deniz/hava sistemlerini window.__VEH ile dışa açar.
// main.js'e dokunmadan headless testte entegrasyonu taklit etmek için kullanılır.
import '../../src/main.js';
import { TrafficLights } from '../../src/world/traffic.js';
import { ShipTraffic } from '../../src/world/ships.js';
import { BoatManager, BOAT_TYPES, nearestWaterSpot } from '../../src/entities/boats.js';
import { AircraftManager, AIR_TYPES } from '../../src/entities/aircraft.js';

window.__VEH = { TrafficLights, ShipTraffic, BoatManager, AircraftManager, BOAT_TYPES, AIR_TYPES, nearestWaterSpot };
// main.js entegrasyon parçasının birebir taklidi
window.__wireVehicles = () => {
  const g = window.game;
  if (g.traffic) return;
  g.traffic = new TrafficLights(g);
  g.boats = new BoatManager(g);
  g.aircraft = new AircraftManager(g);
  g.ships = new ShipTraffic(g);
  const orig = g.updateGame.bind(g);
  g.updateGame = (dt, t) => {
    orig(dt, t);
    if (!g.player.inInterior) { g.traffic.update(dt); g.boats.update(dt); g.aircraft.update(dt); g.ships.update(dt); }
  };
  // player.js parçası: araç kendi girişini okur
  const pl = g.player;
  const od = pl.updateDriving.bind(pl);
  pl.updateDriving = (dt, input) => { od(dt, input); const v = pl.vehicle; if (v && v.readInput) v.readInput(input, dt); };
};
