const tree = {
    'Browser': ['Y', 'Surfer'], 'Strider': ['K', 'Fighter'], 'Automingler': ['J', 'Mingler'], 'Mingler': ['K', 'Hexa Tank'], 'Necromancer': ['Y', 'Necromancer'], 'Underseer': ['I', 'Director'], 'Firework': ['Y', 'Rocketeer'], 'Leviathan': ['H', 'Rocketeer'], 'Rocketeer': ['K', 'Launcher'], 'Annihilator': ['U', 'Destroyer'], 'Destroyer': ['Y', 'Pounder'], 'Swarmer': ['I', 'Launcher'], 'Twister': ['U', 'Launcher'], 'Launcher': ['H', 'Pounder'], 'Fighter': ['Y', 'TriAngle'], 'Surfer': ['K', 'TriAngle'], 'Sprayer': ['H', 'Machine Gun'], 'Redistributor': ['Y', 'Sprayer'], 'Spreadshot': ['U', 'Triple Shot'], 'Gale': ['I', 'Octo Tank'], 'Crackshot': ['J', 'Penta Shot'], 'Penta Shot': ['Y', 'Triple Shot'], 'Twin': ['Y', 'Basic'], 'Double Twin': ['Y', 'Twin'], 'Triple Shot': ['U', 'Twin'], 'Sniper': ['U', 'Basic'], 'Machine Gun': ['I', 'Basic'], 'Gunner': ['I', 'Machine Gun'], 'Machine Gunner': ['H', 'Gunner'], 'Nailgun': ['U', 'Gunner'], 'Pincer': ['K', 'Nailgun'], 'Flank Guard': ['H', 'Basic'], 'Hexa Tank': ['Y', 'Flank Guard'], 'Octo Tank': ['Y', 'Hexa Tank'], 'Cyclone': ['U', 'Hexa Tank'], 'HexaTrapper': ['I', 'Hexa Tank'], 'TriAngle': ['U', 'Flank Guard'], 'Booster': ['U', 'TriAngle'], 'Falcon': ['I', 'TriAngle'], 'Bomber': ['H', 'TriAngle'], 'AutoTriAngle': ['J', 'TriAngle'], 'Auto3': ['I', 'Flank Guard'], 'Auto5': ['Y', 'Auto3'], 'Mega3': ['U', 'Auto3'], 'Auto4': ['I', 'Auto3'], 'Banshee': ['H', 'Auto3'], 'Trap Guard': ['H', 'Flank Guard'], 'Buchwhacker': ['Y', 'Trap Guard'], 'Gunner Trapper': ['U', 'Trap Guard'], 'Conqueror': ['J', 'Trap Guard'], 'Bulwark': ['K', 'Trap Guard'], 'TriTrapper': ['J', 'Flank Guard'], 'Fortress': ['Y', 'TriTrapper'], 'Septatrapper': ['I', 'TriTrapper'], 'Whirlwind': ['H', 'Septatrapper'], 'Nona': ['Y', 'Septatrapper'], 'SeptaMachine': ['U', 'Septatrapper'], 'Architect': ['H', 'TriTrapper'], 'TripleTwin': ['K', 'Flank Guard'], 'Director': ['J', 'Basic'], 'Pounder': ['K', 'Basic'],
    'Healer': ['X', 'Basic'], 'Physician': ['Space', 'Healer'], 'Basic': [], 'Overseer': ['Y', 'Director'], 'Cruiser': ['U', 'Director'], 'Spawner': ['H', 'Director'], 'Director Drive': ['J', 'Director'], 'Honcho': ['K', 'Director'], 'Manager': ['X', 'Director'], 'Foundry': ['Space', 'Spawner'], 'Top Banana': ['Space', 'Foundry'], 'Shopper': ['K', 'Foundry'], 'Mega Spawner': ['I', 'Spawner'], 'Ultra Spawner': ['Y', 'Mega Spawner'],
};

const getPath = (name) => {
    let p = '', o = tree[name];
    while (o) {
        p = o[0] + p;
        let n = o[1];
        if (n === 'Basic') break;
        o = tree[n];
    }
    return p;
};

const indicesToKeys = (input) => {
    let indices = input;
    if (typeof input === 'string') {
        indices = input.trim().split(/\s+/).filter(x => x.length > 0).map(x => parseInt(x));
    }
    if (!Array.isArray(indices)) return '';
    const keys = ['Y', 'U', 'I', 'H', 'J', 'K', 'L', ';', "'"];
    return indices.map(idx => keys[idx] || '').join('');
};

const convertStats = (statsArr) => {
    let flat = new Array(10).fill(0);
    statsArr.forEach(([idx, val]) => {
        if (idx >= 0 && idx < 10) flat[idx] = val;
    });
    return flat;
};

module.exports = {
    tree,
    getPath,
    indicesToKeys,
    convertStats
};
