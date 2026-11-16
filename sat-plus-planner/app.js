import {catalog} from './catalog.js?v=b08d61425826';
import {solvePlan} from './solver.js?v=b08d61425826';
import {computeFloor, renderFloor} from './diagrams.js?v=b08d61425826';
import {planTransportRuns, renderCampus} from './campus.js?v=b08d61425826';
import {renderPowerPlanner} from './power.js?v=b08d61425826';
import {starterRuns} from './starter-runs.js?v=b08d61425826';

const el = id => document.getElementById(id);
const serverOrigin = document.querySelector('meta[name="gridline-api"]')?.content;
const serverCatalogHash = document.querySelector('meta[name="gridline-catalog-sha256"]')?.content;
const serverEnabled = location.protocol === 'https:' && /^https:\/\/[\w.-]+$/.test(serverOrigin || '');
const items = new Map(catalog.items.map(item => [item.id, item]));
const gates = new Map(catalog.gates.map(gate => [gate.id, gate]));
const recipes = new Map(catalog.recipes.map(recipe => [recipe.id, recipe]));
const machines = new Map(catalog.machines.map(machine => [machine.id, machine]));
const transport = kind => catalog.transports
  .filter(t => t.kind === kind && (kind === 'belt' ? /^Conveyor Belt Mk/i : /^Pipeline Mk/i).test(t.name))
  .sort((a, b) => a.capacityPerMinute - b.capacityPerMinute);
const belts = transport('belt');
const pipes = transport('pipe');
const starterStock = [
  ['Iron Plate',30],['Iron Rod',30],['Iron Sheet',20],['Iron Wire',30],['Screws',60],
  ['Wire',60],['Cable',30],['Copper Rod',15],['Copper Sheet',15],['Copper Busbars',10],
  ['Tin Plate',20],['Reinforced Iron Plate',5],['Rotor',5],['Modular Frame',2],
  ['Concrete',60],['Glass',15],['Smooth Belt Drive',10],['Bronze Pipes',12],['Bronze Frame',2],
  ['Tinned Wire',20],['Quickwire',30],['Solar Cell',3],['AI Limiter',1],['Caterium Heatsink',2],
  ['Quartz Crystal',10],['Biomass',10],['Reanimated SAM',10],['Dirt',10],['Siterite Ore',10],
];
const guideRuns = [
  {id:'plates',name:'Iron plates',outputs:[['Iron Plate',20]],note:'Feed 30 Crushed Siterite/min from the stock bin to one Impure Iron Smelter. Feed its ingots to one Plate Constructor.'},
  {id:'rods',name:'Iron rods',outputs:[['Iron Rod',15]],note:'Switch a Constructor to rods and feed it 15 Iron Ingots/min from stock. One Impure Iron Smelter makes 30 ingots/min while active.'},
  {id:'copper',name:'Copper batch · make cable',outputs:[['Copper Rod',2],['Wire',.2],['Cable',9.9],['Copper Busbars',2.5]],note:'Crush 120 Callanite in 2 active minutes. Smelt 120 ingots in 5 active minutes, then make 180 rods in 10 active minutes. Use 120 rods for 200 wire, turn 198 wire into 99 cable, and use 40 rods for 25 busbars. Keep 20 rods and 2 wire. Planner rates express the batch totals per 10 minutes of reference time. Run each job in turn.'},
  {id:'copper-wire',name:'Copper batch · keep the wire',outputs:[['Copper Rod',2],['Wire',20],['Copper Busbars',2.5]],note:'Crush and smelt 120 Callanite. Make 180 rods, use 120 for 200 wire and 40 for 25 busbars, then keep 20 rods. Rates express the batch totals per 10 minutes of reference time. Reuse the same Constructor.'},
  {id:'tin-plates',name:'Tin plate batch',outputs:[['Tin Plate',20]],imports:[['Iron Plate',10]],note:'Load 90 Crushed Siterite for 3 active smelting minutes. Mix the resulting 45 Tin Ingots with 30 Iron Plate from stock. Take 5 Assembler cycles (90 seconds) for 60 Tin Plates, or bench-craft before Part Assembly. Planner rates use the 3-minute smelting window.'},
  {id:'tin-rods',name:'Tin rods',outputs:[['Tin Rod',7.5]],note:'One Impure Tin Smelter makes 15 ingots/min. Load 2 ingots per rod and switch a shared Constructor to Tin Rod. The Constructor runs at 100% clock when fed.'},
];
const guideRecipes = [
  ['Iron Ingot','Impure Iron Ingot'],['Copper Ingot','Impure Copper Ingot'],['Tin Ingot','Impure Tin Ingot'],
  ['Crushed Siterite','Crushed Siterite'],['Crushed Callanite','Crushed Callanite'],
  ...['Iron Plate','Iron Rod','Copper Rod','Wire','Cable','Copper Busbars','Tin Plate','Tin Rod'].map(name=>[name,name]),
];
const presets = [
  {name:'Starter Parts Factory · Tier 0–2 stock',tier:2,belt:2,pipe:1,outputs:starterStock,stock:true,runs:starterRuns},
  {name:'Wire & Cable Factory',tier:2,belt:2,pipe:1,outputs:[['Wire',30],['Cable',15]]},
  {name:'Smart Plating Factory',tier:2,belt:2,pipe:1,outputs:[['Smart Plating',2]]},
  {name:'Steel Parts Factory',tier:4,belt:3,pipe:2,outputs:[['Steel Beam',15],['Steel Pipe',20]]},
  {name:'Solid Biofuel Workshop',tier:2,belt:2,pipe:1,outputs:[['Solid Biofuel',60]]},
  {name:'Starter Parts Factory · Part 1',tier:1,belt:1,pipe:1,runs:guideRuns},
];
const money = new Intl.NumberFormat('en', {maximumFractionDigits:3});
const fmt = number => number == null || !Number.isFinite(number) ? '—' : money.format(number);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const unit = u => u === 'm3' ? 'm³' : u === 'MW' ? 'MW' : u === 'MJ' ? 'MJ' : 'items';
const rate = (n, u) => `${fmt(n)} ${unit(u)}/min`;
const displayItem = id => items.get(id)?.name || id;
const mark = (list, index) => list[index - 1];
const cap = (list, tier) => mark(list, tier)?.capacityPerMinute || 60;
const sortedItems = catalog.items.filter(item => item.form !== 'energy').sort((a,b) => a.name.localeCompare(b.name));
const producers = new Map();
const documentedProducers = new Map();
for (const recipe of catalog.recipes) {
  for (const {itemId} of recipe.outputs) {
    if (!documentedProducers.has(itemId)) documentedProducers.set(itemId,[]);
    if (!documentedProducers.get(itemId).includes(recipe)) documentedProducers.get(itemId).push(recipe);
    if (!recipe.supported || !recipe.machineIds?.length) continue;
    if (!producers.has(itemId)) producers.set(itemId, []);
    if (!producers.get(itemId).includes(recipe)) producers.get(itemId).push(recipe);
  }
}
const sourcesByItem = groupBy(catalog.resourceSources, source=>source.itemId);
const manualsByItem = groupBy((catalog.manualRecipes || []).flatMap(recipe=>recipe.outputs.map(port=>({recipe,itemId:port.itemId}))), entry=>entry.itemId);
const terminalByItem = groupBy(catalog.recipes.filter(recipe=>recipe.supported && !recipe.outputs.length).flatMap(recipe=>[...new Set(recipe.inputs.map(p=>p.itemId))].map(itemId=>({recipe,itemId}))),entry=>entry.itemId);
const targetItems = sortedItems.filter(item => producers.has(item.id) || sourcesByItem.has(item.id));
const recipeItems = sortedItems.filter(item=>documentedProducers.has(item.id) || sourcesByItem.has(item.id) || manualsByItem.has(item.id) || terminalByItem.has(item.id));
const allItemOptions = options(sortedItems, item => item.id, item => item.name);
const storageKey = 'sfplus-foundry-v1';
const libraryKey = 'sfplus-foundry-library-v1';
const favoriteKey = 'gridline-favorite-recipes-v1';
let favorites = readFavorites();
let state = restore();
let plan, floors, runs, selected, campus, view = 'floor';
const zoomLevels = [.6,.8,1,1.25,1.6,2.1,2.8,3.7,5];
const fittedZoom = zoomLevels.indexOf(1);
let zoomIndex = fittedZoom;
let verification;

function options(values, value, label) {
  return values.map(entry => `<option value="${escape(value(entry))}">${escape(label(entry))}</option>`).join('');
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(value);
  }
  return groups;
}

function activePreset() {
  return state.preset === '' ? null : presets[Number(state.preset)];
}

function activeRun() {
  return activePreset()?.runs?.find(run=>run.id===state.presetRun);
}

function base(index = 0, runId) {
  const preset = presets[index] || presets[0];
  const run = preset.runs?.find(choice=>choice.id===runId) || (preset.stock ? null : preset.runs?.[0]);
  const targets = values => values.map(([name,rate])=>({itemId:catalog.items.find(item=>item.name===name)?.id,rate})).filter(t=>t.itemId);
  const overrides = {}, sources = {}, allocations = {};
  for (const [product,name] of run ? preset.stock ? run.recipeChoices || [] : guideRecipes : []) {
    const item = catalog.items.find(entry=>entry.name===product);
    const recipe = catalog.recipes.find(entry=>entry.name===name && entry.supported && entry.outputs.some(port=>port.itemId===item?.id));
    if (recipe) overrides[item.id] = recipe.id;
  }
  if (run && !preset.stock) {
    for (const [id,purity] of [['node-133','pure'],['node-104','normal']]) {
      const node = catalog.nodes.find(entry=>entry.id===id);
      const source = catalog.resourceSources.find(entry=>entry.itemId===node?.itemId && entry.purity===purity && entry.name.includes('Standard Mining Head'));
      if (source) {sources[node.itemId]=source.id;allocations[source.id]=[id];}
    }
  }
  return {preset:String(index),presetRun:run?.id||'',tier:preset.tier,belt:preset.belt,pipe:preset.pipe,exact:false,alternates:false,research:!run||Boolean(preset.stock),expectedYields:false,preferFavorites:!run,
    name:'',purity:'normal',imports:targets(run?.imports||[]),overrides,sources,allocations,across:{},machineOverrides:{},clockOverrides:{},boostOverrides:{},
    clockUnlocked:false,boostUnlocked:false,availablePowerShards:0,checked:[],powerSettings:{},
    availableSomersloops:null,
    targets:targets(run?.outputs||preset.outputs)};
}

function restore() {
  let saved;
  try {
    saved = location.hash.startsWith('#plan=')
      ? JSON.parse(decodeURIComponent(location.hash.slice(6)))
      : JSON.parse(localStorage.getItem(storageKey));
  } catch {}
  if (!location.hash.startsWith('#plan=') && saved?.preset==='0' && !saved.name && !saved.checked?.length &&
    ['overrides','sources','allocations','across','machineOverrides','clockOverrides','boostOverrides'].every(key=>!Object.keys(saved[key]||{}).length) &&
    !saved.imports?.length && !saved.alternates && !saved.exact && !saved.expectedYields &&
    saved.targets?.length===2 && saved.targets[0].rate===20 && saved.targets[1].rate===15 &&
    displayItem(saved.targets[0].itemId)==='Iron Plate' && displayItem(saved.targets[1].itemId)==='Iron Rod') {
    return normalizePlan({...saved,targets:base().targets});
  }
  return normalizePlan(saved);
}

