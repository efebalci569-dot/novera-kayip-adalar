import { Panel } from './Panel.js';
import { h } from './dom.js';
import { PERKS } from '../data/perks.js';

export class PerkUI extends Panel {
  constructor(game) {
    super(game, 'skills', { title: 'Yetenekler', icon: '✨', action: 'skills' });
    for (const ev of ['perk:upgraded', 'level:up', 'perk:points']) game.bus.on(ev, () => this.refresh());
  }

  render() {
    const g = this.game;
    const p = g.progression;
    const cards = Object.entries(PERKS).map(([id, def]) => {
      const rank = p.rank(id);
      return h('div', { class: 'perk' },
        h('div', { class: 'p-head' },
          h('div', { class: 'p-icon' }, def.icon),
          h('div', {}, h('div', { class: 'p-name' }, def.name), h('div', { class: 'pips' }, Array.from({ length: def.maxRank }, (_, i) => h('div', { class: `pip ${i < rank ? 'on' : ''}` })))),
        ),
        h('div', { class: 'p-desc' }, def.desc),
        h('button', {
          class: `btn small ${p.canUpgrade(id) ? 'primary' : ''}`,
          disabled: !p.canUpgrade(id),
          onclick: () => {
            if (p.upgradePerk(id)) {
              g.audio.play('craft');
              g.ui.hud.toast(`✨ ${def.name} → ${p.rank(id)}. derece`, 'success');
            }
          },
        }, rank >= def.maxRank ? 'Maksimum' : `Geliştir (${rank}/${def.maxRank})`),
      );
    });
    this.body.replaceChildren(
      h('div', { class: 'points-banner' }, 'Kullanılabilir yetenek puanı:', h('b', {}, p.perkPoints), h('span', { class: 'inv-note', style: { margin: 0 } }, '— her seviye atlamada 1 puan kazanırsın. Seçimlerin oyun tarzını belirler.')),
      h('div', { class: 'perk-grid' }, cards),
    );
  }
}
