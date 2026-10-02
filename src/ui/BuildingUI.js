import { Panel } from './Panel.js';
import { h, itemChip } from './dom.js';
import { BUILDINGS, BUILD_ORDER } from '../data/buildings.js';

export class BuildingUI extends Panel {
  constructor(game) {
    super(game, 'building', { title: 'İnşa', icon: '🏗️', action: 'building' });
    game.bus.on('inventory:changed', () => this.refresh());
  }

  render() {
    const g = this.game;
    const inv = g.player.inventory;
    const cards = BUILD_ORDER.map((type) => {
      const def = BUILDINGS[type];
      const unlocked = g.state.buildings.has(type);
      if (!unlocked) {
        // seviyeyle açılanlar adıyla görünür (hedef olsun), görevle açılanlar gizli kalır
        const lvl = def.unlock?.level;
        return h('div', { class: 'build-card locked' },
          h('div', { class: 'bc-icon' }, lvl ? def.icon : '🔒'),
          h('div', { class: 'bc-name' }, lvl ? def.name : '???'),
          h('div', { class: 'bc-desc' }, lvl ? `🔒 Seviye ${lvl}'de açılır. ${def.desc}` : 'Görevlerle açılır.'),
        );
      }
      const afford = g.building.canAfford(type);
      const count = g.building.count(type);
      return h('div', {
        class: `build-card ${afford ? '' : 'cant'}`,
        onclick: () => {
          g.audio.play('click');
          g.ui.close();
          g.building.startPlacement(type);
        },
      },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' } },
        h('div', { class: 'bc-icon' }, def.icon),
        count ? h('span', { class: 'chip' }, `Kurulu: ${count}`) : null,
      ),
      h('div', { class: 'bc-name' }, def.name, def.shelter ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, `Konfor ${'★'.repeat(Math.max(1, Math.round(def.comfort)))}`) : null),
      h('div', { class: 'bc-desc' }, def.desc),
      h('div', { class: 'cost' }, Object.entries(def.cost).map(([id, n]) => itemChip(id, n, inv.count(id)))),
      );
    });
    this.body.replaceChildren(
      h('div', { class: 'section-title' }, 'Bir yapı seç — sonra yerleştirmek istediğin yere bak ve sol tıkla'),
      h('div', { class: 'build-grid' }, cards),
      h('div', { class: 'inv-note', style: { marginTop: '14px' } }, 'İpucu: Önizleme mavi ise yerleştirilebilir; kırmızıysa bir ağaç, kaya, çalı ya da başka bir yapıyla çakışıyordur. Yatağı ve sandığı barınağın içine koyabilirsin.'),
    );
  }
}