function normalizePlan(saved) {
  const defaults = base();
  if (!saved || typeof saved !== 'object') return defaults;
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? {...value} : {};
  const validRate = t => items.has(t?.itemId) && Number(t.rate) >= .000001 && Number(t.rate) <= 1000000;
  const targets = Array.isArray(saved.targets) ? saved.targets.filter(validRate).slice(0,30) : [];
  return {...defaults,...saved,
    name: typeof saved.name === 'string' ? saved.name.trim().slice(0,80) : '',
    tier: Math.min(9, Math.max(0, Math.trunc(Number(saved.tier ?? defaults.tier)) || 0)),
    belt: mark(belts, Number(saved.belt)) ? Number(saved.belt) : defaults.belt,
    pipe: mark(pipes, Number(saved.pipe)) ? Number(saved.pipe) : defaults.pipe,
    targets: targets.length ? targets : defaults.targets,
    imports: Array.isArray(saved.imports) ? saved.imports.filter(validRate).slice(0,30) : [],
    overrides: record(saved.overrides),sources:record(saved.sources),
    across: record(saved.across),machineOverrides:record(saved.machineOverrides),clockOverrides:record(saved.clockOverrides),boostOverrides:record(saved.boostOverrides),
    allocations: Object.fromEntries(Object.entries(record(saved.allocations)).filter(([,nodes])=>Array.isArray(nodes)).map(([source,nodes])=>[source,nodes.filter(id=>typeof id==='string')])),
    availablePowerShards:Math.max(0,Math.min(100000,Math.trunc(Number(saved.availablePowerShards)||0))),
    availableSomersloops:saved.availableSomersloops == null ? null : Math.max(0,Math.min(100000,Math.trunc(Number(saved.availableSomersloops)||0))),
    checked: Array.isArray(saved.checked) ? saved.checked.filter(id=>typeof id === 'string') : [],
    powerSettings:record(saved.powerSettings),
  };
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoriteKey));
    return saved && typeof saved==='object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

function plannerCatalog() {
  if (!state.preferFavorites || !Object.keys(favorites).length) return catalog;
  const preferredRecipes = {...catalog.preferredRecipes};
  for (const [itemId,recipeId] of Object.entries(favorites)) {
    if (!producers.get(itemId)?.some(r=>r.id===recipeId)) continue;
    const prior = preferredRecipes[itemId];
    preferredRecipes[itemId] = [recipeId,...(Array.isArray(prior)?prior:prior?[prior]:[]).filter(id=>id!==recipeId)];
  }
  return {...catalog,preferredRecipes};
}

function filteredTargets() {
  const match = el('item-filter').value.trim().toLowerCase();
  return match ? targetItems.filter(item=>item.name.toLowerCase().includes(match)) : targetItems;
}

function setTargetOptions(select, itemId) {
  const filtered = filteredTargets();
  select.innerHTML = options(filtered, item=>item.id, item=>item.name);
  if (itemId && !filtered.some(item=>item.id===itemId)) select.add(new Option(displayItem(itemId),itemId),0);
  if (itemId) select.value = itemId;
}

function addTarget({itemId = filteredTargets()[0]?.id || targetItems[0]?.id, rate: value = 10} = {}) {
  const row = el('target-template').content.firstElementChild.cloneNode(true);
  const select = row.querySelector('.target-item');
  setTargetOptions(select,itemId);
  setupTargetRecipe(row);
  row.querySelector('.target-rate').value = value;
  row.querySelector('.remove-target').addEventListener('click', () => {
    row.remove();
    keepOneTarget();
    markCustom();
  });
  el('targets').append(row);
  keepOneTarget();
  return row;
}

function setupTargetRecipe(row) {
  const id = row.querySelector('.target-item').value;
  const select = row.querySelector('.target-recipe');
  const available = (producers.get(id) || []).filter(r=>recipeCanPin(r));
  const pin = recipes.get(state.overrides[id]);
  select.innerHTML = '<option value="">Automatic</option>' + options(available,r=>r.id,r=>r.name);
  if (pin && !available.some(r=>r.id===pin.id)) select.add(new Option(`${pin.name} · Tier ${pin.tier}`,pin.id));
  select.value = pin?.id || '';
  select.disabled = !available.length && !pin;
}

function recipeCanPin(recipe) {
  return recipe.supported && recipe.machineIds.length && (recipe.tier ?? 0)<=state.tier && (recipe.deterministic!==false || state.expectedYields);
}

function sourceCanPin(source) {
  return source.supported && (source.tier ?? 0)<=state.tier;
}

function updateTargetRecipes() {
  for (const row of el('targets').children) setupTargetRecipe(row);
}

function pinRecipe(itemId, recipeId) {
  if (!recipeId) {
    delete state.overrides[itemId];
    return;
  }
  const choice = recipes.get(recipeId);
  if (!choice?.outputs.some(p=>p.itemId===itemId)) return;
  state.overrides[itemId] = recipeId;
  delete state.sources[itemId];
  if (choice.alternate) el('alternates').checked = true;
  if (choice.deterministic === false) el('expected-yields').checked = true;
  if (choice.gateIds?.some(id=>gates.get(id)?.kind==='EST_MAM')) el('research').checked = true;
}

function keepOneTarget() {
  const buttons = [...el('targets').querySelectorAll('.remove-target')];
  for (const button of buttons) button.disabled = buttons.length === 1;
}

function markCustom() {
  state.preset = '';
  state.presetRun = '';
  el('preset').value = '';
  el('preset-run-control').hidden = true;
  el('plan-pending').hidden = false;
}

function renderImports() {
  el('import-list').innerHTML = state.imports.map(t => `<div class="import-row"><label for="import-${escape(t.itemId)}">${escape(displayItem(t.itemId))}</label>
    <input id="import-${escape(t.itemId)}" aria-label="${escape(displayItem(t.itemId))} available per minute" data-import="${escape(t.itemId)}" type="number" min="0.000001" max="1000000" step="any" value="${escape(t.rate)}" required>
    <button class="remove-target" type="button" data-remove-import="${escape(t.itemId)}" aria-label="Remove ${escape(displayItem(t.itemId))} import">×</button></div>`).join('');
}

function syncForm() {
  el('preset').value = state.preset;
  const preset = activePreset();
  const runs = preset?.runs || [];
  el('preset-run-control').hidden = !runs.length;
  el('preset-run-label').textContent = preset?.stock ? 'Starter factory build' : 'Shared workshop run';
  el('preset-run-help').textContent = preset?.stock ? 'Build one section first. Use All 29 stock targets for the combined mall.' :
    'Run one job at a time using stock bins and shared machines.';
  el('preset-run').innerHTML = (preset?.stock ? '<option value="">All 29 stock targets</option>' : '') + options(runs,run=>run.id,run=>run.name);
  el('preset-run').value = state.presetRun;
  for (const field of ['belt','pipe','purity']) el(field).value = state[field];
  for (const field of ['alternates','exact','research']) el(field).checked = Boolean(state[field]);
  el('expected-yields').checked = Boolean(state.expectedYields);
  el('prefer-favorites').checked = Boolean(state.preferFavorites);
  el('clock-unlocked').checked = Boolean(state.clockUnlocked);
  el('boost-unlocked').checked = Boolean(state.boostUnlocked);
  el('shard-stock').value = state.availablePowerShards;
  el('sloop-stock').value = state.availableSomersloops ?? '';
  el('targets').replaceChildren();
  for (const target of state.targets) addTarget(target);
  renderImports();
}

function takeForm() {
  state.targets = [...el('targets').children].map(row => ({itemId:row.querySelector('.target-item').value,rate:row.querySelector('.target-rate').valueAsNumber}));
  state.imports = [...el('import-list').querySelectorAll('[data-import]')].map(input => ({itemId:input.dataset.import,rate:input.valueAsNumber}));
  state.tier = activePreset()?.tier ?? 9;
  for (const field of ['belt','pipe']) state[field] = Number(el(field).value);
  for (const field of ['alternates','exact','research']) state[field] = el(field).checked;
  state.expectedYields = el('expected-yields').checked;
  state.preferFavorites = el('prefer-favorites').checked;
  state.purity = el('purity').value;
}

function layoutOptions() {
  return {beltTier:state.belt,pipeTier:state.pipe,beltCapacity:cap(belts,state.belt),pipeCapacity:cap(pipes,state.pipe)};
}

function floorOptions(row) {
  const attributes = row.machine?.logistics;
  const explicit = attributes?.solidOutputs ?? row.machine?.solidOutputs;
  const filtrator = /^Filtrator$/i.test(row.machineName || '');
  const multiple = row.outputs?.filter(port => port.unit !== 'm3').length > 1;
  const preferredAcross = Number(state.across[row.id]);
  const across = Number.isInteger(preferredAcross) && preferredAcross > 0 ? preferredAcross : undefined;
  return {...layoutOptions(),across,sharedSolidOutput:multiple && (explicit === 1 || filtrator)};
}

function calculate({preserveChecks = false} = {}) {
  if (!el('plan-form').reportValidity()) return;
  const previous = JSON.stringify(state.targets);
  takeForm();
  updateTargetRecipes();
  if (!preserveChecks && previous !== JSON.stringify(state.targets)) state.checked = [];
  plan = solvePlan(plannerCatalog(),{...solverSettings(),targets:state.targets,imports:state.imports,exactScale:state.exact,exactScaleCap:1000});
  if (activeRun() && !activePreset()?.stock) applyGuideOutlet(plan);
  floors = buildOrder(plan).map(({row,layer}) => {
    // Keep giant plans calculable without constructing one element per machine.
    const floor = row.machineCount > 0 && row.machineCount <= 1200 ? computeFloor(row, floorOptions(row)) : null;
    return {row,floor,layer};
  });
  runs = planTransportRuns(floors,plan.routes,{
    beltTiers:belts.slice(0,state.belt).map(t=>t.capacityPerMinute),
    pipeTiers:pipes.slice(0,state.pipe).map(t=>t.capacityPerMinute),
  });
  if (!floors.some(entry => entry.row.id === selected)) {
    const measured = floors.filter(e=>e.row.kind==='production' && e.floor?.foundationCount);
    selected = (measured.find(e=>e.row.machineCount>1) || measured[0] || floors[0])?.row.id;
    zoomIndex = fittedZoom;
  }
  campus = null;
  const summaryStatus = renderSummary();
  renderSteps();
  renderSelected();
  el('print-plan').disabled = !floors.length;
  el('plan-pending').hidden = true;
  renderView();
  save();
  el('status').textContent = `${plan.machineCount} machines, ${floors.length} build steps. ${summaryStatus || `${plan.status} material plan`}.`;
}

function applyGuideOutlet(current) {
  const miner = current.rows.find(row=>row.extraction?.allocatedNodes?.some(node=>node.id==='node-133'));
  const outlets = miner?.extraction.outputs?.filter(port=>port.itemId===miner.itemId) || [];
  if (miner?.machineCount!==1 || outlets.length!==2 || outlets.some(port=>port.perMinute!==60)) return;
  const routes = current.routes.filter(route=>route.from===miner.id);
  const route = routes[0];
  if (routes.length!==1 || route.rate>60 || !current.rows.some(row=>row.id===route.to && row.recipeName==='Crushed Siterite')) return;
  route.designRate = 60;
  route.minimumParallelLanes = 1;
  miner.outputs = miner.outputs.map(port=>port.itemId===miner.itemId ? {...port,perMachineRate:60} : port);
  current.diagnostics = current.diagnostics.filter(check=>!(check.code==='single-machine-transport' && check.rowId===miner.id && check.itemId===miner.itemId));
}

function buildOrder(current) {
  const all = [...current.rows,...current.disposalRows];
  const byId = new Map(all.map(row=>[row.id,row]));
  const placed = new Map();
  const ordered = [];
  function place(row) {
    if (!row) return -1;
    if (placed.has(row.id)) return placed.get(row.id);
    placed.set(row.id,-1);
    const baseLayer = row.kind==='production'||row.kind==='disposal' ? 1 : 0;
    const layer = Math.max(baseLayer,...(row.children || []).map(id=>place(byId.get(id))+1));
    placed.set(row.id,layer);
    ordered.push({row,layer});
    return layer;
  }
  for (const row of all) place(row);
  return ordered.sort((a,b)=>a.layer-b.layer);
}

const layerName = layer => layer===0 ? 'Layer 0 · Sources & imports' : `Layer ${layer}`;

function guideWasteBuffer(out) {
  return Boolean(activeRun() && !activePreset()?.stock && out?.method==='unresolved' && items.get(out.itemId)?.name==='Crushed Gangue' &&
    ['Crushed Siterite','Crushed Callanite'].includes(plan.rows.find(row=>row.id===out.from)?.recipeName));
}

function runChanged(run) {
  const original = base(Number(state.preset),run.id);
  return ['belt','pipe','purity','targets','imports','overrides','sources','allocations','machineOverrides',
    'clockOverrides','boostOverrides','exact','expectedYields','research','alternates','preferFavorites']
    .some(key=>JSON.stringify(state[key])!==JSON.stringify(original[key]));
}

