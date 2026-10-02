import { Panel } from './Panel.js';
import { h, renderSlot } from './dom.js';
import { ITEMS } from '../data/items.js';
import { RARITIES } from '../data/rarities.js';
import { HOTBAR_SIZE } from '../data/progression.js';
import { Inventory } from '../player/Inventory.js';

/** Slot ızgarası: sürükle-bırak, tıklama ve sağ tık desteğiyle (envanter ve sandık ortak kullanır). */
export function buildSlotGrid(game, inventory, { onClick, onContext, selectedIndex = -1, showLocked = 0, hotbar = false } = {}) {
  const grid = h('div', { class: 'inv-grid' });
  inventory.slots.forEach((stack, i) => {
    const el = h('div', { draggable: stack ? 'true' : 'false' });
    renderSlot(el, stack, {
      key: hotbar && i < HOTBAR_SIZE ? String(i + 1) : null,
      extraClass: `${hotbar && i < HOTBAR_SIZE ? 'hot' : ''} ${i === selectedIndex ? 'active' : ''}`,
    });
    el.addEventListener('click', (e) => onClick?.(i, e));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onContext?.(i, e);
    });
    el.addEventListener('dragstart', (e) => {
      game.ui.drag = { inventory, index: i };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const d = game.ui.drag;
      game.ui.drag = null;
      if (!d) return;
      Inventory.move(d.inventory, d.index, inventory, i);
      game.audio.play('click');
    });
    grid.append(el);
  });
  for (let i = 0; i < showLocked; i++) {
    grid.append(h('div', { class: 'slot locked', title: 'Sırt çantası ile açılır' }, '🔒'));
  }
  return grid;
}

export class InventoryUI extends Panel {
  constructor(game) {
    super(game, 'inventory', { title: 'Envanter', icon: '🎒', action: 'inventory' });
    this.selected = -1;
    this.confirmDrop = false;
    game.bus.on('inventory:changed', ({ inventory }) => {
      if (inventory === game.player.inventory) this.refresh();
    });
  }

  open(ctx) {
    this.selected = -1;
    super.open(ctx);
  }

  render() {
    const g = this.game;
    const inv = g.player.inventory;
    const locked = inv.size < 20 ? Math.min(5, 20 - inv.size) : 0;
    const grid = buildSlotGrid(g, inv, {
      hotbar: true,
      selectedIndex: this.selected,
      showLocked: locked,
      onClick: (i) => {
        this.selected = inv.slots[i] ? i : -1;
        this.confirmDrop = false;
        this.render();
      },
      onContext: (i) => this.quickUse(i),
    });

    const s = g.player.stats;
    const p = g.progression;
    const weapon = g.player.selectedItem?.damage ?? 0;
    const charStats = h('div', { class: 'char-stats' },
      h('div', {}, '❤️ Can', h('b', {}, `${Math.ceil(s.health)}/${s.maxHealth}`)),
      h('div', {}, '🍖 Açlık', h('b', {}, `${Math.ceil(s.hunger)}/100`)),
      h('div', {}, '💧 Susuzluk', h('b', {}, `${Math.ceil(s.thirst)}/100`)),
      h('div', {}, '⚡ Enerji', h('b', {}, `${Math.ceil(s.stamina)}/${Math.round(s.maxStamina)}`)),
      h('div', {}, '🛡️ Savunma', h('b', {}, s.defense)),
      h('div', {}, '⚔️ Hasar', h('b', {}, Math.round((s.baseDamage + weapon) * (1 + p.bonus('damage'))))),
    );

    this.body.replaceChildren(h('div', { class: 'inv-layout' },
      h('div', {},
        h('div', { class: 'section-title' }, `Eşyalar (${inv.slots.filter(Boolean).length}/${inv.size})`),
        grid,
        h('div', { class: 'inv-note' }, 'İlk 5 slot hızlı slotlarındır (1–5 tuşları). Sürükleyerek yer değiştir, sağ tık ile hızlı kullan.'),
        h('div', { class: 'section-title', style: { marginTop: '18px' } }, `Karakter · Seviye ${p.level}`),
        charStats,
      ),
      this.renderDetails(),
    ));
  }

