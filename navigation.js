import {terrainBlocked, segmentClear} from './public/terrain.js';
import {STATS, WORLD, entityStats} from './public/rules.js';

// The grid and the final approach use the same footprint. In particular, the
// old 50px navigation exclusion could never reach a worker's 51px melee range.
export const BUILDING_RADIUS = 38;
const CELL = 30, SIZE = WORLD / CELL, COUNT = SIZE * SIZE;
const EPSILON = .2;
const caches = new WeakMap(), paths = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const nodePoint = k => ({x: (k % SIZE) * CELL + CELL / 2, y: Math.floor(k / SIZE) * CELL + CELL / 2});
const bounds = (x, y) => x < 15 || y < 15 || x > WORLD - 15 || y > WORLD - 15;
const terrainGrids = new Map();

function makeNavigation(r, extraBuilding = null, ignored = new Set()) {
  const buildings = r.entities.filter(e => e.hp > 0 && STATS[e.type]?.building && !ignored.has(e.id));
  if (extraBuilding) buildings.push(extraBuilding);
  const blocked = (x, y) => bounds(x, y) || (r.mapId && terrainBlocked(x, y, 10, r.mapId)) || buildings.some(b => (x - b.x) ** 2 + (y - b.y) ** 2 < BUILDING_RADIUS ** 2);
  const terrainKey = r.mapId || null;
  if (!terrainGrids.has(terrainKey)) terrainGrids.set(terrainKey, Uint8Array.from({length: COUNT}, (_, k) => {
    const p = nodePoint(k); return terrainKey && terrainBlocked(p.x, p.y, 10, terrainKey) ? 1 : 0;
  }));
  const grid = terrainGrids.get(terrainKey).slice();
  for (const b of buildings) {
    for (let y = Math.max(0, Math.floor((b.y - BUILDING_RADIUS) / CELL)); y <= Math.min(SIZE - 1, Math.floor((b.y + BUILDING_RADIUS) / CELL)); y++) {
      for (let x = Math.max(0, Math.floor((b.x - BUILDING_RADIUS) / CELL)); x <= Math.min(SIZE - 1, Math.floor((b.x + BUILDING_RADIUS) / CELL)); x++) {
        const p = nodePoint(y * SIZE + x);
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < BUILDING_RADIUS ** 2) grid[y * SIZE + x] = 1;
      }
    }
  }
  return {blocked, grid, edges: new Map(), buildings};
}

function navigation(r) {
  let cached = caches.get(r);
  if (cached && cached.tick === r.tick && cached.entities === r.entities && cached.count === r.entities.length && cached.mapId === r.mapId) return cached.nav;
  const signature = r.entities.filter(e => e.hp > 0 && STATS[e.type]?.building).map(e => `${e.id}:${e.x}:${e.y}`).join('|');
  const nav = cached?.signature === signature && cached.mapId === r.mapId ? cached.nav : makeNavigation(r);
  caches.set(r, {tick: r.tick, entities: r.entities, count: r.entities.length, signature, mapId: r.mapId, nav});
  return nav;
}

export function invalidateNavigation(r) {caches.delete(r);}
export function isWalkable(r, point) {return valid(point) && !navigation(r).blocked(point.x, point.y);}

/** Find a nearby reachable interaction target without moving the unit.
 * A failed search shares the tick's pathfinding budget and visits only a
 * bounded neighbourhood; callers can throttle retries when a forest runs out.
 */
export function findReachableTarget(r, from, candidates, reach = 28, maxTravel = 650) {
  if (!valid(from) || !candidates.length) return {target:null, deferred:false};
  const nav = navigation(r);
  const direct = target => {
    const end = endpoint(from, target, reach);
    return distance(from, end) <= maxTravel && !nav.blocked(end.x, end.y) && segmentClear(from, end, nav.blocked);
  };
  if (direct(candidates[0])) return {target:candidates[0], deferred:false};
  if ((r.navigationBudget !== undefined && r.navigationBudget <= 0) || r.resourceSearchBudget === 0) return {target:null, deferred:true};
  if (r.navigationBudget !== undefined) r.navigationBudget--;
  if (r.resourceSearchBudget !== undefined) r.resourceSearchBudget--;
  const costs = new Float64Array(COUNT).fill(Infinity), queue = [];
  for (const start of startsFor(nav, from)) {costs[start.key] = start.distance; queue.push(start.key);}
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i], cost = costs[key] + CELL;
    if (cost > maxTravel) continue;
    for (const next of neighbours(nav, key)) if (cost < costs[next]) {costs[next] = cost; queue.push(next);}
  }
  for (const target of candidates) {
    if (direct(target)) return {target, deferred:false};
    const tx = Math.floor(target.x / CELL), ty = Math.floor(target.y / CELL), radius = Math.ceil(reach / CELL) + 2;
    for (let y = Math.max(0, ty-radius); y <= Math.min(SIZE-1, ty+radius); y++) {
      for (let x = Math.max(0, tx-radius); x <= Math.min(SIZE-1, tx+radius); x++) {
        const key = y * SIZE + x;
        if (!Number.isFinite(costs[key])) continue;
        const node = nodePoint(key), end = endpoint(node, target, reach);
        if (costs[key] + distance(node, end) <= maxTravel && !nav.blocked(end.x, end.y) && segmentClear(node, end, nav.blocked)) return {target, deferred:false};
      }
    }
  }
  return {target:null, deferred:false};
}

