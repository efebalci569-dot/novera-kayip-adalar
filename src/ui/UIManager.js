import { h } from './dom.js';
import { HUD } from './HUD.js';
import { InventoryUI } from './InventoryUI.js';
import { CraftingUI } from './CraftingUI.js';
import { BuildingUI } from './BuildingUI.js';
import { QuestUI } from './QuestUI.js';
import { MapUI } from './MapUI.js';
import { PerkUI } from './PerkUI.js';
import { TechTreeUI } from './TechTreeUI.js';
import { ContainerUI } from './ContainerUI.js';
import { NoteUI } from './NoteUI.js';
import { MenuUI } from './MenuUI.js';
import { TouchControls } from './TouchControls.js';
import { registerIconKind } from './ItemIcons.js';
import { buildAnimalModel } from '../world/AnimalModels.js';
import { buildCreatureModel } from '../world/CreatureModels.js';

// Klavye kısayolu → panel eşlemesi ve gereken özellik kilidi
const PANEL_KEYS = [
  { action: 'inventory', panel: 'inventory', feature: null },
  { action: 'crafting', panel: 'crafting', feature: 'crafting' },
  { action: 'building', panel: 'building', feature: 'building' },
  { action: 'journal', panel: 'journal', feature: 'journal' },
  { action: 'map', panel: 'map', feature: 'map' },
  { action: 'skills', panel: 'skills', feature: 'skills' },
  { action: 'techtree', panel: 'techtree', feature: 'techtree' },
];

/** Tüm arayüzü yönetir: HUD, tek seferde açık olan panel ve menüler. */
export class UIManager {
  constructor(game) {
    this.game = game;
    registerIconKind('animal', (type) => ({ object: buildAnimalModel(type).root, rotation: [0.25, -0.9, 0] }));
    registerIconKind('enemy', (type) => ({ object: buildCreatureModel(type).root, rotation: [0.3, -0.8, 0] }));
    registerIconKind('boss', (type) => ({ object: buildCreatureModel(type).root, rotation: [0.15, -0.6, 0] }));
    this.root = document.getElementById('ui-root');
    this.hud = new HUD(game, this.root);
    this.touch = new TouchControls(game, this.root); // telefon/tablet kontrolleri (paneller ve menüler bunun üstünde)
    this.panelLayer = h('div', { class: 'panel-layer' });
    this.panelLayer.addEventListener('mousedown', (e) => {
      if (e.target === this.panelLayer) this.close();
    });
    this.root.append(this.panelLayer);
    this.panels = {
      inventory: new InventoryUI(game),
      crafting: new CraftingUI(game),
      building: new BuildingUI(game),
      journal: new QuestUI(game),
      map: new MapUI(game),
      skills: new PerkUI(game),
      techtree: new TechTreeUI(game),
      container: new ContainerUI(game),
      note: new NoteUI(game),
    };
    for (const p of Object.values(this.panels)) this.panelLayer.append(p.el);
    this.menu = new MenuUI(game, this.root);
    this.active = null;
    this.drag = null;
  }

  isOpen(name) {
    return this.active === name;
  }

  open(name, ctx = {}) {
    const g = this.game;
    if (this.active) this.panels[this.active].close();
    if (g.building.active) g.building.cancel();
    this.active = name;
    this.panels[name].open(ctx);
    this.panelLayer.classList.add('open');
    g.input.exitLock();
    g.audio.play('click');
  }

  close() {
    if (!this.active) return;
    this.panels[this.active].close();
    this.active = null;
    this.panelLayer.classList.remove('open');
    this.drag = null;
    if (this.game.state.mode === 'playing') this.game.input.requestLock();
  }

  toggle(name, ctx) {
    if (this.active === name) this.close();
    else this.open(name, ctx);
  }

  /** Oyun sırasında panel kısayollarını işler. */
  handleHotkeys() {
    const { input, state } = this.game;
    for (const k of PANEL_KEYS) {
      if (!input.wasPressed(k.action)) continue;
      if (this.game.player.ghost && k.panel !== 'map' && k.panel !== 'journal') continue; // izleyici
      if (k.feature && !state.hasFeature(k.feature)) {
        this.hud.toast('🔒 Bu özellik henüz açılmadı. Görevleri takip et!', 'warn', 2200);
        continue;
      }
      this.toggle(k.panel);
      return;
    }
  }

  update(dt) {
    this.hud.update(dt);
    this.touch.update(dt);
    this.menu.update(dt);
    if (this.active) this.panels[this.active].update(dt);
  }
}
