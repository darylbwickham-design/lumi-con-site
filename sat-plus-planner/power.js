/** Verified SF+ power sizing. No implicit returned-fluid or co-product credit.
 * Standalone: the host injects the catalogue and its production solver callback.
 */
const P_EPS=1e-8;
const pNum=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const pCeil=x=>Math.ceil(x-P_EPS*Math.max(1,Math.abs(x)));
const pSum=xs=>xs.reduce((a,b)=>a+b,0);
const pMap=xs=>new Map((xs||[]).map(x=>[x.id,x]));
const pGcd=(a,b)=>{a=Math.round(a);b=Math.round(b);while(b)[a,b]=[b,a%b];return Math.abs(a);};
const pEscape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pFmt=x=>x==null||!Number.isFinite(x)?'—':new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(x);
const pUnit=item=>item?.unit==='m3'?'m³':'items';
const pAdd=(map,id,rate)=>{if(rate>P_EPS)map.set(id,(map.get(id)||0)+rate);};
const pPorts=ports=>{const m=new Map();for(const x of ports||[])if(x.role!=='discard')pAdd(m,x.itemId,pNum(x.perMinute));return [...m].map(([itemId,perMinute])=>({itemId,perMinute}));};

export const DEFAULT_POWER_SETTINGS={basis:'factory',targetMW:1000,reservePercent:15,extraMW:0,additionalAuxMW:0,loadBasis:'peak',optionId:'',waterTreatment:'boil',wastePolicy:'treat',storageMinutes:60,includeAuxiliaries:true,externalItemIds:[],measuredPowerMW:{},family:'all',search:''};

function powerIndex(catalog){return {items:pMap(catalog.items),machines:pMap(catalog.machines),recipes:pMap(catalog.recipes),assemblies:pMap(catalog.assemblies),gates:pMap(catalog.gates)};}
function eligible(thing,stage,settings,ix){
 if(!thing)return false;if(thing.tier!=null&&Number(thing.tier)>stage)return false;
 if(settings.allowAlternates===false&&thing.alternate)return false;
 const gates=(thing.gateIds||[]).filter(id=>!ix.gates.has(id)||pNum(ix.gates.get(id).tier)<=stage);
 if(settings.allowMam===false&&gates.length&&gates.every(id=>/MAM/i.test(ix.gates.get(id)?.kind||'')))return false;
 if(settings.unlockedGateIds){const unlocked=new Set(settings.unlockedGateIds);if(thing.gateIds?.length&&!thing.gateIds.some(id=>unlocked.has(id)))return false;if((thing.requiredGateIds||[]).some(id=>!unlocked.has(id)))return false;if((thing.gateGroups||[]).some(group=>!group.some(id=>unlocked.has(id))))return false;}
 return true;
}
function supplyTier(catalog,itemId){
 const candidates=[...(catalog.resourceSources||[]).filter(x=>x.supported&&x.itemId===itemId),...(catalog.recipes||[]).filter(x=>x.supported&&!/^Unpackage/.test(x.name)&&x.outputs.some(p=>p.itemId===itemId))].map(x=>x.tier).filter(Number.isFinite);
 return candidates.length?Math.min(...candidates):0;
}
/** Exact curve points only: never extrapolate an RPM generator's nameplate. */
export function powerAtVerifiedRpm(machine,rpm){
 const p=machine?.rpmGeneratorProfile;if(!p)return null;
 const point=p.curve?.find(x=>Math.abs(pNum(x.rpm)-rpm)<P_EPS);
 return point&&Number.isFinite(point.power)&&point.power>0?Math.min(point.power,pNum(p.maxPowerOutput,Infinity)):null;
}

/** Environmental hardware is verified; its continuous site output is not inferred. */
export function getEnvironmentalPowerProfiles(catalog,{stage=9,...settings}={}){
 const ix=powerIndex(catalog),level=stage==='all'?Infinity:pNum(stage,9);
 return (catalog.generators||[]).filter(g=>!g.rpmDependent&&/^(Geothermal Generator|Solar Panel|Water Turbine|Wind Turbine)/.test(g.name)&&eligible(g,level,settings,ix)&&eligible(ix.machines.get(g.machineId),level,settings,ix)).map(g=>({...g,tier:Math.max(g.tier??0,ix.machines.get(g.machineId)?.tier??0),siteCaveat:/Solar/.test(g.name)?'Measure across a complete day/night cycle. A daytime reading is not continuous output; any storage or backup must be sized separately.':/Geothermal/.test(g.name)?'Survey each usable geothermal site and its complete output cycle. The requested count does not prove that enough suitable sites exist.':/Water/.test(g.name)?'Measure each intended water-turbine location and verify placement, spacing and sustained output. The requested count does not prove suitable water sites exist.':'Measure sustained output at the intended height and location across the full observed variation. Verify spacing and every additional site.'})).sort((a,b)=>a.tier-b.tier||a.name.localeCompare(b.name));
}

