/**
 * Measured, transport-aware SF+ factory bays. No browser globals are read until
 * renderFloor is called. All computeFloor coordinates are metres, never pixels.
 * Machine outlines are catalogue clearance volumes, not invented mesh outlines.
 * Connection anchors are explicitly schematic unless the caller supplies ports.
 */
export const FOUNDATION_METRES = 8;
export const BELT_CAPACITIES = Object.freeze([0, 60, 120, 270, 480, 780, 1200]);
export const PIPE_CAPACITIES = Object.freeze([0, 150, 300, 450]);

const NS = 'http://www.w3.org/2000/svg';
const EPS = 1e-8;
let renderSerial = 0;
const num = (v, fallback = 0) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && /^-?[\d.]+\/-?[\d.]+$/.test(v)) {
    const [a, b] = v.split('/').map(Number);
    return b && Number.isFinite(a / b) ? a / b : fallback;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const positive = (v, fallback) => { const n = num(v, NaN); return n > 0 ? n : fallback; };
const round = v => Math.round(v * 1e6) / 1e6;
const snap = v => Math.ceil((v - EPS) / FOUNDATION_METRES) * FOUNDATION_METRES;
const pretty = n => num(n).toLocaleString('en-GB', {maximumFractionDigits: 2});
const point = p => Array.isArray(p) ? {x: num(p[0]), y: num(p[1])} : {x: num(p?.x ?? p?.X), y: num(p?.y ?? p?.Y)};
const rectPoly = (x, y, w, d) => [{x, y}, {x: x + w, y}, {x: x + w, y: y + d}, {x, y: y + d}];
const boundsOf = points => {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys)};
};
const extent = b => ({...b, widthM: b.maxX - b.minX, depthM: b.maxY - b.minY});
const uniqueWarnings = rows => [...new Set(rows.filter(Boolean))];

function polygonOf(box) {
  const points = box.polygon ?? box.projectedPolygon ?? box.corners2D ?? box.points ?? box.corners;
  if (Array.isArray(points) && points.length >= 3) return points.map(point);
  const b = box.bounds ?? box;
  const min = b.min ?? b.Min, max = b.max ?? b.Max;
  if (min && max) {
    const a = point(min), z = point(max);
    return rectPoly(a.x, a.y, z.x - a.x, z.y - a.y);
  }
  const x = num(b.minX ?? b.x ?? b.xM), y = num(b.minY ?? b.y ?? b.yM);
  const w = positive(b.widthM ?? b.width ?? (num(b.maxX, NaN) - x), 0);
  const d = positive(b.depthM ?? b.depth ?? (num(b.maxY, NaN) - y), 0);
  return w && d ? rectPoly(x, y, w, d) : null;
}

