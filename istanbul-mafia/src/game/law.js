// [kanun] Kanun ve sokak düzeni yan sistemleri: ambulans, araç gaspı, trafik cezası, ev sahibi.
// main.js yalnız `law.update(dt)` ve F tuşunda `law.carjack.tryEnter(v)` çağırır.
import { Ambulance } from './ambulance.js';
import { Carjack } from './carjack.js';
import { TrafficLaw } from './traffic_law.js';
import { HomeOwner } from './homeowner.js';

export class Law {
  constructor(game) {
    this.game = game;
    this.ambulance = new Ambulance(game);
    this.carjack = new Carjack(game);
    this.traffic = new TrafficLaw(game);
    this.home = new HomeOwner(game);
    game.ambulance = this.ambulance;
  }
  update(dt) {
    this.carjack.update(dt);
    this.traffic.update(dt);
    this.home.update(dt);
    this.ambulance.update(dt);
  }
}
