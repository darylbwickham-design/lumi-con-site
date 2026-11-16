/** A measured campus packing proposal. Coordinates and corridor widths are metres.
 * Ports are service handoffs, never invented physical machine sockets. Horizontal
 * corridor headers and perpendicular crossings require separate rack elevations.
 */
const NS = 'http://www.w3.org/2000/svg';
const GRID = 8;
const EPS = 1e-7;
const n = (value, fallback = 0) => value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
const snap = value => Math.ceil((value - EPS) / GRID) * GRID;
const fmt = value => Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const intersects = (a, b) => a.x < b.x + b.widthM - EPS && a.x + a.widthM > b.x + EPS && a.y < b.y + b.depthM - EPS && a.y + a.depthM > b.y + EPS;
let serial = 0;

/** Pure geometry, also useful for non-DOM validation and saved layouts. */
export function computeCampus(entries = [], routes = [], options = {}) {
  const excluded = [], pads = [], ids = new Set();
  for (const entry of entries) {
    const { row = {}, floor = {} } = entry || {};
    let reason = null;
    if (!row.id || ids.has(row.id)) reason = 'Missing or duplicate facility ID.';
    else if (!(n(floor?.widthM) > 0 && n(floor?.depthM) > 0) || floor.status === 'unmeasured') reason = 'No measured floor dimensions.';
    else if (floor.areaIncludesAllComponents === false && options.includePartialAssemblies !== true) reason = 'Companion components have no verified combined layout.';
    else if (row.extraction?.nodeRequired && options.includeNodeBound !== true) reason = 'Node-bound equipment belongs at its actual resource site.';
    if (reason) { excluded.push({ rowId: row.id, row, floor, reason }); continue; }
    ids.add(row.id);
    pads.push({ id: row.id, row, floor, widthM: snap(floor.widthM), depthM: snap(floor.depthM), incident: [] });
  }
  const byId = new Map(pads.map(p => [p.id, p]));
  const beltCapacity = Math.max(EPS, n(options.beltCapacity, 60));
  const pipeCapacity = Math.max(EPS, n(options.pipeCapacity, 150));
  const trackSpacingM = Math.max(2, n(options.trackSpacingM, 2));
  const corridorRoutes = [], omittedRoutes = [];
  const busyRate = (pad, route, input) => {
    if (!pad) return route.rate;
    const streams = input ? pad.row.inputs || [] : pad.row.outputs || [];
    const stream = streams.find(p => p.itemId === route.itemId);
    if (!stream) return route.rate;
    const busy = n(stream.perMachineRate) * n(pad.row.machineCount);
    if (input) return Math.max(n(route.rate), busy);
    // Other consumers retain their portion of a shared product output.
    const fraction = n(stream.rate) > 0 ? Math.min(1, n(route.rate) / n(stream.rate)) : 1;
    return Math.max(n(route.rate), busy * fraction);
  };
  routes.forEach((route, originalIndex) => {
    const from = byId.get(route.from), to = byId.get(route.to);
    if (!(n(route.rate) > 0) || (!from && !to) || from === to) { omittedRoutes.push({ ...route, originalIndex, reason: 'No distinct measured campus endpoints.' }); return; }
    const capacity = route.unit === 'm3' ? pipeCapacity : beltCapacity;
    const designRate = n(route.designRate) || Math.max(n(route.rate), busyRate(from, route, false), busyRate(to, route, true));
    const parallelLanes = Math.max(1, Math.ceil((designRate - EPS) / capacity));
    const value = { ...route, originalIndex, id: `C${String(corridorRoutes.length + 1).padStart(2, '0')}`,
      fromPadId: from?.id || null, toPadId: to?.id || null, capacity, designRate,
      parallelLanes, trackWidthM: parallelLanes * trackSpacingM,
      transport: route.unit === 'm3' ? 'pipe' : 'belt', boundary: !from || !to };
    corridorRoutes.push(value);
    if (from) from.incident.push(value);
    if (to) to.incident.push(value);
  });
  let trackOffset = 4;
  for (const route of corridorRoutes) { route.trackOffset = trackOffset; route.trackCentre = trackOffset + route.trackWidthM / 2; trackOffset += route.trackWidthM; }
  const routingBandM = corridorRoutes.length ? snap(trackOffset + 4) : 8;
  const gapM = snap(Math.max(8, n(options.padGapM, 8)));
  const apronM = 8;
  for (const pad of pads) {
    const connectorWidth = pad.incident.reduce((total, r) => total + r.trackWidthM, 0) + 8;
    pad.bayWidthM = snap(Math.max(pad.widthM, connectorWidth));
    pad.bayDepthM = apronM + pad.depthM;
  }
  const area = pads.reduce((total, p) => total + (p.bayWidthM + gapM) * (p.bayDepthM + gapM), 0);
  const widest = Math.max(0, ...pads.map(p => p.bayWidthM));
  const requestedWidth = n(options.targetWidthM, Math.sqrt(Math.max(1, area) * n(options.aspectRatio, 1.5)));
  const shelfLimitM = snap(Math.max(widest, requestedWidth));
  const shelves = [];
  let shelf = { index: 0, pads: [], widthM: 0, depthM: 0 };
  for (const pad of pads) {
    const requiredWidth = (shelf.pads.length ? gapM : 0) + pad.bayWidthM;
    if (shelf.pads.length && shelf.widthM + requiredWidth > shelfLimitM + EPS) {
      shelves.push(shelf); shelf = { index: shelves.length, pads: [], widthM: 0, depthM: 0 };
    }
    pad.bayX = 8 + shelf.widthM + (shelf.pads.length ? gapM : 0);
    shelf.widthM = pad.bayX - 8 + pad.bayWidthM;
    shelf.depthM = Math.max(shelf.depthM, pad.bayDepthM);
    pad.shelfIndex = shelf.index; shelf.pads.push(pad);
  }
  if (shelf.pads.length) shelves.push(shelf);
  const facilityWidthM = Math.max(0, ...shelves.map(s => s.widthM));
  const spineX = 8 + facilityWidthM + gapM;
  let y = 8;
  for (const s of shelves) {
    s.routingY = y; s.padY = y + routingBandM; s.depthM = snap(s.depthM);
    for (const pad of s.pads) {
      pad.x = pad.bayX + Math.floor((pad.bayWidthM - pad.widthM) / (2 * GRID)) * GRID;
      pad.y = s.padY + apronM;
      let connectionX = pad.bayX + 4;
      pad.handoffs = {};
      for (const route of pad.incident) {
        const x = connectionX + route.trackWidthM / 2;
        pad.handoffs[route.id] = { x, y: pad.y - 4, dockX: clamp(x, pad.x + 2, pad.x + pad.widthM - 2), dockY: pad.y };
        connectionX += route.trackWidthM;
      }
    }
    y += routingBandM + s.depthM + gapM;
  }
  const widthM = pads.length ? snap(spineX + routingBandM + 8) : 0;
  const depthM = pads.length ? snap(y) : 0;
  for (const route of corridorRoutes) {
    const from = byId.get(route.fromPadId), to = byId.get(route.toPadId);
    const a = from?.handoffs[route.id], b = to?.handoffs[route.id];
    const ay = from ? shelves[from.shelfIndex].routingY + route.trackCentre : null;
    const by = to ? shelves[to.shelfIndex].routingY + route.trackCentre : null;
    const x = spineX + route.trackCentre;
    if (from && to && from.shelfIndex === to.shelfIndex) route.points = [a, { x: a.x, y: ay }, { x: b.x, y: by }, b];
    else if (from && to) route.points = [a, { x: a.x, y: ay }, { x, y: ay }, { x, y: by }, { x: b.x, y: by }, b];
    else if (from) route.points = [a, { x: a.x, y: ay }, { x, y: ay }];
    else route.points = [{ x, y: by }, { x: b.x, y: by }, b];
    route.points = route.points.map(p => ({ x: p.x, y: p.y })).filter((p, i, all) => !i || Math.abs(p.x - all[i - 1].x) > EPS || Math.abs(p.y - all[i - 1].y) > EPS);
    route.lengthM = route.points.slice(1).reduce((length, p, i) => length + Math.abs(p.x - route.points[i].x) + Math.abs(p.y - route.points[i].y), 0);
    route.rackElevationNote = 'Plan crossings are not junctions: perpendicular runs need separate rack elevations and lifts/risers. Heights, head lift and exact sockets require an in-game check.';
  }
  const overlaps = [];
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) if (intersects(pads[i], pads[j])) overlaps.push([pads[i].id, pads[j].id]);
  const warnings = [
    'This is a measured packing proposal on flat terrain, not a surveyed placement at the Dune Desert nodes.',
    'Each coloured corridor has reserved physical track width. Crossing lines are not junctions; build perpendicular runs at separate rack elevations.',
    'Pad-edge handoffs are schematic. Verify physical sockets, lifts, pipe head lift and access before placing the connecting runs.',
    'Corridors allow the greater of routed demand and busy full-clock source/consumer flow. Average duty still controls long-term production.',
  ];
  if (excluded.length) warnings.push(`${excluded.length} facilities are excluded from this area claim; their reasons are returned in excluded.`);
  if (pads.some(p => p.floor.areaIncludesAllComponents === false)) warnings.push('Partial assemblies were explicitly included. Their companion footprints are not included in the displayed campus dimensions.');
  if (pads.some(p => p.row.kind === 'source' && p.row.extraction?.nodeRequired)) warnings.push('Node-bound extraction was explicitly included as a clearance reference only; move it to its actual surveyed node.');
  return { version: 1, unit: 'metres', foundationM: GRID, widthM, depthM,
    widthFoundations: widthM / GRID, depthFoundations: depthM / GRID, foundationCount: widthM * depthM / 64,
    pads, shelves, routes: corridorRoutes, excluded, omittedRoutes, overlaps, spineX, routingBandM, warnings,
    serviceApronM: apronM, trackSpacingM, beltCapacity, pipeCapacity, status: pads.length ? overlaps.length ? 'invalid' : 'measured-proposal' : 'empty' };
}