function startsFor(nav, point) {
  const sx = Math.floor(point.x / CELL), sy = Math.floor(point.y / CELL), starts = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
    const key = y * SIZE + x, p = nodePoint(key);
    if (!nav.grid[key] && segmentClear(point, p, nav.blocked)) starts.push({key, distance: distance(point, p)});
  }
  starts.sort((a, b) => a.distance - b.distance);
  return starts;
}

function neighbours(nav, key) {
  if (nav.edges.has(key)) return nav.edges.get(key);
  const x = key % SIZE, y = Math.floor(key / SIZE), from = nodePoint(key), result = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
    const next = ny * SIZE + nx;
    if (!nav.grid[next] && segmentClear(from, nodePoint(next), nav.blocked)) result.push(next);
  }
  nav.edges.set(key, result);
  return result;
}

function endpoint(from, target, reach) {
  const d = distance(from, target);
  if (d <= reach) return {x: from.x, y: from.y};
  const margin = Math.max(0, reach - EPSILON), ratio = margin / d;
  return {x: target.x + (from.x - target.x) * ratio, y: target.y + (from.y - target.y) * ratio};
}

function routeToRange(nav, from, target, reach) {
  const starts = startsFor(nav, from);
  if (!starts.length) return {nodes: [], reachable: false};
  const previous = new Int32Array(COUNT).fill(-1), queue = [];
  // Multiple locally visible starting cells avoid forcing an arbitrary side of
  // a narrow gap. Every first segment is still checked against real geometry.
  for (const {key} of starts) {previous[key] = key; queue.push(key);}
  let best = starts[0].key, bestDistance = distance(from, target), goal = null;
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i], p = nodePoint(key), d = distance(p, target);
    if (d < bestDistance) {best = key; bestDistance = d;}
    if (d <= reach + CELL * 1.5) {
      const end = endpoint(p, target, reach);
      if (!nav.blocked(end.x, end.y) && segmentClear(p, end, nav.blocked)) {best = key; goal = end; break;}
    }
    for (const next of neighbours(nav, key)) if (previous[next] === -1) {previous[next] = key; queue.push(next);}
  }
  const nodes = [];
  for (let key = best; ; key = previous[key]) {
    nodes.push(nodePoint(key));
    if (previous[key] === key) break;
  }
  nodes.reverse();
  if (goal) nodes.push(goal);
  else if (bestDistance >= distance(from, target) - 2) return {nodes: [], reachable: false};
  // Smooth a few adjacent grid corners, preserving collision checks. This also
  // avoids the small orbit around a building seen when aiming at its centre.
  const smooth = [];
  let current = from;
  for (let i = 0; i < nodes.length;) {
    let next = i;
    for (let j = i + 1; j < Math.min(nodes.length, i + 7); j++) if (segmentClear(current, nodes[j], nav.blocked)) next = j;
    smooth.push(nodes[next]); current = nodes[next]; i = next + 1;
  }
  return {nodes: smooth, reachable: !!goal};
}

/** Move towards a free interaction perimeter. The caller owns order/activity. */
export function walk(e, target, dt, r, reach = 0) {
  if (!valid(target) || !Number.isFinite(reach) || reach < 0) return 'blocked';
  if (e.rootUntil > r.time) return 'rooted';
  const tolerance = reach ? 0 : 2;
  if (distance(e, target) <= reach + tolerance) {paths.delete(e); return 'arrived';}
  const nav = navigation(r), cached = paths.get(e);
  let path = cached;
  const sameGoal = path && path.nav === nav && path.reach === reach && distance(path.target, target) < 15 && r.tick - path.tick <= 25;
  if (!sameGoal) {
    const end = endpoint(e, target, reach);
    if (!nav.blocked(end.x, end.y) && segmentClear(e, end, nav.blocked)) path = {nodes: [end], reachable: true};
    else {
      if (r.navigationBudget !== undefined && r.navigationBudget <= 0) return 'moving';
      if (r.navigationBudget !== undefined) r.navigationBudget--;
      path = routeToRange(nav, e, target, reach);
    }
    path.nav = nav; path.target = {x: target.x, y: target.y}; path.reach = reach; path.tick = r.tick;
    paths.set(e, path);
  }
  // Do not discard the final approach a fraction of a pixel before entering
  // attack/repair range. The combat check uses the actual distance, not a snap.
  while (path.nodes.length && distance(e, path.nodes[0]) < .01) path.nodes.shift();
  if (!path.nodes.length) {
    paths.delete(e);
    return distance(e, target) <= reach + tolerance ? 'arrived' : 'blocked';
  }
  const goal = path.nodes[0], d = distance(e, goal);
  const speed = entityStats(e).speed || 0;
  const amount = Math.min(d, speed * dt * (e.slowUntil > r.time ? .6 : 1));
  if (!amount) return 'blocked';
  const next = {x: e.x + (goal.x - e.x) / d * amount, y: e.y + (goal.y - e.y) / d * amount};
  if (!nav.blocked(next.x, next.y) && segmentClear(e, next, nav.blocked)) {e.x = next.x; e.y = next.y;}
  else {paths.delete(e); return 'blocked';}
  if (distance(e, target) <= reach + tolerance) {paths.delete(e); return 'arrived';}
  return 'moving';
}