/** Eligible fuel, matched steam, and explicitly measured environmental options. */
export function getPowerOptions(catalog,{stage=9,...settings}={}){
 const ix=powerIndex(catalog),level=stage==='all'?Infinity:pNum(stage,9),options=[],excluded=[];
 const can=x=>eligible(x,level,settings,ix);
 const environment=new Map(getEnvironmentalPowerProfiles(catalog,{stage,...settings}).map(g=>[g.id,g]));
 for(const g of catalog.generators||[]){
  const measured=environment.get(g.id),measurement=pNum(settings.measuredPowerMW?.[g.id]);
  if(measured&&measurement>0){options.push({id:g.id,family:'measured',name:`${g.name} · site-measured`,tier:measured.tier,grossMW:measurement,capacityBasis:'user-measured',measurementConditional:true,inputs:pPorts(g.inputs),outputs:pPorts(g.outputs),equipment:[{machineId:g.machineId,count:1,role:'Site-measured generator'}],recipeIds:[],gateIds:g.gateIds||[],source:g.source,notes:[`${measurement} MW per unit is your measured continuous output, not a catalogue-confirmed firm value.`,measured.siteCaveat,'Size one bank only where every unit can sustain the entered value. Hardware costs exclude storage, backup generation, site works and grid losses.']});continue;}
  if(!g.supported||!(g.grossPowerMW>0)){excluded.push({id:g.id,name:g.name,reason:g.notes||'Generation profile is not verified.'});continue;}
  const machine=ix.machines.get(g.machineId);if(!can(g)||!can(machine))continue;
  options.push({id:g.id,family:'generator',name:g.name,tier:Math.max(g.tier??0,machine.tier??0),grossMW:g.grossPowerMW,inputs:pPorts(g.inputs),outputs:pPorts(g.outputs),equipment:[{machineId:g.machineId,count:1,role:'Generator'}],fuelItemId:g.fuelItemId,recipeIds:[],gateIds:[...new Set([...(g.gateIds||[]),...(machine.gateIds||[])])],source:g.source,notes:[g.fullBlast===false?'Fuel demand is rated full-load demand; this generator follows load.':'Fuel demand assumes full rated output.',g.notes].filter(Boolean)});
 }
 const boilers=(catalog.recipes||[]).filter(r=>r.supported&&/^Boiler Tier/.test(r.name)&&r.outputs.some(o=>ix.items.get(o.itemId)?.name==='Steam')&&r.inputs.some(i=>ix.items.get(i.itemId)?.name==='Water'));
 const turbines=(catalog.assemblies||[]).filter(a=>a.verified&&!a.unsupportedReason&&!a.powerUnsupportedReason&&a.turbineRpm&&/using Steam$/.test(a.name));
 for(const a of turbines){
  const tr=(catalog.recipes||[]).find(r=>r.assemblyId===a.id);if(!tr?.supported||!can(tr))continue;
  const steam=pPorts(tr.inputs)[0],turbineRole=a.roles.find(r=>r.machineIds.some(id=>!ix.machines.get(id)?.rpmGeneratorProfile)),generatorRole=a.roles.find(r=>r.machineIds.some(id=>ix.machines.get(id)?.rpmGeneratorProfile));
  const turbineId=turbineRole?.machineIds.find(id=>can(ix.machines.get(id)));if(!turbineId||!steam)continue;
  for(const generatorId of generatorRole?.machineIds||[]){
   const generator=ix.machines.get(generatorId),gross=powerAtVerifiedRpm(generator,a.turbineRpm);if(!gross||!can(generator))continue;
   for(const br of boilers){
    const ba=ix.assemblies.get(br.assemblyId),steamOut=pPorts(br.outputs).find(o=>o.itemId===steam.itemId);if(!steamOut||!ba?.verified||ba.unsupportedReason||ba.powerUnsupportedReason||!can(br))continue;
    const roles=ba.roles.map(r=>r.machineIds.find(id=>can(ix.machines.get(id))));if(roles.some(x=>!x))continue;
    const fuel=br.inputs.find(i=>ix.items.get(i.itemId)?.name!=='Water');if(!fuel)continue;
    const tier=Math.max(tr.tier??0,br.tier??0,...[turbineId,generatorId,...roles].map(id=>ix.machines.get(id)?.tier??0),supplyTier(catalog,fuel.itemId));if(tier>level)continue;
    const gcd=pGcd(steam.perMinute*1000,steamOut.perMinute*1000);if(!gcd)continue;
    const boilerCount=Math.round(steam.perMinute*1000/gcd),turbineCount=Math.round(steamOut.perMinute*1000/gcd);
    if(boilerCount>1000||turbineCount>1000)continue;
    const inputs=pPorts(br.inputs).map(p=>({...p,perMinute:p.perMinute*boilerCount}));
    const outputs=[...pPorts(br.outputs).filter(p=>p.itemId!==steam.itemId).map(p=>({...p,perMinute:p.perMinute*boilerCount})),...pPorts(tr.outputs).map(p=>({...p,perMinute:p.perMinute*turbineCount}))];
    const equipment=[...roles.map((machineId,i)=>({machineId,count:boilerCount,role:i===0?'Boiler':'Heater'})),{machineId:turbineId,count:turbineCount,role:'Turbine'},{machineId:generatorId,count:turbineCount,role:'RPM generator'}];
    const bp=catalog.machines.find(m=>m.name==='Boiler Platform'),cp=catalog.machines.find(m=>m.name===(/Super HV/.test(ix.machines.get(turbineId).name)?'Super Conductor Platform':'Converter Platform'));
    if(bp)equipment.push({machineId:bp.id,count:boilerCount,role:'Boiler support'});if(cp)equipment.push({machineId:cp.id,count:turbineCount,role:'Turbine support'});
    options.push({id:`steam:${br.id}:${tr.id}:${generatorId}`,family:'steam',name:`${generator.name} · ${ix.items.get(fuel.itemId)?.name} · ${ix.machines.get(roles[0])?.name}`,tier,grossMW:gross*turbineCount,inputs,outputs,equipment,fuelItemId:fuel.itemId,boilerRecipeId:br.id,turbineRecipeId:tr.id,turbineRpm:a.turbineRpm,boilersPerBlock:boilerCount,turbinesPerBlock:turbineCount,steam:{itemId:steam.itemId,perMinute:steam.perMinute*turbineCount,perTurbine:steam.perMinute,perBoiler:steamOut.perMinute},recipeIds:[br.id,tr.id],gateIds:[...new Set([...(br.gateIds||[]),...(tr.gateIds||[]),...equipment.flatMap(e=>ix.machines.get(e.machineId)?.gateIds||[])])],source:br.source,notes:[`${boilerCount} boiler/heater pair${boilerCount===1?'':'s'} and ${turbineCount} turbine/generator pair${turbineCount===1?'':'s'} per balanced block; all run at100% when supplied.`,`Generator output comes from its exact ${a.turbineRpm.toLocaleString()} RPM curve point.`,...(!bp||!cp?['Required platform metadata is missing; construction is incomplete.']:[])]});
   }
  }
 }
 options.sort((a,b)=>a.tier-b.tier||a.family.localeCompare(b.family)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return {options,excluded};
}

/** Aggregate whole hardware costs without inventing belts, pumps or cable length. */
export function powerConstruction(catalog,equipment){
 const ix=powerIndex(catalog),totals=new Map(),unknown=[];
 for(const e of equipment){const m=ix.machines.get(e.machineId);if(!m){unknown.push(e.machineId);continue;}if(!Array.isArray(m.cost))unknown.push(m.name);for(const p of m.cost||[])pAdd(totals,p.itemId,p.amount*e.count);}
 return {items:[...totals].map(([itemId,amount])=>({itemId,name:ix.items.get(itemId)?.name||itemId,amount})).sort((a,b)=>a.name.localeCompare(b.name)),unknown};
}

/** Material plant before upstream fuel manufacturing. Whole blocks; no returns. */
export function buildPowerPlant(catalog,option,blockCount=1,configuration={}){
 const cfg={...DEFAULT_POWER_SETTINGS,...configuration},ix=powerIndex(catalog),stage=cfg.stage==='all'?Infinity:pNum(cfg.stage,9),can=x=>eligible(x,stage,cfg,ix);
 let blocks=Math.max(1,pCeil(blockCount)),scale=1;
 const waterId=catalog.items.find(x=>x.name==='Water')?.id;
 const tailwater=pPorts(option.outputs).find(p=>p.itemId===waterId)?.perMinute||0;
 const disposalBoiler=catalog.recipes.find(r=>r.name==='Boiler Tier 1 using Water heated with Coal at 500°C');
 const disposalAssembly=ix.assemblies.get(disposalBoiler?.assemblyId);
 const disposeWaterRate=disposalBoiler?.inputs.find(p=>p.itemId===waterId)?.perMinute;
 // Scale the base steam block so a separate disposal heater can run continuously.
 // Otherwise its independent fuel timer would be undercounted at partial duty.
 if(tailwater&&cfg.waterTreatment==='boil'&&disposeWaterRate){scale=Math.round(disposeWaterRate*1000/pGcd(tailwater*1000,disposeWaterRate*1000));blocks*=scale;}
 const equipment=[],feeds=new Map(),wastes=[],disposal=[],warnings=[],errors=[],links=[],ventDemand=new Map();
 const addEquipment=(machineId,count,role)=>{if(count>P_EPS)equipment.push({machineId,name:ix.machines.get(machineId)?.name||machineId,count:pCeil(count),role});};
 for(const e of option.equipment)addEquipment(e.machineId,e.count*blocks,e.role);
 for(const p of option.inputs)pAdd(feeds,p.itemId,p.perMinute*blocks);
 const recipes=catalog.recipes.filter(r=>r.supported&&can(r));
 function recipeEquipment(r,equivalent,role){const a=ix.assemblies.get(r.assemblyId);const choose=ids=>ids.filter(id=>can(ix.machines.get(id))).sort((a,b)=>(ix.machines.get(a)?.name==='Packager'?-1:0)-(ix.machines.get(b)?.name==='Packager'?-1:0))[0];const ids=a?a.roles.map(role=>choose(role.machineIds)):[choose(r.machineIds)];if(ids.some(id=>!id)){errors.push(`No eligible producer for ${r.name}.`);return;}for(const id of ids)addEquipment(id,equivalent,role);if(ids.some(id=>/Stack/.test(ix.machines.get(id)?.name||''))){const platform=catalog.machines.find(m=>m.name==='Gas Vent Platform');if(platform)addEquipment(platform.id,equivalent,'Exhaust support');else errors.push('Gas Vent Platform metadata missing.');}}
 const sinkStreams=[];
 function dispose(itemId,rate,origin,depth=0){
  if(rate<P_EPS)return;const item=ix.items.get(itemId);wastes.push({itemId,name:item?.name||itemId,rate,origin});
  if(depth>3){errors.push(`Treatment chain for ${item?.name} exceeds the verified route depth.`);return;}
  if(cfg.wastePolicy==='store'||(itemId===waterId&&cfg.waterTreatment==='export')){disposal.push({itemId,name:item?.name,rate,method:'Finite storage / external export',storageAmount:rate*pNum(cfg.storageMinutes,60),complete:false});warnings.push(`${item?.name}: storage/export is an external obligation, not continuous disposal.`);return;}
  if(item?.form==='solid'&&item.canSink){sinkStreams.push({itemId,rate});disposal.push({itemId,name:item.name,rate,method:'AWESOME Sink',complete:true});return;}
  const vent=recipes.find(r=>r.inputs.length===1&&r.inputs[0].itemId===itemId&&!r.outputs.some(o=>o.role!=='discard'));
  if(vent){const equivalent=rate/vent.inputs[0].perMinute;pAdd(ventDemand,vent.id,equivalent);disposal.push({itemId,name:item?.name,rate,method:vent.name,recipeId:vent.id,equivalent,complete:true});return;}
  if(itemId===waterId&&cfg.waterTreatment==='boil'){
   if(!disposalBoiler||!can(disposalBoiler)||!disposalAssembly?.roles.every(r=>r.machineIds.some(id=>can(ix.machines.get(id))))){errors.push('The separate tailwater boiler is not unlocked.');return;}
   const eq=rate/disposeWaterRate;recipeEquipment(disposalBoiler,eq,'Tailwater disposal boiler/heater');const bp=catalog.machines.find(m=>m.name==='Boiler Platform');if(bp)addEquipment(bp.id,eq,'Tailwater boiler support');
   for(const p of disposalBoiler.inputs)if(p.itemId!==waterId)pAdd(feeds,p.itemId,p.perMinute*eq);
   disposal.push({itemId,name:item?.name,rate,method:'Separate coal boiler → Steam Stack',recipeId:disposalBoiler.id,equivalent:eq,complete:true});
   for(const p of pPorts(disposalBoiler.outputs))dispose(p.itemId,p.perMinute*eq,'Tailwater treatment',depth+1);return;
  }
  const converter=recipes.find(r=>r.inputs.length===1&&r.inputs[0].itemId===itemId&&r.outputs.length&&r.outputs.every(o=>{const p=ix.items.get(o.itemId);return o.role==='discard'||p?.form==='solid'&&p.canSink;}));
  if(converter){const eq=rate/converter.inputs[0].perMinute;recipeEquipment(converter,eq,'Waste treatment');disposal.push({itemId,name:item?.name,rate,method:converter.name,recipeId:converter.id,equivalent:eq,complete:true});for(const p of pPorts(converter.outputs))dispose(p.itemId,p.perMinute*eq,'Treatment product',depth+1);return;}
  const packer=recipes.find(r=>/^Packaged /.test(r.name)&&r.inputs.some(p=>p.itemId===itemId)&&r.inputs.length===2&&r.outputs.length===1&&ix.items.get(r.outputs[0].itemId)?.form==='solid'&&ix.items.get(r.outputs[0].itemId)?.canSink);
  if(packer){const eq=rate/packer.inputs.find(p=>p.itemId===itemId).perMinute;recipeEquipment(packer,eq,'Waste packaging');for(const p of packer.inputs)if(p.itemId!==itemId)pAdd(feeds,p.itemId,p.perMinute*eq);disposal.push({itemId,name:item?.name,rate,method:`${packer.name} → Sink; fresh containers required`,recipeId:packer.id,equivalent:eq,complete:true});for(const p of pPorts(packer.outputs))dispose(p.itemId,p.perMinute*eq,'Packaged waste',depth+1);return;}
  errors.push(`No eligible one-way disposal route for ${item?.name||itemId}.`);disposal.push({itemId,name:item?.name,rate,method:'Unresolved',complete:false});
 }
 for(const p of pPorts(option.outputs))dispose(p.itemId,p.perMinute*blocks,'Power generation');
 for(const [recipeId,equivalent]of ventDemand)recipeEquipment(ix.recipes.get(recipeId),equivalent,'Waste exhaust');
 const beltCapacity=Math.max(1,pNum(cfg.beltCapacity,120)),pipeCapacity=Math.max(1,pNum(cfg.pipeCapacity,150));
 const sink=catalog.machines.find(m=>m.name==='AWESOME Sink');
 const sinkRate=pSum(sinkStreams.map(x=>x.rate));if(sinkRate){if(sink&&can(sink))addEquipment(sink.id,pCeil(sinkRate/beltCapacity),'Dedicated waste Sink');else errors.push('AWESOME Sink is not unlocked.');}
 const feedRows=[...feeds].map(([itemId,rate])=>({itemId,name:ix.items.get(itemId)?.name||itemId,unit:ix.items.get(itemId)?.unit||'item',rate}));
 for(const p of feedRows)links.push({...p,direction:'Fresh supply',lanes:pCeil(p.rate/(p.unit==='m3'?pipeCapacity:beltCapacity))});
 for(const p of wastes){const unit=ix.items.get(p.itemId)?.unit||'item';links.push({...p,unit,direction:p.origin,lanes:pCeil(p.rate/(unit==='m3'?pipeCapacity:beltCapacity))});}
 if(option.steam){const steamRate=option.steam.perMinute*blocks;links.push({itemId:option.steam.itemId,name:'Hot Steam',unit:'m3',rate:steamRate,direction:'Boilers → turbines',lanes:pCeil(steamRate/pipeCapacity)});if(option.steam.perTurbine>pipeCapacity+P_EPS)warnings.push(`One turbine needs ${pFmt(option.steam.perTurbine)} m³/min Steam, above the selected ${pipeCapacity} m³/min pipe. Verify multiple physical ports; parallel trunks alone do not prove the connection works.`);if(option.steam.perBoiler>pipeCapacity+P_EPS)warnings.push(`One boiler emits ${pFmt(option.steam.perBoiler)} m³/min Steam, above the selected pipe capacity.`);}
 const merged=new Map();for(const e of equipment){const old=merged.get(e.machineId);if(old){old.count+=e.count;old.role=[...new Set((old.role+'; '+e.role).split('; '))].join('; ');}else merged.set(e.machineId,{...e});}
 const machines=[...merged.values()],localAuxMW=pSum(machines.map(e=>e.count*pNum(ix.machines.get(e.machineId)?.maxPowerMW,ix.machines.get(e.machineId)?.powerMW||0)));
 return {optionId:option.id,option,requestedBlocks:Math.max(1,pCeil(blockCount)),blocks,blockScale:scale,grossMW:option.grossMW*blocks,feeds:feedRows,targets:feedRows.map(({itemId,rate})=>({itemId,rate})),equipment:machines,construction:powerConstruction(catalog,machines),localAuxMW,wastes,disposal,disposalComplete:!errors.length&&disposal.every(x=>x.complete),transport:links,warnings,errors,notes:[...option.notes,...(scale>1?[`Each selected unit expands to ${scale} base blocks so the separate tailwater boiler/heater runs at100% without undercounting continuous heater fuel.`]:[]),'All fresh inputs are separate from outputs. No returned water, spent slime or other byproduct offsets production.','Fuel, extraction, treatment-consumable manufacturing and user-specified pump loads are counted separately from gross generation.']};
}

export function powerTarget(plan,settings={}){
 const s={...DEFAULT_POWER_SETTINGS,...settings};let load=s.basis==='target'?Math.max(0,pNum(s.targetMW)):pNum(s.loadBasis==='average'?plan?.power?.averageMW:plan?.power?.installedPeakMW);
 load+=Math.max(0,pNum(s.extraMW));return {loadMW:load,targetMW:load*(1+Math.max(0,pNum(s.reservePercent))/100),factoryKnown:s.basis==='target'||!!plan?.power?.complete};
}

/** Iteratively include the power needed to manufacture this plant's own inputs. */
export async function calculatePowerOption(catalog,option,targetMW,{onSolveSupply,...configuration}={}){
 const cfg={...DEFAULT_POWER_SETTINGS,...configuration};const first=buildPowerPlant(catalog,option,1,cfg),unitGross=first.grossMW;
 if(!(unitGross>0)||!Number.isFinite(targetMW)||targetMW<=0)throw Error('Enter a positive MW target or calculate a factory with a known power load.');
 let count=Math.max(1,pCeil(targetMW/unitGross)),result;
 for(let iteration=0;iteration<16;iteration++){
  const plant=buildPowerPlant(catalog,option,count,cfg),external=new Set(cfg.externalItemIds||[]),imports=plant.targets.filter(t=>external.has(t.itemId));let supplyPlan=null,supplyError=null;
  if(plant.targets.length&&cfg.includeAuxiliaries&&onSolveSupply){try{supplyPlan=await onSolveSupply({...cfg.solverSettings,stage:cfg.stage,allowAlternates:cfg.allowAlternates,allowMam:cfg.allowMam,beltCapacity:cfg.beltCapacity,pipeCapacity:cfg.pipeCapacity,targets:plant.targets,imports,...(cfg.recipeOverrides?{recipeOverrides:cfg.recipeOverrides}:{}),...(cfg.sourceOverrides?{sourceOverrides:cfg.sourceOverrides}:{})});}catch(error){supplyError=error.message||String(error);}}
  const supplyComplete=!plant.targets.length||(cfg.includeAuxiliaries&&!!supplyPlan&&supplyPlan.status==='solved'&&supplyPlan.power?.complete&&supplyPlan.disposalComplete!==false);
  const upstreamAuxMW=supplyPlan?(cfg.loadBasis==='average'?pNum(supplyPlan.power?.averageMW):pNum(supplyPlan.power?.installedPeakMW)):0;
  const knownAuxMW=plant.localAuxMW+upstreamAuxMW+Math.max(0,pNum(cfg.additionalAuxMW));
  const estimatedNetMW=plant.grossMW-knownAuxMW,netMW=supplyComplete&&plant.disposalComplete?estimatedNetMW:null;
  result={...plant,capacityBasis:option.capacityBasis||'catalogue',measurementConditional:!!option.measurementConditional,supplyPlan,supplyComplete,supplyError,imports,targetMW,upstreamAuxMW,knownAuxMW,netMW,estimatedNetMW,headroomMW:netMW==null?null:netMW-targetMW,iterations:iteration+1,auxiliariesIncluded:!!cfg.includeAuxiliaries,status:supplyComplete&&plant.disposalComplete?'solved':'partial'};
  if(!supplyComplete||!plant.disposalComplete||estimatedNetMW>=targetMW-P_EPS)return result;
  const next=Math.max(count+1,pCeil((targetMW+knownAuxMW)/unitGross));if(next>100000){result.status='blocked';result.errors.push('More than100,000 power blocks would be required; check fuel-production energy demand.');return result;}
  if(iteration>3&&estimatedNetMW<=0){result.status='blocked';result.errors.push('This supply chain consumes at least as much power as the plant generates.');return result;}
  count=next;
 }
 result.status='partial';result.errors.push('Net sizing did not converge within16 passes.');return result;
}

function installPowerStyle(document){if(document.getElementById('sfplus-power-style'))return;const style=document.createElement('style');style.id='sfplus-power-style';style.textContent=`
.pp{--pp-bg:#151e22;--pp-line:#2d3d42;--pp-muted:#adbdbe;--pp-accent:#efb36a;--pp-active:#a4d9cf;color:#eef3f1;font:13px/1.5 Inter,system-ui,sans-serif}
.pp *{box-sizing:border-box}.pp [hidden]{display:none!important}.pp h2,.pp h3,.pp h4{color:#eef3f1;margin:0 0 8px;font-family:inherit;font-weight:650;letter-spacing:0}.pp h2{font-size:20px}.pp h3{font-size:17px}.pp h4{font-size:13px;margin-top:20px}.pp p{margin:7px 0}.pp .pp-muted{color:var(--pp-muted);font-size:12px}.pp .pp-eyebrow{color:var(--pp-muted);font-size:11px;margin:0 0 4px}.pp .pp-top{display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:14px}.pp .pp-badge{color:var(--pp-muted);padding:3px 0;font-size:11px;white-space:nowrap}
.pp .pp-controls,.pp .pp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px}.pp .pp-main-controls{grid-template-columns:minmax(150px,1fr) minmax(100px,.7fr) minmax(220px,1.8fr);align-items:end}.pp label{display:block;min-width:0;font-size:12px;color:var(--pp-muted)}.pp input:not([type=checkbox]),.pp select{display:block;min-width:0;width:100%;min-height:38px;background:#10181c;color:#eef3f1;border:1px solid #405257;border-radius:6px;padding:8px 9px;margin-top:5px;font:inherit}.pp input:disabled{opacity:.45}.pp input[type=checkbox]{accent-color:var(--pp-active);vertical-align:middle;margin-right:6px}.pp input::placeholder{color:#879a9c}.pp button{background:#1c292e;color:#e7efed;border:1px solid #405257;border-radius:6px;min-height:36px;padding:8px 12px;cursor:pointer;font:600 12px Inter,system-ui,sans-serif}.pp button:hover:not(:disabled){background:#293a40;border-color:#688681}.pp button.pp-primary{background:var(--pp-accent);color:#1c211f;border-color:var(--pp-accent)}.pp button.pp-primary:hover:not(:disabled){background:#f6c38a}.pp button:disabled{opacity:.45;cursor:default}.pp :is(button,input,select,summary):focus-visible{outline:2px solid var(--pp-active);outline-offset:3px}.pp .pp-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:13px 0}.pp .pp-actions p{font-size:12px;color:var(--pp-muted);margin:0}
.pp .pp-section{background:var(--pp-bg);border:1px solid var(--pp-line);border-radius:8px;padding:18px;margin:12px 0}.pp .pp-setup{margin-top:0}.pp .pp-demand{padding:10px 0 2px;color:var(--pp-active);font-size:12px}.pp .pp-secondary{margin-top:17px;border-top:1px solid var(--pp-line);padding-top:4px}.pp details{margin:0;border-bottom:1px solid var(--pp-line);padding:11px 0}.pp details:last-child{border-bottom:0}.pp summary{cursor:pointer;color:#d7e2e0;font-size:12px;font-weight:550}.pp summary::marker{color:#829b9c}.pp details[open]>summary{color:var(--pp-active);margin-bottom:13px}.pp summary small{font-size:11px;font-weight:400;color:var(--pp-muted);margin-left:8px}.pp details .pp-controls{margin:10px 0}.pp ul{padding-left:20px}.pp .pp-progress{font-size:12px;color:var(--pp-active)}.pp .pp-progress:empty{display:none}
.pp .pp-cards{margin:15px 0}.pp .pp-card{padding:12px 13px;background:#111a1e;border:1px solid var(--pp-line);border-radius:6px}.pp .pp-card strong{display:block;color:#eef3f1;font-size:23px;font-weight:600;letter-spacing:-.5px;margin:3px 0}.pp .pp-card small{display:block;color:var(--pp-muted);font-size:11px}.pp .pp-card:last-child{border-color:#52766f;background:#172725}.pp .pp-card:last-child strong{color:var(--pp-active)}.pp .pp-result-status{font-size:12px;color:var(--pp-muted)}.pp .pp-equipment{margin:12px 0;border:1px solid var(--pp-line);border-radius:6px;overflow:hidden}.pp .pp-equipment-row{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(100px,.65fr);gap:12px;align-items:center;padding:10px 12px;border-top:1px solid var(--pp-line)}.pp .pp-equipment-row:first-child{border-top:0}.pp .pp-equipment-row>strong{font-size:18px;font-weight:600;color:var(--pp-active);font-variant-numeric:tabular-nums}.pp .pp-equipment-row>span{font-weight:550;overflow-wrap:anywhere}.pp .pp-equipment-row>small{color:var(--pp-muted);font-size:11px;overflow-wrap:anywhere}.pp .pp-feed-list{display:flex;flex-wrap:wrap;gap:8px 24px;padding:8px 0}.pp .pp-feed-list>div{display:grid;gap:2px}.pp .pp-feed-list strong{font-size:12px;font-weight:550}.pp .pp-feed-list span{color:var(--pp-muted);font-size:12px;font-variant-numeric:tabular-nums}
.pp .pp-table-wrap{overflow:auto;max-height:410px;border:1px solid var(--pp-line);border-radius:6px;margin:9px 0}.pp table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}.pp th{text-align:left;position:sticky;top:0;background:#1c292e;color:var(--pp-muted);padding:10px;font-weight:550;z-index:1}.pp td{border-top:1px solid var(--pp-line);padding:9px 10px}.pp td:first-child{white-space:normal;min-width:140px}.pp .pp-selected td{background:#1b302e}.pp .pp-selected button{border-color:#72a89b;color:var(--pp-active)}.pp .pp-pass{color:var(--pp-active)}.pp .pp-warn{color:#efbd85}.pp .pp-error{color:#f4a79a}.pp .pp-alert{border-left:2px solid #bc8c58;padding:5px 0 5px 14px;font-size:12px}.pp .pp-alert li+li{margin-top:5px}.pp .pp-imports{display:flex;flex-wrap:wrap;gap:9px}.pp .pp-imports label{padding:7px 10px;border:1px solid var(--pp-line);border-radius:6px}.pp a{color:var(--pp-active)}.pp .pp-comparison{padding:0 18px}.pp .pp-comparison>summary{padding:12px 0}.pp .pp-comparison[open]{padding-bottom:18px}
@media(max-width:760px){.pp .pp-main-controls{grid-template-columns:1fr 1fr}.pp .pp-main-controls>label:last-child{grid-column:1/-1}}@media(max-width:480px){.pp .pp-section{padding:14px}.pp .pp-top{gap:8px}.pp .pp-badge{font-size:10px;white-space:normal;text-align:right;max-width:110px}.pp .pp-cards{grid-template-columns:1fr}.pp .pp-equipment-row{grid-template-columns:36px minmax(0,1fr);gap:6px 10px}.pp .pp-equipment-row>small{grid-column:2}.pp summary small{display:block;margin:3px 0 0 14px}.pp .pp-comparison{padding:0 14px}.pp .pp-comparison[open]{padding-bottom:14px}}
`;document.head.append(style);}

/** Render a self-contained panel. Call returned destroy() before replacing it. */
export function renderPowerPlanner(container,context={}){
 const {catalog,plan,onSettings,onPrefill,onSolveSupply}=context;if(!catalog)throw Error('Power planner requires catalog.');
 installPowerStyle(container.ownerDocument);const ix=powerIndex(catalog);let settings={...DEFAULT_POWER_SETTINGS,...context.settings},alive=true,serial=0,lastResult=null;const results=new Map();
 const stage=context.stage??9,beltCapacity=context.beltCapacity??120,pipeCapacity=context.pipeCapacity??150;
 const config=()=>({...context.solverSettings,...settings,stage,beltCapacity,pipeCapacity,solverSettings:context.solverSettings,onSolveSupply});
 const environment=getEnvironmentalPowerProfiles(catalog,{stage,...context.solverSettings});
 let available=getPowerOptions(catalog,{stage,...context.solverSettings,...settings}),options=available.options;
 if(!options.some(x=>x.id===settings.optionId))settings.optionId=options.find(x=>x.name.includes('Solid Biofuel'))?.id||options[0]?.id||'';
 const option=()=>options.find(x=>x.id===settings.optionId),target=()=>powerTarget(plan,settings);
 const by=p=>container.querySelector(p),text=(selector,value)=>{const node=by(selector);if(node)node.textContent=value;};
 const table=(cols,rows)=>`<div class="pp-table-wrap"><table><thead><tr>${cols.map(x=>`<th>${pEscape(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">No entries.</td></tr>`}</tbody></table></div>`;
 const machineBill=(list)=>`<div class="pp-equipment" role="list" aria-label="Plant equipment">${list.map(e=>`<div class="pp-equipment-row" role="listitem"><strong aria-label="${pFmt(e.count)} units">${pFmt(e.count)}<span aria-hidden="true"> ×</span></strong><span>${pEscape(e.name)}</span><small>${pEscape(e.role)}</small></div>`).join('')}</div>`;
 function persist(){onSettings?.({...settings});}
 function measuredControls(){return `<details id="power-site-measurements"><summary>Site-measured geothermal, solar, water and wind</summary><p class="pp-warn"><strong>Conditional capacity only.</strong> Enter a measured continuous MW per unit for your actual site. Leave a field blank or zero to exclude it. Never use an instantaneous peak or daytime-only reading. A measurement adds a selectable option; this planner does not verify site availability, storage or backup coverage.</p><div class="pp-controls">${environment.map(g=>`<label>${pEscape(g.name)} · Tier ${g.tier}<input type="number" min="0" step="any" data-power-measured="${pEscape(g.id)}" aria-label="${pEscape(g.name)} measured continuous MW per unit" placeholder="Measured continuous MW / unit" value="${pNum(settings.measuredPowerMW?.[g.id])||''}"><span>${pEscape(g.siteCaveat)}</span></label>`).join('')||'<p>No environmental generators are available with the selected tier and unlocks.</p>'}</div><p class="pp-muted">Only unlocked hardware is listed. Count and construction materials use the official building catalogue. MV, HV and Super HV are already represented by matched steam assemblies above; their RPM nameplates are not environmental measurements.</p></details>`;}
 function refreshList(){
  const search=settings.search.toLowerCase(),shown=options.filter(x=>(settings.family==='all'||x.family===settings.family)&&(!search||x.name.toLowerCase().includes(search)));
  by('#power-options-table').innerHTML=`<div class="pp-table-wrap"><table><thead><tr><th>Generation option</th><th>Tier</th><th>Gross / block</th><th>Blocks</th><th>Auxiliary load</th><th>Net capacity</th><th>Result</th></tr></thead><tbody>${shown.map(o=>{const r=results.get(o.id);return `<tr class="${o.id===settings.optionId?'pp-selected':''}"><td><button type="button" data-power-select="${pEscape(o.id)}">${pEscape(o.name)}</button></td><td>${o.tier}</td><td>${pFmt(o.grossMW)} MW</td><td>${r?pFmt(r.blocks):'—'}</td><td>${r?pFmt(r.knownAuxMW)+' MW':'Not calculated'}</td><td>${r?.netMW!=null?pFmt(r.netMW)+' MW':'—'}</td><td class="${r?.status==='solved'&&!r.measurementConditional?'pp-pass':'pp-warn'}">${r?r.measurementConditional?'Conditional on site measurement':r.status==='solved'?'Supply calculated':'Needs supply / waste work':'Not sized'}</td></tr>`;}).join('')}</tbody></table></div>`;
  by('#power-options-count').textContent=`${shown.length} of ${options.length} eligible profiles. Environmental rows use your measurements; steam blocks use matched whole equipment.`;
 }
 function supplySummary(r){
  const rows=r.supplyPlan?.rows||[],errors=r.supplyPlan?.diagnostics?.filter(d=>d.severity==='error')||[];
  return `<p>${!r.targets.length?'This generator has no catalogue fuel or coolant inputs. Add any site auxiliaries explicitly; storage and backup generation are outside this calculation.':r.supplyComplete?'Fuel, coolant, fresh disposal containers and their upstream production are included in the auxiliary load.':'Upstream supply is incomplete. The displayed known auxiliary load is not a verified total; firm net capacity is withheld.'}</p>${r.imports.length?`<p class="pp-warn">Existing supply selected: ${r.imports.map(p=>`${pEscape(ix.items.get(p.itemId)?.name)} ${pFmt(p.rate)} ${pUnit(ix.items.get(p.itemId))}/min`).join('; ')}. Their upstream power is outside this plant calculation.</p>`:''}${r.supplyError?`<p class="pp-error">${pEscape(r.supplyError)}</p>`:''}${errors.length?`<ul class="pp-warn">${errors.slice(0,12).map(d=>`<li>${pEscape(d.message)}</li>`).join('')}</ul>`:''}${rows.length?`<details><summary>Fuel and coolant production (${rows.length} rows)</summary>${table(['Factory / extraction','Machines','Peak MW'],rows.map(row=>[pEscape(row.recipeName||row.name||row.machineName||row.sourceName||row.id),pFmt(row.machineCount),pFmt(row.power?.installedPeakMW)]))}</details>`:''}`;
 }
 function renderResult(r){
  lastResult=r;const totalBill=new Map(r.construction.items.map(x=>[x.itemId,{...x}]));for(const x of r.supplyPlan?.construction||[]){const old=totalBill.get(x.itemId);if(old)old.amount+=x.amount;else totalBill.set(x.itemId,{...x});}
  const messages=[...(r.measurementConditional?['Conditional on your measured continuous output. Survey every proposed unit; daytime peaks, site limits, storage and backup coverage are not verified.',...r.option.notes.slice(1,2)]:[]),...r.errors,...r.warnings,...(!target().factoryKnown?['The current factory load is incomplete; use an explicit MW target before relying on sizing.']:[])];
  by('#power-result').innerHTML=`<div class="pp-section">
   <p class="pp-eyebrow">Your plant</p><h3>${pEscape(r.option.name)}</h3>
   <p class="pp-result-status">${r.netMW==null?'Complete the supply or waste routes below before relying on this plant.':r.measurementConditional?'Hardware sized from your measurement. Confirm continuous output at every site.':`${pFmt(r.netMW)} MW available for a ${pFmt(r.targetMW)} MW target, including your reserve.`}</p>
   <div class="pp-cards">
    <div class="pp-card"><small>${r.measurementConditional?'Gross from your site measurement':'Gross rated output'}</small><strong>${pFmt(r.grossMW)} MW</strong><small>${pFmt(r.blocks)} base block${r.blocks===1?'':'s'}</small></div>
    <div class="pp-card"><small>Known auxiliary load · ${pEscape(settings.loadBasis)}</small><strong>${pFmt(r.knownAuxMW)} MW</strong><small>${pFmt(r.localAuxMW)} plant + ${pFmt(r.upstreamAuxMW)} upstream + ${pFmt(pNum(settings.additionalAuxMW))} extra</small></div>
    <div class="pp-card"><small>${r.measurementConditional?'Conditional net after auxiliaries':'Net available to your factory'}</small><strong>${pFmt(r.netMW)} MW</strong><small>${r.netMW==null?'Not verified until supply completes':pFmt(r.headroomMW)+' MW above target including reserve'}</small></div>
   </div>
   ${messages.length?`<ul class="pp-warn pp-alert">${messages.map(m=>`<li>${pEscape(m)}</li>`).join('')}</ul>`:''}
   <h4>Build this equipment</h4>${machineBill(r.equipment)}
   <h4>Supply the plant</h4>
   <div class="pp-feed-list">${r.feeds.length?r.feeds.map(f=>`<div><strong>${pEscape(f.name)}</strong><span>${pFmt(f.rate)} ${pUnit(ix.items.get(f.itemId))}/min</span></div>`).join(''):'<p class="pp-muted">No fuel or coolant inputs. Site auxiliaries, storage and backup are separate.</p>'}</div>
   ${r.option.steam?`<p class="pp-muted">Local steam connection: ${pFmt(r.option.steam.perMinute*r.blocks)} m³/min from boilers to turbines.</p>`:''}
   <div class="pp-actions"><button id="power-prefill" class="pp-primary" type="button">Plan these fuel & coolant factories</button><p>${r.targets.length?'Opens the factory plan with these exact input rates.':'This plant needs no fuel or coolant factory.'}</p></div>
   <p class="pp-muted">Build the supply chain on a separate startup circuit. Fill fluid lines before connecting the factory load.</p>
   <div class="pp-secondary">
    <details ${r.supplyComplete?'':'open'}><summary>Supply factories & auxiliary power <small>${pFmt(r.upstreamAuxMW)} MW upstream</small></summary>${supplySummary(r)}</details>
    <details ${r.disposalComplete?'':'open'}><summary>Waste & cooling routes <small>${r.disposal.length?r.disposalComplete?'Separate treatment included':'Needs attention':'No waste streams'}</small></summary>${table(['Stream','Rate / min','Treatment','Storage for selected horizon'],r.disposal.map(x=>[pEscape(x.name),pFmt(x.rate)+' '+pUnit(ix.items.get(x.itemId)),pEscape(x.method),x.storageAmount==null?'—':pFmt(x.storageAmount)+' '+pUnit(ix.items.get(x.itemId))]))}${r.option.family==='steam'?'<p class="pp-muted">Steam turbines return condensed Water directly. Separate boiler disposal converts that water to steam for a Steam Stack; packaged disposal needs fresh containers. Neither route feeds the parent boiler.</p>':''}</details>
    <details><summary>Belts & pipes <small>${pFmt(beltCapacity)} items/min · ${pFmt(pipeCapacity)} m³/min</small></summary>${table(['Stream / connection','Rate / min','Parallel trunks, minimum'],r.transport.map(x=>[pEscape(x.name)+' · '+pEscape(x.direction),pFmt(x.rate)+' '+(x.unit==='m3'?'m³':'items'),pFmt(x.lanes)]))}<p class="pp-muted">Trunk counts do not establish an individual building's physical port capacity or required head lift.</p></details>
    <details><summary>Construction shopping list <small>${totalBill.size} parts</small></summary>${table(['Part','Amount'],[...totalBill.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>[pEscape(x.name),pFmt(x.amount)]))}<p class="pp-muted">Includes generation, treatment and calculated upstream buildings. Foundations, cable lengths, belts/pipes and unsurveyed lift pumps are separate.</p></details>
    <details><summary>Sources & operating assumptions</summary><ul>${r.notes.map(n=>`<li>${pEscape(n)}</li>`).join('')}</ul><p><a href="${pEscape(r.option.source)}" target="_blank" rel="noreferrer">Official catalogue recipe/building source</a> · snapshot ${pEscape(catalog.version)}</p></details>
   </div>
  </div>`;
  by('#power-prefill').disabled=!onPrefill||!r.targets.length;by('#power-prefill').onclick=()=>onPrefill?.({name:`Supply for ${r.option.name}`,targets:r.targets,imports:r.imports,recipeOverrides:settings.recipeOverrides||context.solverSettings?.recipeOverrides||{},sourceOverrides:settings.sourceOverrides||context.solverSettings?.sourceOverrides||{},description:`${pFmt(r.grossMW)} MW gross; ${pFmt(r.netMW)} MW ${r.measurementConditional?'conditional measured':'calculated'} net. Separate plant equipment and waste treatment are listed in Power.`});
 }
 function render(){
  container.innerHTML=`<section class="pp">
   <div class="pp-top"><div><h2>Build power</h2><p class="pp-muted">Choose a plant to cover your factory and its own supply chain.</p></div><span class="pp-badge">Tier ${stage} · no byproduct returns</span></div>
   <div class="pp-section pp-setup">
    <div class="pp-controls pp-main-controls">
     <label>Demand<select id="power-basis"><option value="factory">Current factory load</option><option value="target">Target output in MW</option></select></label>
     <label>Target MW<input id="power-target-mw" type="number" min="0" step="10" value="${pNum(settings.targetMW)}"></label>
     <label>Power plant<select id="power-option">${options.map(o=>`<option value="${pEscape(o.id)}">${pEscape(o.name)} · T${o.tier}</option>`).join('')}</select></label>
    </div>
    <p id="power-target-summary" class="pp-demand"></p>
    <div class="pp-actions"><button id="power-size" class="pp-primary" type="button">Size selected plant</button><p>Includes fuel and coolant production power by default.</p><button id="power-cancel" type="button" hidden>Stop comparison</button></div>
    <div id="power-progress" class="pp-progress" role="status"></div>
    <div class="pp-secondary">
     <details id="power-demand-options"><summary>Demand, reserve & auxiliary loads <small id="power-demand-settings-summary"></small></summary>
      <div class="pp-controls"><label>Factory / auxiliary load basis<select id="power-load-basis"><option value="peak">Installed peak — conservative</option><option value="average">Productive average</option></select></label><label>Reserve (%)<input id="power-reserve" type="number" min="0" max="200" value="${pNum(settings.reservePercent)}"></label><label>Other factory demand (MW)<input id="power-extra" type="number" min="0" value="${pNum(settings.extraMW)}"></label><label>Pumps / other plant auxiliaries (MW)<input id="power-aux" type="number" min="0" value="${pNum(settings.additionalAuxMW)}"></label></div>
      <p><label><input id="power-include-aux" type="checkbox" ${settings.includeAuxiliaries?'checked':''}> Include upstream supply power and resize the plant to cover it</label></p>
     </details>
     <details id="power-operation-options"><summary>Cooling & waste handling <small id="power-operation-settings-summary"></small></summary>
      <p class="pp-muted">Waste leaves through a separate treatment route. Fresh inputs are not reduced by returned fluids.</p>
      <div class="pp-controls"><label>Condensed water handling<select id="power-water-treatment"><option value="boil">Separate boiler + Steam Stack</option><option value="package">Package + Sink (fresh canisters)</option><option value="export">External export / finite storage</option></select></label><label>Other waste handling<select id="power-waste-policy"><option value="treat">Verified one-way treatment</option><option value="store">Finite storage / external export</option></select></label><label>Storage horizon (minutes)<input id="power-storage-minutes" type="number" min="1" value="${pNum(settings.storageMinutes)}"></label></div>
     </details>
     <details id="power-import-options"><summary>Existing fuel or coolant supply <small id="power-import-settings-summary"></small></summary><p class="pp-muted">Checked streams are external inputs. Their upstream machines and electricity are excluded; supply the listed rate continuously.</p><div class="pp-imports" id="power-existing-inputs"></div></details>
     ${measuredControls()}
    </div>
   </div>
   <div id="power-result"></div>
   <details class="pp-section pp-comparison" id="power-comparison"><summary>Compare available plants <small>${options.length} eligible profiles</small></summary>
    <div class="pp-controls"><label>Family<select id="power-family"><option value="all">All available plants</option><option value="generator">Fuel generators</option><option value="steam">Steam boiler assemblies</option><option value="measured">Site-measured environmental</option></select></label><label>Filter options<input id="power-search" type="search" placeholder="Coal, HV, biofuel…" value="${pEscape(settings.search)}"></label></div>
    <div class="pp-actions"><button id="power-compare" type="button">Calculate every option</button><p>Compare net capacity after each plant's supply chain.</p></div>
    <p id="power-options-count" class="pp-muted"></p><div id="power-options-table"></div>
    <details><summary>Profiles excluded from firm generation (${available.excluded.length})</summary><ul class="pp-muted">${available.excluded.map(x=>`<li>${pEscape(x.name)} — ${pEscape(x.reason)}</li>`).join('')}</ul></details>
   </details>
  </section>`;
  for(const [id,key]of[['power-basis','basis'],['power-load-basis','loadBasis'],['power-option','optionId'],['power-water-treatment','waterTreatment'],['power-waste-policy','wastePolicy'],['power-family','family']])by('#'+id).value=settings[key];
  updateInputs();refreshList();
  const numeric={'power-target-mw':'targetMW','power-reserve':'reservePercent','power-extra':'extraMW','power-aux':'additionalAuxMW','power-storage-minutes':'storageMinutes'};
  container.onchange=event=>{const node=event.target,id=node.id;if(node.dataset.powerMeasured){settings.measuredPowerMW={...settings.measuredPowerMW,[node.dataset.powerMeasured]:Math.max(0,pNum(node.value))};available=getPowerOptions(catalog,{stage,...context.solverSettings,...settings});options=available.options;if(!options.some(o=>o.id===settings.optionId))settings.optionId=options[0]?.id||'';serial++;results.clear();lastResult=null;persist();render();by('#power-site-measurements').open=true;return;}if(numeric[id])settings[numeric[id]]=Math.max(0,pNum(node.value));else{const select={'power-basis':'basis','power-load-basis':'loadBasis','power-option':'optionId','power-water-treatment':'waterTreatment','power-waste-policy':'wastePolicy','power-family':'family'};if(select[id])settings[select[id]]=node.value;else if(id==='power-include-aux')settings.includeAuxiliaries=node.checked;else if(node.dataset.powerImport){const set=new Set(settings.externalItemIds);node.checked?set.add(node.dataset.powerImport):set.delete(node.dataset.powerImport);settings.externalItemIds=[...set];}else return;}serial++;results.clear();lastResult=null;by('#power-result').innerHTML='';text('#power-progress','');persist();updateInputs();refreshList();};
  by('#power-search').oninput=e=>{settings.search=e.target.value;persist();refreshList();};
  container.onclick=event=>{const id=event.target.closest('[data-power-select]')?.dataset.powerSelect;if(id){settings.optionId=id;by('#power-option').value=id;persist();updateInputs();refreshList();const old=results.get(id);if(old)renderResult(old);} };
  by('#power-size').onclick=()=>run(false);by('#power-compare').onclick=()=>run(true);by('#power-cancel').onclick=()=>{serial++;text('#power-progress','Comparison stopped. Completed results are retained.');by('#power-cancel').hidden=true;};
 }
 function updateInputs(){
  const t=target();text('#power-target-summary',`Requires ${pFmt(t.targetMW)} MW net · ${pFmt(t.loadMW)} MW demand + ${pFmt(pNum(settings.reservePercent))}% reserve.${t.factoryKnown?'':' Current factory load is incomplete.'}`);
  by('#power-target-mw').disabled=settings.basis!=='target';by('#power-target-mw').value=settings.basis==='target'?pNum(settings.targetMW):Math.max(0,t.loadMW-pNum(settings.extraMW));
  text('#power-demand-settings-summary',`${pFmt(pNum(settings.reservePercent))}% reserve · ${settings.loadBasis==='peak'?'peak':'average'} load${settings.includeAuxiliaries?' · supply power included':' · supply power excluded'}`);
  text('#power-operation-settings-summary',`${settings.waterTreatment==='boil'?'Separate boiler + vent':settings.waterTreatment==='package'?'Package + Sink':'External water export'} · ${settings.wastePolicy==='store'?'finite waste storage':'one-way treatment'}`);
  text('#power-import-settings-summary',(settings.externalItemIds||[]).length?`${settings.externalItemIds.length} external inputs selected`:'Calculate fresh supply');
  const ids=[...new Set([...(option()?.inputs||[]).map(x=>x.itemId),...(lastResult?.targets||[]).map(x=>x.itemId)])];by('#power-existing-inputs').innerHTML=ids.map(id=>`<label><input type="checkbox" data-power-import="${pEscape(id)}" ${(settings.externalItemIds||[]).includes(id)?'checked':''}> ${pEscape(ix.items.get(id)?.name||id)}</label>`).join('')||'<p class="pp-muted">This option has no fuel or coolant inputs.</p>';
 }

 async function run(all){
  if(!option())return;const token=++serial;const selected=all?options:[option()];by('#power-cancel').hidden=!all;by('#power-size').disabled=true;by('#power-compare').disabled=true;
  for(let i=0;i<selected.length;i++){
   if(!alive||token!==serial)break;const o=selected[i];text('#power-progress',`Sizing ${i+1}/${selected.length}: ${o.name}`);await new Promise(resolve=>setTimeout(resolve,0));
   try{const r=await calculatePowerOption(catalog,o,target().targetMW,config());if(!alive||token!==serial)break;results.set(o.id,r);if(o.id===settings.optionId)renderResult(r);refreshList();}catch(error){if(token===serial)text('#power-progress',`Could not size ${o.name}: ${error.message||error}`);}
  }
  if(alive){by('#power-size').disabled=false;by('#power-compare').disabled=false;by('#power-cancel').hidden=true;if(token===serial){if(results.size)text('#power-progress',all?`${results.size} plants calculated. Review net capacity and supply status in the comparison below.`:'Plant sized. Equipment and required supplies are below.');updateInputs();}}
 }
 render();const dispose=()=>{alive=false;serial++;container.onchange=null;container.onclick=null;};return {destroy:dispose,dispose,getSettings(){return {...settings};},getResult(){return lastResult;},calculate(){return run(false);}};
}