function el(tag, attributes = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) if (value != null) node.setAttribute(key, String(value));
  if (text != null) node.textContent = String(text);
  return node;
}
const append = (parent, tag, attributes, text) => { const node = el(tag, attributes, text); parent.appendChild(node); return node; };
const colour = route => route.kind === 'overflow' ? '#fb7185' : route.transport === 'pipe' ? '#66c8ff' : '#edc46a';
function wrap(text, maxChars) {
  const lines = [''];
  for (const word of String(text).split(/\s+/)) {
    const i = lines.length - 1;
    if (lines[i] && lines[i].length + word.length + 1 > maxChars) lines.push(word);
    else lines[i] += (lines[i] ? ' ' : '') + word;
  }
  return lines;
}

/** Return an SVG DOM node plus measured dimensions and inspectable pure layout. */
export function renderCampus(entries, routes, options = {}) {
  const layout = computeCampus(entries, routes, options);
  const key = `campus-${++serial}`;
  const paddingM = 20;
  const width = Math.max(120, layout.widthM + paddingM * 2);
  const subtitle = layout.pads.length
    ? `${layout.widthFoundations} × ${layout.depthFoundations} foundations · ${fmt(layout.widthM)} × ${fmt(layout.depthM)} m · ${layout.pads.length} measured bays · click a bay to inspect`
    : 'No complete measured facilities are available for this campus. See the unmeasured and off-site list.';
  const subtitleLines = wrap(subtitle, Math.floor((width - paddingM * 2) / 1.8));
  const footerLines = [
    ['#e0bd68', 'Gold = solid belts. Blue = pipes. Rose = byproduct disposal. Dashed = unverified pad handoff.'],
    ['#aec0ce', '8 m grid. Perpendicular crossings need separate rack heights; they are not junctions. Exact ports and pipe hydraulics require an in-game check.'],
    ['#aec0ce', `${layout.excluded.length} unmeasured, incomplete or node-bound facilities excluded. This area is a packing proposal for flat terrain.`],
  ].flatMap(([fill, text]) => wrap(text, Math.floor((width - paddingM * 2) / 1.55)).map(line => ({ fill, text: line })));
  const headingM = Math.max(30, 22 + subtitleLines.length * 4);
  const footerM = 16 + footerLines.length * 5;
  const depth = Math.max(80, layout.depthM + headingM + footerM);
  const svg = el('svg', { xmlns: NS, viewBox: `0 0 ${width} ${depth}`, width: Math.round(width * 6), height: Math.round(depth * 6),
    role: 'img', 'aria-labelledby': `${key}-title ${key}-description`, 'data-layout': 'physical-campus',
    style: 'display:block;width:100%;height:auto;max-width:none;background:#09131e;font-family:Inter,Arial,sans-serif' });
  append(svg, 'title', { id: `${key}-title` }, `Factory campus: ${layout.widthFoundations} by ${layout.depthFoundations} foundations`);
  append(svg, 'desc', { id: `${key}-description` }, `${layout.pads.length} measured bays with separate physical belt and pipe corridors. ${layout.warnings.join(' ')}`);
  append(svg, 'rect', { width, height: depth, fill: '#09131e' });
  append(svg, 'text', { x: paddingM, y: 10, fill: '#f1f6fa', 'font-size': Math.min(5, (width - paddingM * 2) / 25), 'font-weight': 700 }, 'FACTORY CAMPUS · MEASURED FOUNDATION GRID');
  subtitleLines.forEach((text, i) => append(svg, 'text', { x: paddingM, y: 18 + i * 4, fill: '#b5c6d6', 'font-size': 3.3 }, text));
  const defs = append(svg, 'defs');
  const pattern = append(defs, 'pattern', { id: `${key}-grid`, width: GRID, height: GRID, patternUnits: 'userSpaceOnUse' });
  append(pattern, 'path', { d: 'M 8 0 L 0 0 0 8', fill: 'none', stroke: '#355064', 'stroke-width': .13, opacity: .65 });
  const arrow = append(defs, 'marker', { id: `${key}-arrow`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
  append(arrow, 'path', { d: 'M0,0 L8,4 L0,8 Z', fill: '#edf5fc' });
  const g = append(svg, 'g', { transform: `translate(${paddingM},${headingM})` });
  if (layout.pads.length) {
    append(g, 'rect', { x: 0, y: 0, width: layout.widthM, height: layout.depthM, fill: '#101e2a', stroke: '#527087', 'stroke-width': .5 });
    append(g, 'rect', { x: 0, y: 0, width: layout.widthM, height: layout.depthM, fill: `url(#${key}-grid)` });
    append(g, 'rect', { x: layout.spineX, y: 8, width: layout.routingBandM, height: Math.max(0, layout.depthM - 16), fill: '#142d39', opacity: .8 });
    for (const shelf of layout.shelves) append(g, 'rect', { x: 8, y: shelf.routingY, width: layout.spineX - 8 + layout.routingBandM, height: layout.routingBandM, fill: '#142d39', opacity: .8 });
    for (const pad of layout.pads) {
      const bay = append(g, 'g', { role: options.onSelect ? 'button' : 'group', tabindex: options.onSelect ? 0 : null,
        'aria-label': `${pad.row.itemName || pad.row.machineName}, ${pad.floor.count ?? pad.row.machineCount} ${pad.row.machineName || 'machines'}, ${fmt(pad.widthM)} by ${fmt(pad.depthM)} metres`,
        'data-row-id': pad.id, style: options.onSelect ? 'cursor:pointer;outline:none' : null });
      const label = pad.row.itemName || pad.row.recipeName || pad.row.machineName || 'Facility';
      append(bay, 'title', {}, `${label}: ${pad.floor.count ?? pad.row.machineCount} × ${pad.row.machineName || 'machine'}; ${pad.widthM / 8} × ${pad.depthM / 8} foundations. Clearance envelopes and service lanes, not mesh silhouettes.`);
      append(bay, 'rect', { x: pad.bayX, y: pad.y - 8, width: pad.bayWidthM, height: 8, fill: '#283c4a', opacity: .75 });
      const outline = append(bay, 'rect', { x: pad.x, y: pad.y, width: pad.widthM, height: pad.depthM, rx: .6, fill: '#162d40', stroke: '#70a8ca', 'stroke-width': .5 });
      append(bay, 'rect', { x: pad.x, y: pad.y, width: pad.widthM, height: pad.depthM, fill: `url(#${key}-grid)` });
      // Internal lane locations come directly from computeFloor in metres.
      for (const lane of pad.floor.lanes || []) append(bay, 'line', { x1: pad.x + lane.from.x, y1: pad.y + lane.from.y, x2: pad.x + lane.to.x, y2: pad.y + lane.to.y,
        stroke: lane.kind === 'waste' ? '#b95569' : lane.transport === 'pipe' ? '#4d97bd' : '#a48b4f', 'stroke-width': .28, opacity: .8 });
      for (const machine of pad.floor.machines || []) {
        const rect = append(bay, 'rect', { x: pad.x + machine.x, y: pad.y + machine.y, width: machine.widthM, height: machine.depthM, fill: '#254c62', stroke: '#9fc9df', 'stroke-width': .25 });
        append(rect, 'title', {}, `${pad.row.machineName || 'Machine'} ${machine.number || machine.index + 1}: ${fmt(machine.widthM)} × ${fmt(machine.depthM)} m envelope`);
        for (const box of machine.clearanceBoxes || []) {
          if (!box.polygon?.length) continue;
          append(bay, 'polygon', { points: box.polygon.map(p => `${pad.x + p.x},${pad.y + p.y}`).join(' '),
            fill: box.type === 'soft' ? 'none' : '#467085', 'fill-opacity': .22, stroke: box.type === 'soft' ? '#d9b96b' : '#a9cfde', 'stroke-width': .16, 'stroke-dasharray': box.type === 'soft' ? '1 .5' : null });
        }
      }
      append(bay, 'text', { x: pad.x + 2, y: pad.y + 3.1, fill: '#f1f7fc', 'font-size': Math.min(3, pad.widthM / Math.max(12, label.length) * 1.4), 'font-weight': 700 }, label);
      append(bay, 'text', { x: pad.x + 2, y: pad.y + pad.depthM - 1.8, fill: '#b8d0df', 'font-size': 2.1 }, `${pad.widthM / 8} × ${pad.depthM / 8} foundations`);
      for (const [routeId, point] of Object.entries(pad.handoffs)) {
        append(bay, 'path', { d: `M ${point.x} ${point.y} H ${point.dockX} V ${point.dockY}`, fill: 'none', stroke: '#9eb3c2', 'stroke-width': .22, 'stroke-dasharray': '.8 .6' });
        append(bay, 'circle', { cx: point.x, cy: point.y, r: .65, fill: '#cfdeea' });
        append(bay, 'text', { x: point.x + .7, y: point.y + 1.9, fill: '#c5d4e0', 'font-size': 1.8 }, routeId);
      }
      if (typeof options.onSelect === 'function') {
        const activate = () => options.onSelect(pad.row, pad.floor, pad);
        bay.addEventListener('click', activate);
        bay.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
        bay.addEventListener('focus', () => outline.setAttribute('stroke', '#ffffff'));
        bay.addEventListener('blur', () => outline.setAttribute('stroke', '#70a8ca'));
      }
    }
    for (const route of layout.routes) {
      const path = route.points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
      const routeGroup = append(g, 'g', { 'data-route-id': route.id });
      append(routeGroup, 'title', {}, `${route.id} · ${route.name || route.itemId}: ${fmt(route.rate)} ${route.unit}/min planned; ${fmt(route.designRate)} design flow; ${route.parallelLanes} parallel ${route.transport} lane(s) at ${fmt(route.capacity)}/min. Approximate horizontal run ${fmt(route.lengthM)} m. ${route.rackElevationNote}`);
      append(routeGroup, 'path', { d: path, fill: 'none', stroke: colour(route), 'stroke-width': Math.max(.5, route.trackWidthM - .5), opacity: .12, 'stroke-linejoin': 'round' });
      append(routeGroup, 'path', { d: path, fill: 'none', stroke: colour(route), 'stroke-width': .35, 'stroke-linejoin': 'round', 'marker-end': `url(#${key}-arrow)` });
      const labelPoint = route.boundary ? route.fromPadId ? route.points.at(-1) : route.points[0] : route.points[1];
      append(routeGroup, 'text', { x: labelPoint.x + 1, y: labelPoint.y - .7, fill: colour(route), 'font-size': 2.1, 'paint-order': 'stroke', stroke: '#10212d', 'stroke-width': .6 }, `${route.id}${route.parallelLanes > 1 ? ` ×${route.parallelLanes}` : ''}${route.boundary ? ' ↔ off campus' : ''}`);
    }
    append(g, 'line', { x1: 0, y1: -4, x2: layout.widthM, y2: -4, stroke: '#9cb1c1', 'stroke-width': .2 });
    append(g, 'text', { x: layout.widthM / 2, y: -6, fill: '#c9d9e6', 'font-size': 3, 'text-anchor': 'middle' }, `${fmt(layout.widthM)} m / ${layout.widthFoundations} foundations`);
  }
  const fy = headingM + layout.depthM + 8;
  footerLines.forEach((line, i) => append(svg, 'text', { x: paddingM, y: fy + i * 5, fill: line.fill, 'font-size': 2.8 }, line.text));
  svg.dataset.widthFoundations = String(layout.widthFoundations);
  svg.dataset.depthFoundations = String(layout.depthFoundations);
  return { svg, widthFoundations: layout.widthFoundations, depthFoundations: layout.depthFoundations, layout, excluded: layout.excluded, warnings: layout.warnings };
}

/** Standalone serialisation for a download link; no event handlers are required. */
export function campusSVG(result) {
  const svg = result?.svg || result;
  if (!svg || typeof XMLSerializer === 'undefined') throw new Error('Pass a rendered campus SVG in a browser.');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

export default renderCampus;