function renderPresetNotes() {
  const preset = activePreset();
  const run = activeRun();
  const notes = el('preset-notes');
  notes.hidden = !(run || preset?.stock);
  if (run && runChanged(run)) {
    el('preset-notes-title').textContent = 'Custom section settings';
    el('preset-notes-content').innerHTML = '<p>Use the updated floor plans and build checklist for the selected recipes, clocks and transport.</p>';
  } else if (run && preset?.stock) {
    el('preset-notes-title').textContent = 'Build this starter section';
    el('preset-notes-content').innerHTML = `<p>${escape(run.note)}</p>`;
  } else if (run) {
    el('preset-notes-title').textContent = 'Part 1 run instructions';
    const node = run.id.startsWith('copper') ? 'C1' : 'S1';
    el('preset-notes-content').innerHTML = `<p>${escape(run.note)}</p><p>Use one Mk.1 outlet from ${node} and a separate Gangue bin for each Crusher. An empty 4,800-item bin holds 192 active minutes at 25 Gangue/min. Stop before it fills. Use hand transfers until splitters unlock.</p><p>The machine list shows each job. Reuse the workshop’s Smelters and Constructors between jobs.</p>`;
  } else if (preset?.stock) {
    el('preset-notes-title').textContent = 'Handcrafting and later-tier materials';
    el('preset-notes-content').innerHTML = '<p>This plan makes every listed stock target at once. Pick a starter factory build above for a smaller section. Targets are stock left over after internal demand.</p><p>Handcraft Portable Miners in the Equipment Workshop from 2 Iron Plate and 4 Iron Rod each. For one Dimensional Depot collect a Mercer Sphere. Craft 12 SAM Fluctuators at the bench using 120 Reanimated SAM, 3 Bronze Frames and 9 Caterium Heatsinks. The Depot needs 10.</p><p>Some early unlocks still need later materials. Brass Pipes, Steel Bolts and Steel Beams need Tier 3. Crystal Oscillators need Tier 4. Computers, Lead Sheets, Plastic and Asphalt need later production.</p>';
  }
}

function solverSettings() {
  return {...layoutOptions(),stage:state.tier,recipeOverrides:state.overrides,
    sourceOverrides:state.sources,nodeAllocations:state.allocations,
    machineOverrides:state.machineOverrides,clockOverrides:state.clockOverrides,clockUnlocked:state.clockUnlocked,
    boostOverrides:state.boostOverrides,boostUnlocked:state.boostUnlocked,availablePowerShards:state.availablePowerShards,
    ...(state.availableSomersloops == null ? {} : {availableSomersloops:state.availableSomersloops}),
    defaultPurity:state.purity,allowAlternates:state.alternates,allowMam:state.research,allowExpectedOutputs:state.expectedYields};
}

function metric(label, value, note, action = '') {
  return `<div class="metric"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small>${action}</div>`;
}

function renderSummary() {
  const measured = floors.reduce((sum,e) => sum + (e.floor?.foundationCount || 0),0);
  const unknown = floors.some(e => e.row.machineCount && (!e.floor?.foundationCount || e.floor.partialAssembly));
  const run = activeRun();
  const title = state.name || (activePreset()?.stock && run ? run.name : activePreset()?.name || `${plan.targets[0]?.name || 'Custom'} Factory`);
  el('plan-title').textContent = title;
  el('plan-sub').textContent = plan.targets.length>6 ? `${plan.targets.length} stock targets · see rates in Factory setup.` :
    (plan.targets.map(t => `${t.name} ${rate(t.rate,t.unit)}`).join(' · ') || 'Choose a material to plan a factory.');
  el('plan-context').textContent = `Belts Mk.${state.belt} · Pipes Mk.${state.pipe}`;
  renderPresetNotes();
  const buffered = plan.overflow.filter(guideWasteBuffer);
  const unresolved = plan.overflow.filter(o=>o.method==='unresolved'&&!guideWasteBuffer(o)).length;
  el('metrics').innerHTML = [
    metric('Machines',fmt(plan.machineCount),''),
    metric('Installed draw',`${fmt(plan.power.installedPeakMW)} MW`,plan.power.complete ? '' : 'Known draw only','<button class="metric-action" type="button" data-build-power>Build power →</button>'),
    metric('Bay foundations',measured ? fmt(measured) : '—',unknown ? 'Measured bays only' : ''),
    metric('Waste streams',fmt(plan.overflow.length),unresolved ? `${unresolved} need disposal` : buffered.length ? 'Finite stock bins' : ''),
  ].join('');
  const notifications = plan.diagnostics.filter(d => !['tier-gates-only','node-allocation-required'].includes(d.code) &&
    !(d.code==='unresolved-overflow' && buffered.some(out=>out.from===d.rowId && out.itemId===d.itemId)));
  if (plan.status==='estimated') notifications.unshift({message:'One or more outputs use estimated random yields. Use buffers and plan for variable supply.'});
  if (plan.exactScale.applied) notifications.unshift({message:`Scaled all target rates by ${fmt(plan.exactScale.factor)} for continuous whole-machine ratios.`});
  for (const [transports, mk, u] of [[belts,state.belt,'items'],[pipes,state.pipe,'m³']]) {
    const current = mark(transports,mk);
    if (current?.tier > state.tier && (transports === belts || plan.routes.some(r=>r.unit==='m3'))) notifications.unshift({message:`${current.name} (${current.capacityPerMinute} ${u}/min) is a Tier ${current.tier} unlock. Check the cap before building at Tier ${state.tier}.`});
  }
  const box = el('diagnostics');
  box.hidden = !notifications.length;
  const errors = notifications.filter(d=>d.severity==='error');
  const priority = errors.length ? [errors[0]] : [];
  const remaining = notifications.filter(d=>!priority.includes(d));
  const notices = list => list.map(d=>`<p class="${escape(d.severity || '')}">${escape(d.message)}</p>`).join('');
  box.innerHTML = notices(priority) + (remaining.length ? `<details><summary>${remaining.length} ${priority.length ? 'more ' : ''}plan ${remaining.length===1?'check':'checks'}</summary>${notices(remaining)}</details>` : '');
  const status = el('plan-state');
  const statusText = run && buffered.length && !errors.length ? 'Batch plan · finite bins' : ({partial:'Partial plan',blocked:'Needs input',estimated:'Estimated yields'})[plan.status];
  status.hidden = !statusText;
  status.dataset.state = plan.status;
  status.textContent = statusText || '';
  return statusText;
}

function rowTitle(row) {
  if (row.kind === 'disposal') return `Dispose of ${row.itemName}`;
  if (row.kind === 'source') return `Gather ${row.itemName}`;
  if (row.kind === 'infrastructure') return `Pressurize ${row.itemName} well`;
  if (row.kind === 'import') return `Receive ${row.itemName}`;
  if (row.kind === 'unresolved') return `Resolve ${row.itemName}`;
  return `Make ${row.itemName}`;
}

function dimensions(floor) {
  return floor?.foundationCount ? `${fmt(floor.foundationColumns)} × ${fmt(floor.foundationRows)} foundations` : '';
}

function equipment(row) {
  if (!row.machineCount) return row.kind === 'import' ? 'External supply' : row.kind === 'unresolved' ? 'Production unresolved' : row.sourceName || 'Manual collection';
  if (row.components?.length) return row.components.map(c=>`${fmt(c.machineCount)} × ${c.machineName}`).join(' + ');
  return `${fmt(row.machineCount)} × ${row.machineName}`;
}

function renderSteps() {
  const built = floors.filter(({row})=>state.checked.includes(row.id)).length;
  el('step-count').textContent = `${built}/${floors.length} built`;
  const groups = groupBy(floors,entry=>entry.layer);
  let index = 1;
  el('steps').innerHTML = [...groups].map(([layer,entries])=>`<div class="step-layer"><p class="layer-label">${escape(layerName(layer))}</p>${entries.map(({row,floor})=>`<button class="step-button ${state.checked.includes(row.id) ? 'is-done' : ''}" type="button" data-step="${escape(row.id)}" aria-current="${row.id === selected}"><span class="step-number">${String(index++).padStart(2,'0')}</span><span><strong>${escape(rowTitle(row))}</strong><small>${escape(dimensions(floor) || equipment(row))}</small></span></button>`).join('')}</div>`).join('');
  el('step-picker').innerHTML = [...groups].map(([layer,entries])=>`<optgroup label="${escape(layerName(layer))}">${options(entries,entry=>entry.row.id,entry=>rowTitle(entry.row))}</optgroup>`).join('');
  updateStepNavigation();
  revealStep();
}

function updateStepNavigation() {
  const index = floors.findIndex(e=>e.row.id===selected);
  el('step-prev').disabled = index<1;
  el('step-next').disabled = index<0 || index===floors.length-1;
  el('step-picker').disabled = index<0;
  el('step-picker').value = selected || '';
}

function revealStep() {
  const list = el('steps');
  const active = list.querySelector('[aria-current=true]');
  if (!active || !list.clientWidth) return;
  const top = active.offsetTop;
  if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = Math.max(0,top - (list.clientHeight-active.offsetHeight)/2);
  }
}

function selectStep(id, move = false) {
  if (!floors.some(e => e.row.id === id)) return;
  if (id !== selected) zoomIndex = fittedZoom;
  selected = id;
  for (const b of el('steps').querySelectorAll('[data-step]')) b.setAttribute('aria-current', String(b.dataset.step === id));
  updateStepNavigation();
  renderSelected();
  if (move) {
    activate('floor');
    el('tab-floor').focus();
  }
  revealStep();
}

function setBuilt(id, checked) {
  state.checked = checked ? [...new Set([...state.checked,id])] : state.checked.filter(value=>value!==id);
  if (selected === id) el('step-built').checked = checked;
  save();
  renderSteps();
}

function unlocks(ids = [], depth = 2, seen = new Set()) {
  if (!ids.length || depth < 0) return '';
  return ids.filter(id => !seen.has(id)).map(id => {
    const gate = gates.get(id);
    if (!gate) return '';
    const cost = gate.cost?.map(c => `${fmt(c.amount)} ${displayItem(c.itemId)}`).join(', ');
    const visited = new Set([...seen,id]);
    const type = ({EST_MAM:'MAM',EST_Milestone:'HUB',EST_HardDrive:'Hard drive',EST_Alternate:'Hard drive',EST_ResourceSink:'AWESOME Shop',EST_Custom:'Unlock'})[gate.kind] || 'Unlock';
    const grouped = gate.dependencyGroups || [];
    const groupedIds = new Set(grouped.flatMap(group=>group.ids || []));
    const remainder = [...new Set([...(gate.dependencyIds || []),...(gate.gateIds || [])])].filter(child=>!groupedIds.has(child));
    const next = unlocks(remainder,depth-1,visited);
    const choices = grouped.map(group=>{
      const depend = unlocks(group.ids,depth-1,visited);
      return depend ? `<li>${group.all?'Required together':'Any one of'}<ul>${depend}</ul></li>` : '';
    }).join('');
    return `<li>${escape(type)} · ${escape(gate.name)}${gate.tier == null ? '' : ` (Tier ${fmt(gate.tier)})`}${cost ? `<br><small>${escape(cost)}</small>` : ''}${next || choices ? `<ul>${next}${choices}</ul>` : ''}</li>`;
  }).join('');
}

function unlockNames(ids = []) {
  return ids.map(id=>gates.get(id)?.name).filter(Boolean).join(' / ');
}

function ports(list = []) {
  return list.map(p => `<li class="material-line"><span>${escape(p.name || displayItem(p.itemId))}</span><strong>${escape(rate(p.rate,p.unit))}</strong></li>`).join('');
}