function hasEgress(nav, point, origin, radius = 150) {
  if (nav.blocked(point.x, point.y)) return false;
  const starts = startsFor(nav, point);
  if (!starts.length) return false;
  const seen = new Uint8Array(COUNT), queue = starts.map(s => s.key);
  for (const key of queue) seen[key] = 1;
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    if (distance(nodePoint(key), origin) >= radius) return true;
    for (const next of neighbours(nav, key)) if (!seen[next]) {seen[next] = 1; queue.push(next);}
  }
  return false;
}

function radialPoints(origin, radii, angle = Math.PI / 3) {
  const points = [];
  for (const radius of radii) for (let i = 0; i < 24; i++) {
    const offset = i === 0 ? 0 : Math.ceil(i / 2) * Math.PI / 12 * (i % 2 ? 1 : -1);
    points.push({x: origin.x + Math.cos(angle + offset) * radius, y: origin.y + Math.sin(angle + offset) * radius});
  }
  return points;
}

/** Search only the producer's perimeter. An enclosed producer keeps its queue. */
export function findProductionExit(r, building) {
  const nav = navigation(r), withoutProducer = makeNavigation(r, null, new Set([building.id]));
  const angle = valid(building.rally) ? Math.atan2(building.rally.y - building.y, building.rally.x - building.x) : Math.PI / 3;
  for (const p of radialPoints(building, [52, 68, 84, 100], angle)) {
    if (!nav.blocked(p.x, p.y) && segmentClear(building, p, withoutProducer.blocked) && hasEgress(nav, p, building)) return p;
  }
  return null;
}

/** Initial/mobile spawns use a nearby free point, never the opposite riverbank. */
export function findSafeSpawn(r, point) {
  if (!valid(point)) return null;
  const nav = navigation(r);
  if (!nav.blocked(point.x, point.y) && hasEgress(nav, point, point, 90)) return {x: point.x, y: point.y};
  const covering = new Set(nav.buildings.filter(b => distance(b, point) < BUILDING_RADIUS).map(b => b.id));
  const before = covering.size ? makeNavigation(r, null, covering) : nav;
  for (const p of radialPoints(point, [24, 40, 56, 72, 88, 104])) {
    if (!nav.blocked(p.x, p.y) && segmentClear(point, p, before.blocked) && hasEgress(nav, p, point, 90)) return p;
  }
  return null;
}

/** Preflight before resource payment: all moves follow existing free space. */
export function planBuildingPlacement(r, point) {
  if (!valid(point)) return null;
  const before = navigation(r), after = makeNavigation(r, {id: 'proposed', type: 'tower', hp: 1, ...point}), moves = [];
  // A building needs a usable perimeter even when no worker is standing on it.
  if (!radialPoints(point, [52, 68]).some(p => !after.blocked(p.x, p.y) && segmentClear(point, p, before.blocked) && hasEgress(after, p, point))) return null;
  for (const entity of r.entities) {
    if (entity.hp <= 0 || STATS[entity.type]?.building || distance(entity, point) > 95) continue;
    if (!after.blocked(entity.x, entity.y) && hasEgress(after, entity, point)) continue;
    const angle = Math.atan2(entity.y - point.y, entity.x - point.x);
    const candidates = radialPoints(point, [52, 68, 84, 100], angle).sort((a, b) => distance(entity, a) - distance(entity, b));
    const free = candidates.find(p => distance(entity, p) <= 120 && !after.blocked(p.x, p.y) && segmentClear(entity, p, before.blocked) && hasEgress(after, p, point));
    if (!free) return null;
    moves.push({entity, x: free.x, y: free.y});
  }
  return {moves};
}
