export interface MacroCategoryDef {
  id: string;
  label: string;
  subcategories: string[];
}

export const MACRO_CATEGORIES: MacroCategoryDef[] = [
  {
    id: "fantasy-weapons",
    label: "Fantasy Weapons & Unhelpful Armor",
    subcategories: [
      "Overly Ceremonial Polearms",
      "Shields Built for Extremely Specific Threats",
      "Daggers Made From Unsuitable Materials",
      "Helmets With Terrible Visibility",
      "Enchanted Bows That Only Shoot Odd Projectiles",
      "Gauntlets For Non-Combat Chores",
      "Scabbards Missing Their Original Sword",
      "Wizard Staves Bought at Clearance",
      "Siege Engines Scaled For Squirrels",
      "Boots With Counterproductive Enchantments",
    ],
  },
  {
    id: "90s-memorabilia",
    label: "90s & Y2K Memorabilia",
    subcategories: [
      "Translucent Atomic-Plastic Electronics",
      "Cereal-Box Trial CD-ROMs",
      "Inflatable Dorm-Room Furniture",
      "Mall Photo-Booth Props & Frames",
      "Forgotten Virtual Pet Knockoffs",
      "Holographic Slap Bracelets & Pogs",
      "Video Rental Store Late-Fee Artifacts",
      "Neon Gel Pens & Scented Erasers",
      "Roller-Rink Carpet Swatches & Tokens",
      "Y2K Preparedness Pamphlets & Stickers",
    ],
  },
  {
    id: "abstract-thoughts",
    label: "Abstract Thoughts & Fleeting Sensations",
    subcategories: [
      "Sudden Minor Domestic Realizations",
      "Awkward Elevator Micro-Moments",
      "Phantom Childhood Nostalgia Whiffs",
      "Unplaced Déjà Vu in Mundane Places",
      "Half-Remembered Dreams About Geometry",
      "Polite Hesitations at Four-Way Stops",
      "3 AM Philosophical Conclusions",
      "False Memories of Songs That Never Existed",
      "Mild Suspicion Toward Inanimate Objects",
      "Unearned Confidence Before Reading Instructions",
    ],
  },
  {
    id: "household-objects",
    label: "Everyday Household & Junk-Drawer Objects",
    subcategories: [
      "Orphaned Appliance Attachments",
      "Mystery Keys To Long-Gone Locks",
      "Rubber Bands Frozen Into Fossil Shapes",
      "Instruction Manuals In Seven Languages For A Toaster",
      "Drawer Dividers Holding Only Lint & Washers",
      "Coasters From Restaurants That Closed Decades Ago",
      "Allen Wrenches From Forgotten Flat-Pack Furniture",
      "Refrigerator Magnets Promoting Retired Plumbers",
      "Decorative Soap Nobody Was Allowed To Use",
      "Tupperware Lids Matching Zero Known Containers",
    ],
  },
  {
    id: "food-snacks",
    label: "Food, Snacks & Questionable Culinary Relics",
    subcategories: [
      "Discontinued Limited-Edition Sodas",
      "Hyper-Sculpted Diner Garnishes",
      "Novelty Pasta Shapes That Cook Unevenly",
      "Condiment Packets From Extinct Fast-Food Chains",
      "Hard Candies Fused Into Grandmotherly Glass Bowls",
      "Artisanal Pickles Nobody Requested",
      "Birthday Cake Toppers With Confusing Themes",
      "Fortune Cookie Slips With Vague Bureaucratic Advice",
      "Vending-Machine Snacks Stuck On Coil B4",
      "Commemorative Tin Biscuits From Minor Royal Weddings",
    ],
  },
  {
    id: "famous-artworks",
    label: "Famous & Almost-Famous Artworks",
    subcategories: [
      "Masterpieces Painted From Five Feet To The Left",
      "Museum Gift-Shop Misprint Postcards",
      "Rejected Preliminary Sketches Of Famous Statues",
      "Still Lifes Featuring One Anachronistic Snack",
      "Frames Much More Expensive Than Their Painting",
      "Renaissance Portraits Of Mildly Annoyed Pets",
      "Abstract Sculptures Mistaken For Coat Racks",
      "Miniature Oil Paintings Inside Walnut Shells",
      "Audio-Guide Headsets Stuck On Track 47",
      "Forgotten Civic Murals In Post Office Lobbies",
    ],
  },
  {
    id: "clothing-haberdashery",
    label: "Clothing & Peculiar Haberdashery",
    subcategories: [
      "Souvenir Hats From Nonexistent Regattas",
      "Single Gloves Found On Park Benches",
      "Ties Patterned With Obscure Infrastructure",
      "Ceremonial Sashes For Unclear Civic Offices",
      "Socks Woven With Oddly Specific Warnings",
      "Pocket Squares Folded Into Impossible Origami",
      "Belt Buckles Commemorating County Trade Expos",
      "Windbreakers From 1991 Corporate Retreats",
      "Velcro Sneakers That Light Up Out Of Sync",
      "Monograms Belonging To Someone Named Q.Z.",
    ],
  },
  {
    id: "obsolete-tech",
    label: "Obsolete Tech & Shareware Relics",
    subcategories: [
      "Proprietary Charging Cables With 19 Pins",
      "Floppy Disks Labeled With Cryptic Handwriting",
      "Pagers Preloaded With One Mysterious Beep",
      "Beige Computer Mice With Heavy Rubber Trackballs",
      "Electronic Pocket Organizers With 2KB Memory",
      "CRT Screen Savers Trapped In Physical Form",
      "Universal Remotes Programmed To Nothing",
      "Dot-Matrix Printer Banner Borders",
      "Cordless Phone Antennas Held Together By Tape",
      "Shareware Registration Postcards Never Mailed",
    ],
  },
  {
    id: "bureaucracy-ephemera",
    label: "Bureaucratic Paperwork & Expired Coupons",
    subcategories: [
      "Triplicate Carbon-Copy Forms For Imaginary Permits",
      "Coupons Expired Since The Early Seventies",
      "Library Due-Date Cards Stamped Into Oblivion",
      "Punch Cards One Hole Short Of A Free Sandwich",
      "Laminated Badges For One-Day Conferences",
      "Receipts For Exactly One Single Bolt",
      "Raffle Tickets Nobody Called The Number Of",
      "Parking Validation Stamps From Demolished Garages",
      "Warranty Cards For Indestructible Anvils",
      "Waiting-Room Number Slips (#99)",
    ],
  },
  {
    id: "board-game-orphans",
    label: "Board Game Orphans & Tabletop Pieces",
    subcategories: [
      "Pewter Tokens Depicting Unclear Occupations",
      "Dice With Unhelpful Non-Numeric Faces",
      "Chance Cards From Extremely Petty Editions",
      "Plastic Hourglasses Running 47 Seconds",
      "Cardboard Coins Denoted In Fractional Turnips",
      "Rulebook Errata Slips Causing More Arguments",
      "Wooden Meeples Wearing Tiny Top Hats",
      "Spinners That Always Land On The Line",
      "Scorepads Filled Out By Competitive Cousins",
      "Hex Tiles Depicting Mildly Marshy Beige",
    ],
  },
  {
    id: "mall-arcade",
    label: "Mall Kiosk & Arcade Prize Counter Oddities",
    subcategories: [
      "4,000-Ticket Top-Shelf Dust Collectors",
      "Laser-Etched Glass Cubes With Dolphins",
      "Fountain Wishes Salvaged During Maintenance",
      "Food-Court Toothpick Flags",
      "Claw-Machine Plushies With Asymmetric Eyes",
      "Personalized Mini License Plates For Rare Names",
      "Glow-In-The-Dark Finger Traps",
      "Airbrushed T-Shirt Stencil Cutouts",
      "Arcade Tokens Valid Only At 'FunZone 1994'",
      "Mood Rings Permanently Locked On 'Puzzled'",
    ],
  },
  {
    id: "cryptid-naturalia",
    label: "Cryptid Ephemera & Unverified Natural History",
    subcategories: [
      "Plaster Casts Of Suspiciously Boot-Shaped Tracks",
      "Feathers Allegedly Dropped By Regional Mothmen",
      "Pinecones Shaped Uncannily Like Historical Figures",
      "Geodes Containing Surprisingly Plain Gravel",
      "Pressed Four-Leaf Clovers That Have Five Leaves",
      "Driftwood Resembling A Mildly Surprised Eel",
      "Jarred Swamp Fog From Unmapped Counties",
      "Shed Antlers Of Miniature Mythical Deer",
      "Blurrily Photographed Silhouettes On Polaroids",
      "Field-Guide Footnotes Corrected In Pencil",
    ],
  },
  {
    id: "retro-futurism",
    label: "Retro-Futuristic Gadgets & Space-Age Debris",
    subcategories: [
      "Chrome Atomic-Age Egg Timers",
      "Vacuum-Tube Pocket Translators",
      "Rayguns That Only Warm Up Toast",
      "World's Fair Monorail Commemorative Pennies",
      "Bakelite Dials Calibrated From 'Calm' To 'Zest'",
      "Jetpack Inspection Tags",
      "Lunar Golf Tees Never Taken Out Of The Bag",
      "Analog Radar Screens Showing Only Pigeons",
      "21st-Century Concept Sketches Drawn In 1958",
      "Foil Space-Food Tubes Of Beige Pudding",
    ],
  },
  {
    id: "school-locker",
    label: "School Supply Nostalgia & Locker Finds",
    subcategories: [
      "Trapper Keeper Inserts With Radical Grids",
      "Protractors Snapped At Exactly 63 Degrees",
      "Chalkboard Felt Erasers Caked In Pastel Dust",
      "Book-Fair Posters Of Lamborghini Countaches",
      "Overhead Projector Transparency Sheets",
      "Wooden Hall Passes The Size Of Canoe Paddles",
      "Mechanical Pencil Lead Tubes With One Piece Left",
      "Paperback Textbooks Covered In Brown Grocery Bags",
      "Science-Fair Ribbons For 'Honorable Effort'",
      "Cafeteria Sporks With Bent Outer Tines",
    ],
  },
  {
    id: "roadside-motel",
    label: "Roadside Attraction & Vintage Motel Ephemera",
    subcategories: [
      "Diamond-Shaped Plastic Motel Key Fobs",
      "Souvenir Pennies Elongated By Hand-Crank Machines",
      "Brochures For Mystery Spots Where Balls Roll Uphill",
      "Postcards Of The World's Second-Largest Twine Ball",
      "Matchbooks From Steakhouses Shaped Like Hats",
      "Dashboard Hula Figurines Wearing Tiny Parkas",
      "View-Master Reels Of Caverns Lit By Colored Bulbs",
      "Bumper Stickers Surviving Only By Adhesive Grit",
      "Folding Paper Road Maps Impossible To Refold",
      "Diner Coffee Mugs Weighing Three Pounds Empty",
    ],
  },
  {
    id: "alchemy-potions",
    label: "Alchemical Vials & Mildly Pointless Potions",
    subcategories: [
      "Elixirs That Only Change Your Hair Part Side",
      "Tinctures Of Distilled Tuesday Afternoon",
      "Stoppered Vials Of Sparkly Lukewarm Tap Water",
      "Mortars & Pestles Used Exclusively For Cinnamon",
      "Scrolls Of Transmuting Tin Into Slightly Shinier Tin",
      "Beakers Bubbling At One Bubble Per Month",
      "Wax-Sealed Flasks Labeled 'Do Not Shake (Already Shaken)'",
      "Powdered Moonbeam Substitute (Artificial Flavor)",
      "Alembics Twisted Like Pretzels",
      "Philosopher's Pebbles (Junior Grade)",
    ],
  },
  {
    id: "musical-oddities",
    label: "Musical Oddities & Obscure Sound-Makers",
    subcategories: [
      "Kazoos Tuned Strictly To F-Sharp",
      "Slide Whistles Missing Their Stopper",
      "Tuning Forks Calibrated To Refrigerator Hum",
      "Accordion Bellows Patched With Postage Stamps",
      "Triangle Beaters Made Of Braided Brass",
      "Vinyl 45-RPM Adapters In Rare Marbled Colors",
      "Sheet Music For Solo Bicycle Bell",
      "Metronomes That Speed Up When Watched",
      "Cowbells Muffled With Vintage Velvet",
      "Music Boxes Playing Only The Middle Four Bars",
    ],
  },
  {
    id: "office-breakroom",
    label: "Office Cubicle Artifacts & Breakroom Mysteries",
    subcategories: [
      "Staplers Jammed Since Q3 2008",
      "Motivational Posters About Unrelated Rowboats",
      "Coffee Carafes With Permanent Quarter-Inch Rings",
      "Desk Toys Whose Kinetic Balls Lost Momentum",
      "Sticky Notes Containing Passwords To Nothing",
      "Rubber Stamps Reading 'SEMI-URGENT'",
      "Cubicle Nameplates For 'TEMP - DO NOT REMOVE'",
      "Dry-Erase Markers That Write Only In Faint Ghost Gray",
      "Paperclip Chains Spanning Fourteen Feet",
      "Breakroom Fridge Labels Written In Passive-Aggressive Caps",
    ],
  },
  {
    id: "yard-sale-garden",
    label: "Gardening Quirks & Yard-Sale Finds",
    subcategories: [
      "Garden Gnomes Dressed For Wrong Seasons",
      "Wind Chimes Made Of Mismatched Silverware",
      "Watering Cans Shaped Like Philosophical Ducks",
      "Seed Packets For Heirloom Beige Radishes",
      "Sun-Faded Pink Plastic Lawn Flamingos",
      "Sundials Placed Permanently Indoors",
      "Terracotta Pots Painted By Enthusiastic Toddlers",
      "Birdhouses Modelled After Brutalist Post Offices",
      "Price Stickers Saying '25¢ OBO' Still Attached",
      "Trowels Engraved With Retired Gardening Club Mottos",
    ],
  },
  {
    id: "maritime-flotsam",
    label: "Maritime Flotsam & Beachcomber Finds",
    subcategories: [
      "Sea-Glass Shards Frosted Like Sour Candy",
      "Messages In Bottles Asking About Car Warranties",
      "Cork Fishing Floats Nibble-Marked By Crabs",
      "Brass Spyglasses That Zoom Out Instead Of In",
      "Ships-In-Bottles Depicting Tiny Tugboat Traffic Jams",
      "Nautical Knots Nobody Can Untie Or Name",
      "Lighthouse Postcards Taken In Thick Fog",
      "Barnacle-Encrusted Teacups",
      "Pocket Compasses Pointing Toward Nearest Bakery",
      "Shells That Sound Like Distant Dial-Up Instead Of Ocean",
    ],
  },
  {
    id: "horology-measurements",
    label: "Horology, Odd Clocks & Peculiar Rulers",
    subcategories: [
      "Pocket Watches With Thirteen Uneven Hours",
      "Tape Measures Marked Only In 'Roughly'",
      "Cuckoo Clocks Inhabited By Shy Finches",
      "Barometers Predicting Only 'Indoors'",
      "Thermometers Scaled In Historical Cozy Units",
      "Kitchen Timers Shaped Like Mildly Judgemental Tomatoes",
      "Spirit Levels With Two Arguing Bubbles",
      "Calipers For Measuring Single Blueberries",
      "Calendars For Leap Years That Never Happened",
      "Stopwatch Split-Buttons Stuck At 00:00.01",
    ],
  },
  {
    id: "theatrical-props",
    label: "Theatrical Props & Backstage Leftovers",
    subcategories: [
      "Papier-Mâché Goblets Painted Metallic Gold",
      "Breakaway Sugar-Glass Bottles Intact Since Act II",
      "Velvet Stage Curtains Snipped Into Bookmarks",
      "Fake Mustaches Losing Their Spirit Gum",
      "Cardboard Crowns Lined With Foil Gum Wrappers",
      "Cue Cards Written Backwards In Giant Marker",
      "Stage Telephones That Ring Exclusively Via Mouth-Sound",
      "Wooden Rubber Chickens From Serious Dramas",
      "Playbills Crediting 'Townsperson #14'",
      "Trapdoor Hinges Squeaking In Dramatic Minor",
    ],
  },
  {
    id: "cosmic-oddities",
    label: "Cosmic Debris & Amateur Astronomy Relics",
    subcategories: [
      "Micrometeorites Indistinguishable From Driveway Pebbles",
      "Glow-In-The-Dark Ceiling Constellations Missing Orion's Belt",
      "Cardboard Eclipse Viewers Used Once",
      "Planetarium Ticket Stubs To Pluto Retrospectives",
      "Star Charts Annotated With Imaginary Spoons",
      "Telescope Lens Caps Dropped In Tall Grass",
      "Tiny Brass Orreries Missing Mercury",
      "Meteor-Shower Lawn-Chair Cupholders",
      "Radio-Telescope Printouts Of Microwave Burritos",
      "Souvenir Vials Of Simulated Regolith",
    ],
  },
  {
    id: "victorian-parlor",
    label: "Victorian Parlor Tricks & Antique Knick-Knacks",
    subcategories: [
      "Stereoscope Cards Of Mildly Scenic Canals",
      "Porcelain Thimbles Depicting Municipal Bridges",
      "Zoetrope Paper Strips Of Trotting Badgers",
      "Silver Calling-Card Trays For Hermits",
      "Pressed-Velvet Photo Albums Of Stern Uncles",
      "Clockwork Tin Frogs Missing Their Winding Key",
      "Tea Strainers Shaped Like Tiny Submarines",
      "Snuffboxes Repurposed For Peppermints",
      "Hand-Tinted Lantern Slides Of Icebergs",
      "Hatpins Topped With Glass Gooseberries",
    ],
  },
  {
    id: "stationery-seals",
    label: "Stationery, Stamps & Wax-Seal Mysteries",
    subcategories: [
      "Postage Stamps From Micronations Of Three People",
      "Wax Seals Bearing An Ambiguous Turnip Crest",
      "Fountain Pen Nibs Bent During Heated Postscripts",
      "Air-Mail Envelopes Bordered In Faded Stripes",
      "Blotting Paper Mirror-Imaged With Half A Recipe",
      "Embossing Pliers That Crimp Tiny Owls",
      "Bookmark Tassels Detached From Their Bookmark",
      "Pencil Sharpeners Shaped Like Miniature Globes",
      "Rubber Erasers Carved Into Homemade Stamps",
      "Thank-You Notes Left Unsent Since 2003",
    ],
  },
  {
    id: "sports-gym",
    label: "Sports Oddities & Gym-Class Relics",
    subcategories: [
      "Rainbow Parachute Wedges From Elementary Gym",
      "Bowling Shoes In Size 8½ Left Only",
      "Foam Finger Pointers Saying '#4!'",
      "Ping-Pong Balls With One Tiny Thumb Dent",
      "Trophies For 'Most Consistent Benchwarmer'",
      "Whistles On Braided Lanyards Missing Their Pea",
      "Mini-Golf Pencils With Zero Eraser",
      "Shuffleboard Pucks Retired For Wobbling",
      "Badminton Shuttlecocks Perched On Roof Gutters",
      "Sweatbands Embroidered With Chess Openings",
    ],
  },
  {
    id: "weather-in-jars",
    label: "Captured Weather & Atmospheric Vessels",
    subcategories: [
      "Bottled October Drizzle From A Bus Stop",
      "Static Electricity Harvested From Wool Sweaters",
      "Snowglobes Whose Flakes Float Upward",
      "Sunbeams Preserved In Amber Mason Jars",
      "Tiny Dust Devils Contained In Salt Shakers",
      "Humidity Samples From 1998 Greenhouses",
      "Frost Ferns Scraped Off Attic Panes",
      "Breezes That Only Rustle Receipts",
      "Barometric Sighs Sealed In Corked Tubes",
      "Miniature Rainbows Refracted Through Jam Jars",
    ],
  },
  {
    id: "lost-and-found",
    label: "Lost-and-Found Box Hall of Fame",
    subcategories: [
      "Umbrellas That Flip Inside Out At 4 MPH",
      "Reading Glasses With Different Prescriptions Per Lens",
      "Water Bottles Covered In Overlapping Indie Stickers",
      "Mittens Clipped To Nothing",
      "Earphone Cases Containing Only One Wrong Earbud",
      "Bicycle Bells Detached From Any Handlebar",
      "Lunchboxes Featuring Crossover Cartoons That Never Met",
      "Keychains With Seven Loyalty Tags And Zero Keys",
      "Scarves Knitted To Impractical Twelve-Foot Lengths",
      "Bookmark Ribbons Pulled From Mystery Novels",
    ],
  },
  {
    id: "hyper-specific-utensils",
    label: "Culinary Utensils With One Hyper-Specific Job",
    subcategories: [
      "Cast-Aluminum Olive Pitters For Left-Handed Hosts",
      "Grapefruit Spoons With Dramatic Serrations",
      "Butter Curlers Used Once Every Decade",
      "Egg Toppers Resembling Medieval Devices",
      "Banana Slicers Shaped Like Cheerful Dachshunds",
      "Corn-Cob Holders Styled As Tiny Corn Cobs",
      "Nutmeg Graters With Secret Compartments",
      "Toast Tongs Crafted From Laminated Bamboo",
      "Melon Ballers Producing Slightly Trapezoidal Cubes",
      "Spaghetti Measurers For '1.37 People'",
    ],
  },
  {
    id: "hardware-fragments",
    label: "Architectural Fragments & Hardware-Store Mysteries",
    subcategories: [
      "Paint Swatches With Overly Poetic Names",
      "Brass Doorknobs That Turn Both Ways Without Latching",
      "Ceramic Bathroom Tiles With One Tiny Painted Frog",
      "Light-Switch Plates For Three Switches In Weird Spots",
      "Sample Carpet Squares From Bowling Alleys",
      "Cabinet Hinges Engineered At 117 Degrees",
      "Chain-Pull Finials Shaped Like Tiny Acorns",
      "Brass House Numbers For Fraction '½'",
      "Window Latches Cast In Art-Deco Zigzags",
      "Mystery Washers Left Over After Successful Repairs",
    ],
  },
];