function renderFootprintFacts(floor,row) {
  const facts = el('footprint-facts');
  const caveat = el('footprint-caveat');
  facts.hidden = !floor?.foundationCount;
  caveat.hidden = facts.hidden;
  if (facts.hidden) {
    facts.replaceChildren();
    return;
  }
  const machinesAcross = Math.min(floor.count, floor.throughputLimit, 12);
  const canAdjust = machinesAcross > 1;
  const requested = state.across[row.id];
  const candidates = Array.from({length:machinesAcross},(_,index)=>index+1);
  const arrangement = `${fmt(floor.across)} across · ${fmt(floor.rowCount)} ${floor.rowCount === 1 ? 'row' : 'rows'}`;
  const warning = floor.extractorNote || (floor.partialAssembly ? 'This drawing shows the primary component. Check companion placement in game.' : '');
  facts.innerHTML = `
    <div><dt>FOUNDATION PAD</dt><dd>${fmt(floor.foundationColumns)} × ${fmt(floor.foundationRows)} <small>· ${fmt(floor.foundationCount)} total</small></dd><span>${fmt(floor.widthM)} × ${fmt(floor.depthM)} m</span></div>
    <div><dt>ARRANGEMENT</dt><dd>${escape(arrangement)}</dd><span>${fmt(floor.count)} ${floor.count === 1 ? 'machine' : 'machines'}</span></div>
    <div><dt>INSTALLED POWER</dt><dd>${row.power.installedPeakMW == null ? '—' : `${fmt(row.power.installedPeakMW)} MW`}</dd><span>${fmt(row.clockPercent ?? 100)}% clock per machine</span></div>
    <div>${canAdjust ? `<dt><label for="machines-across">ROW WIDTH</label></dt><dd><select id="machines-across"><option value="">Auto</option>${options(candidates,n=>n,n=>`${n} per row`)}</select></dd><span>Up to ${fmt(machinesAcross)} at the selected caps</span>` : `<dt>ROW WIDTH</dt><dd>1 per row</dd><span>${floor.overloaded.length ? 'Check transport capacity' : 'At the selected caps'}</span>`}</div>`;
  if (canAdjust) el('machines-across').value = candidates.includes(Number(requested)) ? String(requested) : '';
  caveat.textContent = ['Fitting positions are schematic.',warning].filter(Boolean).join(' ');
}

function renderLanes(lanes = []) {
  el('lanes-panel').hidden = !lanes.length;
  el('lane-jump').hidden = !lanes.length;
  el('lane-list').innerHTML = lanes.map(lane=>{
    const transport = lane.transport==='pipe' ? 'Pipe' : 'Belt';
    const flow = lane.low===lane.high ? fmt(lane.high) : `${fmt(lane.low)}–${fmt(lane.high)}`;
    const capacity = lane.cap ? `${flow} / ${rate(lane.cap,lane.unit)}` : rate(lane.high,lane.unit);
    return `<li class="lane-card${lane.overCapacity?' is-over':''}" data-kind="${escape(lane.kind)}"><span class="lane-code">${escape(lane.code)}</span><span class="lane-info"><strong>${escape(lane.name)}</strong><small>${escape(transport)} · ${escape(capacity)}</small><small>Planned bay ${escape(rate(lane.rate,lane.unit))}${lane.overCapacity?' · Over capacity':''}</small></span></li>`;
  }).join('');
}

function rowMaterials(row) {
  const cost = new Map();
  const components = row.components?.length ? row.components : [row];
  const add = (entries = [], count = 0) => {
    for (const part of entries) cost.set(part.itemId,(cost.get(part.itemId) || 0) + part.amount * count);
  };
  if (row.extraction?.cost) add(row.extraction.cost,row.machineCount);
  else for (const part of components) add(part.machine?.cost,part.machineCount);
  if (row.powerShards && catalog.clockPolicy?.shardItemId) cost.set(catalog.clockPolicy.shardItemId,row.powerShards);
  if (row.somersloops && catalog.productionBoostPolicy?.itemId) cost.set(catalog.productionBoostPolicy.itemId,row.somersloops);
  return [...cost].map(([id,amount])=>`<li class="material-line"><span>${escape(displayItem(id))}</span><strong>${fmt(amount)}</strong></li>`).join('');
}

function renderSelected() {
  verification?.abort();
  verification = null;
  const current = floors.find(entry => entry.row.id === selected);
  const built = el('step-built');
  const stage = el('blueprint-stage');
  built.disabled = !current;
  built.checked = Boolean(current && state.checked.includes(current.row.id));
  if (!current) {
    el('step-position').textContent = 'Foundation plan';
    el('step-title').textContent = 'Choose a production target';
    el('step-sub').textContent = '';
    stage.replaceChildren();
    el('step-detail').replaceChildren();
    el('download').disabled = true;
    el('bay-clock').hidden = true;
    renderLanes();
    renderFootprintFacts();
    resizeBlueprint();
    return;
  }
  const {row,floor} = current;
  el('step-position').textContent = `Layer ${current.layer} · Viewing step ${floors.indexOf(current)+1} of ${floors.length}`;
  el('step-title').textContent = rowTitle(row);
  el('step-sub').textContent = equipment(row);
  el('download').disabled = !floor?.foundationCount;
  renderBayClock(row);
  let svg;
  if (floor?.foundationCount) {
    const drawing = el('drawing');
    svg = renderFloor(row,{...floorOptions(row),layout:floor,blueprintOnly:true,viewportWidth:drawing.clientWidth-28,viewportHeight:drawing.clientHeight-26});
    stage.replaceChildren(svg);
  } else {
    const reason = row.machineCount > 1200 ? 'This bay exceeds the 1,200-machine drawing limit. Split this build into smaller sites.' :
      row.machineCount ? 'The official export has no measured clearance for this machine.' :
      row.kind === 'import' ? 'Supply this material from the other factory at the rate below.' :
      row.kind === 'unresolved' ? 'Choose a different recipe or supply this item from another factory.' : 'Gather this material at the required rate.';
    stage.innerHTML = `<p class="no-drawing">${escape(reason)}</p>`;
  }
  renderLanes(svg?.laneKey);
  renderFootprintFacts(floor,row);
  resizeBlueprint();
  const eligible = (producers.get(row.itemId) || []).filter(recipeCanPin);
  const overrideControl = row.kind !== 'disposal' && eligible.length ? `<div class="field"><label for="recipe-choice">Recipe</label><select id="recipe-choice"><option value="">Automatic</option>${options(eligible, r=>r.id, r=>[r.name,unlockNames(r.gateIds)].filter(Boolean).join(' · '))}</select></div>` : '';
  const sourceChoices = (sourcesByItem.get(row.itemId)||[]).filter(s=>sourceCanPin(s));
  const chosenNodes = row.extraction?.suggestedNodes || [];
  const selectedNodes = state.allocations[row.sourceId] || [];
  const sourceControl = row.kind === 'source' && sourceChoices.length > 1 ? `<div class="field"><label for="source-choice">Extraction method</label><select id="source-choice"><option value="">Automatic</option>${options(sourceChoices,s=>s.id,s=>[s.name,s.purity,rate(s.ratePerMinute,row.unit)].filter(Boolean).join(' · '))}</select></div>` : '';
  const nodeControl = chosenNodes.length ? `<details class="step-extra"><summary>Allocate ${fmt(row.machineCount)} ${escape(row.extraction.purity || '')} node(s)</summary><p>Closest matching nodes to the Dune Desert reference point. Coordinates use the game map axes in metres.</p><fieldset class="nodes"><legend class="sr-only">Resource nodes</legend>${chosenNodes.map(n=>`<label class="check-label"><input type="checkbox" data-node="${escape(n.id)}" ${selectedNodes.includes(n.id) ? 'checked' : ''}> ${fmt(n.x)}, ${fmt(n.y)} · ${fmt(n.distanceM)} m away</label>`).join('')}</fieldset></details>` : '';
  const outputPorts = row.outputs?.length ? ports(row.outputs.filter(p=>p.role === 'product')) : row.outputRate ? ports([{name:row.itemName,rate:row.outputRate,unit:row.unit}]) : '';
  const destinations = plan.routes.filter(r=>r.from===row.id && r.kind==='input');
  const deliveries = destinations.length ? `<ul class="material-lines deliveries">${destinations.map(r=>`<li class="material-line"><span>→ ${stepLink(r.to)}</span><strong>${escape(rate(r.rate,r.unit))}</strong></li>`).join('')}</ul>` : '';
  const wastes = plan.overflow.filter(o=>o.from===row.id).map(o=>`<li class="material-line waste-line"><span>${escape(o.name || displayItem(o.itemId))}<small>→ ${escape(guideWasteBuffer(o) ? 'Separate Gangue bin' : o.recipeName || 'Disposal needed')}</small></span><strong>${escape(rate(o.rate,o.unit))}</strong></li>`).join('');
  const feeds = (row.inputs||[]).map(port=>`<li class="material-line"><span>${escape(port.name || displayItem(port.itemId))}${port.sourceId ? `<small>From ${stepLink(port.sourceId)}</small>` : ''}</span><strong>${escape(rate(port.rate,port.unit))}</strong></li>`).join('');
  const gateList = unlocks([...new Set([...(row.gateIds || []),...(row.operatingGateIds || [])])],4);
  const utilised = row.machineCount && row.kind !== 'disposal' ? `<p>Set clocks to ${fmt(row.clockPercent ?? 100)}%. ${row.dutyPercent < 99.999 ? `Expected operating time with the requested feed is ${fmt(row.dutyPercent)}%.` : 'This step has a continuous machine ratio.'}</p>` : '';
  const materialList = rowMaterials(row);
  const browse = (documentedProducers.has(row.itemId) || sourcesByItem.has(row.itemId) || manualsByItem.has(row.itemId)) && row.kind!=='disposal' ? `<button class="button quiet recipe-link" type="button" data-browse-recipes="${escape(row.itemId)}">Compare routes</button>` : '';
  const capacity = row.outputs?.find(p=>p.itemId===row.itemId && p.role==='product')?.perMachineRate * row.machineCount;
  const extraOutput = row.kind==='production' && Number.isFinite(capacity) && capacity-row.outputRate>.001 ? `<button class="button quiet recipe-link" type="button" data-extra-output="${capacity-row.outputRate}">Output spare ${escape(rate(capacity-row.outputRate,row.unit))}</button>` : '';
  const sourceAction = row.kind==='source'||row.kind==='import' ? `<button class="button quiet recipe-link" type="button" data-supply-mode="${row.kind==='source'?'import':'local'}">${row.kind==='source'?'Import this material':'Produce on site'}</button>` : '';
  const assigned = row.extraction?.allocatedNodes?.length ? `<p>${row.extraction.allocationStatus==='suggested'?'Suggested':'Allocated'} map position${row.extraction.allocatedNodes.length===1?'':'s'} · ${row.extraction.allocatedNodes.map(n=>`(${fmt(n.x)}, ${fmt(n.y)})`).join(', ')}</p>` : '';
  const conditions = row.operatingRequirements ? `<p>Operating conditions · ${fmt(row.operatingRequirements.temperature?.min)}–${fmt(row.operatingRequirements.temperature?.max)} °C · ${fmt(row.operatingRequirements.humidity?.min*100)}–${fmt(row.operatingRequirements.humidity?.max*100)}% humidity.</p>` : '';
  el('step-detail').innerHTML = `<section class="detail-section"><h4>Planned feed</h4><ul class="material-lines">${feeds || '<li>No upstream inputs listed</li>'}</ul>${sourceControl}${nodeControl}${assigned}${sourceAction}</section>
    <section class="detail-section"><h4>Planned output &amp; waste</h4><ul class="material-lines">${outputPorts}${wastes}${!outputPorts && !wastes ? '<li>Dedicated disposal outlet</li>' : ''}</ul>${deliveries}${utilised}${extraOutput}</section>
    <section class="detail-section"><h4>Build the bay</h4><p>${escape(row.recipeName || row.sourceName || equipment(row))}</p>${conditions}${materialList ? `<details class="step-extra"><summary>Machine build cost</summary><ul class="material-lines">${materialList}</ul></details>` : ''}${gateList ? `<details class="step-extra"><summary>Show unlock costs</summary><ul>${gateList}</ul></details>` : ''}${overrideControl}${browse}</section>`;
  if (el('recipe-choice')) el('recipe-choice').value = state.overrides[row.itemId] || '';
  if (el('source-choice')) el('source-choice').value = state.sources[row.itemId] || '';
  if (canVerifyBay(row)) el('step-detail').lastElementChild.insertAdjacentHTML('beforeend',
    '<div class="bay-verification"><button type="button" class="button quiet recipe-link" data-verify-bay>Cross-check this bay</button><output id="bay-check-result" aria-live="polite"></output></div>');
}

