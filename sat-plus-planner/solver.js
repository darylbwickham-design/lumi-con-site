/**
 * A dependency planner, not a coproduct optimiser. Every item has one deliberately
 * chosen production lane. Other outputs of that lane are disposal obligations;
 * they never become free inputs to another lane. Rates are items or m3 per minute.
 */
const EPS = 1e-8;
const finite = value => value != null && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value));
const number = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
const list = value => Array.isArray(value) ? value : value ? Object.values(value) : [];
const ceil = value => Math.ceil(value - EPS * Math.max(1, Math.abs(value)));
const unique = values => [...new Set(values)];
const sum = values => values.reduce((a, b) => a + b, 0);
const idOf = value => typeof value === 'string' ? value : value?.itemId ?? value?.partId ?? value?.id;
const byId = values => new Map(values.map(value => [value.id, value]));
const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);

export function normalizeCatalog(data = {}) {
  const items = list(data.items ?? data.parts);
  const machines = list(data.machines);
  const recipes = list(data.recipes);
  const sources = list(data.resourceSources ?? data.sources);
  return { ...data, items, machines, recipes, resourceSources: sources,
    itemById: byId(items), machineById: byId(machines), recipeById: byId(recipes), sourceById: byId(sources) };
}

function groupedPorts(recipe, direction, itemById) {
  const ports = recipe[direction] ?? (recipe.ports || []).filter(p => p.direction === direction.slice(0, -1));
  const grouped = new Map();
  for (const port of ports || []) {
    const itemId = idOf(port);
    const seconds = number(port.durationSeconds ?? recipe.cycleSeconds ?? recipe.duration);
    const rate = finite(port.perMinute) ? number(port.perMinute) : seconds > 0 ? number(port.amount) * 60 / seconds : NaN;
    if (!itemId || !Number.isFinite(rate) || rate < 0) throw new Error(`Invalid ${direction} port in ${recipe.name || recipe.id}`);
    if (rate <= EPS) continue;
    const previous = grouped.get(itemId);
    const item = itemById.get(itemId);
    const value = { itemId, name: item?.name || port.name || itemId, unit: item?.unit || (['liquid', 'gas'].includes(item?.form) ? 'm3' : 'item'),
      perMachineRate: rate, expectedPerMachineRate: number(port.expectedPerMinute, rate * number(port.expectedChance ?? port.chance, 1)), role: port.role, chance: port.chance ?? 1 };
    if (previous) { previous.perMachineRate += rate; previous.expectedPerMachineRate += value.expectedPerMachineRate; }
    else grouped.set(itemId, value);
  }
  return [...grouped.values()];
}

function fraction(value, maxDenominator = 1000000) {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return [0, 1];
  let x = value, h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x), h = a * h1 + h0, k = a * k1 + k0;
    if (!Number.isSafeInteger(h) || k > maxDenominator) break;
    if (Math.abs(h / k - value) <= EPS * Math.max(1, Math.abs(value))) return [h, k];
    [h0, h1, k0, k1] = [h1, h, k1, k];
    const remainder = x - a;
    if (remainder < Number.EPSILON) break;
    x = 1 / remainder;
  }
  return null;
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/** Smallest bounded integer multiplier making every productive machine count integral. */
export function fullClockScale(rows, cap = 10000) {
  let factor = 1;
  for (const row of rows) {
    if (!row.machineId || row.kind === 'import' || row.kind === 'unresolved') continue;
    const q = fraction(row.machineEquivalent);
    if (!q) return { possible: false, factor: null, cap, reason: 'Rates could not be represented accurately enough as bounded fractions.' };
    factor = factor / gcd(factor, q[1]) * q[1];
    if (!Number.isSafeInteger(factor) || factor > cap) return { possible: false, factor: null, exceeds: factor, cap, reason: `The common full-clock multiplier exceeds ${cap}.` };
  }
  return { possible: true, factor, cap, reason: factor === 1 ? 'All productive machine counts are already whole.' : `Multiply every requested output by ${factor}; all productive machine counts then become whole.` };
}