export const CREATIVE_TWISTS: string[] = [
  "bearing a tiny hand-lettered label that raises more questions than answers",
  "preserved in pristine condition despite having zero practical use",
  "clearly crafted with immense artisan pride for an unclear occasion",
  "rescued from a church basement rummage sale in 1996",
  "mildly warm to the touch for no scientific reason",
  "accompanied by a tiny certificate of non-authenticity",
  "finished in an unmistakable 1980s woodgrain veneer",
  "minted in a commemorative run of exactly one",
  "engraved on the underside with polite instructions",
  "designed by a committee that never met in person",
  "featuring an unnecessary bubble level built into the side",
  "wrapped half-way in faded carnival prize ribbon",
  "painted in nostalgic seafoam green and mustard yellow",
  "stamped 'INSPECTED BY #00' in crisp purple ink",
  "shaped with inexplicable aerodynamic fins",
  "stored inside a velvet-lined matchbox",
  "bearing faint tooth-marks from a mischievous housecat",
  "calibrated exclusively for leap-day afternoons",
  "decorated with tiny embossed stars along the rim",
  "folded with geometric precision nobody dares unfold",
  "emitting the faintest scent of cedarwood and library paste",
  "cast from anodized aluminum in vivid cobalt blue",
  "repaired lovingly with a single strip of copper foil",
  "weighted at the base so it always wobbles back upright",
  "sold originally via late-night 2 AM infomercial",
  "numbered '#4 of 3' in gold leaf",
  "featuring a tiny viewing window into empty space",
  "textured like waffle-cone pattern in solid brass",
  "built with a flip-open lid revealing nothing inside",
  "carried across three continents by mistake in a coat pocket",
  "crafted from marbled butterscotch Bakelite",
  "adorned with a miniature enamel crest of a pigeon",
  "sealed in vintage blister-pack cardboard",
  "balanced on three tiny claw-and-ball feet",
  "tinted iridescent pearlescent violet",
  "complete with a tiny braided silk wrist strap",
  "marked 'FOR DISPLAY PURPOSES ONLY' on both sides",
  "hollowed out to hold a single Tic-Tac",
  "etched with an overly dramatic Latin motto about snacks",
  "molded in glow-in-the-dark pale celadon plastic",
];