  renderDetails() {
    const g = this.game;
    const inv = g.player.inventory;
    const stack = inv.slots[this.selected];
    if (!stack) return h('div', { class: 'details' }, h('div', { class: 'empty' }, 'Ayrıntıları görmek için bir eşya seç.'));
    const def = ITEMS[stack.id];
    const rarity = RARITIES[def.rarity ?? 'common'];
    const stats = [];
    if (def.food) {
      const f = def.food;
      if (f.hunger) stats.push(`🍖 +${f.hunger}`);
      if (f.thirst) stats.push(`💧 +${f.thirst}`);
      if (f.health) stats.push(`❤️ ${f.health > 0 ? '+' : ''}${f.health}`);
      if (f.stamina) stats.push(`⚡ +${f.stamina}`);
    }
    if (def.damage) stats.push(`⚔️ Hasar ${def.damage}`);
    if (def.tool && def.tool.type !== 'torch') stats.push(`Kademe ${def.tool.tier}`);
    if (stack.dur !== undefined) stats.push(`Dayanıklılık ${Math.ceil(stack.dur)}/${def.durability}`);

    const actions = [];
    if (def.food) actions.push(h('button', { class: 'btn small primary', onclick: () => this.quickUse(this.selected) }, def.consumeVerb ?? 'Ye'));
    if (def.vehicle) actions.push(h('button', { class: 'btn small primary', onclick: () => this.quickUse(this.selected) }, '🌊 Suya İndir'));
    if (this.selected >= HOTBAR_SIZE) {
      actions.push(h('button', { class: 'btn small', onclick: () => this.toHotbar(this.selected) }, 'Hızlı slota taşı'));
    } else {
      actions.push(h('button', { class: 'btn small', onclick: () => { g.player.selectSlot(this.selected); this.render(); } }, 'Eline al'));
    }
    actions.push(h('button', {
      class: 'btn small danger',
      onclick: () => {
        if (!this.confirmDrop) {
          this.confirmDrop = true;
          this.render();
          return;
        }
        const taken = inv.removeAt(this.selected);
        if (taken) {
          const p = g.player.position;
          g.world.drops.spawn(p.x + Math.sin(g.player.yaw) * 1.2, p.z + Math.cos(g.player.yaw) * 1.2, [taken]);
        }
        this.selected = -1;
        this.confirmDrop = false;
        this.render();
      },
    }, this.confirmDrop ? 'Emin misin? Yere bırak' : 'Yere bırak'));

    return h('div', { class: 'details' },
      h('div', { class: 'd-head' },
        h('div', { class: 'd-icon' }, def.icon),
        h('div', {},
          h('div', { class: 'd-name', style: { color: rarity.color } }, def.name, stack.count > 1 ? ` ×${stack.count}` : ''),
          h('div', { class: 'd-rarity', style: { color: rarity.color } }, rarity.name),
        ),
      ),
      h('div', { class: 'd-desc' }, def.desc ?? ''),
      stats.length ? h('div', { class: 'd-stats' }, stats.map((s) => h('span', { class: 'chip' }, s))) : null,
      h('div', { class: 'd-actions' }, actions),
    );
  }

  quickUse(i) {
    const g = this.game;
    const stack = g.player.inventory.slots[i];
    if (!stack) return;
    const def = ITEMS[stack.id];
    if (def.food) {
      g.interaction.consume(i);
    } else if (def.vehicle) {
      g.ui.close();
      if (!g.building.startPlacement(def.vehicle)) g.notify('Bir taşıtı suya indirmek için kıyıda olmalısın.', 'warn');
      else g.notify(`${def.icon} Suya bak ve [Sol tık] ile indir. [R] döndürür.`, 'info');
    } else if (i < HOTBAR_SIZE) {
      g.player.selectSlot(i);
    } else {
      this.toHotbar(i);
    }
  }

  toHotbar(i) {
    const g = this.game;
    const inv = g.player.inventory;
    let target = inv.slots.findIndex((s, idx) => idx < HOTBAR_SIZE && !s);
    if (target < 0) target = g.player.selectedSlot;
    Inventory.move(inv, i, inv, target);
    this.selected = target;
    g.audio.play('click');
    this.render();
  }
}