/** Exported for data-quality checks. Dimensions are accepted only when supplied. */
export function normalizeFootprint(machine = {}, options = {}) {
  const f = options.footprint ?? machine.footprint;
  if (!f || !positive(f.widthM, 0) || !positive(f.depthM, 0)) return null;
  const supplied = f.clearanceBoxes ?? machine.clearanceBoxes ?? f.boxes ?? [];
  let boxes = supplied.map((box, index) => ({
    id: box.id ?? `clearance-${index + 1}`,
    type: /soft/i.test(String(box.type ?? box.Type ?? box.clearanceType)) ? 'soft' : 'hard',
    polygon: polygonOf(box),
    minZ: num(box.minZ ?? box.z ?? box.bounds?.minZ ?? box.bounds?.min?.z),
    maxZ: num(box.maxZ ?? box.bounds?.maxZ ?? box.bounds?.max?.z,
      Number.isFinite(num(box.height,NaN)) ? num(box.z)+num(box.height) : num(f.heightM)),
    source: box.source ?? f.source ?? machine.source ?? null
  })).filter(b => b.polygon?.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  if (!boxes.length) boxes = [{id: 'clearance-envelope', type: 'hard',
    polygon: rectPoly(0, 0, num(f.widthM), num(f.depthM)), minZ: 0, maxZ: num(f.heightM),
    source: f.source ?? machine.source ?? null}];
  const included = options.includeSoftClearance === false ? boxes.filter(b => b.type !== 'soft') : boxes;
  const packing = included.length ? included : boxes;
  const b = boundsOf(packing.flatMap(x => x.polygon));
  // A clockwise quarter-turn is enough to expose a useful row/depth trade-off.
  const rotated = options.rotation === 90 || options.rotate === true;
  const transformed = boxes.map(box => ({...box, polygon: box.polygon.map(p => {
    const x = p.x - b.minX, y = p.y - b.minY;
    return rotated ? {x: b.maxY - b.minY - y, y: x} : {x, y};
  })}));
  return {
    widthM: rotated ? b.maxY - b.minY : b.maxX - b.minX,
    depthM: rotated ? b.maxX - b.minX : b.maxY - b.minY,
    heightM: positive(f.heightM, null),
    catalogWidthM: num(f.widthM), catalogDepthM: num(f.depthM),
    rotation: rotated ? 90 : 0, boxes: transformed, originalBounds: b,
    source: f.source ?? f.sourceUrl ?? machine.source ?? null,
    provenance: f.provenance ?? f.basis ?? 'Catalogue clearance volumes; not the visible machine mesh',
    usesEnvelopeOnly: !supplied.length
  };
}

function normalizeStreams(step, count) {
  const streams = [];
  const equivalent = positive(step.machineEquivalent, count || 1);
  for (const [direction, ports] of [['input', step.inputs ?? []], ['output', step.outputs ?? []]]) {
    ports.forEach((s, index) => {
      const unit = s.unit === 'm3' || /liquid|gas|fluid/i.test(String(s.form)) ? 'm3' : 'item';
      const perMachineExplicit = Number.isFinite(num(s.perMachineRate, NaN));
      const perMachineRate = Math.max(0, num(s.perMachineRate, num(s.rate) / equivalent));
      const waste = direction === 'output' && ['overflow', 'waste', 'byproduct', 'discard'].includes(s.role);
      streams.push({id: `${direction}-${s.itemId ?? index}-${index}`, itemId: s.itemId ?? null,
        name: s.name ?? s.itemName ?? 'Unnamed material', direction,
        kind: direction === 'input' ? 'feed' : waste ? 'waste' : 'product',
        role: s.role ?? (direction === 'input' ? 'input' : 'product'), unit,
        transport: unit === 'm3' ? 'pipe' : 'belt',
        rate: Math.max(0, num(s.rate)), perMachineRate, perMachineExplicit,
        sourceId: s.sourceId ?? null, destination: s.destination ?? s.target ?? null,
        portIndex: s.portIndex ?? null});
    });
  }
  return streams;
}

/**
 * Pure layout. Solver row fields: machineCount, machine, inputs/outputs with
 * name/unit/rate/perMachineRate. options.across is a requested machine count,
 * constrained by independent belt and pipe manifolds at the configured clock.
 * Port perMachineRate already includes the selected clock/output boost; do not
 * multiply it again. Legacy fullClockRate fields mean busy configured rates.
 *
 * The returned machine rectangles, polygons, ports, lanes, connections and
 * junctions all use the same local metre coordinate system. Consumers can place
 * this bay inside a larger physical factory without parsing the SVG.
 */
export function computeFloor(step = {}, options = {}) {
  const machine = step.machine ?? {};
  const clockPercent=positive(step.clockPercent,100);
  const count = Math.max(0, Math.ceil(num(options.machineCount ?? step.machineCount ?? step.machines, 1)));
  const beltTier = Math.min(6, Math.max(1, Math.round(num(options.beltTier, 1))));
  const pipeTier = Math.min(3, Math.max(1, Math.round(num(options.pipeTier, 1))));
  const beltCapacity = positive(options.beltCapacity, BELT_CAPACITIES[beltTier]);
  const pipeCapacity = positive(options.pipeCapacity, PIPE_CAPACITIES[pipeTier]);
  const footprint = normalizeFootprint(machine, options);
  const streams = normalizeStreams(step, count);
  const warnings = [];
  const requiredComponents=(step.components??[]).map(c=>({
    role:c.role??'Required component', machineId:c.machineId??c.machine?.id,
    machineName:c.machineName??c.machine?.name??'Companion machine',
    count:Math.ceil(num(c.machineCount,count*num(c.perAssembly,1))),
    footprint:normalizeFootprint(c.machine??{},options),machine:c.machine??null
  }));
  const partialAssembly=requiredComponents.length>1;
  if(partialAssembly)warnings.push(`Required assembly: ${requiredComponents.map(c=>`${c.count} × ${c.machineName}`).join(' + ')}. This bay measures only ${step.machineName??machine.name??'the primary component'}; companion placement and total assembly area are not verified. Use separate component bays and check attachment positions in game.`);
  if (streams.some(s => !s.perMachineExplicit)) warnings.push('Some busy port rates were inferred from equivalent machines; verify the recipe and configured clock before copying this bay.');
  const constraints = streams.filter(s => s.perMachineRate > EPS).map(s => ({
    streamId: s.id, name: s.name, transport: s.transport, direction: s.direction,
    capacity: s.transport === 'pipe' ? pipeCapacity : beltCapacity,
    perMachineRate: s.perMachineRate,
    machinesPerLane: Math.floor(((s.transport === 'pipe' ? pipeCapacity : beltCapacity) + EPS) / s.perMachineRate)
  }));
  if (options.sharedSolidOutput === true) {
    const q = streams.filter(s => s.direction === 'output' && s.transport === 'belt').reduce((a, s) => a + s.perMachineRate, 0);
    if (q > EPS) constraints.push({streamId:'combined-solid-output', name:'Combined shared solid output', transport:'belt', direction:'output',
      capacity:beltCapacity, perMachineRate:q, machinesPerLane:Math.floor((beltCapacity + EPS) / q)});
  }
  const overloaded = constraints.filter(c => c.machinesPerLane < 1);
  for (const c of overloaded) warnings.push(`${c.name}: one machine at ${pretty(clockPercent)}% clock needs ${pretty(c.perMachineRate)} ${c.transport === 'pipe' ? 'm3' : 'items'}/min, above the selected ${pretty(c.capacity)} capacity. Upgrade its actual port connection or lower the configured clock; extra parallel trunks cannot fix a single overloaded port.`);
  const throughputLimit = constraints.length ? Math.max(1, Math.min(...constraints.map(c => c.machinesPerLane))) : Math.max(1, count);
  const aisleM = Math.max(0, num(options.aisleM, 2));
  const laneSpacingM = Math.max(2, num(options.laneSpacingM, 2));
  const edgeM = Math.max(2, num(options.edgeM, 2));
  const portGapM = Math.max(2, num(options.portGapM, 2));
  const input = streams.filter(s => s.direction === 'input');
  const output = streams.filter(s => s.direction === 'output').sort((a,b) => (a.kind === 'waste') - (b.kind === 'waste'));
  // Pack verified clearance envelopes, including soft clearance by default.
  // Foundation snapping belongs at the outside of the pad, not between machines.
  const pitchX = footprint ? footprint.widthM + aisleM : 0;
  const feedBandM = input.length ? portGapM + (input.length - 1) * laneSpacingM : 0;
  const outputBandM = output.length ? portGapM + (output.length - 1) * laneSpacingM : 0;
  const rowBodyDepthM = feedBandM + (footprint?.depthM ?? 0) + outputBandM;
  const rowGapM = Math.max(aisleM, streams.length ? laneSpacingM : 0);
  const pitchY = rowBodyDepthM + rowGapM;
  const maxAcross = Math.max(1, Math.round(num(options.maxAcross, 12)));
  const dimensions = columns => ({
    widthM:snap(edgeM * 2 + columns * pitchX - aisleM),
    depthM:snap(edgeM * 2 + Math.ceil(count / columns) * rowBodyDepthM + Math.max(0,Math.ceil(count / columns)-1) * rowGapM)
  });
  let automaticAcross=1, bestArea=Infinity, bestShape=Infinity;
  if(footprint && count)for(let columns=1;columns<=Math.min(count,throughputLimit,maxAcross);columns++){
    const size=dimensions(columns),area=size.widthM*size.depthM;
    const shape=Math.abs(Math.log(size.widthM/size.depthM/1.6));
    if(area<bestArea-EPS || Math.abs(area-bestArea)<EPS && shape<bestShape){automaticAcross=columns;bestArea=area;bestShape=shape;}
  }
  const wish = Math.max(1, Math.round(num(options.across, automaticAcross)));
  const across = Math.max(1, Math.min(Math.max(1, count), wish, throughputLimit, maxAcross));
  if (options.across && across < wish && throughputLimit < wish) warnings.push(`Requested ${wish} across; limited to ${across} per row by the selected transport tier. Each row has independent headers.`);
  const rowCount = count ? Math.ceil(count / across) : 0;
  const extractor = step.kind === 'source' || /miner|extractor|pressurizer|water turbine/i.test(step.machineName ?? machine.name ?? '');
  const extractorNote = options.extractorNote ?? step.extractorNote ?? (extractor ? 'Extraction equipment follows real resource nodes, wells, water depth or terrain. The row arrangement is a procurement/clearance guide, not surveyed node placement.' : null);
  const base = {version:1, id:step.id ?? 'factory-bay', title:options.title ?? step.recipeName ?? step.itemName ?? 'Factory bay',
    machineName:step.machineName ?? machine.name ?? 'Machine', machineId:step.machineId ?? machine.id ?? null,
    count, requestedAcross:wish, across, rowCount, throughputLimit,
    beltTier, pipeTier, beltCapacity, pipeCapacity, streams, constraints, overloaded,
    clockPercent,fullClockPercent:clockPercent, dutyPercent:num(step.dutyPercent, num(step.dutyCycle, 1) * 100),
    outputMultiplier:positive(step.outputMultiplier,1),boostCount:Math.max(0,num(step.boostCount)),
    requiredRate:num(step.outputRate), power:step.power ?? null, extractorNote,
    footprint, unit:'metres', foundationM:FOUNDATION_METRES,
    portsVerified:false, requiredComponents,partialAssembly,areaIncludesAllComponents:!partialAssembly,
    warnings, source:footprint?.source ?? null};
  if (!footprint || !count) {
    if (!footprint) warnings.push('No verified clearance dimensions are supplied for this machine. Foundation count and floor area are intentionally not invented.');
    if (!count) warnings.push('No machines are required for this step.');
    return {...base, status:!count?'empty':'unmeasured', widthM:null, depthM:null, areaM2:null,
      foundationColumns:null, foundationRows:null, foundationCount:null,
      rows:[], machines:[], lanes:[], connections:[], junctions:[], ports:[], dimensionLines:[],
      warnings:uniqueWarnings(warnings)};
  }
  const {widthM,depthM} = dimensions(across);
  const rows = [], machines = [], lanes = [], junctions = [], ports = [], connections = [];
  let index = 0;
  for (let ri = 0; ri < rowCount; ri++) {
    const n = Math.min(across, count-index);
    const top = edgeM + ri*pitchY;
    const bodyY = top+feedBandM;
    const row = {id:`row-${ri+1}`, index:ri, count:n, x:edgeM, y:top,
      widthM:n*pitchX-aisleM, depthM:rowBodyDepthM, bodyY,
      machineIds:[], laneIds:[], fullClockMW:n*num(step.power?.perMachineMaxMW ?? machine.maxPowerMW ?? machine.powerMW),
      requiredAverageFraction:num(step.dutyCycle, 1)};
    const firstCentre = edgeM + footprint.widthM/2;
    const lastCentre = edgeM+(n-1)*pitchX+footprint.widthM/2;
    for (const [direction, ss] of [['input',input],['output',output]]) ss.forEach((s, li) => {
      const y = direction==='input' ? bodyY-portGapM-li*laneSpacingM : bodyY+footprint.depthM+portGapM+li*laneSpacingM;
      const capacity = s.transport==='pipe'?pipeCapacity:beltCapacity;
      const fullClockRate = n*s.perMachineRate;
      const lane = {id:`${row.id}-${s.id}`, rowId:row.id, streamId:s.id, itemId:s.itemId, name:s.name,
        kind:s.kind, direction, transport:s.transport, unit:s.unit,
        from:{x:edgeM-2,y}, to:{x:widthM-edgeM+2,y},
        fullClockRate, scheduledAverageRate:s.rate*n/count, capacity,
        utilization:fullClockRate/capacity, overCapacity:fullClockRate>capacity+EPS,
        sourceId:s.sourceId, destination:s.destination,
        splitCount:direction==='input'?n:0, mergeCount:direction==='output'?n:0,
        note:s.transport==='pipe'?'Independent fluid manifold; head lift and pipe direction need site verification.':'Independent belt lane; do not merge this with another row above capacity.'};
      lanes.push(lane); row.laneIds.push(lane.id);
    });
    for (let ci=0;ci<n;ci++) {
      index++;
      const x=edgeM+ci*pitchX, y=bodyY;
      const m={id:`machine-${index}`, index:index-1, number:index, rowIndex:ri, columnIndex:ci,
        x,y,widthM:footprint.widthM,depthM:footprint.depthM,rotation:footprint.rotation,
        buildOrigin:{x:x+(footprint.rotation===90?footprint.originalBounds.maxY:-footprint.originalBounds.minX),
          y:y+(footprint.rotation===90?-footprint.originalBounds.minX:-footprint.originalBounds.minY)},
        machineId:base.machineId,name:base.machineName,recipeName:base.title,
        clockPercent:base.clockPercent,dutyPercent:base.dutyPercent,
        clearanceBoxes:footprint.boxes.map(b=>({...b,polygon:b.polygon.map(p=>({x:p.x+x,y:p.y+y}))})),
        ports:[]};
      for (const [direction,ss] of [['input',input],['output',output]]) ss.forEach((s,li)=>{
        // Actual machine port transforms are absent from the source catalogue.
        // These reserved service anchors are deliberately marked unverified.
        const anchorX=x+footprint.widthM*(li+1)/(ss.length+1);
        const anchorY=direction==='input'?y:y+footprint.depthM;
        const lane=lanes.find(l=>l.id===`${row.id}-${s.id}`);
        const port={id:`${m.id}-${s.id}`,machineId:m.id,streamId:s.id,itemId:s.itemId,name:s.name,
          x:anchorX,y:anchorY,direction,kind:s.kind,transport:s.transport,
          perMachineRate:s.perMachineRate,capacity:lane.capacity,unit:s.unit,positionVerified:false,
          placement:'Reserved service anchor on clearance edge; verify the actual machine port in game'};
        const junction={id:`junction-${port.id}`,x:anchorX,y:lane.from.y,
          type:s.transport==='pipe'?'pipe-junction':direction==='input'?'splitter':'merger',
          laneId:lane.id,machineId:m.id,streamId:s.id,
          inputRate:direction==='input'?s.perMachineRate*(n-ci):s.perMachineRate,
          outputRate:direction==='input'?s.perMachineRate:s.perMachineRate*(ci+1),
          // Fittings are diagram symbols, not sourced buildable footprints.
          symbolOnly:true};
        const connection={id:`connection-${port.id}`,machineId:m.id,portId:port.id,laneId:lane.id,
          streamId:s.id,itemId:s.itemId,kind:s.kind,transport:s.transport,
          rate:s.perMachineRate,capacity:lane.capacity,unit:s.unit,
          points:direction==='input'?[{x:anchorX,y:lane.from.y},{x:anchorX,y:anchorY}]:[{x:anchorX,y:anchorY},{x:anchorX,y:lane.from.y}],
          portPositionVerified:false};
        m.ports.push(port);ports.push(port);junctions.push(junction);connections.push(connection);
      });
      machines.push(m);row.machineIds.push(m.id);
    }
    rows.push(row);
  }
  warnings.push('Clearance geometry is measured; connection anchors and fitting symbols are schematic. Verify actual port locations/output separation, and use lifts where routes cross.');
  if (streams.some(s=>s.transport==='pipe')) warnings.push('Fluid row capacities do not verify head lift, pumps, priming or terrain. Keep feed and waste networks separate.');
  return {...base,status:overloaded.length?'transport-blocked':partialAssembly?'partial-assembly':'ready',widthM,depthM,areaM2:widthM*depthM,
    foundationColumns:widthM/8,foundationRows:depthM/8,foundationCount:widthM*depthM/64,
    aisleM,laneSpacingM,edgeM,portGapM,rowGapM,rowBodyDepthM,pitchX,pitchY,rows,machines,lanes,connections,junctions,ports,
    dimensionLines:[{axis:'x',from:{x:0,y:-3},to:{x:widthM,y:-3},valueM:widthM},
      {axis:'y',from:{x:widthM+3,y:0},to:{x:widthM+3,y:depthM},valueM:depthM}],
    warnings:uniqueWarnings(warnings)};
}

/** Separate measured bays; does not invent relative assembly attachment geometry. */
export function computeAssemblyFloors(step={}, options={}) {
  if(!(step.components?.length>1))return [computeFloor(step,options)];
  return step.components.map((c,i)=>computeFloor({...step,
    id:`${step.id??'assembly'}-component-${i+1}`,components:[],
    recipeName:`${step.recipeName??'Assembly'} / ${c.role??c.machineName}`,
    machine:c.machine,machineId:c.machineId,machineName:c.machineName,
    machineCount:c.machineCount??num(step.machineCount,1)*num(c.perAssembly,1),
    inputs:[],outputs:[],
    extractorNote:'Required assembly component. This measured bay does not establish the attachment geometry between components; verify the in-game assembly connections.'
  },{...options,title:undefined}));
}

const PALETTES = {
  dark:{bg:'#0c141b',panel:'#14222d',grid:'#22333f',major:'#344b5b',text:'#e3edf2',muted:'#a4b6c2',machine:'#1b303f',stroke:'#66869b',feed:'#efa65a',product:'#52d4c5',waste:'#ef8970',fluid:'#78bce3',soft:'#9ba1c8'},
  light:{bg:'#ffffff',panel:'#edf3f6',grid:'#dfe7ec',major:'#b9c9d3',text:'#102b3a',muted:'#486170',machine:'#e4eef4',stroke:'#507386',feed:'#a75a0b',product:'#087c71',waste:'#b74127',fluid:'#216b9e',soft:'#78629a'}
};
const laneColor = (lane,p) => lane.kind==='waste'?p.waste:lane.kind==='feed'?p.feed:p.product;
const labelRate = (rate,unit) => `${pretty(rate)} ${unit==='m3'?'m³':'items'}/min`;

function textWrap(value, limit=32) {
  const words=String(value).split(/\s+/),lines=[];let line='';
  for(const word of words){if(line && `${line} ${word}`.length>limit){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;}
  if(line)lines.push(line);return lines;
}

/**
 * Grid-first browser rendering. All floor geometry is still in computeFloor's
 * metre coordinate system; only the presentation scale and annotations change.
 *
 * compact:true / chrome:false removes the repeated title and detailed notes.
 * exportAnnotations:true includes source, warnings and operating assumptions.
 * The lane key remains in compact mode, so a cropped/exported SVG is legible.
 * blueprintOnly:true removes the lane key and footer as well, for an app with
 * an external key. The same key is exposed as svg.laneKey. Explicit export
 * annotations take precedence, preserving a self-contained standalone export.
 */
export function renderFloor(step={}, options={}) {
  const document=options.document ?? globalThis.document;
  if(!document?.createElementNS)throw new Error('renderFloor requires a DOM document; use computeFloor for server-side layout.');
  const layout=options.layout ?? computeFloor(step,options);
  const p=PALETTES[options.theme==='light'?'light':'dark'];
  const blueprintOnly=options.blueprintOnly===true && options.exportAnnotations!==true;
  const chrome=!blueprintOnly && options.chrome!==false && options.compact!==true;
  const annotations=!blueprintOnly && (options.exportAnnotations ?? chrome);
  const requestedPpm=Math.max(3,Math.min(24,num(options.pixelsPerMetre,8)));
  // Small bays should occupy the canvas, rather than sit inside fixed gutters.
  const ppm=layout.widthM?Math.max(requestedPpm,Math.min(24,400/layout.widthM)):requestedPpm;
  const floorW=layout.widthM?layout.widthM*ppm:560;
  const floorH=layout.depthM?layout.depthM*ppm:190;
  const lanePitchPx=(layout.laneSpacingM??2)*ppm;
  const maximumLaneFont=blueprintOnly?Math.min(22.4,Math.max(12,lanePitchPx*.55)):10.5;
  const codeColumns=Math.max(1,Math.ceil((maximumLaneFont+10)/lanePitchPx));
  const codeCharacters=1+String(Math.max(1,layout.streams.length)).length;
  const codeColumnWidth=Math.ceil(codeCharacters*maximumLaneFont*.62+14)+8;
  const left=Math.max(blueprintOnly?54:42,10+codeColumns*codeColumnWidth);
  const width=Math.max(360,floorW+left+56);
  const titleLines=textWrap(layout.title,Math.max(24,Math.floor((width-32)/11))).slice(0,3);
  const headerH=chrome?64+titleLines.length*23:0;
  const alertText=layout.overloaded.length?'PORT CAPACITY EXCEEDED':layout.partialAssembly?'PRIMARY COMPONENT ONLY':null;
  const alertH=alertText?28:0;
  const top=headerH+alertH+(blueprintOnly?56:44);
  const estimatedFit=Math.min(positive(options.viewportWidth,920)/width,positive(options.viewportHeight,620)/(top+floorH+16));
  const labelScale=blueprintOnly?Math.min(1.4,Math.max(1,.85/estimatedFit)):1;
  const laneFont=blueprintOnly?Math.min(16*labelScale,Math.max(12,(layout.laneSpacingM??4)*ppm*.55)):10.5;
  const counts={feed:0,product:0,waste:0};
  const codeOf=new Map(layout.streams.map(s=>[s.id,`${s.kind==='feed'?'F':s.kind==='waste'?'W':'P'}${++counts[s.kind]}`]));
  const laneOrder=new Map([...layout.lanes].sort((a,b)=>a.from.y-b.from.y).map((lane,index)=>[lane.id,index]));
  const keyRows=layout.streams.map(s=>{
    const lanes=layout.lanes.filter(l=>l.streamId===s.id);
    const rates=lanes.map(l=>l.fullClockRate);
    const low=rates.length?Math.min(...rates):s.perMachineRate;
    const high=rates.length?Math.max(...rates):s.perMachineRate;
    const cap=s.transport==='pipe'?layout.pipeCapacity:layout.beltCapacity;
    const names=textWrap(s.name,Math.max(16,Math.floor((width-174)/7)));
    return {...s,code:codeOf.get(s.id),names,low,high,cap,height:29+Math.max(0,names.length-1)*14};
  });
  const keyTop=top+floorH+22;
  const keyHeight=keyRows.length?24+keyRows.reduce((a,r)=>a+r.height,0):0;
  const noteWidth=Math.max(40,Math.floor((width-32)/6.1));
  const notes=annotations?[
    layout.footprint?`8 m foundation grid. ${pretty(layout.aisleM??2)} m requested service gap. Solid outlines are hard clearance; dotted outlines are soft clearance.`:'Measured floor geometry is unavailable. The key shows busy demand per machine at its configured clock, not a verified row.',
    ...layout.warnings,
    ...(layout.extractorNote?[layout.extractorNote]:[])
  ].flatMap(s=>textWrap(s,noteWidth)):[];
  const symbolY=keyTop+keyHeight+12;
  const noteY=symbolY+30;
  const height=blueprintOnly?top+floorH+16:noteY+(annotations?notes.length*15+(layout.source?25:0):0)+14;
  const svg=document.createElementNS(NS,'svg');
  const id=`sf-floor-${String(layout.id).replace(/[^a-zA-Z0-9_-]/g,'-')}-${options.instanceId??++renderSerial}`;
  const el=(name,attrs={},parent=svg,text)=>{
    const node=document.createElementNS(NS,name);
    for(const[k,v]of Object.entries(attrs))if(v!==undefined&&v!==null)node.setAttribute(k,String(v));
    if(text!==undefined)node.textContent=String(text);
    parent.appendChild(node);return node;
  };
  svg.setAttribute('xmlns',NS);
  svg.setAttribute('viewBox',`0 0 ${round(width)} ${round(height)}`);
  svg.setAttribute('width',round(width));svg.setAttribute('height',round(height));
  svg.setAttribute('role','img');svg.setAttribute('aria-labelledby',`${id}-title ${id}-desc`);
  svg.setAttribute('class','sf-floor-diagram');svg.setAttribute('data-layout-status',layout.status);
  svg.setAttribute('data-presentation',blueprintOnly?'blueprint':chrome?'annotated':'compact');
  svg.setAttribute('fill',p.text);
  svg.setAttribute('style',`display:block;max-width:100%;height:auto;background:${p.bg}`);
  el('title',{id:`${id}-title`},svg,`${layout.title}: ${layout.count} ${layout.machineName}, ${layout.across} across by ${layout.rowCount} rows`);
  el('desc',{id:`${id}-desc`},svg,layout.footprint?
    `True-scale clearance plan on an 8 metre foundation grid. ${pretty(layout.widthM)} by ${pretty(layout.depthM)} metres. F means feed, P means product, W means waste. ${blueprintOnly?'The accompanying material-lane table names every lane and its flow.':`Lane labels show busy row demand at ${pretty(layout.clockPercent??100)}% configured clock over capacity; the key also shows planned average bay flow.`} Solid belts and dashed pipes have directional arrows. Port positions are schematic. ${layout.warnings.join(' ')}`:
    'Verified footprint unavailable; no floor area or foundation count has been fabricated.');
  el('metadata',{},svg,JSON.stringify({schema:'foundry-floor-presentation-v2',unit:'metres',foundationM:8,
    source:layout.source,portsVerified:false,clockPercent:layout.clockPercent??100,dutyPercent:layout.dutyPercent,
    outputMultiplier:layout.outputMultiplier??1,boostCount:layout.boostCount??0,
    widthM:layout.widthM,depthM:layout.depthM,warnings:layout.warnings,extractorNote:layout.extractorNote}));
  const defs=el('defs');
  el('style',{},defs,`
    #${id}-drawing text{font-family:Inter,Segoe UI,Arial,sans-serif}
    #${id}-drawing .sf-lane{fill:none;stroke-linecap:round;stroke-linejoin:round}
    #${id}-drawing .sf-dim{fill:none;stroke:${blueprintOnly?p.text:p.muted};stroke-width:${blueprintOnly?1.2:.8};opacity:${blueprintOnly?.9:.8}}
    #${id}-drawing .sf-machine:hover .sf-hard{stroke:${p.product};stroke-width:2}
    #${id}-drawing .sf-machine:focus{outline:none}
    #${id}-drawing .sf-machine:focus .sf-hard{stroke:${p.product};stroke-width:2.5}
    @media print{.sf-floor-diagram{break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  `);
  for(const [name,color]of Object.entries({feed:p.feed,product:p.product,waste:p.waste,dim:p.muted})){
    const arrow=blueprintOnly?10:8;
    const marker=el('marker',{id:`${id}-${name}`,markerWidth:name==='dim'?5:arrow,markerHeight:name==='dim'?5:arrow,
      refX:name==='dim'?4:arrow-1,refY:name==='dim'?2.5:arrow/2,orient:'auto-start-reverse',markerUnits:'userSpaceOnUse'},defs);
    el('path',{d:name==='dim'?'M 0 0 L 5 2.5 L 0 5 z':`M 0 0 L ${arrow} ${arrow/2} L 0 ${arrow} z`,fill:color},marker);
  }
  const pattern=el('pattern',{id:`${id}-grid`,width:8*ppm,height:8*ppm,patternUnits:'userSpaceOnUse',x:left,y:top},defs);
  el('rect',{width:8*ppm,height:8*ppm,fill:p.bg},pattern);
  el('path',{d:`M ${8*ppm} 0 L 0 0 0 ${8*ppm}`,fill:'none',stroke:p.grid,'stroke-width':1},pattern);
  el('path',{d:`M ${4*ppm} 0 V ${8*ppm} M 0 ${4*ppm} H ${8*ppm}`,fill:'none',stroke:p.grid,'stroke-width':.5,opacity:.35},pattern);
  const draw=el('g',{id:`${id}-drawing`});
  el('rect',{width,height,fill:p.bg},draw);
  if(chrome){
    el('text',{x:16,y:20,'font-size':10,'font-weight':700,'letter-spacing':1.6,fill:p.product},draw,'GRIDLINE  /  FACTORY BAY');
    titleLines.forEach((s,i)=>el('text',{x:16,y:47+i*23,'font-size':20,'font-weight':700},draw,s));
    const sy=52+titleLines.length*23;
    el('text',{x:16,y:sy,'font-size':11,fill:p.muted},draw,`${layout.count} × ${layout.machineName} · ${layout.across} across × ${layout.rowCount} rows`);
    el('text',{x:16,y:sy+17,'font-size':11,fill:p.muted},draw,`${pretty(layout.clockPercent??100)}% clock${layout.dutyPercent<99.99?` · ${pretty(layout.dutyPercent)}% planned duty`:''}${layout.outputMultiplier>1?` · ×${pretty(layout.outputMultiplier)} output`:''} · belt ${pretty(layout.beltCapacity)} / pipe ${pretty(layout.pipeCapacity)}`);
  }
  if(alertText){
    el('rect',{x:16,y:headerH+5,width:width-32,height:23,rx:4,fill:p.waste,'fill-opacity':.12,stroke:p.waste,'stroke-width':.7},draw);
    el('text',{x:26,y:headerH+21,'font-size':11,'font-weight':700,fill:p.waste},draw,alertText);
  }
  const xy=q=>({x:left+q.x*ppm,y:top+q.y*ppm});
  const points=pts=>pts.map(q=>{const z=xy(q);return `${round(z.x)},${round(z.y)}`;}).join(' ');
  const labelBox=(x,y,text,color,align='start')=>{
    const w=text.length*(blueprintOnly?laneFont*.62:6.1)+(blueprintOnly?14:12),h=blueprintOnly?laneFont+8:17;
    const px=align==='end'?x-w:x;
    el('rect',{x:px,y:y-(blueprintOnly?laneFont+1:12),width:w,height:h,rx:3,fill:blueprintOnly?color:p.bg,'fill-opacity':blueprintOnly?.12:.96,stroke:blueprintOnly?color:null,'stroke-width':blueprintOnly?.8:null},draw);
    el('text',{x:align==='end'?x-(blueprintOnly?7:6):x+(blueprintOnly?7:6),y,'text-anchor':align,'font-size':laneFont,'font-weight':blueprintOnly?750:600,fill:color},draw,text);
  };
  if(layout.widthM){
    el('rect',{x:left,y:top,width:floorW,height:floorH,fill:`url(#${id}-grid)`,stroke:p.major,'stroke-width':1.2,'data-foundation-grid':'8m'},draw);
    // Dimension witnesses and arrows hug the measured pad, rather than the page.
    const dimY=top-17,dimX=left+floorW+15;
    for(const x of [left,left+floorW])el('line',{x1:x,y1:top-3,x2:x,y2:dimY-5,class:'sf-dim'},draw);
    el('line',{x1:left,y1:dimY,x2:left+floorW,y2:dimY,class:'sf-dim','marker-start':`url(#${id}-dim)`,'marker-end':`url(#${id}-dim)`},draw);
    el('text',{x:left+floorW/2,y:dimY-7,'text-anchor':'middle','font-size':blueprintOnly?14*labelScale:11,'font-weight':blueprintOnly?650:400,fill:blueprintOnly?p.text:p.muted},draw,`${pretty(layout.widthM)} m · ${layout.foundationColumns} foundations`);
    for(const y of [top,top+floorH])el('line',{x1:left+floorW+3,y1:y,x2:dimX+5,y2:y,class:'sf-dim'},draw);
    el('line',{x1:dimX,y1:top,x2:dimX,y2:top+floorH,class:'sf-dim','marker-start':`url(#${id}-dim)`,'marker-end':`url(#${id}-dim)`},draw);
    const verticalLabelX=dimX+(blueprintOnly?22:13);
    el('text',{x:verticalLabelX,y:top+floorH/2,'text-anchor':'middle','font-size':blueprintOnly?14*labelScale:11,'font-weight':blueprintOnly?650:400,fill:blueprintOnly?p.text:p.muted,transform:`rotate(90 ${verticalLabelX} ${top+floorH/2})`},draw,`${pretty(layout.depthM)} m · ${layout.foundationRows} foundations`);
    for(const row of layout.rows){
      const firstMachine=layout.machines.find(machine=>machine.rowIndex===row.index);
      const q=xy({x:0,y:firstMachine?firstMachine.y+firstMachine.depthM/2:row.y+row.depthM/2});
      // Row labels live in the service gutter, never in measured machine/lane space.
      el('text',{x:left-10,y:q.y-3,'text-anchor':'end','font-size':blueprintOnly?13*labelScale:11,'font-weight':700,fill:p.text},draw,`R${String(row.index+1).padStart(2,'0')}`);
      el('text',{x:left-10,y:q.y+13,'text-anchor':'end','font-size':blueprintOnly?11:10,fill:p.muted},draw,`${row.count} ×`);
    }
    for(const lane of layout.lanes){
      const color=laneColor(lane,p),a=xy(lane.from),b=xy(lane.to);
      // A low-contrast track gives every transport line a clear route through the grid.
      el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:p.bg,'stroke-width':7,class:'sf-lane'},draw);
      const trunk=el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':blueprintOnly?3.6:lane.transport==='pipe'?3:2.7,
        'stroke-dasharray':lane.transport==='pipe'?'8 5':null,class:'sf-lane','marker-end':`url(#${id}-${lane.kind})`,'data-lane-id':lane.id},draw);
      const code=codeOf.get(lane.streamId);
      const laneIndex=laneOrder.get(lane.id)??0;
      const badgeRight=left-10-(laneIndex%codeColumns)*codeColumnWidth;
      el('line',{x1:badgeRight+3,y1:a.y,x2:a.x-3,y2:a.y,stroke:color,'stroke-width':.8,opacity:.55},draw);
      labelBox(badgeRight,a.y+laneFont*.34,code,lane.overCapacity?p.waste:color,'end');
      el('title',{},trunk,`${code} · ${lane.name}\n${labelRate(lane.fullClockRate,lane.unit)} busy row at ${pretty(layout.clockPercent??100)}% configured clock / ${pretty(lane.capacity)} capacity\n${labelRate(lane.scheduledAverageRate,lane.unit)} planned row average\n${lane.note}`);
      const xs=[a.x,...layout.junctions.filter(j=>j.laneId===lane.id).map(j=>xy(j).x),b.x].sort((x,y)=>x-y);
      for(let i=1;i<xs.length;i++)if(xs[i]-xs[i-1]>55){
        const x=(xs[i]+xs[i-1])/2;
        const arrow=blueprintOnly?4.5:3;
        el('path',{d:`M ${x-arrow} ${a.y-arrow} L ${x+arrow*.7} ${a.y} L ${x-arrow} ${a.y+arrow}`,fill:'none',stroke:color,'stroke-width':blueprintOnly?2:1.4},draw);
      }
    }
    for(const con of layout.connections){
      const stream=layout.streams.find(s=>s.id===con.streamId),color=laneColor(stream,p);
      const path=el('polyline',{points:points(con.points),stroke:color,'stroke-width':blueprintOnly?2.8:con.transport==='pipe'?2.4:2,
        'stroke-dasharray':con.transport==='pipe'?'6 4':null,class:'sf-lane','marker-end':`url(#${id}-${con.kind})`,'data-connection-id':con.id},draw);
      el('title',{},path,`${con.transport==='pipe'?'Pipe':'Belt'} branch · ${stream.name}\n${labelRate(con.rate,con.unit)} / ${pretty(con.capacity)} capacity.\nService anchor; actual port location unverified.`);
    }
    for(const m of layout.machines){
      const group=el('g',{class:'sf-machine','data-machine-index':m.index,'data-machine-id':m.machineId,tabindex:options.interactive?'0':null},draw);
      const b=xy(m),mw=m.widthM*ppm,mh=m.depthM*ppm;
      for(const box of m.clearanceBoxes)el('polygon',{points:points(box.polygon),fill:box.type==='soft'?'none':p.machine,
        'fill-opacity':box.type==='soft'?0:.96,stroke:box.type==='soft'?p.soft:p.stroke,
        'stroke-width':box.type==='soft'?1:blueprintOnly?2:1.5,'stroke-dasharray':box.type==='soft'?'3 4':null,class:box.type==='soft'?'sf-soft':'sf-hard'},group);
      el('title',{},group,`${m.name} #${m.number}\n${pretty(m.widthM)} × ${pretty(m.depthM)} m service envelope\n${m.recipeName}\n${pretty(m.clockPercent??100)}% configured clock; ${pretty(m.dutyPercent)}% planned duty\nClearance source: ${layout.source ?? 'supplied catalogue'}`);
      const cx=b.x+mw/2,cy=b.y+mh/2;
      const font=blueprintOnly?Math.max(11,Math.min(17*labelScale,mw/5.2)):Math.max(9,Math.min(13,mw/6));
      const numberFont=blueprintOnly?Math.min(28*labelScale,mw/2.5,mh*.32):Math.min(21,mw/3,mh/2);
      const maxNameLines=Math.max(0,Math.min(3,Math.floor((mh-(blueprintOnly?numberFont+8:35))/(font+2))));
      const names=textWrap(m.name,Math.max(6,Math.floor((mw-10)/(font*.56)))).slice(0,maxNameLines);
      const labelH=(blueprintOnly?numberFont+(names.length?6:0):20)+names.length*(font+2);
      const labelTop=cy-labelH/2;
      el('text',{x:cx,y:labelTop+(blueprintOnly?numberFont*.83:16),'text-anchor':'middle','font-size':numberFont,'font-weight':700,fill:p.product},group,String(m.number).padStart(2,'0'));
      names.forEach((n,i)=>el('text',{x:cx,y:labelTop+(blueprintOnly?numberFont+5+font:34)+i*(font+2),'text-anchor':'middle','font-size':font,'font-weight':600},group,n));
      if(mh>125 && mw>58)el('text',{x:cx,y:b.y+mh-12,'text-anchor':'middle','font-size':10,fill:p.muted},group,`${pretty(m.widthM)} × ${pretty(m.depthM)} m`);
      if(typeof options.onMachineSelect==='function'){
        group.style.cursor='pointer';group.addEventListener('click',()=>options.onMachineSelect(m,layout));
        group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();options.onMachineSelect(m,layout);}});
      }
    }
    for(const port of layout.ports){
      const q=xy(port),color=laneColor(port,p);
      const node=el('circle',{cx:q.x,cy:q.y,r:3.2,fill:p.bg,stroke:color,'stroke-width':1.6,'data-port-id':port.id},draw);
      el('title',{},node,`${port.name} service anchor · ${labelRate(port.perMachineRate,port.unit)}. Actual port position unverified.`);
    }
    for(const j of layout.junctions){
      const q=xy(j),lane=layout.lanes.find(l=>l.id===j.laneId),color=laneColor(lane,p),r=4.5;
      const symbol=j.type==='pipe-junction'?
        el('circle',{cx:q.x,cy:q.y,r,fill:p.bg,stroke:color,'stroke-width':1.8,'data-junction-type':j.type},draw):
        el(j.type==='splitter'?'rect':'polygon',j.type==='splitter'?
          {x:q.x-r,y:q.y-r,width:r*2,height:r*2,rx:.7,fill:p.bg,stroke:color,'stroke-width':1.8,'data-junction-type':j.type}:
          {points:`${q.x},${q.y-r-1} ${q.x+r+1},${q.y} ${q.x},${q.y+r+1} ${q.x-r-1},${q.y}`,fill:p.bg,stroke:color,'stroke-width':1.8,'data-junction-type':j.type},draw);
      if(j.type==='pipe-junction')el('path',{d:`M ${q.x-2.5} ${q.y} H ${q.x+2.5} M ${q.x} ${q.y-2.5} V ${q.y+2.5}`,stroke:color,'stroke-width':1},draw);
      el('title',{},symbol,`${j.type.replace('-',' ')} · ${lane.name}. Symbol only; fitting footprint not measured.`);
    }
  }else{
    el('rect',{x:16,y:top,width:width-32,height:floorH,rx:6,fill:p.panel,stroke:p.major},draw);
    el('text',{x:32,y:top+32,'font-size':18,'font-weight':700},draw,layout.count?'Measured footprint unavailable':'No factory machines required');
    textWrap('No verified clearance is supplied for this step. Machine counts and material demand remain available; foundation area is not assumed.',Math.floor((width-64)/7)).forEach((s,i)=>el('text',{x:32,y:top+62+i*19,'font-size':12,fill:p.muted},draw,s));
  }
  if(!blueprintOnly && keyRows.length){
    el('line',{x1:16,y1:keyTop-7,x2:width-16,y2:keyTop-7,stroke:p.major,'stroke-width':.8},draw);
    el('text',{x:16,y:keyTop+8,'font-size':9.5,'letter-spacing':1.1,'font-weight':700,fill:p.muted},draw,'MATERIAL LANES');
    el('text',{x:width-16,y:keyTop+8,'text-anchor':'end','font-size':9.5,fill:p.muted},draw,layout.footprint?'BUSY ROW / CAPACITY':'BUSY MACHINE / CAPACITY');
    let ky=keyTop+29;
    for(const s of keyRows){
      const color=laneColor(s,p);
      el('rect',{x:16,y:ky-12,width:25,height:18,rx:3,fill:color,'fill-opacity':.13,stroke:color,'stroke-width':.6},draw);
      el('text',{x:28.5,y:ky,'text-anchor':'middle','font-size':10,'font-weight':700,fill:color},draw,s.code);
      s.names.forEach((name,i)=>el('text',{x:49,y:ky+i*14,'font-size':11,'font-weight':600,fill:color},draw,name));
      el('text',{x:width-16,y:ky,'text-anchor':'end','font-size':11,'font-weight':600,fill:s.high>s.cap+EPS?p.waste:p.text},draw,`${pretty(s.low)}${s.high>s.low+EPS?`–${pretty(s.high)}`:''} / ${pretty(s.cap)}`);
      el('text',{x:49,y:ky+14*s.names.length,'font-size':10,fill:p.muted},draw,`${s.transport==='pipe'?'Dashed pipe':'Solid belt'} · planned bay ${labelRate(s.rate,s.unit)}`);
      ky+=s.height;
    }
  }
  const legend=blueprintOnly?[]:[{x:16,text:'Splitter',kind:'splitter',color:p.feed},{x:width*.32,text:'Merger',kind:'merger',color:p.product},{x:width*.61,text:'Pipe junction',kind:'pipe',color:p.muted}];
  for(const item of legend){
    if(item.kind==='splitter')el('rect',{x:item.x,y:symbolY-5,width:8,height:8,fill:p.bg,stroke:item.color,'stroke-width':1.3},draw);
    else if(item.kind==='merger')el('polygon',{points:`${item.x+4},${symbolY-6} ${item.x+9},${symbolY-1} ${item.x+4},${symbolY+4} ${item.x-1},${symbolY-1}`,fill:p.bg,stroke:item.color,'stroke-width':1.3},draw);
    else el('circle',{cx:item.x+4,cy:symbolY-1,r:4,fill:p.bg,stroke:item.color,'stroke-width':1.3},draw);
    el('text',{x:item.x+15,y:symbolY+3,'font-size':10,fill:p.muted},draw,item.text);
  }
  if(annotations){
    notes.forEach((note,i)=>el('text',{x:16,y:noteY+i*15,'font-size':10.5,fill:p.muted},draw,note));
    if(layout.source){
      const source=typeof layout.source==='string'?layout.source:null;
      const a=source?el('a',{href:source,target:'_blank',rel:'noopener'},draw):draw;
      el('text',{x:16,y:noteY+notes.length*15+12,'font-size':10,fill:p.product},a,'Clearance source: official catalogue ↗');
      el('title',{},a,typeof layout.source==='string'?layout.source:JSON.stringify(layout.source));
    }
  }else if(!blueprintOnly){
    el('text',{x:16,y:noteY,'font-size':9.5,fill:p.muted},draw,layout.footprint?`8 m grid · ${pretty(layout.clockPercent??100)}% clock · schematic connection anchors`:'Floor dimensions unavailable · no footprint assumed');
  }
  Object.defineProperty(svg,'floorLayout',{value:layout,enumerable:false});
  Object.defineProperty(svg,'laneKey',{value:keyRows.map(({names,height,...stream})=>({...stream,overCapacity:stream.high>stream.cap+EPS})),enumerable:false});
  Object.defineProperty(svg,'presentationMetrics',{value:{blueprintOnly,width,height,pixelsPerMetre:ppm,estimatedFitScale:estimatedFit,
    minimumReadableScale:blueprintOnly?12/laneFont:12/10.5,labelScale,laneFont},enumerable:false});
  return svg;
}

export default renderFloor;