export interface SampledCategorySeed {
  subcategoryKey: string;
  macroId: string;
  macroLabel: string;
  subcategory: string;
  twist: string;
}

/**
 * Inverse-frequency weighted sampler across all 300 subcategories so the catalog
 * continuously explores fresh territory rather than clustering in a few tropes.
 */
export function sampleCategorySeed(
  usageMap: Map<string, number>,
  randomFn: () => number = Math.random
): SampledCategorySeed {
  const candidates: Array<{
    key: string;
    macroId: string;
    macroLabel: string;
    sub: string;
    weight: number;
  }> = [];

  let totalWeight = 0;
  for (const macro of MACRO_CATEGORIES) {
    for (const rawSub of macro.subcategories) {
      const sub = rawSub.trim();
      const key = `${macro.id}::${sub}`;
      const count = usageMap.get(key) ?? 0;
      const weight = 1 / Math.pow(count + 1, 1.3);
      candidates.push({
        key,
        macroId: macro.id,
        macroLabel: macro.label,
        sub,
        weight,
      });
      totalWeight += weight;
    }
  }

  let r = randomFn() * totalWeight;
  let picked = candidates[0]!;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) {
      picked = c;
      break;
    }
  }

  const twist =
    CREATIVE_TWISTS[Math.floor(randomFn() * CREATIVE_TWISTS.length)] ??
    CREATIVE_TWISTS[0]!;

  return {
    subcategoryKey: picked.key,
    macroId: picked.macroId,
    macroLabel: picked.macroLabel,
    subcategory: picked.sub,
    twist,
  };
}
