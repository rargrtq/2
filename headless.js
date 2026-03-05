const fs = require('fs');
const ws = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { pack, unpack } = require("msgpackr");
const url = require('url');
const { fork } = require('child_process');
const fetchModule = require('node-fetch');
const realFetch = fetchModule.default || fetchModule;
const readline = require('readline');
const { decode_packet, BroadcastParser, RoomParser, MazeMapManager, yield_control_comps_from_angle } = require('./pathfinding');
const commandFile = 'launch.bat';

// ===== CHECK FOR COMMAND LINE ARGUMENTS =====
const args = process.argv.slice(2);
let autoStartCount = 0;
let autoStartMode = false;

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--count' && args[i + 1]) {
    autoStartCount = parseInt(args[i + 1]);
    autoStartMode = true;
    break;
  }
}

function checkBatchCommands() {
  try {
    if (fs.existsSync(commandFile)) {
      const command = fs.readFileSync(commandFile, 'utf8').trim();
      fs.unlinkSync(commandFile);
      console.log(`[BATCH] Received command: ${command}`);
    }
  } catch (e) { }
}

setInterval(checkBatchCommands, 2000);
process.on('uncaughtException', function (e) {
  if (e && e.type === 'system' && (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT')) return;
  if (e && e.message && e.message.includes('FetchError')) return;
  console.log(e);
});
process.on('unhandledRejection', function (e) {
  if (e && e.type === 'system') return;
  if (e && e.code && (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT')) return;
  if (e && e.name === 'FetchError') return;
});

if (!process.env.IS_WORKER) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const configFilePath = 'bot_config.json';

  const getPath = function (name, tree) {
    let p = '', o = tree[name];
    while (o) { p = o[0] + p; let n = o[1]; if (n === 'Basic') { break } o = tree[n] }
    return p;
  };

  const tree = {
    'Browser': ['Y', 'Surfer'], 'Strider': ['K', 'Fighter'], 'Automingler': ['J', 'Mingler'], 'Mingler': ['K', 'Hexa Tank'], 'Necromancer': ['Y', 'Necromancer'], 'Underseer': ['I', 'Director'], 'Firework': ['Y', 'Rocketeer'], 'Leviathan': ['H', 'Rocketeer'], 'Rocketeer': ['K', 'Launcher'], 'Annihilator': ['U', 'Destroyer'], 'Destroyer': ['Y', 'Pounder'], 'Swarmer': ['I', 'Launcher'], 'Twister': ['U', 'Launcher'], 'Launcher': ['H', 'Pounder'], 'Fighter': ['Y', 'TriAngle'], 'Surfer': ['K', 'TriAngle'], 'Sprayer': ['H', 'Machine Gun'], 'Redistributor': ['Y', 'Sprayer'], 'Spreadshot': ['U', 'Triple Shot'], 'Gale': ['I', 'Octo Tank'], 'Crackshot': ['J', 'Penta Shot'], 'Penta Shot': ['Y', 'Triple Shot'], 'Twin': ['Y', 'Basic'], 'Double Twin': ['Y', 'Twin'], 'Triple Shot': ['U', 'Twin'], 'Sniper': ['U', 'Basic'], 'Machine Gun': ['I', 'Basic'], 'Gunner': ['I', 'Machine Gun'], 'Machine Gunner': ['H', 'Gunner'], 'Nailgun': ['U', 'Gunner'], 'Pincer': ['K', 'Nailgun'], 'Flank Guard': ['H', 'Basic'], 'Hexa Tank': ['Y', 'Flank Guard'], 'Octo Tank': ['Y', 'Hexa Tank'], 'Cyclone': ['U', 'Hexa Tank'], 'HexaTrapper': ['I', 'Hexa Tank'], 'TriAngle': ['U', 'Flank Guard'], 'Fighter': ['Y', 'TriAngle'], 'Booster': ['U', 'TriAngle'], 'Falcon': ['I', 'TriAngle'], 'Bomber': ['H', 'TriAngle'], 'AutoTriAngle': ['J', 'TriAngle'], 'Surfer': ['K', 'TriAngle'], 'Auto3': ['I', 'Flank Guard'], 'Auto5': ['Y', 'Auto3'], 'Mega3': ['U', 'Auto3'], 'Auto4': ['I', 'Auto3'], 'Banshee': ['H', 'Auto3'], 'Trap Guard': ['H', 'Flank Guard'], 'Buchwhacker': ['Y', 'Trap Guard'], 'Gunner Trapper': ['U', 'Trap Guard'], 'Conqueror': ['J', 'Trap Guard'], 'Bulwark': ['K', 'Trap Guard'], 'TriTrapper': ['J', 'Flank Guard'], 'Fortress': ['Y', 'TriTrapper'], 'Septatrapper': ['I', 'TriTrapper'], 'Whirlwind': ['H', 'Septatrapper'], 'Nona': ['Y', 'Septatrapper'], 'SeptaMachine': ['U', 'Septatrapper'], 'Architect': ['H', 'TriTrapper'], 'TripleTwin': ['K', 'Flank Guard'], 'Director': ['J', 'Basic'], 'Pounder': ['K', 'Basic'],
  };

  let PRESETS = {
    'Testing & Classic': [
      { tanks: [0, 3, 0], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [0, 3, 1], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [0, 3, 2], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [6, 1, 2], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [0, 1, 0], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI },
      { tanks: [3, 1, 1], stats: [[8, 6], [0, 9], [1, 9], [6, 9], [7, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 }
    ],
    'Best AR Tanks': [
      { tanks: [5, 3, 5, 3], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI },
      { tanks: [0, 1, 5, 1], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI },
      { tanks: [3, 0, 0, 2], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [3, 2, 2, 0], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 },
      { tanks: [5, 3, 5, 0], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI },
      { tanks: [0, 2, 1, 5], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI },
      { tanks: [3, 0, 5, 4], stats: [[2, 6], [3, 9], [4, 9], [5, 9], [6, 9]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], autospin: true, pathfinding_facing_angle_offset: 0 }
    ],
    'Tri-branch Hell': [
      { tanks: [3, 1, 0, 0], stats: [[0, 2], [1, 2], [2, 2], [3, 8], [4, 6], [5, 8], [6, 9], [7, 5]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [3, 1, 3, 8], stats: [[0, 2], [1, 2], [2, 2], [3, 8], [4, 6], [5, 8], [6, 9], [7, 5]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [3, 1, 5, 4], stats: [[0, 2], [1, 2], [2, 2], [3, 8], [4, 6], [5, 8], [6, 9], [7, 5]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [3, 1, 4, 0], stats: [[0, 2], [1, 2], [2, 2], [3, 8], [4, 6], [5, 8], [6, 9], [7, 5]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 }
    ],
    'ADG Advanced': [
      { tanks: [4, 5], stats: [[2, 9], [3, 9], [4, 9], [5, 9], [6, 3], [7, 3]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [0, 0, 2], stats: [[0, 1], [1, 2], [2, 3], [3, 8], [4, 7], [5, 9], [6, 9], [7, 3]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [0, 0, 3], stats: [[0, 1], [1, 2], [2, 3], [3, 8], [4, 7], [5, 9], [6, 9], [7, 3]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: 0 },
      { tanks: [1, 2, 1], stats: [[0, 1], [1, 2], [2, 5], [3, 8], [4, 7], [5, 9], [6, 7], [7, 3]], growth_extended_upgrades_order_to_max: [2, 7, 1, 0, 8, 9], pathfinding_facing_angle_offset: Math.PI }
    ]
  };

  // Attempt to load advanced presets from file
  if (fs.existsSync('./just_some_bot_upgrades.js')) {
    try {
      const content = fs.readFileSync('./just_some_bot_upgrades.js', 'utf8');
      const parts = content.split('//').filter(p => p.trim().length > 0);
      parts.forEach(part => {
        const lines = part.split('\n');
        const name = lines[0].trim().replace(/^\d+\.\s*/, '');
        const dataPart = lines.slice(1).join('\n').trim();
        if (name && dataPart.startsWith('[')) {
          try {
            const data = eval(dataPart);
            if (Array.isArray(data)) {
              PRESETS[name] = data;
            }
          } catch (e) { }
        }
      });
    } catch (e) { }
  }



  let botConfig = {
    squadId: 'epb',
    name: '[SSS] tristam',
    tank: 'Booster',
    tankMode: 'single', // 'single' or 'preset'
    activePreset: 'Best AR Tanks',
    keys: [],
    autoFire: false,
    autoRespawn: true,
    target: 'player',
    aim: 'drone',
    chatSpam: '',
    stats: [2, 2, 2, 6, 6, 8, 8, 8, 0],
    launchDelay: 20000
  };

  let workers = [];
  let proxies = {};
  let usedProxies = new Set();
  const usageFilePath = 'proxy_usage.json';
  let paused = false;

  function loadProxyUsage() {
    try {
      if (fs.existsSync(usageFilePath)) {
        const data = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
        if (Array.isArray(data)) usedProxies = new Set(data);
      }
    } catch (e) { usedProxies = new Set(); }
  }

  function saveProxyUsage() {
    try {
      fs.writeFileSync(usageFilePath, JSON.stringify(Array.from(usedProxies)), 'utf8');
    } catch (e) { }
  }

  function resetProxyUsage() {
    usedProxies = new Set();
    saveProxyUsage();
    loadProxies();
    console.log('\n[PROXIES] Usage history has been reset.');
    setTimeout(displayMenu, 1500);
  }


  function saveConfig() {
    try { fs.writeFileSync(configFilePath, JSON.stringify(botConfig, null, 2), 'utf8'); } catch (e) { }
  }

  function loadConfig() {
    try {
      if (fs.existsSync(configFilePath)) {
        const savedConfigData = fs.readFileSync(configFilePath, 'utf8');
        const savedConfig = JSON.parse(savedConfigData);
        botConfig = { ...botConfig, ...savedConfig };
      }
    } catch (e) { }
    loadProxyUsage();
  }


  function loadProxies() {
    try {
      if (!fs.existsSync('proxies.txt')) {
        console.log('[PROXIES] proxies.txt not found.');
        return;
      }
      const proxyData = fs.readFileSync('proxies.txt', 'utf8');
      const lines = proxyData.split(/\r?\n/).filter(line => line.trim() !== '');

      let allFound = 0;
      proxies = {};

      for (const line of lines) {
        let text = line.trim();
        if (text.startsWith('#') || text === '') continue; // Skip comments and empty lines
        allFound++;

        let protocol = 'http'; // Default to HTTP as it is more common and matches the error log
        let hasProtocol = false;

        // Support explicit protocol prefixes
        if (text.startsWith('socks5h://')) {
          protocol = 'socks5h';
          text = text.slice(10);
          hasProtocol = true;
        } else if (text.startsWith('socks5://')) {
          protocol = 'socks5h';
          text = text.slice(9);
          hasProtocol = true;
        } else if (text.startsWith('socks://')) {
          protocol = 'socks5h';
          text = text.slice(8);
          hasProtocol = true;
        } else if (text.startsWith('http://')) {
          protocol = 'http';
          text = text.slice(7);
          hasProtocol = true;
        } else if (text.startsWith('https://')) {
          protocol = 'http';
          text = text.slice(8);
          hasProtocol = true;
        }

        // Only use provider-specific defaults if no protocol was explicitly provided
        if (!hasProtocol) {
          if (text.includes('lightningproxies') || text.includes('v6.')) {
            protocol = 'http';
          } else if (text.includes('maskify')) {
            protocol = 'socks5h';
          }
        }

        const parts = text.split(':');
        let proxyUrl = '';
        let type = '';
        if (parts.length === 4) {
          const [host, port, user, pass] = parts;
          proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;
          type = protocol.startsWith('socks') ? 'socks' : 'http';
        } else if (parts.length === 2) {
          const [host, port] = parts;
          proxyUrl = `${protocol}://${host}:${port}`;
          type = protocol.startsWith('socks') ? 'socks' : 'http';
        }

        if (proxyUrl && !usedProxies.has(proxyUrl)) {
          proxies[proxyUrl] = type;
        }
      }

      const availableCount = Object.keys(proxies).length;
      console.log(`[PROXIES] Total: ${allFound} | Used: ${usedProxies.size} | Fresh available: ${availableCount}`);

      if (availableCount === 0 && allFound > 0) {
        console.log('[PROXIES] WARNING: No fresh proxies left! Please reset usage or add more.');
      }
    } catch (e) {
      console.log('[PROXIES] Error loading proxies.txt:', e.message);
    }
  }


  // === MAIN FUNCTION TO START BOTS ===
  function startBots(numBots) {
    try { fs.writeFileSync('active_proxies.txt', '', 'utf8'); } catch (e) { }
    let launchQueue = [];
    const proxyList = Object.keys(proxies);
    const hasProxies = proxyList.length > 0;
    const botIdCounter = Date.now() % 10000;

    if (hasProxies && proxyList.length < numBots) {
      console.log(`[WARNING] Only ${proxyList.length} fresh proxies available for ${numBots} bots.`);
    }

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

    if (botConfig.tankMode === 'preset' && PRESETS[botConfig.activePreset]) {
      const currentPreset = PRESETS[botConfig.activePreset];
      for (let i = 0; i < numBots; i++) {
        const entry = currentPreset[i % currentPreset.length];
        launchQueue.push({
          tank: indicesToKeys(entry.tanks),
          stats: convertStats(entry.stats),
          keys: [],
          autospin: entry.autospin || false,
          growth_order: entry.growth_extended_upgrades_order_to_max || [],
          angle_offset: entry.pathfinding_facing_angle_offset || 0
        });
      }
    } else if (botConfig.tankMode === 'multi' && botConfig.multiTankConfig && Array.isArray(botConfig.multiTankConfig)) {
      // 1. Add explicitly configured groups
      botConfig.multiTankConfig.forEach(group => {
        const count = group.count || 1;
        for (let k = 0; k < count; k++) {
          if (launchQueue.length < numBots) {
            launchQueue.push({ tank: group.tank, keys: group.keys || [] });
          }
        }
      });

      // 2. Fill remainder with new random groups
      if (launchQueue.length < numBots) {
        // Determine group size from the last config entry, or default to 1
        let groupSize = 1;
        if (botConfig.multiTankConfig.length > 0) {
          groupSize = botConfig.multiTankConfig[botConfig.multiTankConfig.length - 1].count || 1;
        }

        const tankNames = Object.keys(tree);

        while (launchQueue.length < numBots) {
          // Pick a random tank for this new chunk
          const randomTank = tankNames[Math.floor(Math.random() * tankNames.length)];

          // Add up to groupSize bots with this tank
          for (let k = 0; k < groupSize && launchQueue.length < numBots; k++) {
            launchQueue.push({ tank: randomTank, keys: [] });
          }
        }
      }
    } else {
      for (let i = 0; i < numBots; i++) {
        let tankVal = botConfig.tank;
        if (/^[\d\s]+$/.test(tankVal)) {
          tankVal = indicesToKeys(tankVal);
        } else {
          tankVal = getPath(tankVal, tree);
        }
        launchQueue.push({
          tank: tankVal,
          stats: [...botConfig.stats],
          keys: botConfig.keys
        });
      }
    }
    const launchBot = (botSpec, index) => {
      const nextProxy = getFreshProxy();
      const config = {
        id: botIdCounter + index,
        proxy: nextProxy ? { type: nextProxy.type, url: nextProxy.url } : false,
        hash: '#' + botConfig.squadId,
        name: botConfig.name,
        stats: botSpec.stats || [...botConfig.stats],
        type: 'follow',
        token: 'follow-3c8f2e',
        autoFire: botConfig.autoFire,
        autoRespawn: botConfig.autoRespawn,
        target: botConfig.target,
        aim: botConfig.aim,
        keys: [...botSpec.keys],
        tank: botSpec.tank,
        chatSpam: botConfig.chatSpam,
        squadId: botConfig.squadId,
        loadFromCache: true,
        cache: false,
        arrasCache: './ah.txt',
        autospin: botSpec.autospin,
        growth_order: botSpec.growth_order,
        angle_offset: botSpec.angle_offset
      };

      console.log(`Launching bot #${config.id} (${botSpec.tank}) using ${config.proxy ? 'proxy' : 'direct connection'}...`);
      const worker = fork(__filename, [], { env: { ...process.env, IS_WORKER: 'true' } });

      worker.on('message', (msg) => {
        if (msg.type === 'blacklisted' || msg.type === 'proxy_failed') {
          const reason = msg.type === 'blacklisted' ? `Blacklisted: ${msg.reason || 'Unknown'}` : 'Connection Failed/Timeout';
          console.log(`[BOT ${config.id}] Proxy issue! (${reason}). Rotating...`);
          worker.kill();
          // Remove from workers list
          workers = workers.filter(w => w !== worker);
          // Relaunch with same spec but new proxy
          setTimeout(() => launchBot(botSpec, index), 2000); // Wait 2s before retry
        } else if (msg.type === 'verified_good') {
          if (msg.proxyUrl) {
            fs.appendFileSync('notblacklisted.txt', msg.proxyUrl + '\n', 'utf8');
            console.log(`[BOT ${config.id}] Proxy verified as GOOD and saved to notblacklisted.txt`);
          }
        }
      });

      worker.send({ type: 'start', config: config });
      workers.push(worker);

      // Mark proxy as used persistently if it wasn't already
      if (config.proxy && config.proxy.url) {
        try { fs.appendFileSync('active_proxies.txt', config.proxy.url + '\n', 'utf8'); } catch (e) { }
        usedProxies.add(config.proxy.url);
        saveProxyUsage();
      }
    };

    launchQueue.forEach((botSpec, i) => {
      setTimeout(() => launchBot(botSpec, i), botConfig.launchDelay * i);
    });

    function getFreshProxy() {
      const keys = Object.keys(proxies);
      if (keys.length === 0) return null;
      const url = keys[0];
      const type = proxies[url];
      delete proxies[url]; // Remove from available
      return { url, type };
    }


    setTimeout(() => {
      console.log(`\n✓ All ${numBots} bots launched!`);
      if (!autoStartMode) {
        setTimeout(displayMenu, 2000);
      }
    }, botConfig.launchDelay * numBots + 1000);
  }

  function disconnectBots() {
    console.log(`\nDisconnecting ${workers.length} bot(s)...`);
    workers.forEach(worker => worker.kill());
    workers = [];
    paused = false;
    if (!autoStartMode) {
      setTimeout(displayMenu, 1000);
    }
  }

  function togglePause() {
    paused = !paused;
    console.log(`\n${paused ? 'Pausing' : 'Resuming'} all bots...`);
    workers.forEach(worker => worker.send({ type: 'pause', paused: paused }));
    if (!autoStartMode) {
      setTimeout(displayMenu, 1000);
    }
  }

  // === MENU SYSTEM ===
  function displayMenu() {
    console.clear();
    console.log('═════════════════════════════════════');
    console.log('        ARRAS.IO BOT PANEL');
    console.log('═════════════════════════════════════');
    console.log(`Bots Running: ${workers.length}`);
    console.log(`Squad ID: ${botConfig.squadId}`);
    console.log(`Tank: ${botConfig.tank}`);
    console.log(`Bots Paused: ${paused ? 'Yes' : 'No'}`);
    console.log('');
    console.log('--- ACTIONS ---');
    console.log('[1] Start Bots');
    console.log('[2] Stop All Bots');
    console.log('[3] Pause/Resume Bots');
    console.log('[4] Settings');
    console.log('[5] Exit');
    console.log('[7] Simulate Key');
    console.log('[8] Proxy Stats');
    console.log('[9] Reset Proxy Usage History');
    console.log('═════════════════════════════════════');

    rl.question('Select option (1-9): ', handleMenuChoice);
  }


  function handleMenuChoice(choice) {
    choice = choice.trim();

    // Clear input buffer
    rl.pause();
    rl.resume();

    switch (choice) {
      case '1':
        askBotCount();
        break;
      case '2':
        disconnectBots();
        break;
      case '3':
        togglePause();
        break;
      case '4':
        showSettings();
        break;
      case '5':
        console.log('\nExiting...');
        disconnectBots();
        rl.close();
        rl.close();
        process.exit();
        break;
      case '7':
        askKeyToSimulate();
        break;
      case '8':
        loadProxies(); // Refreshes stats
        setTimeout(displayMenu, 3000);
        break;
      case '9':
        rl.question('\nAre you sure you want to reset proxy usage history? (y/n): ', (ans) => {
          if (ans.toLowerCase() === 'y') {
            resetProxyUsage();
          } else {
            displayMenu();
          }
        });
        break;
      default:
        console.log('\nInvalid option. Please choose 1-9.');
        setTimeout(displayMenu, 1000);
        break;
    }
  }


  function askBotCount() {
    console.log('\n');
    rl.question('How many bots to start? ', (answer) => {
      const num = parseInt(answer.trim());

      if (isNaN(num) || num < 1) {
        console.log('\nInvalid number. Please enter a positive number.');
        setTimeout(askBotCount, 500);
        return;
      }

      console.log(`\nStarting ${num} bots...`);
      startBots(num);
    });
  }

  function showSettings() {
    console.clear();
    console.log('═════════════════════════════════════');
    console.log('           SETTINGS');
    console.log('═════════════════════════════════════');
    console.log(`[1] Squad ID: ${botConfig.squadId}`);
    console.log(`[2] Bot Name: ${botConfig.name}`);
    console.log(`[3] Tank Selection (Mode: ${botConfig.tankMode.toUpperCase()})`);
    if (botConfig.tankMode === 'single') {
      console.log(`    Current Tank: ${botConfig.tank}`);
    } else {
      console.log(`    Active Preset: ${botConfig.activePreset}`);
    }
    console.log(`[4] AutoFire: ${botConfig.autoFire ? 'ON' : 'OFF'}`);
    console.log(`[5] Launch Delay: ${botConfig.launchDelay}ms`);
    console.log(`[6] Back to Main Menu`);
    console.log('═════════════════════════════════════');

    rl.question('Select setting to change (1-6): ', handleSettingChoice);
  }

  function handleSettingChoice(choice) {
    choice = choice.trim();

    switch (choice) {
      case '1':
        rl.question(`New Squad ID (current: ${botConfig.squadId}): `, (val) => {
          botConfig.squadId = val || botConfig.squadId;
          saveConfig();
          console.log('Squad ID updated!');
          setTimeout(showSettings, 1000);
        });
        break;
      case '2':
        rl.question(`New Bot Name (current: ${botConfig.name}): `, (val) => {
          botConfig.name = val || botConfig.name;
          saveConfig();
          console.log('Bot name updated!');
          setTimeout(showSettings, 1000);
        });
        break;
      case '3':
        console.log('\n--- TANK SELECTION ---');
        console.log('[1] Single Tank Mode');
        console.log('[2] Preset Cycling Mode (from bots system)');
        rl.question('Select mode (1-2): ', (mode) => {
          if (mode === '2') {
            botConfig.tankMode = 'preset';
            console.log('\n--- AVAILABLE PRESETS ---');
            Object.keys(PRESETS).forEach((p, idx) => console.log(`[${idx + 1}] ${p}`));
            rl.question('Select preset: ', (pIdx) => {
              const keys = Object.keys(PRESETS);
              const selected = keys[parseInt(pIdx) - 1];
              if (selected) {
                botConfig.activePreset = selected;
                saveConfig();
                console.log(`Preset set to: ${selected}`);
              } else {
                console.log('Invalid selection.');
              }
              setTimeout(showSettings, 1000);
            });
          } else {
            botConfig.tankMode = 'single';
            // Determine tiers dynamically for display
            const tiers = { 'Tier 1': [], 'Tier 2': [], 'Tier 3': [], 'Tier 4': [], 'Special/Other': [] };

            const getDepth = (name) => {
              let depth = 1;
              let current = name;
              while (tree[current] && tree[current][1] !== 'Basic') {
                current = tree[current][1];
                if (!current) break;
                depth++;
              }
              return depth;
            };

            Object.keys(tree).forEach(tank => {
              if (tank === 'Basic') return;
              if (tree[tank] && tree[tank][1] === 'Basic') {
                tiers['Tier 2'].push(tank);
              } else {
                const d = getDepth(tank);
                if (d === 2) tiers['Tier 3'].push(tank);
                else if (d === 3) tiers['Tier 4'].push(tank);
                else tiers['Special/Other'].push(tank);
              }
            });

            // Basic is Tier 1
            tiers['Tier 1'].push('Basic');

            console.log('\n--- AVAILABLE TANKS ---');
            for (const [tier, tanks] of Object.entries(tiers)) {
              if (tanks.length > 0) {
                console.log(`\n[${tier}]:`);
                console.log(tanks.sort().join(', '));
              }
            }
            console.log('\n-----------------------');

            rl.question(`New Tank (current: ${botConfig.tank}): `, (val) => {
              if (tree[val] || val === 'Basic') {
                botConfig.tank = val;
                saveConfig();
                console.log('Tank updated!');
              } else {
                console.log('Invalid tank name.');
              }
              setTimeout(showSettings, 1000);
            });
          }
        });
        break;
      case '4':
        rl.question('AutoFire (on/off): ', (val) => {
          botConfig.autoFire = val.toLowerCase() === 'on';
          saveConfig();
          console.log(`AutoFire ${botConfig.autoFire ? 'ENABLED' : 'DISABLED'}`);
          setTimeout(showSettings, 1000);
        });
        break;
      case '5':
        rl.question(`New Launch Delay in ms (current: ${botConfig.launchDelay}): `, (val) => {
          const delay = parseInt(val);
          if (!isNaN(delay) && delay >= 0) {
            botConfig.launchDelay = delay;
            saveConfig();
            console.log(`Launch delay set to ${delay}ms`);
          } else {
            console.log('Invalid number.');
          }
          setTimeout(showSettings, 1000);
        });
        break;
      case '6':
        displayMenu();
        break;
      default:
        console.log('\nInvalid choice.');
        setTimeout(showSettings, 1000);
        break;
    }
  }

  function askKeyToSimulate() {
    rl.question('\nEnter key to simulate (e.g. e, space, enter): ', (input) => {
      const code = mapInputToCode(input);
      if (code) {
        console.log(`\nSimulating key '${code}' on ${workers.length} workers...`);
        workers.forEach(w => w.send({ type: 'key_command', key: code }));
      } else {
        console.log(`\nInvalid key input: ${input}`);
      }
      setTimeout(displayMenu, 1500);
    });
  }

  function mapInputToCode(input) {
    if (!input) return null;
    input = input.trim();
    const lower = input.toLowerCase();

    if (lower.length === 1) {
      // Single letter/number
      if (lower >= 'a' && lower <= 'z') return 'Key' + lower.toUpperCase();
      if (lower >= '0' && lower <= '9') return 'Digit' + lower;
    }

    const map = {
      'space': 'Space',
      'enter': 'Enter',
      'shift': 'ShiftLeft',
      'ctrl': 'ControlLeft',
      'alt': 'AltLeft',
      'tab': 'Tab',
      'esc': 'Escape',
      'escape': 'Escape',
      'up': 'ArrowUp',
      'down': 'ArrowDown',
      'left': 'ArrowLeft',
      'right': 'ArrowRight',
      'backspace': 'Backspace'
    };

    return map[lower] || null;
  }

  // === INITIALIZE ===
  loadConfig();
  loadProxies();

  // If started with --count argument, auto-start bots
  if (autoStartMode && autoStartCount > 0) {
    console.log(`\nARRAS.IO BOT PANEL - Auto Start Mode`);
    console.log(`=====================================`);
    console.log(`Starting ${autoStartCount} bots automatically...`);
    startBots(autoStartCount);
  } else {
    // Otherwise show the menu
    setTimeout(displayMenu, 500);
  }

} else {
  // --- WORKER PROCESS (Bot logic) ---
  const atob = (str) => Buffer.from(str, 'base64').toString('binary');
  global.atob = atob;
  if (!console.error) console.error = console.log;

  process.on('uncaughtException', (err) => {
    console.error(`[WORKER ERROR]`, err);
  });
  process.on('unhandledRejection', (err) => {
    console.error(`[WORKER UNHANDLED REJECTION]`, err);
  });
  let isPaused = false;
  let currentBot = null;

  process.on('message', (message) => {
    if (message.type === 'start') {
      const config = message.config;
      options.token = config.token;
      options.loadFromCache = config.loadFromCache;
      options.cache = config.cache;
      options.arrasCache = config.arrasCache;

      arras.then(function () {
        currentBot = arras.create(config);
      });
    } else if (message.type === 'pause') {
      isPaused = message.paused;
      if (currentBot && currentBot.log) currentBot.log(`Bot state is now: ${isPaused ? 'PAUSED' : 'RESUMED'}`);
    } else if (message.type === 'key_command') {
      const { key } = message;
      if (currentBot && currentBot.simulateKey) currentBot.simulateKey(key);
    } else if (message.type === 'pathfinding') {
      if (currentBot) currentBot.config.pathfinding = message.enabled;
    } else if (message.type === 'stop_bot') {
      if (currentBot && currentBot.destroy) currentBot.destroy();
      process.exit();
    }
  });

  const options = { start: () => { } };

  const tree = {
    'Browser': ['Y', 'Surfer'], 'Strider': ['K', 'Fighter'], 'Automingler': ['J', 'Mingler'], 'Mingler': ['K', 'Hexa Tank'], 'Necromancer': ['Y', 'Necromancer'], 'Underseer': ['I', 'Director'], 'Firework': ['Y', 'Rocketeer'], 'Leviathan': ['H', 'Rocketeer'], 'Rocketeer': ['K', 'Launcher'], 'Annihilator': ['U', 'Destroyer'], 'Destroyer': ['Y', 'Pounder'], 'Swarmer': ['I', 'Launcher'], 'Twister': ['U', 'Launcher'], 'Launcher': ['H', 'Pounder'], 'Fighter': ['Y', 'TriAngle'], 'Surfer': ['K', 'TriAngle'], 'Sprayer': ['H', 'Machine Gun'], 'Redistributor': ['Y', 'Sprayer'], 'Spreadshot': ['U', 'Triple Shot'], 'Gale': ['I', 'Octo Tank'], 'Crackshot': ['J', 'Penta Shot'], 'Penta Shot': ['Y', 'Triple Shot'], 'Twin': ['Y', 'Basic'], 'Double Twin': ['Y', 'Twin'], 'Triple Shot': ['U', 'Twin'], 'Sniper': ['U', 'Basic'], 'Machine Gun': ['I', 'Basic'], 'Gunner': ['I', 'Machine Gun'], 'Machine Gunner': ['H', 'Gunner'], 'Nailgun': ['U', 'Gunner'], 'Pincer': ['K', 'Nailgun'], 'Flank Guard': ['H', 'Basic'], 'Hexa Tank': ['Y', 'Flank Guard'], 'Octo Tank': ['Y', 'Hexa Tank'], 'Cyclone': ['U', 'Hexa Tank'], 'HexaTrapper': ['I', 'Hexa Tank'], 'TriAngle': ['U', 'Flank Guard'], 'Fighter': ['Y', 'TriAngle'], 'Booster': ['U', 'TriAngle'], 'Falcon': ['I', 'TriAngle'], 'Bomber': ['H', 'TriAngle'], 'AutoTriAngle': ['J', 'TriAngle'], 'Surfer': ['K', 'TriAngle'], 'Auto3': ['I', 'Flank Guard'], 'Auto5': ['Y', 'Auto3'], 'Mega3': ['U', 'Auto3'], 'Auto4': ['I', 'Auto3'], 'Banshee': ['H', 'Auto3'], 'Trap Guard': ['H', 'Flank Guard'], 'Buchwhacker': ['Y', 'Trap Guard'], 'Gunner Trapper': ['U', 'Trap Guard'], 'Conqueror': ['J', 'Trap Guard'], 'Bulwark': ['K', 'Trap Guard'], 'TriTrapper': ['J', 'Flank Guard'], 'Fortress': ['Y', 'TriTrapper'], 'Septatrapper': ['I', 'TriTrapper'], 'Whirlwind': ['H', 'Septatrapper'], 'Nona': ['Y', 'Septatrapper'], 'SeptaMachine': ['U', 'Septatrapper'], 'Architect': ['H', 'TriTrapper'], 'TripleTwin': ['K', 'Flank Guard'], 'Director': ['J', 'Basic'], 'Pounder': ['K', 'Basic'], 'Healer': ['X', 'Basic'], 'Physician': ['Space', 'Healer'], 'Basic': [], 'Overseer': ['Y', 'Director'], 'Cruiser': ['U', 'Director'], 'Underseer': ['I', 'Director'], 'Spawner': ['H', 'Director'], 'Director Drive': ['J', 'Director'], 'Honcho': ['K', 'Director'], 'Manager': ['X', 'Director'], 'Foundry': ['Space', 'Spawner'], 'Top Banana': ['Space', 'Foundry'], 'Shopper': ['K', 'Foundry'], 'Mega Spawner': ['I', 'Spawner'], 'Ultra Spawner': ['Y', 'Mega Spawner'],
  }, getPath = function (name) {
    let p = '', o = tree[name]
    while (o) {
      p = o[0] + p
      let n = o[1]
      if (n === 'Basic') { break }
      o = tree[n]
    }
    return p
  }

  WebAssembly.instantiateStreaming = false
  const arras = (function () {
    const log = function () {
      const logger = global.console || console;
      if (logger && logger.log) {
        logger.log(`[headless]`, ...arguments);
      }
    }


    let app = false
    const wasm = function () {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async function () {
          return app
        },
        json: async () => ({}),
        text: async () => '',
        clone: function () { return this; }
      }
    }
    let lastStatus = 0, statusData = ''
    const getStatus = function (f, s) {
      let now = global.performance.now()
      if (statusData && now - lastStatus < 15000) {
        return {
          then: function () {
            return {
              then: function (f) {
                let i = JSON.parse(statusData)
                s(i)
                f(i)
              }
            }
          }
        }
      }
      let then = function () { }
      realFetch(f).then(x => x.text()).then(x => {
        statusData = x
        let i = JSON.parse(x)
        s(i)
        then(i)
      })
      return {
        then: function () {
          return {
            then: function (f) {
              then = f
            }
          }
        }
      }
    }

    let ready = false, script = false, o = [], then = function (f) {
      if (ready) {
        f();
      } else {
        o.push(f);
      }
    };

    const initializeAndRunQueue = function () {
      ready = true;
      log('Headless arras ready.');
      for (let i = 0, l = o.length; i < l; i++) {
        o[i]();
      }
      o = [];
      then = function (f) {
        f();
      };
    }

    let prerequisites = 0;
    const onPrerequisiteLoaded = function () {
      prerequisites++;
      if (prerequisites === 2) {
        initializeAndRunQueue();
      }
    }

    if (config.cachedResources && config.cachedResources.wasm) {
      app = Buffer.from(config.cachedResources.wasm, 'base64');
      log('Prerequisite 1/2: WASM loaded from cache.');
      onPrerequisiteLoaded();
    } else {
      realFetch('https://arras.io/app.wasm').then(x => {
        x.arrayBuffer().then(x => {
          app = x;
          log('Prerequisite 1/2: app.wasm loaded.');
          onPrerequisiteLoaded();
        })
      });
    }

    const loadScript = function () {
      const activateBot = (scriptContent) => {
        script = scriptContent;
        log('Prerequisite 2/2: Game script loaded.');
        onPrerequisiteLoaded();
      };

      const extractScriptFromHtml = (html) => {
        const scriptTagStart = html.indexOf('<script>');
        if (scriptTagStart === -1) {
          log('Error: Could not find <script> tag in content.');
          return null;
        }
        let scriptContent = html.slice(scriptTagStart + 8);
        const scriptTagEnd = scriptContent.indexOf('</script');
        if (scriptTagEnd === -1) {
          log('Error: Could not find closing </script> tag.');
          return null;
        }
        scriptContent = scriptContent.slice(0, scriptTagEnd);
        return scriptContent;
      };

      log('Fetching from https://arras.io to ensure correct script execution order...');
      realFetch('https://arras.io').then(x => x.text()).then(html => {
        const extractedScript = extractScriptFromHtml(html);
        if (extractedScript) {
          activateBot(extractedScript);
        }
      }).catch(err => {
        log('FATAL: Could not fetch from arras.io. Please check network or use a valid cache file.', err);
      });
    }
    if (config.cachedResources && config.cachedResources.script) {
      activateBot(config.cachedResources.script);
    } else {
      loadScript();
    }

    const run = function (x, config, oa) {
      const log = function () {
        global.console.log(`[headless ${config.id}]`, ...arguments)
      };
      const capturedStrings = new Set();
      const capturedCenterColors = new Set();
      const allSeenColors = new Set();

      const setGlobal = (key, value) => {
        try {
          Object.defineProperty(global, key, {
            value: value,
            configurable: true,
            writable: true,
            enumerable: true
          });
        } catch (e) {
          try { global[key] = value; } catch (e2) { }
        }
      };

      let target = [0, 0, 0, 0, false],
        active = 0,
        subscribedToLeader = false;

      const internalBotInterface = {
        config: config,
        target: target,
        setActive: (val) => { active = val; },
        setSubscribed: (val) => { subscribedToLeader = val; },
        log: log,
        simulateKey: (code) => {
          if (trigger.keydown && trigger.keyup) {
            trigger.keydown(code);
            setTimeout(() => trigger.keyup(code), 50);
          }
        }
      };

      let broadcastParser = new BroadcastParser();
      let roomParser = new RoomParser();
      let mazeManager = new MazeMapManager();
      let targetPath = [];
      let lastPathUpdate = 0;
      let playerColor = 0;

      let destroy = function () {
        if (destroyed) { return }
        log('Destroying instance...')
        if (gameSocket && gameSocket.readyState < 3) {
          gameSocket.close()
          gameSocket = false
        }
        clearInterval(mainInterval)
        destroyed = true
      }, destroyed = false
      const setInterval = new Proxy(global.setInterval, {
        apply: function (a, b, c) {
          if (destroyed) { return }
          return Reflect.apply(a, b, c)
        }
      }), setTimeout = new Proxy(global.setTimeout, {
        apply: function (a, b, c) {
          if (destroyed) { return }
          return Reflect.apply(a, b, c)
        }
      })

      const handleListener = function (type, f, target) {
        listeners[type] = f
      }
      const listeners = {}
      const trigger = {
        mousemove: function (clientX, clientY) {
          if (listeners.mousemove) {
            listeners.mousemove({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY
            })
          }
        },
        mousedown: function (clientX, clientY, button) {
          if (listeners.mousedown) {
            listeners.mousedown({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY,
              button: button
            })
          }
        },
        mouseup: function (clientX, clientY, button) {
          if (listeners.mouseup) {
            listeners.mouseup({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY,
              button: button
            })
          }
        },
        keydown: function (code, repeat) {
          if (listeners.keydown) {
            listeners.keydown({
              isTrusted: true,
              code: code,
              key: '',
              repeat: repeat || false,
              preventDefault: function () { }
            })
          }
        },
        keyup: function (code, repeat) {
          if (listeners.keyup) {
            listeners.keyup({
              isTrusted: true,
              code: code,
              key: '',
              repeat: repeat || false,
              preventDefault: function () { }
            })
          }
        }
      }

      let window = {
        WebAssembly,
        googletag: {
          cmd: { push: function (f) { try { f(); } catch (e) { } } },
          defineSlot: function () { return this; },
          addService: function () { return this; },
          display: function () { return this; },
          pubads: function () { return this; },
          enableSingleRequest: function () { return this; },
          collapseEmptyDivs: function () { return this; },
          enableServices: function () { return this; }
        },
        arrasAdDone: true
      };
      setGlobal('window', window);
      setGlobal('parent', window);
      setGlobal('top', window);
      setGlobal('self', window);

      window.crypto = { getRandomValues: function (a) { return a } };
      setGlobal('crypto', window.crypto);

      window.addEventListener = function (type, f) { handleListener(type, f, window) };
      setGlobal('addEventListener', window.addEventListener);

      window.removeEventListener = function (type, f) { };
      setGlobal('removeEventListener', window.removeEventListener);

      window.Image = function () { return {} };
      setGlobal('Image', window.Image);

      let inputs = [], setValue = function (str) {
        for (let i = 0, l = inputs.length; i < l; i++) {
          inputs[i].value = str
        }
      }
      let position = [0, 0, 5], died = false, ignore = false, disconnected = false, connected = false, inGame = false, upgrade = false;

      let innerWidth = window.innerWidth = 500
      let innerHeight = window.innerHeight = 500
      setGlobal('innerWidth', 500);
      setGlobal('innerHeight', 500);

      let st = 2, lx = 0, gd = 1, canvasRef = {}, sr = 1, s = 1;

      const g = function () {
        let w = innerWidth;
        let h = innerHeight;
        if (!canvasRef.width) canvasRef.width = w;
        if (w * 0.5625 > h) { s = 888.888888888 / w; } else { s = 500 / h; }
        sr = canvasRef.width / w;
      };
      g();

      const document = (function () {
        const emptyFunc = () => { };
        const emptyStyle = { setProperty: emptyFunc };

        const simulatedContext2D = {
          isContextLost: () => false,
          _matrix: [1, 0, 0, 1, 0, 0], _stack: [],
          _apply: function (x, y) {
            const [a, b, c, d, e, f] = this._matrix;
            return [x * a + y * c + e, x * b + y * d + f];
          },
          fillText: function () {
            if (ignore) { return }
            const a = Array.from(arguments);
            if (!a[0]) return;
            if (typeof a[0] === 'string' && a[0].length > 0) {
              const normalizedColor = this.fillStyle.toLowerCase().replace(/\s+/g, '');
              capturedStrings.add({ text: a[0], color: normalizedColor });
            }
            if (this.font === 'bold 7px Ubuntu' && this.fillStyle === 'rgb(255,255,255)') {
              if (a[0] === `You have spawned! Welcome to the game.`) {
                hasJoined = firstJoin = true;
                setTimeout(() => {
                  if (!destroyed && !disconnected && config.proxy) {
                    process.send({ type: 'verified_good', proxyUrl: config.proxy.url });
                  }
                }, 30000);
              } else if (a[0] === 'You have traveled through a portal!') {
                hasJoined = true
              }
              if ((a[0].startsWith('The server was ') && a[0].endsWith('% active')) || a[0].startsWith('Survived for ') || a[0].startsWith('Succumbed to ') || a[0] === 'You have self-destructed.' || a[0] === `Vanished into thin air` || a[0].startsWith('You have been killed by ')) {
                died = true
              }
              if (!a[0].startsWith(`You're using an ad blocker.`) && a[0] !== 'Respawn' && a[0] !== 'Back' && a[0] !== 'Reconnect' && a[0].length > 2) {
                log('[arras]', a[0])
              }
            }
            if (this.font === 'bold 7.5px Ubuntu' && this.fillStyle === 'rgb(231,137,109)') {
              const msg = a[0];
              const lowered = msg.toLowerCase();
              if (lowered.includes('temporarily banned') || lowered.includes('blacklisted')) {
                disconnected = true;
                if (config.proxy) { process.send({ type: 'blacklisted', proxyUrl: config.proxy.url, reason: msg }); }
                destroy();
                log('[arras-blacklisted]', msg);
              } else if (msg.startsWith('The connection closed due to ')) {
                disconnected = true; destroy(); log('[arras-disconnect]', msg);
              }
            }
            if (this.font === 'bold 5.1px Ubuntu' && this.fillStyle === 'rgb(255,255,255)') {
              if (a[0].startsWith('Coordinates: (')) {
                let b = a[0].slice(14), l = b.length
                if (b[l - 1] === ')') {
                  b = b.slice(0, l - 1).split(', ')
                  if (b.length === 2) {
                    let x = parseFloat(b[0]), y = parseFloat(b[1])
                    position[0] = x; position[1] = y; position[2] = 5;
                  }
                }
              }
            }
          },
          measureText: (text) => ({ width: text.length }),
          clearRect: emptyFunc, strokeRect: emptyFunc,
          fillRect: function (x, y, w, h) {
            const cx = innerWidth / 2, cy = innerHeight / 2;
            const normalizedColor = this.fillStyle.toLowerCase().replace(/\s+/g, '');
            allSeenColors.add(normalizedColor);
            const [p1x, p1y] = this._apply(x, y);
            const [p2x, p2y] = this._apply(x + w, y + h);
            const minX = Math.min(p1x, p2x), maxX = Math.max(p1x, p2x);
            const minY = Math.min(p1y, p2y), maxY = Math.max(p1y, p2y);
            if (minX <= cx + 15 && maxX >= cx - 15 && minY <= cy + 15 && maxY >= cy - 15) {
            }
          },
          save: function () { this._stack.push([...this._matrix]); },
          translate: function (x, y) {
            const [a, b, c, d, e, f] = this._matrix;
            this._matrix[4] = x * a + y * c + e;
            this._matrix[5] = x * b + y * d + f;
          },
          scale: function (sx, sy) {
            this._matrix[0] *= sx; this._matrix[1] *= sx;
            this._matrix[2] *= sy; this._matrix[3] *= sy;
          },
          rotate: function (angle) {
            const [a, b, c, d, e, f] = this._matrix;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            this._matrix[0] = a * cos + c * sin;
            this._matrix[1] = b * cos + d * sin;
            this._matrix[2] = a * -sin + c * cos;
            this._matrix[3] = b * -sin + d * cos;
          },
          clip: emptyFunc,
          restore: function () {
            const s = this._stack.pop();
            if (s) this._matrix = s;
          },
          beginPath: function () { this._isAtCenter = false; },
          moveTo: function (x, y) {
            canvasRef = this.canvas;
            const [rx, ry] = this._apply(x, y);
            if (Math.abs(rx - (innerWidth / 2)) < 15 && Math.abs(ry - (innerHeight / 2)) < 15) this._isAtCenter = true;
          },
          lineTo: function (x, y) {
            const [rx, ry] = this._apply(x, y);
            if (Math.abs(rx - (innerWidth / 2)) < 15 && Math.abs(ry - (innerHeight / 2)) < 15) this._isAtCenter = true;
          },
          rect: function (x, y, w, h) {
            const [p1x, p1y] = this._apply(x, y);
            const [p2x, p2y] = this._apply(x + w, y + h);
            const minX = Math.min(p1x, p2x), maxX = Math.max(p1x, p2x);
            const minY = Math.min(p1y, p2y), maxY = Math.max(p1y, p2y);
            if (minX <= (innerWidth / 2) + 15 && maxX >= (innerWidth / 2) - 15 && minY <= (innerHeight / 2) + 15 && maxY >= (innerHeight / 2) - 15) this._isAtCenter = true;
          },
          arc: function (x, y, r) {
            const [rx, ry] = this._apply(x, y);
            const [ax, ay] = this._apply(x + r, y);
            const rr = Math.sqrt((ax - rx) ** 2 + (ay - ry) ** 2);
            const distSq = (rx - (innerWidth / 2)) ** 2 + (ry - (innerHeight / 2)) ** 2;
            if (distSq <= (rr + 15) ** 2) this._isAtCenter = true;
          },
          ellipse: emptyFunc,
          roundRect: function (x, y, w, h) {
            const normalizedColor = this.fillStyle.toLowerCase().replace(/\s+/g, '');
            allSeenColors.add(normalizedColor);
            const [p1x, p1y] = this._apply(x, y);
            const [p2x, p2y] = this._apply(x + w, y + h);
            const minX = Math.min(p1x, p2x), maxX = Math.max(p1x, p2x);
            const minY = Math.min(p1y, p2y), maxY = Math.max(p1y, p2y);
            if (minX <= (innerWidth / 2) + 15 && maxX >= (innerWidth / 2) - 15 && minY <= (innerHeight / 2) + 15 && maxY >= (innerHeight / 2) - 15) {
            }
          },
          closePath: emptyFunc,
          fill: function () {
            const normalizedColor = this.fillStyle.toLowerCase().replace(/\s+/g, '');
          },
          stroke: emptyFunc, strokeText: emptyFunc, drawImage: emptyFunc,
          setTransform: function (a, b, c, d, e, f) {
            this._matrix = [a, b, c, d, e, f];
          },
          transform: function (a, b, c, d, e, f) {
            const [m0, m1, m2, m3, m4, m5] = this._matrix;
            this._matrix = [
              m0 * a + m2 * b,
              m1 * a + m3 * b,
              m0 * c + m2 * d,
              m1 * c + m3 * d,
              m0 * e + m2 * f + m4,
              m1 * e + m3 * f + m5
            ];
          },
          resetTransform: function () {
            this._matrix = [1, 0, 0, 1, 0, 0];
          },
        };

        const createElement = function (tag, options) {
          const element = {
            tag: tag ? tag.toLowerCase() : '',
            appended: false, value: '', style: emptyStyle,
            addEventListener: (type, f) => handleListener(type, f, element),
            setAttribute: emptyFunc, appendChild: (e) => { e.appended = true },
            focus: emptyFunc, blur: emptyFunc, remove: emptyFunc,
            getBoundingClientRect: () => ({ width: innerWidth, height: innerHeight, top: 0, left: 0, bottom: innerHeight, right: innerWidth }),
          };
          if (element.tag === 'canvas') {
            element.toDataURL = () => 'data:image/png;base64,...';
            element.getContext = (type) => (type === '2d' ? (simulatedContext2D.canvas = element, simulatedContext2D) : null);
          }
          if (element.tag === 'input') { inputs.push(element); }
          if (options) { Object.assign(element, options); }
          return element;
        };

        const doc = createElement('document', { createElement: createElement, body: null, fonts: { load: () => true }, referrer: '' });
        doc.body = createElement('body');
        return doc;
      })();
      window.document = document;
      setGlobal('document', document);

      window.location = { hostname: 'arras.io', hash: config.hash, query: '' };
      setGlobal('location', window.location);
      let lastHash = window.location.hash;

      window.prompt = function () { console.log('prompt', ...arguments) };
      setGlobal('prompt', window.prompt);

      let devicePixelRatio = window.devicePixelRatio = 1;
      setGlobal('devicePixelRatio', 1);

      let a = false;
      window.requestAnimationFrame = function (f) { st = 10; g(); a = f };
      setGlobal('requestAnimationFrame', window.requestAnimationFrame);

      window.performance = { time: 0, now: function () { return this.time } };
      setGlobal('performance', window.performance);

      const console = {
        log: new Proxy(global.console.log, {
          apply: function (a, b, c) {
            if (c[0] === '%cStop!' || (c[0] && c[0].startsWith && c[0].startsWith('%cHackers have been known'))) { return }
            return Reflect.apply(a, b, c)
          }
        }),
        error: global.console.error || global.console.log,
        warn: global.console.warn || global.console.log,
      };
      let lastRecieve = 0;
      let localPort = process.env.PARENT_PORT || 3000;
      let wu = process.env.FOLLOW_SERVER_URL || (process.env.IS_WORKER === 'true' ? `ws://localhost:${localPort}` : '');
      let followSocket = false;

      let connectFollow = function () {
        if (!wu || wu === 'undefined') return;
        try {
          followSocket = new ws(wu, {
            "headers": {
              "user-agent": "Mozilla/5.0 (X11; CrOS x86_64 14588.123.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36",
              "origin": "https://arras.io"
            },
            "followRedirects": true,
            "origin": "https://arras.io",
            "rejectUnauthorized": false,
            "handshakeTimeout": 5000
          });
        } catch (e) {
          return;
        }
        followSocket.binaryType = 'arraybuffer'
        followSocket.addEventListener('open', function () {
          log('Connected to Follow Server.');
          // Subscribe to squad
          const squadId = config.squadId || (config.hash ? config.hash.replace('#', '') : 'epb');
          followSocket.send(pack([10, squadId]));
        })
        followSocket.addEventListener('error', (err) => { });
        followSocket.addEventListener('message', function (e) {
          try {
            if (!target) return;
            let data = unpack(new Uint8Array(e.data));
            if (!data || !Array.isArray(data)) { return }
            const type = data.splice(0, 1)[0];
            switch (type) {
              case 101: {
                if (data.length >= 5) {
                  target[0] = data[0] / 10;
                  target[1] = data[1] / 10;
                  target[2] = data[2] / 10;
                  target[3] = data[3] / 10;
                  target[4] = data[4];
                  active = 25;
                  lastRecieve = Date.now();
                }
                break;
              }
              case 102: {
                active = 0;
                break;
              }
              case 105: {
                if (data.length >= 1) {
                  const key = data[0];
                  if (trigger.keydown && trigger.keyup) {
                    trigger.keydown(key);
                    setTimeout(() => { trigger.keyup(key); }, 50);
                  }
                }
                break;
              }
            }
          } catch (e) { }
        })
        followSocket.addEventListener('close', function () {
          followSocket = false;
          setTimeout(connectFollow, 10000);
        })
      };
      if (wu) connectFollow();

      let proxyAgent = null;
      if (config.proxy && config.proxy.url) {
        try {
          const proxyUrl = config.proxy.url.toLowerCase();
          if (proxyUrl.startsWith('socks')) {
            proxyAgent = new SocksProxyAgent(config.proxy.url);
          } else {
            const secureUrl = config.proxy.url.includes('://') ? config.proxy.url : 'http://' + config.proxy.url;
            proxyAgent = new HttpsProxyAgent(secureUrl);
          }
        } catch (e) {
          console.error(`[BOT] Error creating proxy agent:`, e.message);
        }
      }

      let i = 0, controller = {
        x: 250, y: 250,
        mouseDown: function () { trigger.mousedown(controller.x, controller.y) },
        mouseUp: function () { trigger.mouseup(controller.x, controller.y) },
        click: function (x, y) { trigger.mousedown(x, y, 0); trigger.mouseup(x, y, 0); },
        press: function (code) { trigger.keydown(code); trigger.keyup(code); },
        chat: function (str) {
          log('Sent chat:', str); controller.press('Enter'); performance.time += 90; if (a) a();
          controller.press('Enter'); performance.time += 90; if (a) a();
          setValue(str); controller.press('Enter'); performance.time += 90; if (a) a();
          setValue(str); controller.press('Enter');
        },
        moveDirection: function (x, y) {
          trigger[x < 0 ? 'keydown' : 'keyup']('KeyA'); trigger[y < 0 ? 'keydown' : 'keyup']('KeyW');
          trigger[x > 0 ? 'keydown' : 'keyup']('KeyD'); trigger[y > 0 ? 'keydown' : 'keyup']('KeyS');
        },
        iv: 4 / Math.PI, dv: Math.PI / 4, ix: [1, 1, 0, -1, -1, -1, 0, 1], iy: [0, 1, 1, 1, 0, -1, -1, -1],
        moveVector: function (x, y, i) {
          let d = Math.atan2(y, x), h = (Math.round(d * controller.iv) % 8 + 8) % 8;
          controller.moveDirection(controller.ix[h], controller.iy[h]);
          return h * controller.dv;
        },
        stats: function (arr) {
          for (let i = 0; i < 10; i++) {
            let code = `Digit${(i + 1) % 10}`;
            for (let u = 0; u < arr[i]; u++) { controller.press(code); }
          }
        }
      }, statusRecieved = false, status = [], firstJoin = false, hasJoined = false, timeouts = {}, timeout = function (f, t) {
        if (!(t >= 1)) { t = 1 }; let n = i + t, at = timeouts[n] || (timeouts[n] = []); at.push(f);
      }, block = false, idleKeys = false, idleIndex = -1;
      let idleAngle = 0, cIdleAngle = 0;

      const mainInterval = setInterval(function () {
        if (block || isPaused) return;
        if (a) {
          switch (i) {
            case 1:
            case 2:
            case 5:
            case 10:
            case 20: {
              setValue(config.name || 'bot');
              controller.click(250, 190);
              if (i === 1) log('Play button clicked!', config.name || 'bot', window.location.hash);
              break;
            }
          }
          if (lastHash !== window.location.hash) {
            log('hash =', window.location.hash); lastHash = window.location.hash;
          }
          let at = timeouts[i]; if (at) { delete timeouts[i]; for (let f of at) f(); }
          position[2]--; if (position[2] < 0) controller.press('KeyL');

          if (hasJoined) {
            if (ca.onJoin) ca.onJoin();
            hasJoined = false; inGame = true; upgrade = true;
            let keys = [];
            // Always push tank upgrade keys on every spawn/respawn
            for (let char of config.tank) keys.push(char);
            if (firstJoin) {
              firstJoin = false;
              if (config.joinSequence) for (let k of config.joinSequence) keys.push(k);
              if (config.type === 'spawn2') keys.push('KeyR');
              if (config.type === 'spawn3') {
                log('Spawn3 bot joined. Waiting for room info...');
                setTimeout(() => {
                  const strings = Array.from(capturedStrings);
                  const data = {
                    teams: [],
                    totalPlayers: 0,
                    hash: window.location.hash
                  };

                  process.send({ type: 'spawn3_data', id: config.id, hash: window.location.hash });

                  destroy();
                }, 3000); // Wait 3 seconds for UI to render
                return;
              }
            }
            controller.stats(config.stats);
            if (config.autospin) controller.press('KeyC');
            idleIndex = 0; idleKeys = keys;
          }

          if (idleKeys) {
            if (idleIndex >= 0 && idleIndex < idleKeys.length) {
              const k = idleKeys[idleIndex];
              if (k !== undefined) {
                const code = k.length === 1 ? (k >= '0' && k <= '9' ? 'Digit' + k : 'Key' + k) : k;
                controller.press(code); idleIndex++;
              }
              if (idleIndex >= idleKeys.length) { idleIndex = -1; idleKeys = false; }
            }
          } else if (idleIndex >= -10) { idleIndex--; } else { idleIndex = -11; }

          if (inGame && (config.type === 'follow' || config.type === 'spawn2') && idleIndex < -10) {
            if (upgrade) {
              for (let k of config.keys) {
                const code = k.length === 1 ? (k >= '0' && k <= '9' ? 'Digit' + k : 'Key' + k) : k;
                controller.press(code);
              }
              upgrade = false;
            }

            active--;
            if (i % 175 === 174 && config.chatSpam) controller.chat(config.chatSpam);

            if (config.type === 'follow') {
              if (active > 0) {
                let dx = target[0] - position[0], dy = target[1] - position[1];
                let move_dx = dx, move_dy = dy;
                let ram = config.target === 'mouse';
                if (ram) {
                  move_dx = target[2] - position[0];
                  move_dy = target[3] - position[1];
                }

                // Attempt pathfinding if enabled and map exists
                if (config.pathfinding && mazeManager.map && roomParser.room_dimensions.length > 0) {
                  const now = Date.now();
                  if (now - lastPathUpdate > 500) {
                    const startNode = mazeManager.parse_position_coordinate(position[0], position[1], roomParser.room_dimensions);
                    const endNode = mazeManager.parse_position_coordinate(target[0], target[1], roomParser.room_dimensions);
                    targetPath = mazeManager.find_path(startNode, endNode, playerColor);
                    lastPathUpdate = now;
                  }

                  if (targetPath.length > 0) {
                    const currentBotNode = mazeManager.parse_position_coordinate(position[0], position[1], roomParser.room_dimensions);
                    while (targetPath.length > 0 && currentBotNode[0] === targetPath[0][0] && currentBotNode[1] === targetPath[0][1]) {
                      targetPath.shift();
                    }
                  }

                  if (targetPath.length > 0) {
                    const node = targetPath[0];
                    const targetX = roomParser.room_dimensions[0] + (node[0] + 0.5) * (mazeManager.room_width / mazeManager.map_width);
                    const targetY = roomParser.room_dimensions[1] + (node[1] + 0.5) * (mazeManager.room_height / mazeManager.map_height);
                    move_dx = targetX - position[0];
                    move_dy = targetY - position[1];
                  }
                }

                let d2 = move_dx * move_dx + move_dy * move_dy, move_angle;
                if (d2 < 4 && !ram) {
                  if (d2 < 1) move_angle = controller.moveVector(-move_dx, -move_dy, i) + Math.PI;
                  else controller.moveDirection(0, 0);
                } else { move_angle = controller.moveVector(move_dx, move_dy, i); }

                if (config.aim === 'drone' && !target[4]) {
                  let p2 = Math.PI * 2, h = controller.dv * (((Math.round(move_angle * controller.iv) - 0.5) % 8 + 8) % 8 + 0.5);
                  if (Math.abs(((h - idleAngle) % p2 + Math.PI) % p2 - Math.PI) > 0.75) idleAngle = h + 0.75 * (2 * Math.random() - 1);
                  cIdleAngle = averageAngle(cIdleAngle, idleAngle, 5) % p2;
                  trigger.mousemove(controller.x = 250 + 20 * Math.cos(cIdleAngle), controller.y = 250 + 20 * Math.sin(cIdleAngle));
                } else {
                  let adx = target[2] - position[0], ady = target[3] - position[1];
                  if (adx !== 0 || ady !== 0) {
                    const angle = Math.atan2(ady, adx);
                    trigger.mousemove(controller.x = 250 + 100 * Math.cos(angle), controller.y = 250 + 100 * Math.sin(angle));
                  }
                }
                if (config.autoFire || target[4]) controller.mouseDown(); else controller.mouseUp();
              } else {
                controller.moveDirection(0, 0);
                if (Math.random() < 0.01) {
                  let ra = 2 * Math.PI * Math.random();
                  trigger.mousemove(controller.x = 250 + 20 * Math.cos(ra), controller.y = 250 + 20 * Math.sin(ra));
                }
                controller.mouseUp();
              }
            } else if (config.type === 'spawn2') {
              // Movement logic: hold S forever, hold A after 5 seconds (50 ticks)
              const y = 1; // Down
              let x = 0;
              if (i > 50) {
                x = -1; // Left
              }
              controller.moveDirection(x, y);

              if (active > 0) {
                // Aim at leader's cursor or leader's position
                let adx = target[2] - position[0], ady = target[3] - position[1];
                if (adx !== 0 || ady !== 0) {
                  const angle = Math.atan2(ady, adx);
                  trigger.mousemove(controller.x = 250 + 100 * Math.cos(angle), controller.y = 250 + 100 * Math.sin(angle));
                }
                if (config.autoFire || target[4]) controller.mouseDown(); else controller.mouseUp();
              } else {
                if (Math.random() < 0.01) {
                  let ra = 2 * Math.PI * Math.random();
                  trigger.mousemove(controller.x = 250 + 20 * Math.cos(ra), controller.y = 250 + 20 * Math.sin(ra));
                }
                controller.mouseUp();
              }
            }
          }

          if (died) {
            inGame = false; log('Death detected. Clearing render cache...'); block = true; ignore = true;
            let index = 0, interval = setInterval(function () {
              if (destroyed) { clearInterval(interval); return; }
              for (let j = 0; j < 5; j++) {
                window.innerWidth = 100 + 900 * Math.random(); window.innerHeight = 100 + 900 * Math.random();
                window.devicePixelRatio = 0.5 + Math.random(); performance.time += 9000; if (a) a();
              }
              if (++index >= 5) {
                clearInterval(interval); window.innerWidth = 500; window.innerHeight = 500; window.devicePixelRatio = 1;
                if (config.autoRespawn) { log('Render cache cleared, respawning...'); controller.press('Enter'); }
                block = false; ignore = false; performance.time += 9000; if (a) a();
                if (statusRecieved) i++;
              }
            }, 100);
            died = false; return;
          }
          performance.time += 9000; a();
          if (statusRecieved) i++;
        }
      }, 100);

      const averageAngle = (a, b, c) => {
        let d = 2 * Math.PI; a = ((a % d) + d) % d; let e = (d + b - a) % d;
        return e > Math.PI ? (((a + (e - d) / (c + 1)) % d) + d) % d : (((a + e / (c + 1)) % d) + d) % d;
      }

      window.localStorage = { setItem: function (i, v) { this[i] = v }, getItem: function (i) { return this[i] } };
      setGlobal('localStorage', window.localStorage);

      window.navigator = {};
      setGlobal('navigator', window.navigator);

      window.fetch = new Proxy(realFetch, {
        apply: function (a, b, c) {
          let f = c[0];
          if (typeof f === 'string') {
            if (f.startsWith('./')) f = c[0] = 'https://arras.io' + f.slice(1);
            else if (f.startsWith('/')) f = c[0] = 'https://arras.io' + f;
          }
          let options = c[1] || {}; if (proxyAgent) options.agent = proxyAgent; c[1] = options;
          if (typeof f === 'string' && f.includes('app.wasm')) return wasm();
          return Reflect.apply(a, b, c).then(response => {
            const originalJson = response.json.bind(response);
            response.json = async () => { try { return await originalJson(); } catch (e) { return {}; } };
            if (typeof f === 'string' && f.includes('status')) {
              response.clone().text().then(text => {
                try { const i = JSON.parse(text); if (i.ok && i.status) { statusRecieved = true; status = Object.values(i.status); log('Status received and processed.'); } } catch (e) { }
              }).catch(() => { });
            }
            return response;
          }).catch(() => ({ ok: false, status: 0, json: async () => ({}), text: async () => '', clone: () => ({ text: async () => '' }) }));
        }
      });
      setGlobal('fetch', window.fetch);

      let currentDecryptedPacket = [];
      const originalInstantiate = WebAssembly.instantiate;
      const hookInstantiate = function (buffer, importObject) {
        if (importObject && importObject.env) {
          for (let key in importObject.env) {
            if (typeof importObject.env[key] === 'function') {
              const original = importObject.env[key];
              importObject.env[key] = function (a, b, c) {
                if (config.pathfinding && arguments.length === 3 && typeof a === 'number' && typeof b === 'number' && typeof c === 'number') {
                  if (c === 0) currentDecryptedPacket.push((a ^ b) & 255);
                }
                return original.apply(this, arguments);
              };
            }
          }
        }
        return originalInstantiate.apply(this, arguments);
      };
      WebAssembly.instantiate = hookInstantiate;
      setGlobal('WebAssembly', WebAssembly);

      let gameSocket = false;
      window.WebSocket = new Proxy(ws, {
        construct: function (a, b, c) {
          const fullUrl = b[0], host = new url.URL(fullUrl).host;
          let h = {
            headers: {
              'user-agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
              'accept-encoding': 'gzip, deflate, br', 'accept-language': 'en-US,en;q=0.9', 'cache-control': 'no-cache',
              'connection': 'Upgrade', 'origin': 'https://arras.io', 'pragma': 'no-cache', 'upgrade': 'websocket',
              'Sec-WebSocket-Protocol': b[1] ? b[1].join(', ') : '', 'host': host
            },
            followRedirects: true, origin: 'https://arras.io',
            handshakeTimeout: 15000,
            rejectUnauthorized: false
          };
          if (proxyAgent) h.agent = proxyAgent;
          const d = Reflect.construct(a, [fullUrl, b[1], h], c);

          let isConnected = false;
          let connectTimeout = setTimeout(() => {
            if (!isConnected && d.readyState !== 1) {
              console.log(`[BOT ${config.id}] Connection timed out (15s), terminating socket...`);
              if (config.proxy) process.send({ type: 'proxy_failed', proxyUrl: config.proxy.url });
              d.terminate();
            }
          }, 15000);

          d.addEventListener('open', () => {
            isConnected = true;
            clearTimeout(connectTimeout);
            log('WebSocket open.');
            connected = true;
          });
          d.addEventListener('close', (e) => {
            isConnected = false;
            clearTimeout(connectTimeout);
            if (gameSocket === d) gameSocket = false;
            log('WebSocket closed. code =', e.code);
          });
          d.addEventListener('error', (err) => {
            isConnected = false;
            clearTimeout(connectTimeout);
            console.log(`[BOT ${config.id}] WebSocket Error:`, err.message || err);
            if (config.proxy) process.send({ type: 'proxy_failed', proxyUrl: config.proxy.url });
          });

          d.addEventListener('message', (msg) => {
            if (!config.pathfinding) return;
            // Clear buffer before game script processes it
            currentDecryptedPacket = [];

            // We use a small delay to let the game script's listener (which calls WASM) finish
            setTimeout(() => {
              if (currentDecryptedPacket.length === 0) return;
              try {
                const packet = new Uint8Array(currentDecryptedPacket);
                const header = packet[0];
                if (header === 117) { // update
                  const [decoded] = decode_packet(packet, 'u');
                  if (decoded.length > 5) {
                    let flags = decoded[4];
                    let offset = 5;
                    if (flags & (1 << 0)) offset++;
                    if (flags & (1 << 1)) offset++;
                    if (flags & (1 << 2)) offset += 2;
                    if (flags & (1 << 3)) {
                      playerColor = decoded[offset++];
                    }
                  }
                } else if (header === 98) { // broadcast
                  const [decoded] = decode_packet(packet, 'b');
                  broadcastParser.parse(decoded);
                  if (!mazeManager.map && mazeManager.check_if_map_is_maze(broadcastParser.global_minimap)) {
                    log('Maze detected! Parsing map...');
                    mazeManager.parse_maze_map(roomParser, broadcastParser.global_minimap);
                    if (mazeManager.map) log(`Map parsed: ${mazeManager.map_width}x${mazeManager.map_height}`);
                    else log('Map parsing failed (Dimensions still invalid)');
                  }
                } else if (header === 82) { // room info
                  log('Received room info packet');
                  let game_data_length = packet[2] + packet[3] * 256;
                  let game_data_end = 4 + game_data_length;
                  if (packet.length > game_data_end) {
                    let game_data = new TextDecoder().decode(packet.slice(4, game_data_end));
                    let remaining_packet = decode_packet(packet.slice(game_data_end), undefined)[0];
                    roomParser.parse(remaining_packet, game_data);
                    log(`Room Info parsed. Dimensions: ${roomParser.room_dimensions.join(',')}`);
                  }
                }
              } catch (e) { }
            }, 0);
          });

          d.send = new Proxy(d.send, { apply: (f, g, h) => Reflect.apply(f, g, h) });
          d.addEventListener = new Proxy(d.addEventListener, { apply: (a, b, c) => Reflect.apply(a, b, c) });
          gameSocket = d; return d;
        }
      });
      setGlobal('WebSocket', window.WebSocket);

      try {
        eval(x + '\n//# sourceURL=arras_game_script_' + config.id + '.js');
      } catch (err) {
        log(`[ERROR] Game script failed:`, err.message);
      }

      let ca = oa || {}; ca.window = window; ca.destroy = destroy; ca.controller = controller; ca.trigger = trigger;
      return Object.assign(ca, internalBotInterface);
    }

    let id = 0
    let arras = {
      then: (cb) => {
        then(() => cb(arras));
      },
      create: function (o) {
        if (!ready) {
          log("Warning: 'create' called before arras was ready. It will be queued.");
        }
        o.id = o.id !== undefined ? o.id : id++;
        currentBotInterface = run(script, o);
        return currentBotInterface;
      }
    }
    if (options.start) {
      options.start(arras)
    }
    return arras
  })()
}