function renderBayClock(row) {
  const panel = el('bay-clock');
  const recipe = recipes.get(row.recipeId);
  const stock = el('bay-clock-content');
  if (panel.dataset.step !== row.id) panel.open = false;
  panel.dataset.step = row.id;
  panel.hidden = !(row.kind==='production' && recipe && !recipe.assemblyId && !recipe.requiredModuleMachineIds?.length &&
    row.machine && (row.machine.clock?.canChange || row.machine.productionBoost?.supported || recipe.machineIds.length>1));
  if (panel.hidden) {
    stock.replaceChildren();
    return;
  }
  el('bay-clock-title').textContent = `Clock & machine settings · ${fmt(row.clockPercent ?? 100)}%`;
  const researchGate = gates.get(catalog.clockPolicy?.unlockGateIds?.[0]);
  const unlock = researchGate && row.machine.clock?.canChange ? (state.tier >= researchGate.tier ?
    `<div class="bay-clock-inputs"><label class="check-label"><input id="bay-clock-unlock" type="checkbox" ${state.clockUnlocked?'checked':''}> ${escape(researchGate.name)} researched</label><label class="shard-stock">Power Shards in stock <input id="bay-shard-stock" type="number" min="0" max="100000" step="1" value="${state.availablePowerShards}"></label></div>` :
    `<p>Clock changes unlock with ${escape(researchGate.name)} at Tier ${researchGate.tier}.</p>`) : '';
  stock.innerHTML = unlock + showRecipeSettings(recipe,row);
}

function canVerifyBay(row) {
  const recipe = recipes.get(row.recipeId);
  return serverEnabled && row.kind==='production' && recipe?.supported && recipe.deterministic!==false &&
    !recipe.assemblyId && !recipe.requiredModuleMachineIds?.length && row.clockPercent===100 && !row.boostCount &&
    row.outputRate>0 && row.outputRate<=10000 && row.inputs.every(p=>p.itemId!==row.itemId && p.rate>0 && p.rate<=10000);
}

