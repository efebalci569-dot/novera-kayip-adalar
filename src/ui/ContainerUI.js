import { Panel } from './Panel.js';
import { h } from './dom.js';
import { buildSlotGrid } from './InventoryUI.js';
import { Inventory } from '../player/Inventory.js';

/** Sandık arayüzü: tıkla → karşıya aktar, sürükle → istediğin slota bırak. */
export class ContainerUI extends Panel {
  constructor(game) {
    super(game, 'container', { title: 'Sandık', icon: '📦' });
    game.bus.on('inventory:changed', ({ inventory }) => {
      if (inventory === game.player.inventory || inventory === this.ctx.inventory) this.refresh();
    });
  }

  render() {
    const g = this.game;
    const chest = this.ctx.inventory;
    const player = g.player.inventory;
    if (!chest) return;
    this.titleEl.replaceChildren(`📦 ${this.ctx.title ?? 'Sandık'}`);
    const transfer = (src, dst) => (i) => {
      Inventory.quickTransfer(src, i, dst);
      g.audio.play('click');
    };
    const allTo = (src, dst) => () => {
      for (let i = 0; i < src.size; i++) if (src.slots[i]) Inventory.quickTransfer(src, i, dst);
      g.audio.play('pickup');
    };
    this.body.replaceChildren(h('div', { class: 'container-layout' },
      h('div', {},
        h('div', { class: 'section-title' }, 'Envanterin'),
        buildSlotGrid(g, player, { hotbar: true, onClick: transfer(player, chest), onContext: transfer(player, chest) }),
        h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: allTo(player, chest) }, 'Tümünü sandığa koy →'),
      ),
      h('div', {},
        h('div', { class: 'section-title' }, `Sandık (${chest.slots.filter(Boolean).length}/${chest.size})`),
        buildSlotGrid(g, chest, { onClick: transfer(chest, player), onContext: transfer(chest, player) }),
        h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: allTo(chest, player) }, '← Tümünü al'),
      ),
    ), h('div', { class: 'inv-note' }, 'Bir eşyaya tıklayarak karşı tarafa aktar. Sürükleyerek istediğin slota yerleştir.'));
  }
}
