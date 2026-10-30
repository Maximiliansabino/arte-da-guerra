// Cosmetic effects consume server-confirmed hits; they never calculate damage.
// Keeping coordinates on each event also lets a lethal hit finish its animation.
const LIMIT = 512;
const TIMING = {
  melee: { travel: 170, life: 650 },
  arrow: { travel: 230, life: 710 },
  bolt: { travel: 270, life: 750 }
};

const clock = () => performance.now();
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const circle = (ctx, x, y, radius) => {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
};

export class CombatEffects {
  constructor() {
    this.reset();
  }

  reset() {
    this.events = [];
    this.roomCode = null;
    this.lastId = 0;
  }

  ingest(snapshot, now = clock()) {
    if (!snapshot || !Number.isFinite(snapshot.time)) return;
    if (this.roomCode !== snapshot.code) {
      this.reset();
      this.roomCode = snapshot.code;
    }
    this.events = this.events.filter(event => now - event.started < TIMING[event.kind].life);
    // Compare against the previous snapshot's watermark, so array order cannot
    // accidentally discard a second hit from the same simulation tick.
    const previousId = this.lastId;
    const batchIds = new Set();
    for (const event of snapshot.combatEvents || []) {
      if (!Number.isSafeInteger(event.id) || event.id <= previousId || batchIds.has(event.id)) continue;
      batchIds.add(event.id);
      this.lastId = Math.max(this.lastId, event.id);
      if (!Object.hasOwn(TIMING, event.kind) || !validPoint(event.from) || !validPoint(event.to)) continue;
      if (!Number.isFinite(event.at) || !Number.isFinite(event.damage) || event.damage <= 0) continue;
      const age = Math.max(0, (snapshot.time - event.at) * 1000);
      // Reconnecting must not replay the server's short history as fresh attacks.
      if (age >= TIMING[event.kind].life) continue;
      this.events.push({
        id: event.id,
        kind: event.kind,
        owner: event.owner,
        from: { ...event.from },
        to: { ...event.to },
        damage: event.damage,
        started: now - age
      });
    }
    if (this.events.length > LIMIT) this.events.splice(0, this.events.length - LIMIT);
  }

  draw(ctx, now = clock(), colorsByOwner = {}) {
    this.events = this.events.filter(event => now - event.started < TIMING[event.kind].life);
    for (const event of this.events) {
      const age = Math.max(0, now - event.started);
      const timing = TIMING[event.kind];
      const color = (colorsByOwner instanceof Map
        ? colorsByOwner.get(event.owner)
        : colorsByOwner[event.owner]) || '#ead18b';
      const from = { x: event.from.x, y: event.from.y - 14 };
      const to = { x: event.to.x, y: event.to.y - 8 };
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const progress = Math.min(1, age / timing.travel);
      ctx.save();
      ctx.lineCap = 'round';

      if (age < timing.travel) {
        if (event.kind === 'melee') {
          const radius = Math.max(18, Math.min(64, Math.hypot(to.x - from.x, to.y - from.y)));
          ctx.strokeStyle = color;
          ctx.lineWidth = 7;
          ctx.globalAlpha = 1 - progress * .35;
          ctx.beginPath();
          ctx.arc(from.x, from.y, radius, angle - 1.15 + progress * .8, angle - .65 + progress * 2.1);
          ctx.stroke();
          ctx.strokeStyle = '#fff4ce';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          const x = from.x + (to.x - from.x) * progress;
          const y = from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 12;
          ctx.translate(x, y);
          ctx.rotate(angle);
          if (event.kind === 'arrow') {
            ctx.strokeStyle = '#17281c';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-22, 0);
            ctx.lineTo(2, 0);
            ctx.stroke();
            ctx.strokeStyle = '#f8e7b0';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(7, 0);
            ctx.lineTo(-2, -4);
            ctx.lineTo(-2, 4);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.globalAlpha = .45;
            ctx.strokeStyle = color;
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.moveTo(-27, 0);
            ctx.lineTo(0, 0);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            circle(ctx, 0, 0, 7);
            ctx.fill();
            ctx.fillStyle = '#fff5d7';
            circle(ctx, 1, 0, 3);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      if (age >= timing.travel) {
        const impact = (age - timing.travel) / (timing.life - timing.travel);
        ctx.save();
        ctx.globalAlpha = 1 - impact;
        ctx.strokeStyle = color;
        ctx.fillStyle = '#fff0c9';
        ctx.lineWidth = 3 * (1 - impact) + 1;
        circle(ctx, to.x, to.y, 5 + impact * 20);
        ctx.stroke();
        if (impact < .35) {
          circle(ctx, to.x, to.y, 6 * (1 - impact));
          ctx.fill();
        }
        for (let i = 0; i < 5; i++) {
          const ray = angle + i * Math.PI * 2 / 5;
          const radius = 8 + impact * 24;
          ctx.fillRect(to.x + Math.cos(ray) * radius - 1.5, to.y + Math.sin(ray) * radius - 1.5, 3, 3);
        }
        ctx.font = 'bold 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#18231e';
        const label = `−${Math.round(event.damage)}`;
        const labelY = to.y - 18 - impact * 24;
        ctx.strokeText(label, to.x, labelY);
        ctx.fillStyle = '#fff1cc';
        ctx.fillText(label, to.x, labelY);
        ctx.restore();
      }
    }
  }
}

export const createCombatEffects = () => new CombatEffects();