async function verifyBay(row,button) {
  const status = el('bay-check-result');
  if (!status || !canVerifyBay(row)) return;
  verification?.abort();
  const controller = new AbortController();
  verification = controller;
  const timeout = setTimeout(()=>controller.abort(),10000);
  status.value = 'Checking recipe rates and machine count…';
  button.disabled = true;
  try {
    const response = await fetch(`${serverOrigin}/v1/solve`,{
      method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:controller.signal,
      body:JSON.stringify({catalogVersion:catalog.version,catalogSha256:serverCatalogHash||undefined,stage:state.tier,beltCapacity:cap(belts,state.belt),pipeCapacity:cap(pipes,state.pipe),
        recipeIds:[row.recipeId],recipeOverrides:{[row.itemId]:row.recipeId},machineOverrides:{[row.recipeId]:row.machineId},
        targets:[{itemId:row.itemId,rate:row.outputRate}],imports:row.inputs.map(p=>({itemId:p.itemId,rate:p.rate}))})
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || `Server check failed (${response.status}).`);
    const remote = json.plan?.rows?.find(candidate=>candidate.recipeId===row.recipeId && candidate.itemId===row.itemId);
    const near = (a,b)=>Math.abs(a-b)<=Math.max(1e-7,Math.abs(a)*1e-7);
    const same = remote && remote.machineCount===row.machineCount && near(remote.outputRate,row.outputRate) &&
      near(remote.power?.installedPeakMW,row.power.installedPeakMW) &&
      remote.inputs.length===row.inputs.length && row.inputs.every(p=>remote.inputs.some(q=>q.itemId===p.itemId && near(q.rate,p.rate)));
    status.value = same ? 'Recipe rates, machine count and draw match the server. Supply and waste are checked in the factory plan.' :
      'The server returned a different result for this bay. Check the selected recipe, machine and catalogue version.';
  } catch (error) {
    if (status.isConnected) status.value = controller.signal.aborted ? 'Server check timed out.' : (error.message || 'Server check unavailable.');
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    if (verification === controller) verification = null;
  }
}

function resizeBlueprint(keepCenter = false) {
  const viewport = el('drawing');
  const svg = el('blueprint-stage').querySelector('svg');
  const zoom = zoomLevels[zoomIndex];
  el('zoom').disabled = !svg || zoomIndex === zoomLevels.length-1;
  el('zoom-out').disabled = !svg || zoomIndex === 0;
  el('zoom-reset').disabled = !svg || zoomIndex === fittedZoom;
  el('zoom-level').value = svg ? `${Math.round(zoom*100)}%` : '—';
  viewport.classList.toggle('zoomed',Boolean(svg && zoom>1));
  if (!svg || !viewport.clientWidth) return;
  const {width,height} = svg.viewBox.baseVal;
  if (!width || !height) return;
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
  const fit = Math.min((viewport.clientWidth-28) / width,(viewport.clientHeight-26) / height);
  svg.style.width = `${Math.round(width*fit*zoom)}px`;
  svg.style.height = `${Math.round(height*fit*zoom)}px`;
  if (keepCenter) {
    viewport.scrollLeft = viewport.scrollWidth*centerX - viewport.clientWidth/2;
    viewport.scrollTop = viewport.scrollHeight*centerY - viewport.clientHeight/2;
  } else if (zoomIndex <= fittedZoom) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
}

function changeZoom(change) {
  zoomIndex = change ? Math.max(0,Math.min(zoomLevels.length-1,zoomIndex+change)) : fittedZoom;
  resizeBlueprint(true);
}

function runLabel(route, run) {
  const kind = route.unit === 'm3' ? 'pipe' : 'belt';
  return run.lines.map(line=>`${fmt(line.count)} × ${kind} Mk.${line.tier}`).join(' + ');
}

function machineGroups(bank) {
  if (!bank || (bank.length===1 && bank[0].lines===1 && bank[0].machines===1)) return '';
  return bank.map(group=>`${fmt(group.lines)} line${group.lines===1?'':'s'} × ${fmt(group.machines)} machine${group.machines===1?'':'s'}`).join(' + ');
}

function runInstructions(run) {
  const output = machineGroups(run.outputBank);
  const input = machineGroups(run.inputBank);
  const groups = output && output === input ? [`${input} at both ends`] :
    [output && `Collect from ${output}`,input && `Feed ${input}`];
  return [
    ...groups,
    run.shared ? 'Branch off the shared supply header.' : '',
    run.separateBanks ? 'Connect unequal groups through a distribution header at the bay.' : '',
    run.portCheck ? 'Check the individual machine port capacity.' : '',
  ].filter(Boolean);
}

function endpoint(id) {
  if (id?.startsWith('overflow:') && guideWasteBuffer(plan.overflow.find(out=>out.id===id))) return 'Separate Gangue bin';
  return floors.find(e=>e.row.id===id)?.row.itemName
    || (id?.startsWith('target:') ? 'Output storage' : id?.startsWith('overflow:') ? 'Disposal needed' : 'Supply unavailable');
}

function stepLink(id) {
  const target = floors.find(e=>e.row.id===id);
  const label = escape(endpoint(id));
  return target ? `<button class="route-step" type="button" data-route-step="${escape(id)}" title="${escape(layerName(target.layer))}">${label}</button>` : label;
}

function renderFactory() {
  if (campus) return;
  const kit = renderCampus(floors,plan.routes,{...layoutOptions(),transportRuns:runs,onSelect:row=>selectStep(row.id,true)});
  campus = kit;
  if (kit.layout.pads.length) {
    kit.svg.classList.add('wide');
    el('campus-drawing').replaceChildren(kit.svg);
    el('campus-sub').textContent = `${fmt(kit.widthFoundations)} × ${fmt(kit.depthFoundations)} foundations including shared transport space. Select a bay for its internal layout.`;
  } else {
    el('campus-drawing').innerHTML = '<p class="no-drawing">Calculate a plan with measured production bays to draw the shared layout.</p>';
    el('campus-sub').textContent = 'Production bays and the corridors between them.';
  }
  el('download-campus').disabled = !kit.layout.pads.length;
  const routed = new Map(kit.layout.routes.map(r=>[r.originalIndex,r]));
  const showAverages = el('show-route-averages')?.checked;
  el('campus-routes').innerHTML = `<div class="route-heading"><h4>Install these transport lines</h4><label class="check-label"><input id="show-route-averages" type="checkbox"${showAverages?' checked':''}> Show average rates</label></div>
    <p>Connect the listed machine groups at their configured clock. Use splitter branches on shared belts and let the receiving manifolds fill. Shared groups may pause between cycles. Put crossings on separate rack heights.</p>
    <table class="route-table"><thead><tr><th>Run</th><th>Material</th><th>From → to</th><th>Install</th><th class="route-average">Plan average</th></tr></thead><tbody>
    ${plan.routes.map((r,i)=>{
      const track = routed.get(i);
      const run = runs[i];
      const holding = r.method==='unresolved' && guideWasteBuffer(plan.overflow.find(out=>out.id===r.to));
      const instructions = runInstructions(run);
      const installed = run.lines.reduce((sum,line)=>sum+line.count*line.capacity,0);
      return `<tr><td>${escape(track?.id || 'Off-site')}</td><td>${escape(r.name)}</td><td>${stepLink(r.from)} → ${stepLink(r.to)}</td><td>
        <strong class="lane ${r.method==='unresolved'&&!holding?'blocked':''}">${escape(runLabel(r,run))}</strong>
        <small class="route-average">${escape(rate(installed,r.unit))} installed capacity</small>
        ${instructions.map(note=>`<small>${escape(note)}</small>`).join('')}</td>
        <td class="route-average">${escape(rate(r.rate,r.unit))}</td></tr>`;
    }).join('')}</tbody></table>
    ${kit.excluded.length ? `<details class="step-extra"><summary>Off-site or unmeasured steps</summary><ul>${kit.excluded.map(e=>`<li>${escape(rowTitle(e.row))} · ${escape(e.reason)}</li>`).join('')}</ul></details>` : ''}`;
}

function renderBuild() {
  const footer = plan.construction.length ? `<section class="build-materials"><h4>Machine construction materials</h4><p>${plan.construction.map(c=>escape(`${fmt(c.amount)} ${c.name}`)).join(' · ')}</p><p>Add foundations, belts, fittings, power poles and storage for the chosen site.</p></section>` : '';
  const run = activeRun();
  const commissioning = run && !runChanged(run) ? `<p class="commissioning-note">${escape(run.note)}${activePreset()?.stock ? '' : ' Put Gangue in separate stock bins and stop before they fill.'}</p>` :
    plan.overflow.length ? '<p class="commissioning-note">Connect the dedicated waste outlets before switching on production bays.</p>' : '';
  const connections = plan.routes.map((route,i)=>({route,run:runs[i]}));
  const buildRun = (route,run,inbound) => {
    const direction = inbound ? `from ${endpoint(route.from)}` : `to ${endpoint(route.to)}`;
    const group = machineGroups(inbound ? run.inputBank : run.outputBank);
    const external = inbound && !run.outputBank && floors.some(e=>e.row.id===route.from && e.row.kind==='import');
    return [`${route.name} ${direction} on ${runLabel(route,run)}`,group && `${inbound?'Feed':'Collect from'} ${group}`,
      external ? `Supply ${rate(route.rate,route.unit)} on average` : '',
      run.separateBanks ? 'Connect unequal groups through a distribution header' : '',
      run.portCheck ? 'Check the individual machine port' : ''].filter(Boolean).join(' · ');
  };
  el('build-list').innerHTML = commissioning + floors.map(({row,floor,layer}, i) => {
    const inbound = connections.filter(({route})=>route.to===row.id).map(({route,run})=>`<p>Connect ${escape(buildRun(route,run,true))}.</p>`).join('');
    const outbound = connections.filter(({route})=>route.from===row.id && route.kind!=='input').map(({route,run})=>`<p>Route ${escape(buildRun(route,run,false))}.</p>`).join('');
    const nodeAlloc = row.extraction?.allocatedNodes?.length ? `Allocated nodes ${row.extraction.allocatedNodes.map(n=>`(${fmt(n.x)}, ${fmt(n.y)})`).join(', ')}.` :
      row.extraction?.nodeRequired ? `Allocate ${row.machineCount} ${row.extraction.purity || ''} node(s) before placing this step.` : '';
    const labels = unlockNames(row.gateIds);
    const heading = floors[i-1]?.layer!==layer ? `<h3 class="build-layer">${escape(layerName(layer))}</h3>` : '';
    return `${heading}<section class="build-check"><input aria-label="Mark ${escape(rowTitle(row))} built" type="checkbox" data-check="${escape(row.id)}" ${state.checked.includes(row.id) ? 'checked' : ''}>
      <div><h4>${i+1}. ${escape(rowTitle(row))}</h4><p>${escape([equipment(row),dimensions(floor)].filter(Boolean).join(' · '))}</p>
      ${labels ? `<p>Unlock ${escape(labels)}</p>` : ''}${nodeAlloc ? `<p>${escape(nodeAlloc)}</p>` : ''}${inbound}${outbound}</div>
      <button class="button quiet" type="button" data-open-floor="${escape(row.id)}">Open bay</button></section>`;
  }).join('') + footer + `<section class="build-materials build-power-footer"><div><h4>Power for this factory</h4><p>${fmt(plan.power.installedPeakMW)} MW installed draw</p></div><button class="button quiet" type="button" data-build-power>Build power →</button></section>`;
}

let powerView;
function renderPower() {
  powerView?.dispose?.();
  while (el('power-planner').firstChild) el('power-planner').firstChild.remove();
  powerView = renderPowerPlanner(el('power-planner'),{
    catalog,plan,stage:state.tier,...layoutOptions(),settings:state.powerSettings,solverSettings:solverSettings(),
    onSettings:settings=>{state.powerSettings=settings;save();},
    onSolveSupply:config=>solvePlan(plannerCatalog(),{...solverSettings(),...config,exactScale:false}),
    onPrefill:payload=>planFromTargets(payload.targets,payload.name,{imports:payload.imports || [],overrides:payload.recipeOverrides || {},sources:payload.sourceOverrides || {}})
  });
}

function renderRecipeProducts(preferred = el('recipe-product').value) {
  const filter = el('recipe-filter').value.trim().toLowerCase();
  const pool = el('favorites-only').checked ? recipeItems.filter(item=>favorites[item.id]) : recipeItems;
  const visible = filter ? pool.filter(item=>item.name.toLowerCase().includes(filter)
      || documentedProducers.get(item.id)?.some(r=>r.name.toLowerCase().includes(filter))
      || sourcesByItem.get(item.id)?.some(s=>s.name.toLowerCase().includes(filter))
      || manualsByItem.get(item.id)?.some(({recipe})=>recipe.name.toLowerCase().includes(filter))) : pool;
  el('recipe-product').innerHTML = options(visible,i=>i.id,i=>i.name);
  const requested = visible.some(item=>item.id===preferred) ? preferred : visible.find(item=>item.id===plan?.targets[0]?.itemId)?.id;
  if (requested) el('recipe-product').value = requested;
}

function recipeRates(entries) {
  const totals = new Map();
  for (const port of entries || []) {
    const value = totals.get(port.itemId) || {rate:0};
    value.rate += Number(port.perMinute)||0;
    value.unit = items.get(port.itemId)?.unit;
    value.name = displayItem(port.itemId);
    totals.set(port.itemId,value);
  }
  return totals.size ? `<ul class="material-lines">${ports([...totals.values()])}</ul>` : '<p>None listed</p>';
}

function uncertainOutputRates(entries) {
  const lines = entries.map(p=>`<li class="material-line"><span>${escape(displayItem(p.itemId))}<small>${p.chance == null ? 'Chance unspecified' : `${fmt(p.chance*100)}% chance`}${p.expectedPerMinute != null ? ` · ${escape(rate(p.expectedPerMinute,items.get(p.itemId)?.unit))} expected` : ''}</small></span><strong>${escape(rate(p.perMinute,items.get(p.itemId)?.unit))}</strong></li>`);
  return `<ul class="material-lines">${lines.join('')}</ul>`;
}

function batchMaterials(ports) {
  return `<ul class="material-lines">${ports.map(p=>`<li class="material-line"><span>${escape(p.name || displayItem(p.itemId))}</span><strong>${fmt(p.amount)}${p.unit==='m3'?' m³':''}</strong></li>`).join('')}</ul>`;
}

function routeSources(itemId) {
  const list = (sourcesByItem.get(itemId) || []).filter(s=>el('show-later-recipes').checked || (s.tier ?? 0)<=state.tier);
  if (!list.length) return '';
  return `<details class="catalog-section" open><summary>Extraction and collection · ${list.length} variants</summary><div class="source-list">${list.map(s=>{
    const active = state.sources[itemId]===s.id;
    const hasRate = s.ratePerMinute>0;
    const unit = items.get(itemId)?.unit;
    return `<div class="source-entry"><div><strong>${escape(s.name)}</strong><small>Tier ${fmt(s.tier ?? 0)}${hasRate?` · ${escape(rate(s.ratePerMinute,unit))}`:''}${s.sharedInfrastructure?' · One pressurizer per well':''}</small><small>${escape(unlockNames(s.gateIds))}</small>${!s.supported && s.notes?`<small>${escape(s.notes)}</small>`:''}</div><button class="button quiet" type="button" data-pin-source="${escape(s.id)}" ${sourceCanPin(s)&&!active?'':'disabled'}>${active?'Selected':sourceCanPin(s)?'Use source':'Unavailable'}</button></div>`;
  }).join('')}</div></details>`;
}

function manualRoutes(itemId) {
  const list = (manualsByItem.get(itemId)||[]).map(e=>e.recipe).filter(r=>el('show-later-recipes').checked || (r.tier ?? 0)<=state.tier);
  if (!list.length) return '';
  return `<details class="catalog-section" open><summary>Manual craft · ${list.length} recipes</summary>${list.map(r=>`<section class="recipe-card"><header><div><p class="recipe-tags">MANUAL · TIER ${fmt(r.tier ?? 0)}${r.seasonal?' · SEASONAL':''}${r.legacy?' · LEGACY':''}</p><h4>${escape(r.name)}</h4><p>${escape(r.workstations.map(w=>w.name).join(' / '))}</p></div><a class="button quiet" href="${escape(r.source)}" target="_blank" rel="noopener">Source</a></header><div class="recipe-ports"><div><h5>Input per craft</h5>${batchMaterials(r.inputs)}</div><div><h5>Output per craft</h5>${batchMaterials(r.outputs)}</div></div>${r.notes?`<p>${escape(r.notes)}</p>`:''}${r.gateIds.length?`<details class="step-extra"><summary>Unlock requirements</summary><ul>${unlocks(r.gateIds,4)}</ul></details>`:''}
    ${r.inputs.length ? `<div class="batch-controls manual-controls"><label>Crafts <input type="number" min="1" max="10000" value="1"></label><label>Supply window (minutes) <input type="number" min="1" max="100000" value="60"></label><button class="button quiet" type="button" data-plan-manual="${escape(r.id)}">Plan ingredients</button></div>` : ''}</section>`).join('')}</details>`;
}

function terminalRoutes(itemId) {
  const selections = (terminalByItem.get(itemId) || []).map(e=>e.recipe).filter(r=>el('show-later-recipes').checked || (r.tier ?? 0)<=state.tier);
  if (!selections.length) return '';
  return `<details class="catalog-section"><summary>Consumption and disposal · ${selections.length} routes</summary>${selections.map(r=>`<section class="recipe-card"><h4>${escape(r.name)}</h4><p>Tier ${fmt(r.tier ?? 0)} · ${escape(r.machineIds.map(id=>machines.get(id)?.name).filter(Boolean).join(' / '))}</p><div class="recipe-ports"><div><h5>Inputs per minute</h5>${recipeRates(r.inputs)}</div></div>${r.gateIds.length?`<details class="step-extra"><summary>Unlock requirements</summary><ul>${unlocks(r.gateIds,4)}</ul></details>`:''}</section>`).join('')}</details>`;
}

function renderElevatorBatches() {
  el('elevator-batches').innerHTML = (catalog.elevatorBatches || []).map(batch=>`<section class="recipe-card"><h4>Phase ${batch.phase} · ${escape(batch.name)}</h4>${batchMaterials(batch.requiredParts)}<div class="batch-controls"><label>Minutes to produce one delivery <input type="number" min="1" max="100000" step="1" value="60"></label><button class="button quiet" type="button" data-elevator-phase="${batch.phase}">Plan delivery</button></div></section>`).join('');
}

function planFromTargets(targets,name,changes = {}) {
  if (!targets?.length || !el('plan-form').reportValidity()) return;
  takeForm();
  const previous = {...state,name:state.name || el('plan-title').textContent};
  const snapshots = libraryEntries();
  if (!snapshots.some(s=>JSON.stringify(s.plan)===JSON.stringify(previous))) {
    const id = globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(16);
    writeLibrary([{name:previous.name,id,plan:previous},...snapshots]);
  }
  openSavedPlan({...state,preset:'',name,targets,exact:false,checked:[],...changes});
}

function showRecipeSettings(recipe,node) {
  if (recipe.assemblyId || recipe.requiredModuleMachineIds?.length) return '';
  const choices = recipe.machineIds.map(id=>machines.get(id)).filter(m=>m && (m.tier ?? 0)<=state.tier);
  const machine = choices.find(m=>m.id===(state.machineOverrides[recipe.id] || node?.machineId)) || choices[0];
  if (!machine) return '';
  const choseMachine = state.machineOverrides[recipe.id] || '';
  const clock = machine.clock;
  const clockPolicy = catalog.clockPolicy?.unlockGateIds?.map(id=>gates.get(id)).find(Boolean);
  const boost = machine.productionBoost;
  const proposedClock = Number(state.clockOverrides[recipe.id]) || 100;
  const proposedBoost = Number(state.boostOverrides[recipe.id]) || 0;
  const clockAvailable = state.clockUnlocked && state.tier >= (clockPolicy?.tier ?? Infinity);
  const limit = Math.round((clock?.max ?? 1)*100);
  const minimum = Math.round((clock?.min ?? 1)*100);
  const boostAvailable = state.boostUnlocked && state.tier>=(catalog.productionBoostPolicy?.tier ?? Infinity);
  const machineField = choices.length>1 ? `<label class="field"><span>Machine</span><select data-machine-for="${recipe.id}"><option value="">Automatic</option>${choices.map(m=>`<option value="${m.id}" ${m.id===choseMachine?'selected':''}>${escape(m.name)}</option>`).join('')}</select></label>` : '';
  const clockField = clockAvailable && clock?.canChange ? `<label class="field"><span>Clock speed (%)</span><input type="number" data-clock-for="${recipe.id}" min="${minimum}" max="${limit}" step="any" value="${Math.max(minimum,Math.min(limit,proposedClock))}"></label>` : '';
  const boostField = boostAvailable && boost?.supported && boost.slots>0 ? `<label class="field"><span>Somersloops per machine</span><select data-boost-for="${recipe.id}">${Array.from({length:boost.slots+1},(_,i)=>`<option value="${i}" ${i===proposedBoost?'selected':''}>${i}</option>`).join('')}</select></label>` : '';
  const clockButtons = clockField ? `<div class="clock-presets">${[100,150,200,250].filter(n=>n>=minimum&&n<=limit).map(n=>`<button class="button quiet" type="button" data-clock-set="${recipe.id}" data-value="${n}" aria-pressed="${n===proposedClock}">${n}%</button>`).join('')}</div>` : '';
  const inventory = node ? [node.powerShards ? `${fmt(node.powerShards)} Power Shards` : '',node.somersloops ? `${fmt(node.somersloops)} Somersloops total` : ''].filter(Boolean).join(' · ') : '';
  const installed = inventory ? `<p>${inventory}</p>` : '';
  if (!machineField && !clockField && !boostField) return boost?.slots && !boost.supported && boostAvailable ? `<p class="recipe-warning">${escape(boost.unsupportedReason)}</p>` : '';
  return `<div class="recipe-machine-controls">${machineField}${clockField}${boostField}${clockButtons}</div>${installed}`;
}

function renderRecipes() {
  const itemId = el('recipe-product').value;
  const production = plan?.rows.find(row=>row.itemId===itemId && row.kind==='production');
  const pinned = state.overrides[itemId];
  const onlyFavorites = el('favorites-only').checked;
  const list = (documentedProducers.get(itemId) || []).filter(r=>!r.unsupportedReason?.startsWith('Extraction/module recipe') &&
    (!onlyFavorites || favorites[itemId]===r.id) && (el('show-later-recipes').checked || (r.tier ?? 0)<=state.tier));
  const isPickable = r => recipeCanPin(r);
  const readyCount = list.filter(isPickable).length;
  const chosenSummary = pinned ? `Pinned for this plan · ${escape(recipes.get(pinned)?.name || pinned)}` : `Automatic selection${production ? ` · ${escape(production.recipeName)}` : ''}`;
  const cards = list.length ? `
    <div class="recipe-list-head"><span>${chosenSummary}</span><span>${readyCount} selectable at Tier ${state.tier} · ${list.length} listed</span>${pinned ? `<button type="button" class="button quiet" data-pin-recipe="">Use automatic</button>` : ''}</div>
    ${list.slice().sort((a,b)=>(Number(isPickable(b))-Number(isPickable(a))) || ((a.tier ?? 0)-(b.tier ?? 0)) || (Number(a.alternate)-Number(b.alternate)) || a.name.localeCompare(b.name)).map(r=>{
      const usable = isPickable(r);
      const active = pinned === r.id;
      const favorite = favorites[itemId]===r.id;
      const favoriteButton = r.supported && r.deterministic!==false ? `<button class="button quiet" type="button" data-favorite-recipe="${r.id}" aria-pressed="${favorite}">${favorite?'★ Favorite':'☆ Favorite'}</button>` : '';
      const gated = unlocks(r.gateIds || [],4);
      const machineNames = r.machineIds.map(id=>machines.get(id)?.name).filter(Boolean).join(' / ');
      const wrongTier = (r.tier ?? 0)>state.tier;
      const uncertain = r.deterministic===false;
      const randomNote = state.expectedYields ? 'Random yields are estimates. Size buffers for the nominal output bursts shown above.' : 'Uses random yields. Enable yield estimates in the plan settings.';
      const message = wrongTier ? `Requires Tier ${r.tier}.` : r.unsupportedReason || (uncertain ? randomNote : !usable?'Requires a manual or special building setup.':'');
      return `<section class="recipe-card ${active?'pinned':''}"><header><div><p class="recipe-tags">${r.alternate ? 'ALTERNATE · ' : ''}TIER ${fmt(r.tier ?? 0)}${production?.recipeId===r.id?' · IN BUILD':''}</p><h4>${escape(r.name)}</h4><p>${escape(machineNames || 'Manual / special')}${r.cycleSeconds>0?` · ${fmt(r.cycleSeconds)} s/cycle`:''}</p></div>
      <div class="recipe-card-actions">${favoriteButton}<button class="button ${active?'quiet':'primary'}" type="button" data-pin-recipe="${escape(r.id)}" ${usable&&!active?'':'disabled'}>${active?'Pinned':wrongTier?'Locked':usable?'Use recipe':'Reference only'}</button></div></header>
      <div class="recipe-ports"><div><h5>Inputs per minute</h5>${recipeRates(r.inputs)}</div><div><h5>${uncertain?'Nominal output burst':'Outputs per minute'}</h5>${uncertain?uncertainOutputRates(r.outputs):recipeRates(r.outputs)}</div></div>
      ${gated ? `<details class="step-extra"${wrongTier || r.alternate?' open':''}><summary>Unlock requirements</summary><ul>${gated}</ul></details>` : ''}
      ${message ? `<p class="recipe-warning">${escape(message)}</p>` : ''}${usable ? showRecipeSettings(r,production?.recipeId===r.id ? production:null) : ''}</section>`;
    }).join('')}` : '';
  el('recipe-list').innerHTML = (onlyFavorites ? cards : [cards,routeSources(itemId),manualRoutes(itemId),terminalRoutes(itemId)].join('')) || '<p class="no-drawing">No routes match this item and tier filter.</p>';
}

function applyTuning(control,itemId) {
  const {machineFor,clockFor,boostFor,clockSet,value} = control.dataset;
  const id = machineFor || clockFor || boostFor || clockSet;
  if (!id || !control.reportValidity()) return false;
  if (machineFor) {
    if (control.value) state.machineOverrides[id] = control.value;
    else delete state.machineOverrides[id];
  } else if (clockFor || clockSet) state.clockOverrides[id] = Number(clockSet ? value : control.valueAsNumber) || 100;
  else state.boostOverrides[id] = Number(control.value);
  pinRecipe(itemId,id);
  calculate({preserveChecks:true});
  return true;
}

function libraryEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(libraryKey));
    return Array.isArray(saved) ? saved.filter(entry=>typeof entry?.name==='string' && Array.isArray(entry?.plan?.targets)) : [];
  } catch { return []; }
}

