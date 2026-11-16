/** Additive commissioning runs for the 29-output Tier 0–2 construction mall.
 * These are stock-producing cells, not replacements for the mall's target list.
 * outputs: [item name, net items/min]; recipeChoices: [item name, recipe name].
 * Rates and ratios use the saved official SF+ 2026.3.511 catalogue, 100% clock,
 * no alternates, no amplification and separate disposal of every other product.
 * Extraction counts below assume normal nodes and Standard Mining Heads.
 * Power includes the listed cells and their Sinks, but not generator fuel supply.
 * The Tin/Bronze and Quartz/electronics campaigns have intermittent duty;
 * their displayed average demand is not a promise of continuous full utilisation.
 */
export const starterRuns = [
  {
    id:'stock-iron',
    name:'Iron stock · five parts',
    outputs:[['Iron Plate',20],['Iron Rod',50],['Iron Sheet',50],['Iron Wire',30],['Screws',50]],
    recipeChoices:[['Crushed Siterite','Crushed Siterite'],['Iron Ingot','Impure Iron Ingot'],['Iron Plate','Iron Plate'],['Iron Rod','Iron Rod'],['Iron Sheet','Iron Sheet'],['Iron Wire','Iron Wire'],['Screws','Screws']],
    note:'One shared-mall stock cell: 180 Siterite/min from 3 normal miners feeds 3 Crushers and 6 Smelters on Impure Iron Ingot. Each 60/min Crusher lane feeds two 30/min Smelters. Send 90 ingots/min to 3 Plate Constructors and 90 to 6 Rod Constructors. The 60 plates/min feed one Sheet Constructor at 40/min, leaving 20 plates for stock. The 90 rods/min feed one Iron Wire Constructor at 20/min and one Screws Constructor at 20/min, leaving 50 rods for stock. Stock outputs are 20 plates, 50 rods, 50 sheets, 30 iron wire and 50 screws/min. Combine the 75 Gangue/min on a separate Mk.2 belt to one Sink; no return to production. All productive machines have whole counts at 100% clock; 136.5 MW including the Sink. Part Assembly and later mall bays withdraw from these bins, so these rates are cell outputs, not a promise of the full mall net rates.'
  },
  {
    id:'stock-copper',
    name:'Copper stock · five parts',
    outputs:[['Copper Rod',30],['Wire',30],['Cable',30],['Copper Busbars',15],['Copper Sheet',60]],
    recipeChoices:[['Crushed Callanite','Crushed Callanite'],['Copper Ingot','Impure Copper Ingot'],['Copper Rod','Copper Rod'],['Wire','Wire'],['Cable','Cable'],['Copper Busbars','Copper Busbars'],['Copper Sheet','Copper Sheet']],
    note:'One shared-mall stock cell: 120 Callanite/min from 2 normal miners feeds 2 Crushers, then a Mk.2 manifold feeding 5 Smelters on Impure Copper Ingot at 24/min each. Split the 120 ingots/min between 6 Rod Constructors consuming 72 and 2 Sheet Constructors consuming 48. The 108 rods/min supply 3 Wire Constructors at 54/min total, one Busbar Constructor at 24/min, and 30 rods/min to stock. The 90 wire/min supply one Cable Constructor at 60/min and 30 wire/min to stock. Outputs are 30 rods, 30 wire, 30 cable, 15 busbars and 60 sheets/min. Send 50 Gangue/min separately to one Sink. All productive machine counts are whole at 100% clock; 125 MW including the Sink. This cell deliberately uses the impure recipe to avoid a separate magnesium waste stream.'
  },
  {
    id:'stock-concrete',
    name:'Concrete stock · matched 9:8 cell',
    outputs:[['Concrete',120]],
    recipeChoices:[['Crushed Gangue','Crushed Larrussite'],['Concrete','Concrete']],
    note:'The smallest continuously matched Larrussite cell is 9 Crushers to 8 Concrete Constructors: 540 Larrussite/min from 9 normal miners produces 360 Gangue/min for 120 Concrete/min. Keep the nine 60/min ore feeds separate. Merge each group of three 40/min Gangue outputs into a 120/min Mk.2 lane; each of these three lanes feeds two Constructors at 45/min each. Merge their three 30/min manifold tails into a 90/min feed for the last two Constructors. Let input buffers fill before checking steady output. The separate 360 Crushed Larrussite/min waste needs three Mk.2 lanes and three Sinks. Total 225.5 MW including disposal. For a small finite startup batch, reuse one Crusher for 90 seconds with 90 Larrussite: obtain 60 Gangue plus 60 Crushed Larrussite. Run one Concrete Constructor for 80 seconds to turn the 60 Gangue into 20 Concrete; dispose of the other output separately. The finite batch is not 120/min continuous production.'
  },
  {
    id:'stock-biomass',
    name:'Renewable biomass stock',
    outputs:[['Biomass',120]],
    recipeChoices:[['Biomass','Filtrator filter Algal Mass']],
    note:'After Advanced Biomass Energy, one normal Algal Mass Extractor supplies 60 m³/min to 2 Filtrators at 30 m³/min each. Each Filtrator has four separate 15/min Biomass outputs: merge all eight solid outputs into 120 Biomass/min for stock. Keep the short fluid line local; belt the Biomass to storage. The three machines use 40 MW. This stock run does not burn its output or credit future fuel power; a biofuel factory is a separate draw.'
  },
  {
    id:'stock-reanimated-sam',
    name:'Reanimated SAM stock',
    outputs:[['Reanimated SAM',30]],
    recipeChoices:[['Reanimated SAM','Reanimated SAM']],
    note:'After SAM Reanimation research, 2 normal SAM miners supply 120 SAM/min to one Constructor, producing 30 Reanimated SAM/min with no secondary output. The miners, heads and Constructor use 19 MW. Stop when the stock bin is sufficient. This bridges the manual SAM Fluctuator job: 120 Reanimated SAM + 3 Bronze Frames + 9 Caterium Heatsinks make 12 Fluctuators at the Craft Bench, of which one Dimensional Depot uses 10. The Fluctuator gate must also be researched and a Mercer Sphere collected.'
  },
  {
    id:'stock-dirt',
    name:'Dirt stock for farming',
    outputs:[['Dirt',60]],
    note:'One normal Dirt node with a Modular Miner and Standard Mining Head gives two 30/min solid outputs, 60 Dirt/min combined, at 7.5 MW. Merge onto a Mk.1 belt to a stock container and stop when the farming build and soil batches are covered. This is raw extraction, not an invented crafting recipe.'
  },
  {
    id:'stock-siterite',
    name:'Raw Siterite reserve',
    outputs:[['Siterite Ore',60]],
    note:'One normal Siterite node with a Modular Miner and Standard Mining Head gives two 30/min outputs, 60 ore/min combined, at 7.5 MW. Store this as an explicit raw reserve; the HUB costs 20 Siterite. A miner already assigned to the iron cell cannot simultaneously provide its full cell feed and this additional 60/min stock output. Use a separate source or stop the iron job while filling the reserve.'
  },
  {
    id:'stock-construction',
    name:'Construction stock · concrete & glass',
    outputs:[['Concrete',60],['Glass',20]],
    recipeChoices:[['Crushed Gangue','Crushed Larrussite'],['Concrete','Concrete'],['Sand','Coarse Sand'],['Glass','Sloppy Glass']],
    note:'A smaller shared construction cell: 360 fresh Larrussite/min from 6 normal miners feeds 6 Crushers, producing 240 Gangue/min. Merge each set of three 40/min Gangue outputs onto a 120/min Mk.2 lane. Feed two Concrete Constructors from each lane, consuming 90/min per lane; merge the two 30/min manifold tails to one Coarse Sand Constructor. Its 30 Sand/min feeds one Sloppy Glass Smelter. Net stock is 60 Concrete and 20 Glass/min. Send the separate 240 Crushed Larrussite/min through two Mk.2 waste lanes to two Sinks. All productive counts are whole: 6 miners, 6 Crushers, 5 Constructors and 1 Smelter; 153 MW including the Sinks. Use this instead of the larger concrete-only cell when both bins need filling. The Gangue is deliberately made from fresh ore, never borrowed from another factory waste line.'
  },
  {
    id:'stock-tin-bronze',
    name:'Tin & bronze · shared assembly campaign',
    outputs:[['Tin Plate',20],['Reinforced Iron Plate',5],['Rotor',5],['Modular Frame',2],['Smooth Belt Drive',10],['Bronze Pipes',12],['Bronze Frame',2],['Tinned Wire',20]],
    recipeChoices:[['Iron Ingot','Impure Iron Ingot'],['Copper Ingot','Impure Copper Ingot'],['Tin Ingot','Impure Tin Ingot']],
    note:'One assembly section for eight mall stock bins. Commission it in layers: smelt iron, copper and tin; prepare plates, screws, wire and busbars; make Tin Plate and Rotor; then Reinforced Plate, bronze beams/pipes, Tinned Sheet and Tin Rod; finally Modular Frame, Bronze Frame, Smooth Belt Drive and Tinned Wire. The displayed plan supplies every ingredient from fresh extraction, including intermediate preparation: no free imported ingots or stock credit. Its 27 production/extraction rows reserve 480.5 MW including disposal with the saved normal-node settings. Requested rates are average net stock production. Whole installed machines run at 100% clock when fed and may pause; this is not an all-machines-full ratio. Reuse matching idle smelting, Constructor and Assembler bays between campaigns rather than building eight isolated factories. If the campaign runs simultaneously with the iron/copper cells, supply its additional demand and power; shared hardware cannot perform two jobs at once.'
  },
  {
    id:'stock-quartz-electronics',
    name:'Quartz & electronics · shared finishing campaign',
    outputs:[['Quartz Crystal',10],['Quickwire',30],['Solar Cell',3],['AI Limiter',1],['Caterium Heatsink',2]],
    note:'One finishing section for the five specialist stock bins, after Advanced Sorting and the listed Caterium/Quartz MAM research. Start with fresh Kyalite, Aurovite, Larrussite and supporting metal supplies. Prepare Quartz Crystal, silica, zinc plates, caterium ingots/plates and copper busbars; then make Quickwire, Solar Cells, AI Limiters and Caterium Heatsinks. The plan closes all upstream ingredients and separates every secondary output for disposal; it does not import unexplained Silica, Zinc Plates or Caterium Plate. Its 30 production/extraction rows reserve 687.5 MW including disposal under the saved normal-node settings. These are average net stock rates, with intermittent 100%-clock machine operation. Fill bins in batches and reuse idle preparation bays from the shared mall. Simultaneous campaigns need additional supplied capacity; do not add a stock output and assume it is also available in full to another consumer.'
  },
];

export default starterRuns;