export function solvePlan(inputData, options = {}) {
  const data = normalizeCatalog(inputData);
  const { itemById, machineById, recipeById } = data;
  const diagnostics = [];
  const diagnose = (severity, code, message, details = {}) => diagnostics.push({ severity, code, message, ...details });
  const itemId = value => {
    const id = idOf(value);
    if (itemById.has(id)) return id;
    return data.items.find(item => item.name === id)?.id || id;
  };
  const stage = options.stage == null || options.stage === 'all' ? Infinity : number(options.stage, -1);
  const gateById = byId(data.gates || []);
  const gateSet = options.unlockedGateIds == null ? null : new Set(options.unlockedGateIds);
  const overrides = options.recipeOverrides || {};
  const sourceOverrides = options.sourceOverrides || options.rawSources || {};
  const imports = new Map();
  for (const entry of Array.isArray(options.imports) ? options.imports : Object.entries(options.imports || {}).map(([id, rate]) => ({ itemId: id, rate }))) {
    const id = itemId(entry);
    imports.set(id, typeof entry === 'string' || entry.rate == null || entry.rate === true ? Infinity : number(entry.rate));
  }
  const available = thing => {
    if (thing?.tier != null && number(thing.tier, Infinity) > stage) return false;
    if (options.allowAlternates === false && thing?.alternate) return false;
    const gateChoices = (thing?.gateIds || []).map(id => gateById.get(id)).filter(Boolean).filter(g => g.tier == null || number(g.tier, Infinity) <= stage);
    if (options.allowMam === false && gateChoices.length && gateChoices.every(g => /MAM/i.test(g.kind || ''))) return false;
    if (options.allowMam === false && (thing?.gateGroups || []).some(group => {
      const choices = (Array.isArray(group) ? group : group.anyOf || []).map(id => gateById.get(id)).filter(Boolean);
      return choices.length && choices.every(g => /MAM/i.test(g.kind || ''));
    })) return false;
    if (gateSet && (thing?.gateIds || []).length && !(thing.gateIds || []).some(id => gateSet.has(id))) return false;
    if (gateSet && (thing?.requiredGateIds || []).some(id => !gateSet.has(id))) return false;
    if (gateSet && (thing?.gateGroups || []).some(group => !(Array.isArray(group) ? group : group.anyOf || []).some(id => gateSet.has(id)))) return false;
    return true;
  };
  const targets = new Map();
  const requestedTargets = Array.isArray(options.targets) ? options.targets : Object.entries(options.targets || {}).map(([id, rate]) => ({ itemId: id, rate }));
  for (const target of requestedTargets) {
    const id = itemId(target), rate = Number(target.rate ?? target.perMinute ?? target.amount);
    if (!itemById.has(id)) { diagnose('error', 'unknown-target', `Unknown target item: ${id || '(missing)'}.`); continue; }
    if (!Number.isFinite(rate) || rate <= 0) { diagnose('error', 'invalid-target-rate', `Enter a positive finite rate for ${itemById.get(id).name}.`, { itemId: id }); continue; }
    add(targets, id, rate);
  }
  if (!targets.size) diagnose('error', 'no-targets', 'Add at least one item and a positive output per minute.');
  // Disposal consumables are fresh production demands in this same graph. They
  // are not user exports and must never be supplied by a returned waste stream.
  const suppliedDisposalFeeds = options._diagnosticProbe ? [] : Object.entries(options._disposalSupplies || {})
    .filter(([id, rate]) => itemById.has(id) && finite(rate) && rate > EPS).map(([id, rate]) => [id, Number(rate)]);

  const producers = new Map(), sourceMap = new Map();
  for (const source of data.resourceSources) {
    const id = itemId(source.itemId || source.partId);
    if (!sourceMap.has(id)) sourceMap.set(id, []);
    sourceMap.get(id).push(source);
  }
  for (const recipe of data.recipes) {
    if (recipe.isBuildGunRecipe || recipe.construction || recipe.isCustomization) continue;
    let outputs;
    try { outputs = groupedPorts(recipe, 'outputs', itemById); } catch { continue; }
    for (const port of outputs) {
      if (!producers.has(port.itemId)) producers.set(port.itemId, []);
      producers.get(port.itemId).push(recipe);
    }
  }
  const preferred = data.preferredRecipes || data.meta?.preferredRecipes || {};
  function score(recipe, id) {
    const main = (recipe.outputs || []).find(p => idOf(p) === id)?.role;
    const preference = Array.isArray(preferred[id]) ? preferred[id] : preferred[id] ? [preferred[id]] : [];
    const preferredIndex = preference.indexOf(recipe.id);
    return (preferredIndex >= 0 ? -100000 + preferredIndex * 100 : 0) + (recipe.preferred ? -10000 : 0) + number(recipe.priority) +
      (recipe.name === itemById.get(id)?.name ? -20 : 0) +
      (recipe.alternate ? 1000 : 0) + (recipe.deterministic === false ? 5000 : 0) +
      (['byproduct', 'overflow', 'waste'].includes(main) ? 100 : 0) + number(recipe.tier) * 2;
  }
  const graph = new Map();
  const importNodes = new Map();
  const failed = new Map();
  const maxDepth = number(options.maxDepth, 160);
  let resolutionAttempts = 0;
  const operatingWarnings = new Set();
  function operatingSetting(recipe, machine, components) {
    const requestedClock = options.clockOverrides?.[recipe.id] ?? 100;
    const requestedBoost = options.boostOverrides?.[recipe.id] ?? 0;
    const requestedClockPercent = number(requestedClock, NaN);
    let clockPercent = 100, boostCount = 0;
    const warn = (code, message) => {
      const key = `${recipe.id}:${code}:${message}`;
      if (!operatingWarnings.has(key)) { operatingWarnings.add(key); diagnose('warning', code, `${recipe.name}: ${message}`, { recipeId: recipe.id }); }
    };
    const unlocked = (gateIds, confirmed) => {
      const choices = (gateIds || []).map(id => gateById.get(id)).filter(Boolean);
      return choices.some(g => (g.tier == null || number(g.tier, Infinity) <= stage) && (confirmed === true || gateSet?.has(g.id)));
    };
    const clock = machine.clock || {};
    if (requestedClockPercent !== 100) {
      const gates = clock.unlockGateIds || data.clockPolicy?.unlockGateIds || [];
      if (!Number.isFinite(requestedClockPercent) || requestedClockPercent <= 0) warn('invalid-clock', 'Clock must be a positive percentage; using 100%.');
      else if (!clock.canChange || components.length !== 1 || recipe.assemblyId) warn('unsupported-clock', 'This producer or assembly has no verified adjustable recipe clock; using 100%.');
      else if (!finite(clock.min) || !finite(clock.max) || requestedClockPercent < clock.min * 100 - EPS || requestedClockPercent > clock.max * 100 + EPS) warn('clock-range', `Requested ${requestedClockPercent}% is outside this producer’s verified ${number(clock.min, 1) * 100}–${number(clock.max, 1) * 100}% range; using 100%.`);
      else if (!unlocked(gates, options.clockUnlocked)) warn('clock-unlock-required', `Confirm ${gates.map(id => gateById.get(id)?.name).filter(Boolean).join(' / ') || 'the verified clock research'} at its eligible HUB tier before changing clocks; using 100%.`);
      else if (machine.powerScalesWithClock !== false && !finite(machine.powerExponent)) warn('clock-power-unverified', 'Clock power scaling is not verified for this machine; using 100%.');
      else {
        const shardId = data.clockPolicy?.shardItemId;
        const canMakeShards = shardId && (producers.get(shardId) || []).some(r => r.supported !== false && available(r) && (r.machineIds || []).some(id => machineById.get(id) && available(machineById.get(id))));
        if (requestedClockPercent > 100 && !canMakeShards && !(number(options.availablePowerShards) > 0)) warn('clock-shards-unavailable', 'Overclocking also requires Power Shards. No permitted shard-production recipe or declared shard inventory is available; using 100%.');
        else clockPercent = requestedClockPercent;
      }
    }
    const boost = machine.productionBoost || {};
    if (Number(requestedBoost) !== 0) {
      const count = Number(requestedBoost);
      if (!Number.isInteger(count) || count < 0) warn('invalid-boost-count', 'Somersloop count must be a non-negative integer per machine; using zero.');
      else if (!boost.supported || !boost.canChange || recipe.assemblyId || components.length !== 1) warn('unsupported-production-boost', `${boost.unsupportedReason || 'Production amplification is not verified for this producer or special assembly'}; using zero Somersloops.`);
      else if (count > number(boost.slots)) warn('boost-slot-limit', `This machine supports ${number(boost.slots)} Somersloop slot(s); using zero instead of the requested ${count}.`);
      else if (!unlocked(boost.unlockGateIds || data.productionBoostPolicy?.unlockGateIds, options.boostUnlocked)) warn('boost-unlock-required', 'Confirm the Tier 5 Production Amplifier research before adding Somersloops; using zero.');
      else if (number(boost.baseMultiplier, NaN) !== 1 || !finite(boost.multiplierPerSlot) || !finite(boost.powerExponent)) warn('boost-profile-unverified', 'This amplification formula is not verified; using zero Somersloops.');
      else boostCount = count;
    }
    const outputMultiplier = boostCount ? number(boost.baseMultiplier, 1) + boostCount * number(boost.multiplierPerSlot) : 1;
    return { requestedClockPercent, clockPercent, clockMultiplier: clockPercent / 100,
      powerShardsPerMachine: ceil(Math.max(0, clockPercent / 100 - 1) / number(data.clockPolicy?.shardStepAbove100, .5)),
      boostCount, boostSlots: number(boost.slots), outputMultiplier,
      boostPowerMultiplier: boostCount ? outputMultiplier ** number(boost.powerExponent, 2) : 1 };
  }
  function resolve(id, path = []) {
    if (++resolutionAttempts > number(options.maxResolutionAttempts, 50000)) throw { code: 'search-limit', message: 'Recipe search reached its safety limit. Choose explicit recipes or imports to narrow this network.' };
    if (!itemById.has(id)) throw { code: 'unknown-ingredient', message: `Recipe references an unknown ingredient: ${id}.`, itemId: id };
    const override = overrides[id] ?? overrides[itemById.get(id)?.name];
    // An explicitly selected recipe may consume fresh supplied material of the
    // same name as its output. Keep that import as a separate graph node: never
    // turn the returned output into an input credit or silently skip the recipe.
    if (imports.has(id) && (path.length || !override)) {
      if (!importNodes.has(id)) importNodes.set(id, { id: `import:${id}`, itemId: id, kind: 'import', children: [], inputs: [], outputs: [], capacity: imports.get(id) });
      return importNodes.get(id);
    }
    if (path.includes(id)) throw { code: 'recipe-cycle', message: `Dependency cycle: ${[...path, id].map(x => itemById.get(x)?.name || x).join(' → ')}. Choose a different recipe or declare a deliberate import.`, path: [...path, id] };
    if (path.length >= maxDepth) throw { code: 'dependency-depth', message: `Dependency depth exceeded ${maxDepth}.`, itemId: id };
    if (graph.has(id)) return graph.get(id);
    const requestedSource = sourceOverrides[id] ?? sourceOverrides[itemById.get(id)?.name];
    const sourceCandidates = (sourceMap.get(id) || []).filter(s => !override && s.supported !== false && available(s) && (!requestedSource || s.id === (requestedSource.id || requestedSource)));
    const purityRank = source => source.purity === (options.defaultPurity || 'normal') ? 0 : source.purity === 'pure' ? 1 : 2;
    sourceCandidates.sort((a, b) => (a.preferred ? -1 : 0) - (b.preferred ? -1 : 0) || number(a.tier) - number(b.tier) || purityRank(a) - purityRank(b) || String(a.id).localeCompare(String(b.id)));
    const reasons = [];
    for (const source of sourceCandidates) {
      try {
        const machine = machineById.get(source.machineId);
        if (machine && !available(machine)) continue;
        if (source.sharedInfrastructure) {
          const infrastructure = machineById.get(source.sharedInfrastructure.machineId);
          if (!infrastructure || !available(infrastructure)) throw { code: 'well-pressurizer-locked', message: `${source.name} requires an unlocked Resource Well Pressurizer.`, itemId: id };
          if (source.sharedInfrastructure.groupBy !== 'wellGroupId' || !data.wellGroups?.length) throw { code: 'well-map-missing', message: `${source.name} has no verified core/satellite map for its pressurizer.`, itemId: id };
        }
        const modules = (source.moduleIds || []).map(moduleId => machineById.get(moduleId));
        if (modules.some(module => !module || !available(module))) continue;
        const rate = number(source.ratePerMinute ?? source.perMinute, NaN);
        if (!(rate > 0)) throw { code: 'invalid-source-rate', message: `No verified extraction rate for ${source.name || id}.` };
        const sourceRecipe = { ...source, inputs: source.inputs || [], outputs: source.outputs?.length ? source.outputs : [{ itemId: id, perMinute: rate }] };
        const inputs = groupedPorts(sourceRecipe, 'inputs', itemById), outputs = groupedPorts(sourceRecipe, 'outputs', itemById);
        const children = inputs.map(port => resolve(port.itemId, [...path, id]));
        inputs.forEach((port, i) => { port.sourceId = children[i].id; });
        const components = [machine, ...modules].filter(Boolean).map((m, i) => ({ role: i ? 'module' : 'extractor', machine: m, perAssembly: 1 }));
        const node = { id: `source:${id}`, itemId: id, kind: 'source', source, machine, components, machineId: source.machineId || null, rate, inputs, outputs, children };
        graph.set(id, node); return node;
      } catch (error) { reasons.push({ ...error, message: error.message || String(error), blockedSourceId: error.blockedSourceId || source.id, dependencyPath: error.dependencyPath || [...path, id] }); }
    }
    if (requestedSource) throw reasons[0] || { code: 'unavailable-source', message: `Selected extraction source is missing, unavailable at this stage, or has no valid rate for ${itemById.get(id).name}.`, itemId: id };
    let candidates = (producers.get(id) || []).filter(recipe => available(recipe));
    if (override) candidates = candidates.filter(recipe => recipe.id === override || recipe.name === override);
    else candidates.sort((a, b) => score(a, id) - score(b, id) || String(a.id).localeCompare(String(b.id)));
    for (const recipe of candidates) {
      try {
        if (recipe.supported === false || recipe.excludedFromModeler === true) throw { code: 'unsupported-recipe', message: `${recipe.name} needs a special assembly or mechanic that this catalogue has not resolved.`, recipeId: recipe.id };
        if (recipe.deterministic === false && !options.allowExpectedOutputs) throw { code: 'random-output', message: `${recipe.name} has random output; enable expected-yield planning explicitly or import its product.`, recipeId: recipe.id };
        let inputs = groupedPorts(recipe, 'inputs', itemById), outputs = groupedPorts(recipe, 'outputs', itemById);
        if (recipe.deterministic === false && options.allowExpectedOutputs) outputs = outputs.map(port => ({ ...port, nominalYieldPerMachineRate: port.perMachineRate, perMachineRate: port.expectedPerMachineRate }));
        const output = outputs.find(port => port.itemId === id);
        if (!(output?.perMachineRate > 0)) continue;
        const requestedMachine = options.machineOverrides?.[recipe.id] ?? options.machineOverrides?.[id];
        const machineIds = recipe.machineIds || recipe.producerIds || [];
        const assembly = recipe.assemblyId ? (data.assemblies || []).find(a => a.id === recipe.assemblyId) : null;
        if (assembly && (assembly.verified === false || assembly.unsupportedReason || assembly.powerUnsupportedReason)) throw { code: 'unsupported-assembly', message: `${recipe.name}: ${assembly.unsupportedReason || assembly.powerUnsupportedReason || 'assembly has not been verified'}.`, recipeId: recipe.id };
        const components = [];
        if (assembly?.roles?.length) for (const role of assembly.roles) {
          const component = (role.machineIds || []).map(machineId => machineById.get(machineId)).filter(Boolean).find(m => available(m));
          if (!component) throw { code: 'unavailable-assembly-component', message: `${recipe.name} also needs an unlocked ${role.name || role.id}.`, recipeId: recipe.id };
          components.push({ role: role.id, machine: component, perAssembly: number(role.count ?? role.amount, 1) });
        }
        const machine = components[0]?.machine || machineIds.map(machineId => machineById.get(machineId)).filter(Boolean).find(m => available(m) && (!requestedMachine || m.id === requestedMachine));
        if (!machine) throw { code: 'unavailable-machine', message: `No available supported machine for ${recipe.name}.`, recipeId: recipe.id };
        if (!components.length) components.push({ role: 'producer', machine, perAssembly: 1 });
        for (const moduleId of recipe.requiredModuleMachineIds || []) {
          const module = machineById.get(moduleId);
          if (!module || !available(module)) throw { code: 'unavailable-recipe-module', message: `${recipe.name} requires an unavailable production module.`, recipeId: recipe.id };
          if (!components.some(c => c.machine.id === moduleId)) components.push({ role: 'required-module', machine: module, perAssembly: 1 });
        }
        const operating = operatingSetting(recipe, machine, components);
        inputs = inputs.map(port => ({ ...port, nominalPerMachineRate: port.perMachineRate, perMachineRate: port.perMachineRate * operating.clockMultiplier }));
        outputs = outputs.map(port => ({ ...port, nominalPerMachineRate: port.nominalYieldPerMachineRate ?? port.perMachineRate,
          capacityPerMachineRate: (port.nominalYieldPerMachineRate ?? port.perMachineRate) * operating.clockMultiplier * operating.outputMultiplier,
          perMachineRate: port.perMachineRate * operating.clockMultiplier * operating.outputMultiplier }));
        const children = inputs.map(port => resolve(port.itemId, [...path, id]));
        inputs.forEach((port, i) => { port.sourceId = children[i].id; });
        const node = { id: `produce:${id}`, itemId: id, kind: 'production', recipe, machine, assembly, components, operating,
          machineId: machine.id, rate: outputs.find(port => port.itemId === id).perMachineRate, inputs, outputs, children };
        graph.set(id, node); return node;
      } catch (error) { reasons.push({ ...error, message: error.message || String(error), blockedRecipeId: error.blockedRecipeId || recipe.id, blockedRecipeName: error.blockedRecipeName || recipe.name, dependencyPath: error.dependencyPath || [...path, id] }); }
    }
    const message = override ? `Selected recipe is unavailable for ${itemById.get(id).name}.` : `No permitted complete production or extraction route for ${itemById.get(id).name}.`;
    const error = reasons[0] || { code: override ? 'unavailable-recipe' : 'missing-production-route', message, itemId: id };
    failed.set(id, error); throw error;
  }

  function gateClosure(ids, seen = new Set()) {
    for (const id of ids || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const gate = gateById.get(id);
      if (gate) gateClosure(unique([...(gate.dependencyIds || gate.gateIds || []), ...(gate.dependencyGroups || []).flatMap(g => g.ids || g.anyOf || [])]), seen);
    }
    return [...seen].map(id => gateById.get(id)).filter(Boolean);
  }
  function explainFailure(id, error) {
    const name = itemById.get(id)?.name || id;
    const recipeOptions = (producers.get(id) || []).filter(r => r.supported !== false && r.excludedFromModeler !== true)
      .sort((a, b) => score(a, id) - score(b, id)).map(recipe => {
        const gates = gateClosure(recipe.gateIds || []);
        return { recipeId: recipe.id, name: recipe.name, tier: recipe.tier, alternate: !!recipe.alternate,
          gates: gates.map(g => ({ id: g.id, name: g.name, tier: g.tier, kind: g.kind })),
          bootstrapPayments: gates.flatMap(g => (g.cost || []).filter(cost => cost.itemId === id).map(cost => ({ gateId: g.id, gateName: g.name, itemId: id, amount: cost.amount }))) };
      });
    const selectedOverride = overrides[id] ?? overrides[name];
    const selectedRecipe = selectedOverride ? (producers.get(id) || []).find(r => r.id === selectedOverride || r.name === selectedOverride) : null;
    if (selectedRecipe?.alternate && options.allowAlternates === false) return { ...error, code: 'alternate-disabled',
      message: `${name}: ${selectedRecipe.name} is an alternate recipe and alternate recipes are disabled. Enable them or choose an available standard recipe.`, recipeOptions };
    let earliestProductionTier = null, prerequisiteGates = [], nextRecipe = null, disposalStillRequired = false;
    if (Number.isFinite(stage) && !options._diagnosticProbe) for (let tier = Math.max(0, Math.floor(stage)); tier <= 9; tier++) {
      const probe = solvePlan(data, { ...options, targets: [{ itemId: id, rate: targets.get(id) || 1 }], stage: tier,
        unlockedGateIds: null, exactScale: false, _disposalSupplies: null, _disposalPass: 0, _diagnosticProbe: true });
      const targetRow = probe.rows.find(row => row.id === probe.targets.find(t => t.itemId === id)?.sourceRowId);
      if (targetRow && !['unresolved', 'import'].includes(targetRow.kind) && !probe.rows.some(row => row.kind === 'unresolved')) {
        earliestProductionTier = tier; nextRecipe = targetRow.recipeName || targetRow.sourceName;
        prerequisiteGates = unique(probe.rows.flatMap(row => row.gateDependencies || []).map(g => g.id))
          .map(gateId => gateById.get(gateId)).filter(g => g && (g.tier >= stage || gateSet && !gateSet.has(g.id)));
        disposalStillRequired = probe.diagnostics.some(d => d.code === 'unresolved-overflow'); break;
      }
    }
    if (earliestProductionTier != null) {
      const importantGates = prerequisiteGates.filter(g => g.tier === earliestProductionTier);
      const unlockNames = unique((importantGates.length ? importantGates : prerequisiteGates).map(g => g.name)).slice(0, 4);
      const prefix = earliestProductionTier > stage
        ? `${name} production requires HUB Tier ${earliestProductionTier}; the plan is set to Tier ${stage}.`
        : `${name} has a production route at HUB Tier ${earliestProductionTier}, but its required unlocks are not enabled.`;
      const message = `${prefix} Use ${nextRecipe}${unlockNames.length ? ` after unlocking ${unlockNames.join(', ')}` : ''}.` +
        (disposalStillRequired ? ' Its byproducts still need a separate verified disposal route.' : ' Byproducts remain isolated from production.');
      return { ...error, code: earliestProductionTier > stage ? 'production-tier-locked' : 'production-unlock-locked', message,
        earliestProductionTier, prerequisiteGates, nextRecipe, disposalStillRequired, recipeOptions, missingItemId: error.itemId !== id ? error.itemId : null };
    }
    const missingItemId = error.itemId && error.itemId !== id ? error.itemId : null;
    return { ...error, message: missingItemId ? `${name} cannot be completed because ${itemById.get(missingItemId)?.name || missingItemId} is unavailable. ${error.message}` : error.message,
      missingItemId, earliestProductionTier, recipeOptions };
  }

  const roots = [], targetNodes = new Map(), disposalFeedNodes = new Map();
  for (const id of targets.keys()) {
    try { const node = resolve(id); roots.push(node); targetNodes.set(id, node); }
    catch (error) {
      const detail = options._diagnosticProbe ? error : explainFailure(id, error);
      diagnose('error', detail.code || 'resolution-failed', detail.message || String(error), { ...detail, itemId: id, targetItemId: id });
      const node = { id: `unresolved:${id}`, itemId: id, kind: 'unresolved', children: [], inputs: [], outputs: [] };
      graph.set(id, node); roots.push(node); targetNodes.set(id, node);
    }
  }
  for (const [id] of suppliedDisposalFeeds) {
    try {
      // Like any other ingredient, a declared fresh import wins here even when
      // the user also requests this item from an explicit manufacturing recipe.
      const node = resolve(id, ['@fresh-disposal-supply']);
      roots.push(node); disposalFeedNodes.set(id, node);
    } catch (error) {
      const detail = options._diagnosticProbe ? error : explainFailure(id, error);
      diagnose('error', detail.code || 'disposal-supply-unavailable', `Fresh disposal supply: ${detail.message || String(error)}`, { ...detail, itemId: id, disposalSupply: true });
      const node = { id: `unresolved:${id}`, itemId: id, kind: 'unresolved', children: [], inputs: [], outputs: [] };
      roots.push(node); disposalFeedNodes.set(id, node);
    }
  }
  const ordered = [], seen = new Set();
  function visit(node) { if (seen.has(node.id)) return; seen.add(node.id); for (const child of node.children) visit(child); ordered.push(node); }
  roots.forEach(visit);
  const demands = new Map();
  for (const [id, rate] of targets) add(demands, targetNodes.get(id).id, rate);
  for (const [id, rate] of suppliedDisposalFeeds) add(demands, disposalFeedNodes.get(id).id, rate);
  for (const node of [...ordered].reverse()) {
    const demand = demands.get(node.id) || 0;
    if (!node.rate) continue;
    for (const port of node.inputs) add(demands, port.sourceId, demand / node.rate * port.perMachineRate);
  }
  function powerOf(node) {
    if (!node.source && node.components?.length > 1) {
      const powers = node.components.map(component => ({ ...powerOf({ recipe: node.recipe, machine: component.machine, machineId: component.machine.id }), count: component.perAssembly }));
      return { mean: powers.some(p => p.mean == null) ? null : sum(powers.map(p => p.mean * p.count)), peak: powers.some(p => p.peak == null) ? null : sum(powers.map(p => p.peak * p.count)) };
    }
    const producer = (node.recipe?.producerPower || []).find(p => (p.machineId || p.producerId) === node.machineId);
    const base = producer || node.source || node.machine || {};
    const mean = base.powerMW ?? base.averageMW ?? base.average ?? node.machine?.powerMW;
    const peak = base.maxPowerMW ?? base.maxMW ?? base.max ?? node.machine?.maxPowerMW ?? mean;
    const clockPower = node.operating && node.machine?.powerScalesWithClock !== false ? node.operating.clockMultiplier ** number(node.machine?.powerExponent, 1) : 1;
    const multiplier = clockPower * (node.operating?.boostPowerMultiplier || 1);
    return { mean: finite(mean) ? number(mean) * multiplier : null, peak: finite(peak) ? number(peak) * multiplier : null };
  }
  const allocatedNodes = new Set();
  const unverifiedWellRows = new Set();
  const rows = ordered.map(node => {
    const item = itemById.get(node.itemId), demand = demands.get(node.id) || 0;
    const equivalent = node.rate ? demand / node.rate : 0, minimumCount = node.machineId ? ceil(equivalent) : 0;
    const explicitAllocation = node.source?.nodeRequired ? options.nodeAllocations?.[node.source.id] : null;
    const explicitIds = explicitAllocation == null ? [] : Array.isArray(explicitAllocation) ? explicitAllocation : [explicitAllocation];
    const count = Math.max(minimumCount, explicitIds.length);
    const p = powerOf(node);
    const row = { id: node.id, kind: node.kind, itemId: node.itemId, itemName: item.name, unit: item.unit || 'item', outputRate: demand,
      recipeId: node.recipe?.id || null, recipeName: node.recipe?.name || null,
      sourceId: node.source?.id || null, sourceName: node.source?.name || null,
      machineId: node.machineId || null, machineName: node.machine?.name || node.source?.machineName || null, machine: node.machine || null,
      assemblyId: node.assembly?.id || null, assemblyKind: node.assembly?.kind || null,
      components: (node.components || []).map(component => ({ role: component.role, machineId: component.machine.id, machineName: component.machine.name, machine: component.machine, perAssembly: component.perAssembly, machineCount: count * component.perAssembly })),
      machineCount: count, machineEquivalent: equivalent, dutyCycle: count ? equivalent / count : 0, dutyPercent: count ? equivalent / count * 100 : 0,
      clockPercent: node.operating?.clockPercent || 100, requestedClockPercent: node.operating?.requestedClockPercent || 100,
      clockMinPercent: number(node.machine?.clock?.min, 1) * 100, clockMaxPercent: number(node.machine?.clock?.max, 1) * 100,
      powerShardsPerMachine: node.operating?.powerShardsPerMachine || 0, powerShards: count * (node.operating?.powerShardsPerMachine || 0),
      boostCount: node.operating?.boostCount || 0, boostSlots: node.operating?.boostSlots || 0,
      outputMultiplier: node.operating?.outputMultiplier || 1, somersloops: count * (node.operating?.boostCount || 0),
      inputs: node.inputs.map(port => ({ ...port, rate: port.perMachineRate * equivalent })),
      outputs: node.outputs.map(port => ({ ...port, rate: port.perMachineRate * equivalent,
        expectedPerMachineRate: port.perMachineRate, perMachineRate: port.capacityPerMachineRate ?? port.perMachineRate,
        role: port.itemId === node.itemId ? 'product' : 'overflow' })),
      expectedYield: node.recipe?.deterministic === false,
      operatingRequirements: node.recipe?.operatingRequirements || (node.assembly?.hatcheryProfile ? { temperature: node.assembly.hatcheryProfile.temperature, humidity: node.assembly.hatcheryProfile.humidity } : null),
      approximateYieldItemIds: node.assembly?.hatcheryProfile?.approximateChancePartIds || [],
      children: node.children.map(child => child.id), source: node.recipe?.source || node.source?.source || null,
      gateIds: node.recipe?.gateIds || node.source?.gateIds || [], tier: node.recipe?.tier ?? node.source?.tier,
      gateDependencies: unique([...(node.recipe?.gateIds || node.source?.gateIds || []), ...(node.machine?.gateIds || []), ...(node.components || []).flatMap(c => c.machine.gateIds || [])]).map(id => gateById.get(id)).filter(Boolean),
      power: { perMachineMW: p.mean, perMachineMaxMW: p.peak, averageMW: p.mean == null ? null : equivalent * p.mean, installedPeakMW: p.peak == null ? null : count * p.peak },
      extraction: node.source ? { ...node.source, requiredRate: demand, requiredMachines: count, minimumMachines: minimumCount } : null };
    row.operatingGateIds = unique([...(row.clockPercent !== 100 ? node.machine?.clock?.unlockGateIds || data.clockPolicy?.unlockGateIds || [] : []),
      ...(row.boostCount ? node.machine?.productionBoost?.unlockGateIds || data.productionBoostPolicy?.unlockGateIds || [] : [])]);
    row.gateDependencies = unique([...row.gateDependencies.map(g => g.id), ...row.operatingGateIds]).map(id => gateById.get(id)).filter(Boolean);
    if (node.source?.nodeRequired) {
      const origin = options.origin || { x: 2700, y: -1950 };
      const isWell = !!node.source.sharedInfrastructure;
      const eligibleNodes = (data.nodes || []).filter(n => n.itemId === node.itemId && (!node.source.purity || n.purity === node.source.purity) && !n.loot && n.extractable !== false && (isWell ? !!n.wellGroupId : !n.wellGroupId))
        .map(n => ({ ...n, distanceM: Math.hypot(n.x - origin.x, n.y - origin.y) })).sort((a, b) => a.distanceM - b.distanceM);
      const selectedIds = options.nodeAllocations?.[node.source.id] || (node.source.nodeId ? [node.source.nodeId] : []);
      const selected = Array.isArray(selectedIds) ? selectedIds : [selectedIds];
      row.extraction.availableMatchingNodes = eligibleNodes.length;
      row.extraction.suggestedNodes = eligibleNodes.slice(0, Math.min(Math.max(count, 3), 30));
      row.extraction.allocatedNodes = selected.map(id => (data.nodes || []).find(n => n.id === id)).filter(Boolean);
      row.extraction.allocationStatus = selected.length ? 'explicit' : 'unallocated';
      if (isWell && !selected.length) {
        const groups = new Map();
        for (const candidate of eligibleNodes) {
          if (!(data.wellGroups || []).some(g => g.id === candidate.wellGroupId && g.satelliteNodeIds.includes(candidate.id))) continue;
          if (!groups.has(candidate.wellGroupId)) groups.set(candidate.wellGroupId, []);
          groups.get(candidate.wellGroupId).push(candidate);
        }
        const orderedGroups = [...groups.values()].sort((a, b) => Number(b.length >= count) - Number(a.length >= count) ||
          (a.length >= count && b.length >= count ? a[0].distanceM - b[0].distanceM : b.length - a.length || a[0].distanceM - b[0].distanceM));
        row.extraction.allocatedNodes = orderedGroups.flatMap(group => group).slice(0, count);
        row.extraction.allocationStatus = 'suggested';
        diagnose('info', 'suggested-well-allocation', `${row.sourceName}: capacity and pressurizer power use the suggested real satellite nodes. Confirm those sites or select another allocation.`, { rowId: row.id });
      }
      if (selected.length) {
        if (selected.length < count) diagnose('error', 'node-capacity', `${row.sourceName} needs ${count} nodes; only ${selected.length} were allocated.`, { rowId: row.id });
        for (const id of selected) {
          if (!eligibleNodes.some(n => n.id === id)) diagnose('error', 'invalid-node', `${id} is not a matching ${node.source.purity || ''} ${item.name} resource node.`, { rowId: row.id, nodeId: id });
          if (allocatedNodes.has(id)) diagnose('error', 'duplicate-node', `${id} is allocated to more than one extraction source.`, { rowId: row.id, nodeId: id });
          allocatedNodes.add(id);
        }
      }
      if (data.nodes?.length && count > eligibleNodes.length) {
        const anyWellSites = (data.nodes || []).some(n => n.itemId === node.itemId && n.wellGroupId && n.extractable !== false);
        if (isWell && !anyWellSites) diagnose('error', 'well-nodes-unmapped', `${item.name}: the extraction profile has a verified rate, but this map export contains no matching well satellites. A real core/satellite allocation cannot be completed. Use an explicit external supply or provide verified node data.`, { rowId: row.id, itemId: node.itemId });
        else diagnose('error', 'world-node-capacity', `${row.sourceName} needs ${count} nodes; the map export contains only ${eligibleNodes.length} matching nodes. Choose another source or purity.`, { rowId: row.id });
      }
      if (isWell && row.extraction.allocatedNodes.length < count) unverifiedWellRows.add(row.id);
    }
    if (node.kind === 'import') {
      row.importCapacity = node.capacity;
      if (demand > node.capacity + EPS) diagnose('error', 'import-deficit', `${item.name} import is short by ${(demand - node.capacity).toFixed(4)} ${row.unit}/min.`, { itemId: node.itemId, required: demand, available: node.capacity });
    }
    if (node.source?.manual || node.source?.collection) diagnose('warning', 'manual-resource', `${item.name} requires manual collection at ${demand.toFixed(4)} ${row.unit}/min; this is not an unattended extraction line.`, { rowId: row.id });
    const maxMachines = node.source?.maxMachines ?? node.source?.availableNodes ?? node.machine?.buildingLimit;
    if (finite(maxMachines) && maxMachines != null && count > Number(maxMachines)) diagnose('error', 'source-capacity', `${row.sourceName || row.machineName} needs ${count} machines, but only ${maxMachines} are available.`, { rowId: row.id });
    if (node.source?.nodeRequired && !node.source.nodeId && !options.nodeAllocations?.[node.source.id]) diagnose('warning', 'node-allocation-required', `Allocate ${count} ${node.source.purity || ''} node(s) to ${row.sourceName}; extraction capacity is a design requirement, not a reserved map site.`, { rowId: row.id });
    if (node.recipe?.deterministic === false) diagnose('warning', 'expected-output-only', `${row.recipeName} uses expected random yields. Rates and duty are not a guaranteed delivery schedule; transport and disposal use the full nominal output burst.`, { rowId: row.id });
    if (row.approximateYieldItemIds.length) diagnose('warning', 'approximate-output-chance', `${row.recipeName}: the catalogue marks the chances for ${row.approximateYieldItemIds.map(id => itemById.get(id)?.name || id).join(', ')} as approximate lower-bound estimates. Treat those expected yields as provisional.`, { rowId: row.id, itemIds: row.approximateYieldItemIds });
    if (row.operatingRequirements) {
      const t = row.operatingRequirements.temperature, h = row.operatingRequirements.humidity;
      const display = value => Number(Number(value).toFixed(4));
      diagnose('warning', 'biological-operating-conditions', `${row.recipeName}: maintain${t ? ` ${display(t.min)}–${display(t.max)} °C` : ' the required temperature'}${h ? ` and ${display(h.min * 100)}–${display(h.max * 100)}% humidity` : ''}. Rates cover active operation; day/night availability, environmental control-module power and finite founder stock are not guaranteed by this calculation. Consumed adults/eggs must be supplied explicitly.`, { rowId: row.id });
    }
    if (count && (p.mean == null || p.peak == null)) diagnose('warning', 'unknown-power', `Power data is incomplete for ${row.machineName || row.sourceName}.`, { rowId: row.id });
    return row;
  });

  const infrastructureRows = new Map();
  for (const row of [...rows]) {
    const requirement = row.extraction?.sharedInfrastructure;
    if (!requirement) continue;
    row.infrastructureIds = [];
    for (const satellite of row.extraction.allocatedNodes || []) {
      const well = (data.wellGroups || []).find(g => g.id === satellite.wellGroupId && g.satelliteNodeIds.includes(satellite.id));
      const core = well && (data.nodes || []).find(n => n.id === well.coreNodeId && n.extractable === false);
      const machine = machineById.get(requirement.machineId);
      if (!well || !core || !machine || well.pressurizerMachineId !== machine.id) {
        unverifiedWellRows.add(row.id);
        diagnose('error', 'well-core-mismatch', `${row.sourceName}: satellite ${satellite.id} has no matching verified pressurizer core.`, { rowId: row.id, nodeId: satellite.id }); continue;
      }
      const infrastructureId = `well-infrastructure:${well.id}`;
      if (!row.infrastructureIds.includes(infrastructureId)) row.infrastructureIds.push(infrastructureId);
      if (!infrastructureRows.has(infrastructureId)) {
        const count = number(requirement.countPerGroup, 1), p = powerOf({ machine, machineId: machine.id });
        infrastructureRows.set(infrastructureId, { id: infrastructureId, kind: 'infrastructure', itemId: row.itemId,
          itemName: `${row.itemName} well pressurization`, unit: row.unit, outputRate: 0, recipeId: null, recipeName: null,
          sourceId: null, sourceName: `Pressurize ${row.itemName} well ${well.id}`, machineId: machine.id, machineName: machine.name, machine,
          components: [{ role: 'shared-pressurizer', machineId: machine.id, machineName: machine.name, machine, perAssembly: 1, machineCount: count }],
          machineCount: count, machineEquivalent: count, dutyCycle: 1, dutyPercent: 100, clockPercent: 100,
          inputs: [], outputs: [], children: [], gateIds: machine.gateIds || [], gateDependencies: gateClosure(machine.gateIds || []), tier: machine.tier,
          power: { perMachineMW: p.mean, perMachineMaxMW: p.peak, averageMW: p.mean == null ? null : p.mean * count, installedPeakMW: p.peak == null ? null : p.peak * count },
          extraction: { nodeRequired: true, nodeId: core.id, wellGroupId: well.id, allocatedNodes: [core], satelliteNodeIds: [],
            allocationStatus: row.extraction.allocationStatus, sharedBySourceIds: [], source: well.source },
          source: machine.source });
      }
      const shared = infrastructureRows.get(infrastructureId);
      if (!shared.extraction.satelliteNodeIds.includes(satellite.id)) shared.extraction.satelliteNodeIds.push(satellite.id);
      if (!shared.extraction.sharedBySourceIds.includes(row.id)) shared.extraction.sharedBySourceIds.push(row.id);
    }
    row.children.push(...row.infrastructureIds);
  }
  rows.unshift(...infrastructureRows.values());

  const routes = [];
  for (const row of rows) for (const port of row.inputs) routes.push({ from: port.sourceId, to: row.id, itemId: port.itemId, name: port.name, unit: port.unit, rate: port.rate, kind: 'input' });
  for (const [id, rate] of targets) routes.push({ from: targetNodes.get(id)?.id, to: `target:${id}`, itemId: id, name: itemById.get(id).name, unit: itemById.get(id).unit || 'item', rate, kind: 'target' });

  const overflow = [], disposalRows = [], disposalSupplies = new Map();
  const sink = data.machines.find(machine => /^(AWESOME )?Sink$/i.test(machine.name) && available(machine));
  const beltCapacity = number(options.beltCapacity, number(data.meta?.defaultBeltCapacity, 60));
  const solidTerminal = port => sink && port.unit !== 'm3' && itemById.get(port.itemId)?.canSink;
  const wasteRecipeCandidates = data.recipes.filter(recipe => available(recipe) && recipe.supported !== false && recipe.deterministic !== false && !recipe.requiredModuleMachineIds?.length)
    .map(recipe => {
      const assembly = recipe.assemblyId ? (data.assemblies || []).find(a => a.id === recipe.assemblyId) : null;
      if (assembly?.roles?.length > 1 || assembly?.unsupportedReason) return null;
      const machine = (recipe.machineIds || recipe.producerIds || []).map(id => machineById.get(id)).find(m => m && available(m));
      if (!machine) return null;
      try { return { recipe, machine, inputs: groupedPorts(recipe, 'inputs', itemById), outputs: groupedPorts(recipe, 'outputs', itemById) }; } catch { return null; }
    }).filter(Boolean);
  const wastePlanCache = new Map();
  function wastePlan(id, path = []) {
    if (path.includes(id) || path.length > 8) return null;
    const item = itemById.get(id);
    if (solidTerminal({ itemId: id, unit: item?.unit })) return { method: 'sink', machine: sink, capacity: beltCapacity, outputs: [], fresh: [] };
    if (wastePlanCache.has(id)) return wastePlanCache.get(id);
    const candidates = wasteRecipeCandidates.filter(p => p.inputs.some(input => input.itemId === id));
    const make = (p, method) => ({ ...p, method, capacity: p.inputs.find(input => input.itemId === id).perMachineRate, fresh: p.inputs.filter(input => input.itemId !== id) });
    let plan = candidates.find(p => p.inputs.length === 1 && p.outputs.every(solidTerminal));
    if (plan) plan = make(plan, plan.outputs.length ? 'treatment-to-sink' : 'disposal-recipe');
    if (!plan && options.autoWastePackaging !== false && !options._diagnosticProbe) {
      const packaged = candidates.find(p => /^Packaged /i.test(p.recipe.name) && !p.recipe.assemblyId && p.outputs.length && p.outputs.every(solidTerminal) &&
        p.inputs.some(input => input.itemId !== id) && p.inputs.filter(input => input.itemId !== id).every(input => input.unit !== 'm3' && /^Empty (Canister|Fluid Tank|Cryo Tank)$/i.test(input.name)));
      if (packaged) plan = make(packaged, 'packaging-to-sink');
    }
    if (!plan && options.autoWasteTreatment !== false && !options._diagnosticProbe) {
      // Audited, non-radioactive one-way chains only. Each extra ingredient is
      // fresh supply, and every output must terminate in a Sink or stack.
      const vetted = candidates.filter(p => !p.recipe.assemblyId && (/^Cast /.test(p.recipe.name) || p.recipe.name === 'Distilled Silica' || p.recipe.name === 'Molten Magnitar™'))
        .sort((a, b) => Number(!!a.recipe.alternate) - Number(!!b.recipe.alternate) || a.inputs.length - b.inputs.length);
      const treatment = vetted.find(p => p.outputs.length && p.outputs.every(output => wastePlan(output.itemId, [...path, id])));
      if (treatment) plan = make(treatment, 'isolated-treatment');
    }
    if (plan) wastePlanCache.set(id, plan);
    return plan || null;
  }
  const wasteQueue = rows.flatMap(row => row.outputs.filter(p => p.role === 'overflow' && p.rate > EPS).map(port => ({ row, port })));
  for (const { row, port } of wasteQueue) {
    const item = itemById.get(port.itemId);
    const disposal = { id: `overflow:${row.id}:${port.itemId}`, from: row.id, ...port, method: 'unresolved', machineId: null, machineCount: 0, reason: null };
    const plan = wastePlan(port.itemId);
    const disposalRecipe = plan?.recipe, machine = plan?.machine, treatmentOutputs = plan?.outputs || [], freshDisposalInputs = plan?.fresh || [];
    if (plan) { disposal.method = plan.method; disposal.capacityPerMachine = plan.capacity; }
    if (machine && disposal.capacityPerMachine > 0) {
      const equiv = port.rate / disposal.capacityPerMachine;
      const burstRate = Math.max(port.rate, port.perMachineRate * row.machineCount);
      const count = ceil(burstRate / disposal.capacityPerMachine);
      const p = powerOf({ machine, machineId: machine.id, recipe: disposalRecipe });
      Object.assign(disposal, { machineId: machine.id, machineCount: count, burstRate, recipeId: disposalRecipe?.id || null, recipeName: disposalRecipe?.name || 'AWESOME Sink' });
      // Each lane receives its own outlet. This conservative layout does not assume
      // mixed overflow can be merged without exceeding its transport capacity.
      const treatmentProducts = treatmentOutputs.map(out => ({ ...out, rate: out.perMachineRate * equiv, role: 'overflow' }));
      const freshInputs = freshDisposalInputs.map(input => {
        const rate = input.perMachineRate * equiv;
        add(disposalSupplies, input.itemId, rate);
        const sourceId = disposalFeedNodes.get(input.itemId)?.id;
        routes.push({ from: sourceId, to: disposal.id, itemId: input.itemId, name: input.name, unit: input.unit, rate, kind: 'input', purpose: 'fresh-disposal-consumable' });
        return { ...input, rate, sourceId };
      });
      const treatmentRow = { id: disposal.id, kind: 'disposal', itemId: port.itemId, itemName: port.name, unit: port.unit,
        outputRate: 0, recipeId: disposalRecipe?.id || null, recipeName: disposal.recipeName,
        machineId: machine.id, machineName: machine.name, machine, machineCount: count, machineEquivalent: equiv,
        dutyCycle: count ? equiv / count : 0, dutyPercent: count ? equiv / count * 100 : 0, clockPercent: 100,
        inputs: [{ ...port, perMachineRate: disposal.capacityPerMachine, sourceId: row.id }, ...freshInputs], outputs: treatmentProducts, children: unique([row.id, ...freshInputs.map(input => input.sourceId).filter(Boolean)]),
        gateIds: disposalRecipe?.gateIds?.length ? disposalRecipe.gateIds : machine.gateIds || [], tier: Math.max(number(disposalRecipe?.tier), number(machine.tier)),
        power: { perMachineMW: p.mean, perMachineMaxMW: p.peak,
          averageMW: p.mean == null ? null : (disposal.method === 'sink' ? count : equiv) * p.mean,
          installedPeakMW: p.peak == null ? null : count * p.peak } };
      disposalRows.push(treatmentRow);
      const treatmentSolids = treatmentProducts.filter(solidTerminal);
      for (const output of treatmentProducts.filter(output => !solidTerminal(output))) wasteQueue.push({ row: treatmentRow, port: output });
      if (treatmentSolids.length) {
        const sinkId = `${disposal.id}:terminal-sink`;
        const totalRate = sum(treatmentSolids.map(out => out.rate));
        const busyTotal = sum(treatmentSolids.map(out => out.perMachineRate)) * count;
        const sinkCount = ceil(busyTotal / beltCapacity), sinkEquivalent = totalRate / beltCapacity;
        const sp = powerOf({ machine: sink, machineId: sink.id });
        disposalRows.push({ id: sinkId, kind: 'disposal', itemId: port.itemId, itemName: `${port.name} treatment solids`, unit: 'item',
          outputRate: 0, recipeId: null, recipeName: 'Sink all treatment products', machineId: sink.id, machineName: sink.name, machine: sink,
          machineCount: sinkCount, machineEquivalent: sinkEquivalent, dutyCycle: sinkCount ? sinkEquivalent / sinkCount : 0,
          dutyPercent: sinkCount ? sinkEquivalent / sinkCount * 100 : 0, clockPercent: 100,
          inputs: treatmentSolids.map(out => ({ ...out, perMachineRate: beltCapacity * out.rate / totalRate, sourceId: disposal.id })), outputs: [], children: [disposal.id],
          gateIds: sink.gateIds || [], tier: sink.tier,
          power: { perMachineMW: sp.mean, perMachineMaxMW: sp.peak, averageMW: sp.mean == null ? null : sinkCount * sp.mean, installedPeakMW: sp.peak == null ? null : sinkCount * sp.peak } });
        for (const out of treatmentSolids) {
          overflow.push({ id: `${sinkId}:${out.itemId}`, from: disposal.id, ...out, method: 'sink', machineId: sink.id, machineCount: sinkCount,
            sharedSinkRowId: sinkId, recipeName: 'AWESOME Sink', reason: null });
          routes.push({ from: disposal.id, to: sinkId, itemId: out.itemId, name: out.name, unit: out.unit, rate: out.rate, kind: 'overflow', method: 'sink' });
        }
      }
    } else {
      disposal.reason = item?.canSink && port.unit !== 'm3' ? 'A sink is not unlocked at this stage.' : 'No verified direct disposal route in this catalogue.';
      diagnose('error', 'unresolved-overflow', `${port.rate.toFixed(4)} ${port.unit}/min ${port.name}: ${disposal.reason} Finite storage is not a permanent disposal solution.`, { rowId: row.id, itemId: port.itemId });
    }
    overflow.push(disposal);
    routes.push({ from: row.id, to: disposal.id, itemId: port.itemId, name: port.name, unit: port.unit, rate: port.rate, kind: 'overflow', method: disposal.method });
  }

  const previousDisposalSupplies = new Map(suppliedDisposalFeeds);
  const supplyIds = unique([...disposalSupplies.keys(), ...previousDisposalSupplies.keys()]);
  const disposalFeedsChanged = supplyIds.some(id => Math.abs((disposalSupplies.get(id) || 0) - number(previousDisposalSupplies.get(id))) > EPS * Math.max(1, disposalSupplies.get(id) || 0));
  if (disposalFeedsChanged) {
    if (number(options._disposalPass) < 24) return solvePlan(data, { ...options,
      _disposalPass: number(options._disposalPass) + 1, _disposalSupplies: Object.fromEntries(disposalSupplies) });
    const fallback = solvePlan(data, { ...options, autoWastePackaging: false, autoWasteTreatment: false, _disposalSupplies: null, _disposalPass: 0 });
    fallback.diagnostics.push({ severity: 'warning', code: 'disposal-supply-convergence', message: 'Fresh waste-treatment supply did not converge within the safety bound. Automatic treatment with extra inputs was not applied; remaining waste is explicitly unresolved. Choose another fresh supply recipe or declare a deliberate external supply.' });
    return fallback;
  }
  if (disposalSupplies.size) diagnose('info', 'fresh-disposal-supply', 'Isolated waste treatment uses fresh ingredients made by the listed upstream factory or supplied by your explicit imports. Every treatment product goes to a dedicated Sink, stack or terminal treatment step; none return to production. Disposal equipment runs at 100% when fed.', { supplies: [...disposalSupplies].map(([id, rate]) => ({ itemId: id, name: itemById.get(id)?.name || id, rate })) });

  const expectedYieldRows = rows.filter(row => row.expectedYield);
  const exact = expectedYieldRows.length ? { possible: false, factor: null, cap: number(options.exactScaleCap, 10000), reason: 'Random yields cannot guarantee a continuous exact machine ratio. Use the expected-yield plan with buffers and a contingency.' } : fullClockScale(rows, number(options.exactScaleCap, 10000));
  if (options.exactScale && !options._scaled) {
    if (exact.possible && exact.factor > 1) {
      const scaled = solvePlan(data, { ...options, _scaled: true, _disposalPass: 0, _disposalSupplies: null, targets: [...targets].map(([itemId, rate]) => ({ itemId, rate: rate * exact.factor })) });
      scaled.exactScale = { ...exact, applied: true, originalTargets: [...targets].map(([itemId, rate]) => ({ itemId, rate })) };
      return scaled;
    }
    if (!exact.possible) diagnose('warning', 'full-clock-scale-cap', exact.reason);
  }
  const allRows = [...rows, ...disposalRows];
  const powerRows = allRows.filter(row => row.machineCount > 0);
  const materialBalance = new Map();
  for (const row of allRows) {
    if (row.kind === 'import') add(materialBalance, row.itemId, row.outputRate);
    for (const port of row.outputs) add(materialBalance, port.itemId, port.rate);
    for (const port of row.inputs) add(materialBalance, port.itemId, -port.rate);
  }
  for (const [id, rate] of targets) add(materialBalance, id, -rate);
  for (const port of overflow.filter(out => out.method === 'unresolved')) add(materialBalance, port.itemId, -port.rate);
  const residuals = [...materialBalance].filter(([id, rate]) => Math.abs(rate) > EPS * Math.max(1, sum(rows.filter(row => row.itemId === id).map(row => row.outputRate))))
    .map(([id, rate]) => ({ itemId: id, name: itemById.get(id)?.name || id, rate }));
  if (residuals.length && !rows.some(row => row.kind === 'unresolved')) diagnose('error', 'material-balance', 'Catalogue source rates and their output ports disagree; the plan has an unresolved material balance.', { residuals });
  const construction = new Map();
  for (const row of allRows) {
    if (row.extraction?.cost) for (const cost of row.extraction.cost) add(construction, itemId(cost), number(cost.amount) * row.machineCount);
    else for (const component of row.components?.length ? row.components : [{ machine: row.machine, machineCount: row.machineCount }]) {
      for (const cost of component.machine?.cost || []) add(construction, itemId(cost), number(cost.amount) * component.machineCount);
    }
  }
  const operatingResources = { powerShards: sum(rows.map(row => row.powerShards || 0)), somersloops: sum(rows.map(row => row.somersloops || 0)) };
  if (operatingResources.powerShards && data.clockPolicy?.shardItemId) add(construction, data.clockPolicy.shardItemId, operatingResources.powerShards);
  if (operatingResources.somersloops && data.productionBoostPolicy?.itemId) add(construction, data.productionBoostPolicy.itemId, operatingResources.somersloops);
  if (finite(options.availablePowerShards) && operatingResources.powerShards > Number(options.availablePowerShards)) diagnose('error', 'power-shard-inventory', `This clock configuration needs ${operatingResources.powerShards} Power Shards; declared inventory is ${options.availablePowerShards}. Add shards or lower clocks.`);
  if (finite(options.availableSomersloops) && operatingResources.somersloops > Number(options.availableSomersloops)) diagnose('error', 'somersloop-inventory', `This amplification configuration needs ${operatingResources.somersloops} Somersloops; declared inventory is ${options.availableSomersloops}. Add Somersloops or lower amplification.`);
  if (operatingResources.powerShards || operatingResources.somersloops) diagnose('info', 'operating-build-inventory', `Install ${operatingResources.powerShards} Power Shards and ${operatingResources.somersloops} Somersloops across the physical machines. These finite items are included in the construction bill; their production and research payments are separate.`);
  const transportCapacity = unit => Math.max(EPS, unit === 'm3' ? number(options.pipeCapacity, 150) : beltCapacity);
  const productionById = new Map(allRows.map(row => [row.id,row]));
  for (const route of routes) {
    const producer = productionById.get(route.from);
    const consumer = productionById.get(route.to);
    const outlet = producer?.outputs.find(port=>port.itemId===route.itemId);
    const inlet = consumer?.inputs.find(port=>port.itemId===route.itemId);
    const share = outlet?.rate > 0 ? Math.min(1,route.rate / outlet.rate) : 1;
    const send = outlet ? outlet.perMachineRate * producer.machineCount * share : 0;
    const receive = inlet ? inlet.perMachineRate * consumer.machineCount : 0;
    route.designRate = Math.max(route.rate,send,receive);
    route.minimumParallelLanes = ceil(route.designRate / transportCapacity(route.unit));
  }
  for (const row of allRows) for (const port of [...row.inputs, ...row.outputs]) {
    if (port.perMachineRate > transportCapacity(port.unit) + EPS) diagnose('warning', 'single-machine-transport', `${row.machineName || row.sourceName}: one configured-clock ${port.name} stream is ${port.perMachineRate.toFixed(4)} ${port.unit}/min, above the selected ${transportCapacity(port.unit)}/min transport. Verify separate physical ports or upgrade that connection; parallel trunk belts alone do not fix one restricted port.`, { rowId: row.id, itemId: port.itemId });
  }
  if (!gateSet && Number.isFinite(stage)) diagnose('info', 'tier-gates-only', 'Tier filtering is active. MAM, milestone and coupon prerequisites still need the gate IDs shown on each recipe; tier selection alone does not pay those unlocks.');
  const errors = diagnostics.filter(d => d.severity === 'error');
  const result = {
    status: errors.length ? rows.some(row => row.kind !== 'unresolved') ? 'partial' : 'blocked' : expectedYieldRows.length ? 'estimated' : 'solved',
    certainty: expectedYieldRows.length ? 'expected-yield' : 'deterministic', expectedYieldRows: expectedYieldRows.map(row => row.id),
    version: data.version || data.dataVersion || null, stage: Number.isFinite(stage) ? stage : null,
    targets: [...targets].map(([id, rate]) => ({ itemId: id, name: itemById.get(id).name, unit: itemById.get(id).unit || 'item', rate, sourceRowId: targetNodes.get(id)?.id })),
    rows, steps: rows, disposalRows, disposalSupplies: [...disposalSupplies].map(([id, rate]) => ({ itemId: id, name: itemById.get(id)?.name || id, rate })), disposalSupplyPasses: number(options._disposalPass), infrastructureRows: [...infrastructureRows.values()], routes, overflow,
    sources: rows.filter(row => row.kind === 'source'), imports: rows.filter(row => row.kind === 'import'),
    unresolved: rows.filter(row => row.kind === 'unresolved'),
    power: { averageMW: sum(powerRows.map(row => row.power.averageMW || 0)), installedPeakMW: sum(powerRows.map(row => row.power.installedPeakMW || 0)),
      complete: !unverifiedWellRows.size && powerRows.every(row => row.power.averageMW != null && row.power.installedPeakMW != null),
      unknownRows: unique([...unverifiedWellRows, ...powerRows.filter(row => row.power.averageMW == null || row.power.installedPeakMW == null).map(row => row.id)]),
      note: 'Productive average excludes startup, idle draw and generator fuel production. Installed peak reserves all listed machines at their configured clocks and amplification, including dedicated disposal equipment.' },
    machineCount: sum(allRows.map(row => row.components?.length ? sum(row.components.map(c => c.machineCount)) : row.machineCount)), productionMachineCount: sum(rows.map(row => row.machineCount)),
    construction: [...construction].map(([id, amount]) => ({ itemId: id, name: itemById.get(id)?.name || id, amount })), operatingResources,
    balance: { complete: !residuals.length, residuals }, disposalComplete: !overflow.some(out => out.method === 'unresolved'),
    exactScale: { ...exact, applied: false }, diagnostics,
    assumptions: ['No coproduct or returned-fluid credits.', 'Machines run at their listed configured clock when fed (100% by default). Duty is the average operating fraction, not a clock setting.', 'Verified amplification multiplies every output, including byproducts; inputs remain unchanged per recipe cycle.', 'Every byproduct has a separate explicit disposal obligation.', 'Power generation, fuel supply, transport power and construction-material production are not silently added.'],
  };
  return result;
}

export const solve = solvePlan;
export default solvePlan;