function renderLibrary() {
  const entries = libraryEntries();
  el('saved-list').innerHTML = entries.length ? entries.map(entry=>`<div class="saved-plan"><div><strong>${escape(entry.name)}</strong><small>Tier ${fmt(Number(entry.plan.tier))} · ${escape(entry.plan.targets.map(t=>displayItem(t.itemId)).join(', '))}</small></div><button class="button quiet" type="button" data-load-plan="${escape(entry.id)}">Open</button><button class="button quiet" type="button" data-delete-plan="${escape(entry.id)}" aria-label="Delete ${escape(entry.name)}">×</button></div>`).join('') : '<p>Your saved builds appear here.</p>';
}

function writeLibrary(entries) {
  try { localStorage.setItem(libraryKey,JSON.stringify(entries));return true; }
  catch { el('library-status').value = 'Browser storage is unavailable. Download a plan file to keep a copy.';return false; }
}

function openSavedPlan(config, name) {
  state = normalizePlan({...config,name:name ?? config.name});
  selected = null;
  zoomIndex = fittedZoom;
  el('item-filter').value = '';
  el('recipe-filter').value = '';
  if (location.hash.startsWith('#plan=')) history.replaceState(null,'',location.href.split('#')[0]);
  syncForm();
  calculate();
  if (el('plan-library').open) el('plan-library').close();
  activate('floor');
}

function renderView() {
  if (view === 'campus') renderFactory();
  if (view === 'build') renderBuild();
  if (view === 'power') renderPower();
  if (view === 'recipes') {
    if (!el('recipe-product').options.length && !el('recipe-filter').value) renderRecipeProducts();
    renderRecipes();
  }
}

function activate(next) {
  if (view==='power' && next!=='power') {
    powerView?.dispose?.();
    powerView = null;
  }
  view = next;
  for (const tab of document.querySelectorAll('[data-view]')) {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected',String(active));
    tab.tabIndex = active ? 0 : -1;
    el(`panel-${tab.dataset.view}`).hidden = !active;
  }
  renderView();
}

function download(svg, name) {
  if (!svg) return;
  saveFile(new XMLSerializer().serializeToString(svg),'image/svg+xml',name,'svg');
}

function saveFile(body, type, name, extension) {
  const object = URL.createObjectURL(new Blob([body],{type}));
  const label = name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'plan';
  const link = Object.assign(document.createElement('a'),{href:object,download:`foundry-${label}.${extension}`});
  link.click();
  setTimeout(()=>URL.revokeObjectURL(object),1000);
}

async function share() {
  const url = new URL(location.href);
  url.hash = `plan=${encodeURIComponent(JSON.stringify({...state,checked:[]}))}`;
  try {
    await navigator.clipboard.writeText(url.href);
    const label = el('share').querySelector('span');
    label.textContent = 'Link copied';
    setTimeout(()=>{label.textContent='Share plan';},2200);
    el('status').textContent = 'Plan link copied.';
  } catch {
    window.prompt('Copy the plan link',url.href);
  }
}

el('catalog-version').textContent = `SF+ ${catalog.meta.catalogVersion.split('-')[0]}`;
el('catalog-version').title = `Official planner export. Installed version from your screenshot ${catalog.meta.installedVersion}.`;
el('preset').innerHTML = '<option value="">Custom plan</option>' + options(presets,p=>presets.indexOf(p),p=>p.name);
el('belt').innerHTML = options(belts,t=>belts.indexOf(t)+1,t=>`Mk.${belts.indexOf(t)+1} · ${t.capacityPerMinute}/min`);
el('pipe').innerHTML = options(pipes,t=>pipes.indexOf(t)+1,t=>`Mk.${pipes.indexOf(t)+1} · ${t.capacityPerMinute} m³/min`);
el('imports').innerHTML = allItemOptions;
const narrowSetup = matchMedia('(max-width: 880px)');
function showSetup(open) {
  el('setup-panel').hidden = !open;
  el('main').classList.toggle('setup-hidden',!open);
  el('setup-toggle').setAttribute('aria-expanded',String(open));
  el('setup-toggle').querySelector('span').textContent = open ? 'Hide setup' : 'Edit setup';
}
narrowSetup.addEventListener('change',event=>showSetup(!event.matches));
showSetup(!narrowSetup.matches);
el('setup-toggle').addEventListener('click',()=>{
  const open = el('setup-panel').hidden;
  showSetup(open);
  if (open && narrowSetup.matches) el('preset').focus();
});
el('plan-form').addEventListener('submit',event=>{
  event.preventDefault();
  if (!el('plan-form').reportValidity()) return;
  calculate();
  if (narrowSetup.matches) {
    showSetup(false);
    el('setup-toggle').focus();
  }
});
el('plan-form').addEventListener('input',event=>{
  if (event.target.matches('.target-rate,[data-import]')) el('plan-pending').hidden = false;
});
el('targets').addEventListener('change',event=>{
  const row = event.target.closest('.target-row');
  if (!row) return;
  if (event.target.matches('.target-recipe')) {
    pinRecipe(row.querySelector('.target-item').value,event.target.value);
    calculate();
    return;
  }
  markCustom();
  if (event.target.matches('.target-item')) setupTargetRecipe(row);
});
el('item-filter').addEventListener('input',()=>{
  for (const select of el('targets').querySelectorAll('.target-item')) setTargetOptions(select,select.value);
});
el('add-target').addEventListener('click',()=>{markCustom();addTarget().querySelector('select').focus();});
el('preset').addEventListener('change',event=>{
  if (event.target.value === '') {markCustom();calculate({preserveChecks:true});return;}
  state = base(Number(event.target.value));
  selected = null;
  syncForm();
  calculate();
});
el('preset-run').addEventListener('change',event=>{
  const next = base(Number(state.preset),event.target.value);
  state = {...next,belt:state.belt,pipe:state.pipe,checked:state.checked};
  selected = null;
  syncForm();
  calculate({preserveChecks:true});
});
for (const id of ['belt','pipe','purity','alternates','exact','research','expected-yields','prefer-favorites']) el(id).addEventListener('change',()=>calculate({preserveChecks:true}));
el('add-import').addEventListener('click',()=>{
  takeForm();
  const itemId = el('imports').value;
  if (!state.imports.some(t=>t.itemId===itemId)) state.imports.push({itemId,rate:60});
  renderImports();
  el('plan-pending').hidden = false;
  el(`import-${itemId}`)?.focus();
});
el('import-list').addEventListener('click',event=>{
  const id = event.target.dataset.removeImport;
  if (!id) return;
  takeForm();
  state.imports = state.imports.filter(t=>t.itemId!==id);
  renderImports();
  el('plan-pending').hidden = false;
});
el('steps').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(b)selectStep(b.dataset.step);});
el('step-picker').addEventListener('change',event=>selectStep(event.target.value));
for (const [id,delta] of [['step-prev',-1],['step-next',1]]) {
  el(id).addEventListener('click',()=>{
    const index = floors.findIndex(e=>e.row.id===selected);
    if (floors[index+delta]) selectStep(floors[index+delta].row.id);
  });
}
el('footprint-facts').addEventListener('change',event=>{
  if (event.target.id !== 'machines-across' || !selected) return;
  const count = Number(event.target.value);
  if (count) state.across[selected] = count;
  else delete state.across[selected];
  calculate({preserveChecks:true});
  el('machines-across')?.focus();
});
el('step-built').addEventListener('change',event=>{
  if (selected) setBuilt(selected,event.target.checked);
});
el('bay-clock-content').addEventListener('change',event=>{
  const input = event.target;
  if (input.id==='bay-clock-unlock' || input.id==='bay-shard-stock') {
    if (!input.reportValidity()) return;
    if (input.id==='bay-clock-unlock') state.clockUnlocked=input.checked;
    else state.availablePowerShards=Math.trunc(input.valueAsNumber||0);
    el('clock-unlocked').checked=state.clockUnlocked;
    el('shard-stock').value=state.availablePowerShards;
    calculate({preserveChecks:true});
    el(input.id)?.focus();
    return;
  }
  const row = floors.find(entry=>entry.row.id===selected)?.row;
  if (row) applyTuning(input,row.itemId);
});
el('bay-clock-content').addEventListener('click',event=>{
  const button = event.target.closest('[data-clock-set]');
  const row = floors.find(entry=>entry.row.id===selected)?.row;
  if (button && row) applyTuning(button,row.itemId);
});
el('step-detail').addEventListener('change',event=>{
  const entry = floors.find(e=>e.row.id===selected);
  if (!entry) return;
  const {row} = entry;
  if (applyTuning(event.target,row.itemId)) return;
  if (event.target.id === 'recipe-choice') {
    pinRecipe(row.itemId,event.target.value);
  } else if (event.target.id === 'source-choice') {
    if (event.target.value) {
      state.sources[row.itemId] = event.target.value;
      delete state.overrides[row.itemId];
    } else delete state.sources[row.itemId];
  } else if (event.target.dataset.node) {
    state.allocations[row.sourceId] = Array.from(el('step-detail').querySelectorAll('[data-node]:checked'),n=>n.dataset.node);
    if (!state.allocations[row.sourceId].length) delete state.allocations[row.sourceId];
    calculate({preserveChecks:true});
    const node = [...el('step-detail').querySelectorAll('[data-node]')].find(n=>n.dataset.node===event.target.dataset.node);
    if (node) {node.closest('details').open=true;node.focus();}
    return;
  } else return;
  calculate();
});
el('step-detail').addEventListener('click',event=>{
  const button = event.target.closest('[data-browse-recipes],[data-extra-output],[data-supply-mode],[data-clock-set],[data-verify-bay]');
  if (!button) return;
  if (button.dataset.browseRecipes) {
    el('recipe-filter').value = '';
    renderRecipeProducts(button.dataset.browseRecipes);
    activate('recipes');
    el('tab-recipes').focus();
    return;
  }
  const row = floors.find(e=>e.row.id===selected)?.row;
  if (!row || !el('plan-form').reportValidity()) return;
  if ('verifyBay' in button.dataset) {verifyBay(row,button);return;}
  if (applyTuning(button,row.itemId)) return;
  if (button.dataset.extraOutput) {
    const extra = Number(button.dataset.extraOutput);
    const entry = [...el('targets').children].find(node=>node.querySelector('.target-item').value===row.itemId);
    if (entry) {
      const value = entry.querySelector('.target-rate');
      value.value = Number((value.valueAsNumber + extra).toFixed(8));
    } else addTarget({itemId:row.itemId,rate:Number(extra.toFixed(8))});
    markCustom();
  } else {
    takeForm();
    state.imports = state.imports.filter(material=>material.itemId!==row.itemId);
    if (button.dataset.supplyMode==='import') state.imports.push({itemId:row.itemId,rate:row.outputRate});
    renderImports();
  }
  calculate();
});
el('build-list').addEventListener('click',event=>{
  const button = event.target.closest('[data-open-floor]');
  if (button) selectStep(button.dataset.openFloor,true);
});
el('build-list').addEventListener('change',event=>{
  const id = event.target.dataset.check;
  if (!id) return;
  setBuilt(id,event.target.checked);
});
el('reset-progress').addEventListener('click',()=>{state.checked=[];el('step-built').checked=false;save();renderBuild();renderSteps();});
el('print-plan').addEventListener('click',()=>{renderBuild();window.print();});
el('results').addEventListener('click',event=>{
  const route = event.target.closest('[data-route-step]');
  if (route) {
    selectStep(route.dataset.routeStep,true);
    return;
  }
  if (!event.target.closest('[data-build-power]')) return;
  state.powerSettings = {...state.powerSettings,basis:'factory'};
  save();
  activate('power');
  el('tab-power').focus();
  el('power-planner').scrollIntoView({block:'start'});
});
el('share').addEventListener('click',share);
el('open-library').addEventListener('click',()=>{
  el('save-name').value = el('plan-title').textContent;
  el('library-status').value = '';
  renderLibrary();
  el('plan-library').showModal();
});
el('close-library').addEventListener('click',()=>el('plan-library').close());
el('save-plan').addEventListener('submit',event=>{
  event.preventDefault();
  const name = el('save-name').value.trim();
  if (!name || !el('plan-form').reportValidity()) return;
  takeForm();
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random().toString(16);
  if (!writeLibrary([{name,id,plan:{...state,name}},...libraryEntries()])) return;
  el('library-status').value = 'Plan saved in this browser.';
  renderLibrary();
  save();
});
el('saved-list').addEventListener('click',event=>{
  const action = event.target.closest('[data-load-plan],[data-delete-plan]');
  if (!action) return;
  const entries = libraryEntries();
  if (action.dataset.loadPlan) {
    const entry = entries.find(e=>e.id===action.dataset.loadPlan);
    if (entry) openSavedPlan(entry.plan,entry.name);
  } else if (writeLibrary(entries.filter(e=>e.id!==action.dataset.deletePlan))) renderLibrary();
});
el('export-plan').addEventListener('click',()=>{
  if (!el('plan-form').reportValidity()) return;
  takeForm();
  const name = el('save-name').value.trim() || el('plan-title').textContent;
  saveFile(JSON.stringify({format:'foundry-plan',version:1,catalog:catalog.version,plan:{...state,name}},null,2),'application/json',name,'json');
});
el('import-plan').addEventListener('click',()=>el('plan-file').click());
el('plan-file').addEventListener('change',async event=>{
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size>1048576) throw new Error('Plan files must be under 1 MiB.');
    const parsed = JSON.parse(await file.text());
    if (parsed.format!=='foundry-plan' || parsed.version!==1 || !parsed.plan?.targets?.some?.(t=>items.has(t?.itemId)&&Number(t.rate)>0)) throw new Error('Choose a Foundry plan file with valid outputs.');
    openSavedPlan(parsed.plan);
  } catch (error) { el('library-status').value = String(error.message || 'Could not open plan file.'); }
});
el('recipe-product').addEventListener('change',renderRecipes);
el('recipe-filter').addEventListener('input',()=>{renderRecipeProducts();renderRecipes();});
el('show-later-recipes').addEventListener('change',renderRecipes);
el('favorites-only').addEventListener('change',()=>{renderRecipeProducts();renderRecipes();});
for (const [id, key] of [['clock-unlocked','clockUnlocked'],['boost-unlocked','boostUnlocked']]) {
  el(id).addEventListener('change',event=>{
    state[key] = event.target.checked;
    calculate({preserveChecks:true});
  });
}
el('shard-stock').addEventListener('change',event=>{
  state.availablePowerShards = Math.max(0,Math.min(100000,Math.trunc(event.target.valueAsNumber||0)));
  event.target.value = state.availablePowerShards;
  calculate({preserveChecks:true});
});
el('sloop-stock').addEventListener('change',event=>{
  state.availableSomersloops = event.target.value === '' ? null : Math.max(0,Math.min(100000,Math.trunc(event.target.valueAsNumber||0)));
  event.target.value = state.availableSomersloops ?? '';
  calculate({preserveChecks:true});
});
el('recipe-list').addEventListener('click',event=>{
  const button = event.target.closest('[data-pin-recipe],[data-clock-set],[data-pin-source],[data-favorite-recipe],[data-plan-manual]');
  if (!button) return;
  const itemId = el('recipe-product').value;
  if (button.dataset.planManual) {
    const manual = catalog.manualRecipes.find(r=>r.id===button.dataset.planManual);
    const [crafts,minutes] = button.parentElement.querySelectorAll('input');
    if (manual && crafts.reportValidity() && minutes.reportValidity()) {
      planFromTargets(manual.inputs.map(p=>({itemId:p.itemId,rate:p.amount*crafts.valueAsNumber/minutes.valueAsNumber})),`Ingredients for ${manual.name}`);
    }
    return;
  }
  if ('pinRecipe' in button.dataset) pinRecipe(itemId,button.dataset.pinRecipe);
  else if (button.dataset.favoriteRecipe) {
    if (favorites[itemId]===button.dataset.favoriteRecipe) delete favorites[itemId];
    else favorites[itemId] = button.dataset.favoriteRecipe;
    try { localStorage.setItem(favoriteKey,JSON.stringify(favorites)); } catch {}
  }
  else if (button.dataset.pinSource) {
    takeForm();
    state.sources[itemId] = button.dataset.pinSource;
    delete state.overrides[itemId];
    state.imports = state.imports.filter(material=>material.itemId!==itemId);
    renderImports();
  }
  else if (applyTuning(button,itemId)) return;
  calculate({preserveChecks:true});
  if (el('favorites-only').checked && button.dataset.favoriteRecipe) {renderRecipeProducts();renderRecipes();}
});
el('recipe-list').addEventListener('change',event=>{
  applyTuning(event.target,el('recipe-product').value);
});
el('elevator-batches').addEventListener('click',event=>{
  const button = event.target.closest('[data-elevator-phase]');
  if (!button) return;
  const time = button.parentElement.querySelector('input');
  const batch = catalog.elevatorBatches.find(b=>b.phase===Number(button.dataset.elevatorPhase));
  if (!batch || !time.reportValidity()) return;
  const targets = batch.requiredParts.map(part=>({itemId:part.itemId,rate:part.amount/time.valueAsNumber}));
  planFromTargets(targets,`Phase ${batch.phase} · ${batch.name}`);
});
el('zoom').addEventListener('click',()=>changeZoom(1));
el('zoom-out').addEventListener('click',()=>changeZoom(-1));
el('zoom-reset').addEventListener('click',()=>changeZoom(0));
el('lane-jump').addEventListener('click',()=>el('lanes-title').focus());
el('download').addEventListener('click',()=>{
  const entry = floors.find(e=>e.row.id===selected);
  if (!entry?.floor?.foundationCount) return;
  const {row,floor} = entry;
  download(renderFloor(row,{...floorOptions(row),layout:floor,exportAnnotations:true,compact:false}),row.itemName);
});
el('download-campus').addEventListener('click',()=>download(campus?.svg,'factory-layout'));
const viewport = el('drawing');
let pan;
viewport.addEventListener('pointerdown',event=>{
  if (event.pointerType !== 'mouse' || event.button !== 0 || zoomIndex <= fittedZoom) return;
  pan = {id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('panning');
  event.preventDefault();
});
viewport.addEventListener('pointermove',event=>{
  if (pan?.id !== event.pointerId) return;
  viewport.scrollLeft = pan.left + pan.x - event.clientX;
  viewport.scrollTop = pan.top + pan.y - event.clientY;
});
viewport.addEventListener('lostpointercapture',()=>{
  pan = null;
  viewport.classList.remove('panning');
});
viewport.addEventListener('keydown',event=>{
  const changes = {'+':1,'=':1,'-':-1,'0':0};
  if (!(event.key in changes)) return;
  event.preventDefault();
  changeZoom(changes[event.key]);
});
new ResizeObserver(()=>resizeBlueprint()).observe(viewport);
const tabs = [...document.querySelectorAll('[data-view]')];
for (const tab of tabs) {
  tab.addEventListener('click',()=>activate(tab.dataset.view));
  tab.addEventListener('keydown',event=>{
    const index = tabs.indexOf(tab);
    const target = {ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if (target == null) return;
    event.preventDefault();
    activate(tabs[target].dataset.view);
    tabs[target].focus();
  });
}
syncForm();
renderElevatorBatches();
if (serverEnabled) {
  el('server-catalog').href = `${serverOrigin}/v1/manifest`;
  el('server-catalog').hidden = false;
}
for (const id of ['preset','add-target','calculate']) el(id).disabled = false;
calculate();
