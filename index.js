require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const PREFIX = '?'; // Changed to ?
const fs = require('fs');
const http = require('http');
const { fork, spawn } = require('child_process');
const path = require('path');

// ===== COMBINED WEB & FOLLOW SERVER =====
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Arras Bot & Follow Server is alive!');
});

// Integrate Follow Server Logic directly into the main server
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');
const wss = new WebSocket.Server({ server });

let leaders = new Map(); // squadId -> { ws, lastUpdate }
let nodes = new Map();   // nodeId  -> { ws, nodeId, activeBots, maxBots, connectedAt }

wss.on('connection', (ws) => {
    let currentSquad = null;
    let isLeader = false;

    ws.on('message', (data) => {
        try {
            const msg = msgpack.decode(data);
            const type = msg[0];

            // Type 0/1/3: Leader Updates
            if (type === 0 || type === 1 || type === 3) {
                const squadId = (type === 0) ? msg[1] : msg[3];
                if (!squadId) return;

                currentSquad = squadId;
                isLeader = true;

                let dataToBroadcast = data;
                if (type === 1) {
                    // Translate: [1, x, y, squadId, mouseX, mouseY, action] -> [101, x, y, mouseX, mouseY, action]
                    dataToBroadcast = msgpack.encode([101, msg[1], msg[2], msg[4], msg[5], msg[6]]);
                }

                leaders.set(squadId, { ws, lastUpdate: Date.now(), data: dataToBroadcast });

                // Broadcast to all clients in this squad except sender
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.squadId === squadId) {
                        client.send(dataToBroadcast);
                    }
                });
            }
            // Type 10: Follower Subscribe
            else if (type === 10) {
                const squadId = msg[1];
                ws.squadId = squadId;
                currentSquad = squadId;
                console.log(`[FOLLOW] New follower joined squad: ${squadId}`);
                if (leaders.has(squadId)) {
                    ws.send(leaders.get(squadId).data);
                }
            }
            // Type 20: Satellite node announces itself
            else if (type === 20) {
                const nodeId = msg[1];
                const maxBots = msg[2] || 30;
                ws.isNode = true;
                ws.nodeId = nodeId;
                nodes.set(nodeId, { ws, nodeId, activeBots: 0, maxBots, connectedAt: Date.now() });
                console.log(`[NODE] Satellite "${nodeId}" connected (max ${maxBots} bots). Total nodes: ${nodes.size}`);
            }
            // Type 22: Satellite sends status update
            else if (type === 22) {
                const nodeId = msg[1];
                if (nodes.has(nodeId)) {
                    const node = nodes.get(nodeId);
                    node.activeBots = msg[2];
                    if (msg[3]) node.maxBots = msg[3];
                }
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        if (isLeader && currentSquad) {
            leaders.delete(currentSquad);
        }
        if (ws.isNode && ws.nodeId) {
            nodes.delete(ws.nodeId);
            console.log(`[NODE] Satellite "${ws.nodeId}" disconnected. Remaining nodes: ${nodes.size}`);
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Combined Keep-alive & Follow Server listening on port ${PORT}`);
});

const { tree, getPath, indicesToKeys, convertStats } = require('./shared');


// ===== PRESETS (same as headless.js) =====
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

// Load advanced presets from file
if (fs.existsSync(path.join(__dirname, 'just_some_bot_upgrades.js'))) {
    try {
        const content = fs.readFileSync(path.join(__dirname, 'just_some_bot_upgrades.js'), 'utf8');
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
// ===== DISCORD CONFIG (RESTORING LOGS) =====
const discordConfigPath = path.join(__dirname, 'config.json');
let discordConfig = { adminRoleId: null, logChannelId: null };
function loadDiscordConfig() {
    try {
        if (fs.existsSync(discordConfigPath)) {
            discordConfig = JSON.parse(fs.readFileSync(discordConfigPath, 'utf8'));
        }
    } catch (e) { }
}
function saveDiscordConfig() {
    try { fs.writeFileSync(discordConfigPath, JSON.stringify(discordConfig, null, 4), 'utf8'); } catch (e) { }
}
loadDiscordConfig();

async function logCommand(message, commandName, details = {}) {
    if (!discordConfig.logChannelId) return;
    try {
        const logChannel = await client.channels.fetch(discordConfig.logChannelId).catch(() => null);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛠️ Command: ${PREFIX}${commandName}`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
                { name: 'Server', value: message.guild ? message.guild.name : 'DMs', inline: true }
            )
            .setTimestamp()
            .setColor('#00ffcc');

        if (Object.keys(details).length > 0) {
            let detailsStr = '';
            for (const [key, val] of Object.entries(details)) detailsStr += `**${key}**: ${val}\n`;
            embed.addFields({ name: 'Details', value: detailsStr || 'None' });
        }

        logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) { }
}

function checkPermission(message) {
    if (!message) return false;
    const authorId = message.author ? message.author.id : (message.id || '');
    // Owner bypass
    if (authorId === '1252643126204694548') return true;

    if (!message.member) return false;
    // Administrator bypass
    if (message.member.permissions.has('Administrator')) return true;
    // Specific role restriction
    const targetRoleId = '1470461508478566444';
    return message.member.roles.cache.has(targetRoleId) || (discordConfig.adminRoleId && message.member.roles.cache.has(discordConfig.adminRoleId));
}

// ===== BOT CONFIG =====
const configFilePath = path.join(__dirname, 'bot_config.json');
let botConfig = {
    squadId: 'epb',
    name: '[SSS] tristam',
    tank: 'Booster',
    tankMode: 'single',
    activePreset: 'Best AR Tanks',
    keys: [],
    joinSequence: [],
    autoFire: false,
    autoRespawn: true,
    target: 'player',
    aim: 'drone',
    chatSpam: '',
    stats: [2, 2, 2, 6, 6, 8, 8, 8, 0],
    launchDelay: 20000,
    pathfinding: false
};

function saveConfig() {
    try { fs.writeFileSync(configFilePath, JSON.stringify(botConfig, null, 2), 'utf8'); } catch (e) { }
}

function loadConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const saved = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
            botConfig = { ...botConfig, ...saved };
        }
    } catch (e) { }
}
loadConfig();

// ===== PROXY MANAGEMENT =====
let proxies = {};
let usedProxies = new Set();
const usageFilePath = path.join(__dirname, 'proxy_usage.json');

function loadProxyUsage() {
    try {
        if (fs.existsSync(usageFilePath)) {
            const data = JSON.parse(fs.readFileSync(usageFilePath, 'utf8'));
            if (Array.isArray(data)) usedProxies = new Set(data);
        }
    } catch (e) { usedProxies = new Set(); }
}

function saveProxyUsage() {
    try { fs.writeFileSync(usageFilePath, JSON.stringify(Array.from(usedProxies)), 'utf8'); } catch (e) { }
}

function loadProxies() {
    try {
        const proxyPath = path.join(__dirname, 'proxies.txt');
        if (!fs.existsSync(proxyPath)) { console.log('[PROXIES] proxies.txt not found.'); return; }
        const proxyData = fs.readFileSync(proxyPath, 'utf8');
        const lines = proxyData.split(/\r?\n/).filter(line => line.trim() !== '');

        let allFound = 0;
        proxies = {};

        for (const line of lines) {
            let text = line.trim();
            if (text.startsWith('#') || text === '') continue;
            allFound++;

            // Detect protocol or default to http
            let protocol = 'http';
            if (text.includes('://')) {
                protocol = text.split('://')[0].toLowerCase();
                if (protocol.startsWith('socks')) protocol = 'socks5h';
                else protocol = 'http';
            } else if (text.includes('maskify')) {
                protocol = 'socks5h';
            } else if (text.includes('whiteproxies') || text.includes('lightningproxies')) {
                protocol = 'http';
            }

            const cleanText = text.includes('://') ? text.split('://')[1] : text;
            const parts = cleanText.split(':');
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

            if (proxyUrl) {
                proxies[proxyUrl] = type;
            }
        }
        console.log(`[PROXIES] Loaded ${allFound} proxies. (Rotating mode enabled)`);
    } catch (e) {
        console.log('[PROXIES] Error loading proxies.txt:', e.message);
    }
}

function getFreshProxy() {
    const keys = Object.keys(proxies);
    if (keys.length === 0) return null;
    const url = keys[0];
    const type = proxies[url];
    // For rotating proxies (1 proxy), do NOT delete it so it can be reused for all bots
    if (keys.length > 1) {
        delete proxies[url];
    }
    return { url, type };
}

loadProxyUsage();
loadProxies();

// ===== NODE / MULTI-CODESPACE SYSTEM =====

// Master's public WebSocket URL — sent to satellites so their workers can connect here
const MASTER_PUBLIC_URL = process.env.CODESPACE_NAME
    ? `wss://${process.env.CODESPACE_NAME}-3000.app.github.dev`
    : (process.env.MASTER_PUBLIC_URL || `ws://localhost:${PORT}`);
console.log(`[NODE] Master public URL: ${MASTER_PUBLIC_URL}`);

// Satellite node config (names list for wake/sleep)
const nodeConfigPath = path.join(__dirname, 'node_config.json');
let nodeConfig = { satellites: [] };
function loadNodeConfig() {
    try {
        if (fs.existsSync(nodeConfigPath)) nodeConfig = JSON.parse(fs.readFileSync(nodeConfigPath, 'utf8'));
    } catch (e) { }
}
function saveNodeConfig() {
    try { fs.writeFileSync(nodeConfigPath, JSON.stringify(nodeConfig, null, 2), 'utf8'); } catch (e) { }
}
loadNodeConfig();

// Resolve the correct GitHub token for a given satellite
// Looks up GITHUB_TOKEN_<ALIAS> in .env, falls back to GITHUB_TOKEN
function getTokenForSatellite(nameOrSat) {
    const sat = typeof nameOrSat === 'string'
        ? nodeConfig.satellites.find(s => s.name === nameOrSat)
        : nameOrSat;
    if (sat && sat.account) {
        const envKey = `GITHUB_TOKEN_${sat.account.toUpperCase()}`;
        const tok = process.env[envKey];
        if (tok) return tok;
    }
    // Fallback to global token
    const fallback = process.env.GITHUB_TOKEN;
    if (!fallback) throw new Error(`No GitHub token found. Set GITHUB_TOKEN or GITHUB_TOKEN_<account> in .env`);
    return fallback;
}

// GitHub Codespaces API: wake / sleep a satellite
async function wakeCodespace(name) {
    const token = getTokenForSatellite(name);
    const res = await fetch(`https://api.github.com/user/codespaces/${name}/start`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json();
}
async function sleepCodespace(name) {
    const token = getTokenForSatellite(name);
    const res = await fetch(`https://api.github.com/user/codespaces/${name}/stop`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json();
}

// Tell all connected satellite nodes to kill their bots
function killAllNodes() {
    nodes.forEach(node => {
        if (node.ws.readyState === 1) {
            try { node.ws.send(msgpack.encode([23])); } catch (e) { }
        }
    });
}

// Resource Cache for Rocket Launch
let cachedResources = { wasm: null, script: null };
async function preloadResources() {
    console.log('[RESOURCES] Pre-loading Arras.io game files for Rocket Launch...');
    try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch('https://arras.io');
        const html = await res.text();
        const scriptTagStart = html.indexOf('<script>');
        let scriptContent = html.slice(scriptTagStart + 8);
        const scriptTagEnd = scriptContent.indexOf('</script');
        cachedResources.script = scriptContent.slice(0, scriptTagEnd);

        const wasmRes = await fetch('https://arras.io/app.wasm');
        cachedResources.wasm = Buffer.from(await wasmRes.arrayBuffer());
        console.log('[RESOURCES] ✅ WASM and Script cached. Ready for instant burst.');
    } catch (e) {
        console.error('[RESOURCES] Failed to cache resources, bots will fetch individually:', e.message);
    }
}
preloadResources();

// Build spawn config object to send to satellite nodes
function buildSpawnConfig(type) {
    let presetData = null;
    if (botConfig.tankMode === 'preset' && PRESETS[botConfig.activePreset]) {
        presetData = PRESETS[botConfig.activePreset];
    }
    return {
        tank: botConfig.tank,
        tankMode: botConfig.tankMode,
        activePreset: botConfig.activePreset,
        preset: presetData,
        stats: botConfig.stats,
        name: botConfig.name || 'bot',
        squadId: botConfig.squadId || 'epb',
        autoFire: botConfig.autoFire,
        autoRespawn: botConfig.autoRespawn,
        target: botConfig.target,
        aim: botConfig.aim,
        chatSpam: botConfig.chatSpam,
        launchDelay: botConfig.launchDelay,
        type: type || 'follow',
        followServerUrl: MASTER_PUBLIC_URL,
        joinSequence: botConfig.joinSequence,
        pathfinding: botConfig.pathfinding,
        cachedResources: {
            script: cachedResources.script,
            wasm: cachedResources.wasm ? cachedResources.wasm.toString('base64') : null
        }
    };
}

// Distribute bots evenly across master + all online satellite nodes
function distributeStartBots(totalCount, message, type) {
    const onlineNodes = Array.from(nodes.values()).filter(n => n.ws.readyState === 1);
    if (onlineNodes.length === 0) {
        // No satellites online — run everything locally (backward compatible)
        startBots(totalCount, message, type);
        return;
    }

    const totalNodes = onlineNodes.length + 1; // +1 for master
    const baseCount = Math.floor(totalCount / totalNodes);
    const remainder = totalCount % totalNodes;
    const masterCount = baseCount + remainder; // master gets the extra from uneven split

    const spawnConfig = buildSpawnConfig(type);

    // Each satellite's share - Done FIRST to account for network latency
    const nodeLines = [];
    onlineNodes.forEach(node => {
        if (baseCount <= 0) return;
        try {
            node.ws.send(msgpack.encode([21, baseCount, spawnConfig]));
            nodeLines.push(`\`${node.nodeId}\`: **${baseCount}**`);
        } catch (e) {
            console.error(`[NODE] Failed to send spawn to ${node.nodeId}:`, e.message);
        }
    });

    // Master's local share - Done AFTER sending satellite commands
    if (masterCount > 0) startBots(masterCount, null, type);

    if (message) {
        const desc = [
            `\`Master\`: **${masterCount}**`,
            ...nodeLines
        ].join('\n');
        message.reply({
            embeds: [createEmbed('📡 Multi-Node Deployment',
                `**${totalCount}** bots distributed across **${totalNodes}** node(s):\n\n${desc}`)]
        });
    }
    console.log(`[NODE] Distributed ${totalCount} bots: master=${masterCount}, ${onlineNodes.length} satellite(s)=${baseCount} each`);
}

// ===== WORKER MANAGEMENT =====
const BOTS_PER_WORKER = 1;
let workers = [];
let paused = false;
let spawn3Results = new Map(); // hash -> data
let spawn3Timeout = null;
let spawn3Message = null;

function startBots(numBots, message, type = 'follow') {
    let launchQueue = [];
    const proxyList = Object.keys(proxies);
    const botIdCounter = Date.now() % 10000;

    if (proxyList.length < numBots) {
        if (message) message.channel.send(`⚠️ Only ${proxyList.length} fresh proxies available for ${numBots} bots.`);
    }

    // Build the launch queue
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
        botConfig.multiTankConfig.forEach(group => {
            const count = group.count || 1;
            for (let k = 0; k < count; k++) {
                if (launchQueue.length < numBots) {
                    launchQueue.push({ tank: group.tank, keys: group.keys || [] });
                }
            }
        });
        if (launchQueue.length < numBots) {
            const tankNames = Object.keys(tree);
            while (launchQueue.length < numBots) {
                const randomTank = tankNames[Math.floor(Math.random() * tankNames.length)];
                launchQueue.push({ tank: randomTank, keys: [] });
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

    function launchBotInstance(botSpec, i, type, botIdCounter) {
        const nextProxy = getFreshProxy();
        const config = {
            id: botIdCounter + i,
            proxy: nextProxy ? { type: nextProxy.type, url: nextProxy.url } : false,
            hash: '#' + (botConfig.squadId || 'epb'),
            name: botConfig.name || 'bot',
            stats: botSpec.stats || [...botConfig.stats],
            type: type,
            token: 'follow-3c8f2e',
            autoFire: botConfig.autoFire,
            autoRespawn: botConfig.autoRespawn,
            target: botConfig.target,
            aim: botConfig.aim,
            keys: [...(botSpec.keys || [])],
            joinSequence: [...botConfig.joinSequence],
            tank: botSpec.tank,
            chatSpam: botConfig.chatSpam,
            squadId: botConfig.squadId || 'epb',
            loadFromCache: true,
            cache: false,
            arrasCache: './ah.txt',
            autospin: botSpec.autospin,
            growth_order: botSpec.growth_order,
            angle_offset: botSpec.angle_offset,
            pathfinding: botConfig.pathfinding,
            cachedResources: {
                script: cachedResources.script,
                wasm: cachedResources.wasm ? cachedResources.wasm.toString('base64') : null
            }
        };

        const workerProcess = fork(path.join(__dirname, 'headless.js'), [], {
            env: { ...process.env, IS_WORKER: 'true', PARENT_PORT: PORT },
            execArgv: ['--max-old-space-size=128'],
            silent: false
        });

        const workerEntry = { process: workerProcess, id: config.id };
        workers.push(workerEntry);

        workerProcess.on('message', (msg) => {
            if (msg.type === 'blacklisted' || msg.type === 'proxy_failed') {
                const reason = msg.type === 'blacklisted' ? `Blacklisted: ${msg.reason || 'Unknown'}` : 'Connection Failed/Timeout';
                console.log(`[BOT ${config.id}] Proxy issue! (${reason}). Rotating...`);
                workerProcess.kill();
                setTimeout(() => {
                    workers = workers.filter(w => w !== workerEntry);
                    launchBotInstance(botSpec, i, type, botIdCounter);
                }, 2000);
            } else if (msg.type === 'verified_good') {
                if (msg.proxyUrl) {
                    fs.appendFileSync(path.join(__dirname, 'notblacklisted.txt'), msg.proxyUrl + '\n', 'utf8');
                }
            } else if (msg.type === 'spawn3_data') {
                if (message && message.channel) {
                    const hash = msg.hash;
                    spawn3Results.set(hash, hash);

                    if (spawn3Timeout) clearTimeout(spawn3Timeout);
                    spawn3Timeout = setTimeout(() => {
                        if (spawn3Results.size === 0) return;

                        const colorMap = {
                            '1': '🔵', // Blue
                            '2': '🟢', // Green
                            '3': '🔴', // Red
                            '4': '🟣'  // Purple
                        };

                        const results = Array.from(spawn3Results.entries()).slice(0, 4);
                        const description = results.map(([h]) => {
                            const cleanHash = h.startsWith('#') ? h.substring(1) : h;
                            const firstDigit = cleanHash.match(/\d/)?.[0] || '0';
                            const emoji = colorMap[firstDigit] || '⚪';
                            return `${emoji} ${h}`;
                        }).join('\n');

                        const embed = new EmbedBuilder()
                            .setAuthor({ name: 'arras.io raper', iconURL: 'https://arras.io/favicon/128x128.png' })
                            .setTitle('Team Links')
                            .setDescription(description)
                            .setColor(0x00D2D2)
                            .setTimestamp()
                            .setFooter({ text: 'Fuck CX • ' + PREFIX + 'help for list' });

                        if (spawn3Message) {
                            spawn3Message.edit({ content: '', embeds: [embed] }).catch(err => {
                                console.error('Error editing spawn3 message:', err);
                                spawn3Message.channel.send({ embeds: [embed] });
                            });
                        }
                        spawn3Results.clear();
                        spawn3Timeout = null;
                        spawn3Message = null;
                    }, 5000);
                }
            }
        });

        workerProcess.on('exit', () => {
            workers = workers.filter(w => w !== workerEntry);
        });

        workerProcess.send({ type: 'start', config });
    }

    const delay = botConfig.launchDelay || 0;
    launchQueue.forEach((botSpec, i) => {
        if (delay <= 0) {
            launchBotInstance(botSpec, i, type, botIdCounter);
        } else {
            setTimeout(() => launchBotInstance(botSpec, i, type, botIdCounter), delay * i);
        }
    });

    if (message) {
        const totalTime = botConfig.launchDelay * numBots;
        setTimeout(() => {
            // All bots launched (initial queue)
        }, totalTime + 1000);
    }
}

function disconnectBots() {
    let botCount = workers.length;
    workers.forEach(w => w.process.kill());
    workers = [];
    paused = false;
    return botCount;
}

function togglePause() {
    paused = !paused;
    workers.forEach(w => w.process.send({ type: 'pause', paused: paused }));
    return paused;
}

function simulateKey(keyCode) {
    workers.forEach(w => w.process.send({ type: 'key_command', key: keyCode }));
}

function mapInputToCode(input) {
    if (!input) return null;
    input = input.trim();
    const lower = input.toLowerCase();
    if (lower.length === 1) {
        if (lower >= 'a' && lower <= 'z') return 'Key' + lower.toUpperCase();
        if (lower >= '0' && lower <= '9') return 'Digit' + lower;
    }
    const map = {
        'space': 'Space', 'enter': 'Enter', 'shift': 'ShiftLeft',
        'ctrl': 'ControlLeft', 'alt': 'AltLeft', 'tab': 'Tab',
        'esc': 'Escape', 'escape': 'Escape',
        'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
        'backspace': 'Backspace'
    };
    return map[lower] || null;
}

// ===== DISCORD BOT =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`[DISCORD] Logged in as ${client.user.tag}!`);
});

const createEmbed = (title, description, color = 0x00D2D2) => {
    return new EmbedBuilder()
        .setAuthor({ name: 'arras.io raper', iconURL: 'https://arras.io/favicon/128x128.png' })
        .setDescription(`### ${title}\n${description}`) // Tighten layout by removing setTitle gap
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Fuck CX • ' + PREFIX + 'help for list' });
};

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    // Global Permission Check
    if (!checkPermission(message)) return;

    // ===== !setup [logChannelId] [adminRoleId] =====
    if (command === 'setup') {
        if (message.guild && !message.member.permissions.has('Administrator'))
            return message.reply({ embeds: [createEmbed('❌ Error', 'Only server administrators can use this command.', 0xff4444)] });

        const logId = args[0];
        const roleId = args[1];

        if (!logId) return message.reply({ embeds: [createEmbed('⚙️ Setup Guide', `Usage: \`${PREFIX}setup [Log Channel ID] [Admin Role ID (Optional)]\``)] });

        discordConfig.logChannelId = logId;
        if (roleId) discordConfig.adminRoleId = roleId;
        saveDiscordConfig();

        message.reply({ embeds: [createEmbed('✅ Setup Complete', `Logs will now be sent to <#${logId}>.\nAdmin Role: ${roleId ? `<@&${roleId}>` : '`None`'}`)] });
        logCommand(message, 'setup', { 'Log Channel': logId, 'Admin Role': roleId || 'None' });
        return;
    }

    // ===== ?spawn [count] [hash] =====
    if (command === 'spawn') {
        const count = parseInt(args[0]) || 1;
        const hash = args[1] || null;
        const isOwner = message.author.id === '1252643126204694548';
        if (count > 50 && !isOwner) return message.reply({ embeds: [createEmbed('❌ Error', 'Max 50 bots at once.', 0xff4444)] });
        if (count < 1) return message.reply({ embeds: [createEmbed('❌ Error', 'Must spawn at least 1 bot.', 0xff4444)] });

        // If hash is provided, temporarily override squadId for this spawn
        if (hash) {
            botConfig.squadId = hash.startsWith('#') ? hash.slice(1) : hash;
            saveConfig();
        }

        const embed = createEmbed('Deployment', `Launching **${count}** bot(s).`)
            .addFields(
                { name: ' Server', value: `\`#${botConfig.squadId}\``, inline: true },
                { name: ' Tank', value: `${botConfig.tankMode === 'preset' ? `Preset: \`${botConfig.activePreset}\`` : `\`${botConfig.tank}\``}`, inline: true },
                { name: ' Name', value: `\`${botConfig.name}\``, inline: true },
                { name: ' Delay', value: `\`${botConfig.launchDelay}ms\``, inline: true }
            );

        message.reply({ embeds: [embed] });
        distributeStartBots(count, message, 'follow');
        logCommand(message, 'spawn', { Count: count, Hash: '#' + botConfig.squadId, Name: botConfig.name });
    }

    // ===== !spawn2 [count] [hash] =====
    else if (command === 'spawn2') {
        const count = parseInt(args[0]) || 1;
        const hash = args[1] || null;
        const isOwner = message.author.id === '1252643126204694548';
        if (count > 50 && !isOwner) return message.reply({ embeds: [createEmbed('❌ Error', 'Max 50 bots at once.', 0xff4444)] });
        if (count < 1) return message.reply({ embeds: [createEmbed('❌ Error', 'Must spawn at least 1 bot.', 0xff4444)] });

        if (hash) {
            botConfig.squadId = hash.startsWith('#') ? hash.slice(1) : hash;
            saveConfig();
        }

        const embed = createEmbed('Deployment 2 (Pattern)', `Launching **${count}** bot(s) with movement pattern.`)
            .addFields(
                { name: ' Server', value: `\`#${botConfig.squadId}\``, inline: true },
                { name: ' Tank', value: `${botConfig.tankMode === 'preset' ? `Preset: \`${botConfig.activePreset}\`` : `\`${botConfig.tank}\``}`, inline: true },
                { name: ' Name', value: `\`${botConfig.name}\``, inline: true },
                { name: ' Delay', value: `\`${botConfig.launchDelay}ms\``, inline: true }
            );

        message.reply({ embeds: [embed] });
        distributeStartBots(count, message, 'spawn2');
        logCommand(message, 'spawn2', { Count: count, Hash: '#' + botConfig.squadId, Name: botConfig.name });
    }

    // ===== ?codes [hash] =====
    else if (command === 'codes') {
        const hash = args[0] || null;
        // Randomly pick a number between 8 and 10 bots inclusive
        const count = Math.floor(Math.random() * 3) + 8;

        if (hash) {
            botConfig.squadId = hash.startsWith('#') ? hash.slice(1) : hash;
            saveConfig();
        }

        spawn3Results.clear();
        message.channel.send("Fetching server codes...").then(m => {
            spawn3Message = m;
        });

        startBots(count, message, 'spawn3');
        logCommand(message, 'codes', { Count: count, Hash: '#' + botConfig.squadId, Name: botConfig.name });
    }

    else if (command === 'kill') {
        killAllNodes(); // also tell all satellite nodes to kill
        const count = disconnectBots();
        const nodeCount = nodes.size;
        message.reply({ embeds: [createEmbed('🔴 Shutdown', `Disconnected **${count}** local bot(s)${nodeCount > 0 ? ` + kill signal sent to **${nodeCount}** node(s)` : ''}.`, 0xff4444)] });
        logCommand(message, 'kill', { Bots: count, Nodes: nodeCount });
    }

    // ===== !pause =====
    else if (command === 'pause') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You do not have the required role to pause the fleet.', 0xff4444)] });
        const isPaused = togglePause();
        message.reply({ embeds: [createEmbed(isPaused ? '⏸️ Fleet Paused' : '▶️ Fleet Resumed', `Status updated for **${workers.length}** worker(s).`)] });
        logCommand(message, 'pause', { Status: isPaused ? 'Paused' : 'Resumed' });
    }

    // ===== !settank [name or indices] =====
    else if (command === 'settank') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You need to be an admin or have the admin role to change settings.', 0xff4444)] });
        const tankInput = args.join(' ');
        if (!tankInput) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}settank [name or indices]\` (e.g. Booster or 3 1 0)`, 0xff4444)] });

        if (/^[\d\s]+$/.test(tankInput)) {
            botConfig.tank = tankInput;
            botConfig.tankMode = 'single';
            saveConfig();
            message.reply({ embeds: [createEmbed('✅ Tank Updated', `Tank set to indices: **${tankInput}**\nKeys: \`${indicesToKeys(tankInput)}\``)] });
            logToDiscord('⚙️ Setting Change', `**${message.author.tag}** updated bot tank to indices: \`${tankInput}\`.`);
        } else {
            if (tree[tankInput] || tankInput === 'Basic') {
                botConfig.tank = tankInput;
                botConfig.tankMode = 'single';
                saveConfig();
                message.reply({ embeds: [createEmbed('✅ Tank Updated', `Tank set to: **${tankInput}**\nPath: \`${getPath(tankInput)}\``)] });
                logCommand(message, 'settank', { Tank: tankInput });
            } else {
                message.reply({ embeds: [createEmbed('❌ Unknown Tank', `"${tankInput}" is not a valid tank name.`, 0xff4444)] });
            }
        }
    }

    // ===== !setstats [0-9 values] =====
    else if (command === 'setstats') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You need to be an admin or have the admin role to change settings.', 0xff4444)] });
        const statsInput = args;
        if (statsInput.length === 0) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setstats 2 2 2 6 6 8 8 8 0\` (10 values)`, 0xff4444)] });

        const stats = statsInput.map(s => parseInt(s));
        if (stats.some(s => isNaN(s) || s < 0 || s > 9)) {
            return message.reply({ embeds: [createEmbed('❌ Error', 'Each stat must be a number from 0 to 9.', 0xff4444)] });
        }

        while (stats.length < 10) stats.push(0);
        botConfig.stats = stats.slice(0, 10);
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Stats Updated', `Build set to: \`[${botConfig.stats.join(', ')}]\``)] });
        logCommand(message, 'setstats', { Build: `[${botConfig.stats.join(', ')}]` });
    }

    // ===== !setname [name] =====
    else if (command === 'setname') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You need to be an admin or have the admin role to change settings.', 0xff4444)] });
        const name = args.join(' ');
        if (!name) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setname [bot name]\``, 0xff4444)] });
        botConfig.name = name;
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Name Updated', `Bot identity set to: **${name}**`)] });
        logCommand(message, 'setname', { Name: name });
    }

    // ===== !setsquad [id] =====
    else if (command === 'setsquad') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You need to be an admin or have the admin role to change settings.', 0xff4444)] });
        const squadId = args[0];
        if (!squadId) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setsquad [id]\``, 0xff4444)] });
        botConfig.squadId = squadId;
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Squad Updated', `Target squad set to: \`#${squadId}\``)] });
        logCommand(message, 'setsquad', { Squad: squadId });
    }

    // ===== !setpreset [preset name] =====
    else if (command === 'setpreset') {
        if (!checkPermission(message)) return message.reply({ embeds: [createEmbed('❌ No Permission', 'You need to be an admin or have the admin role to change settings.', 0xff4444)] });
        const presetName = args.join(' ');
        if (!presetName) {
            const presetList = Object.keys(PRESETS).map((p, i) => `**${i + 1}.** ${p}`).join('\n');
            return message.reply({ embeds: [createEmbed('📋 Available Presets', presetList)] });
        }

        if (PRESETS[presetName]) {
            botConfig.tankMode = 'preset';
            botConfig.activePreset = presetName;
            saveConfig();
            message.reply({ embeds: [createEmbed('✅ Preset Active', `Mode switched to: **${presetName}**`)] });
            logCommand(message, 'setpreset', { Preset: presetName });
        } else {
            message.reply({ embeds: [createEmbed('❌ Unknown Preset', `Available: ${Object.keys(PRESETS).join(', ')}`, 0xff4444)] });
        }
    }

    // ===== !setmode [single|preset|multi] =====
    else if (command === 'setmode') {
        const mode = (args[0] || '').toLowerCase();
        if (!['single', 'preset', 'multi'].includes(mode)) {
            return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setmode single|preset|multi\``, 0xff4444)] });
        }
        botConfig.tankMode = mode;
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Mode Updated', `Tank mode set to: **${mode}**`)] });
    }

    // ===== !setdelay [ms] =====
    else if (command === 'setdelay') {
        const delay = parseInt(args[0]);
        if (isNaN(delay) || delay < 0) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setdelay [ms]\``, 0xff4444)] });
        botConfig.launchDelay = delay;
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Delay Updated', `Launch delay set to: **${delay}ms**`)] });
    }

    // ===== !autofire =====
    else if (command === 'autofire') {
        botConfig.autoFire = !botConfig.autoFire;
        saveConfig();
        message.reply({ embeds: [createEmbed('🔥 AutoFire Toggled', `AutoFire is now **${botConfig.autoFire ? 'ENABLED' : 'DISABLED'}**`)] });
    }

    // ===== !pathfinding =====
    else if (command === 'pathfinding') {
        botConfig.pathfinding = !botConfig.pathfinding;
        saveConfig();
        workers.forEach(w => {
            try { w.process.send({ type: 'pathfinding', enabled: botConfig.pathfinding }); } catch (e) { }
        });
        message.reply({ embeds: [createEmbed('🧩 Pathfinding Toggled', `Pathfinding is now **${botConfig.pathfinding ? 'ENABLED' : 'DISABLED'}**`)] });
    }

    // ===== !spin =====
    else if (command === 'spin') {
        simulateKey('KeyC');
        message.reply({ embeds: [createEmbed('🔄 Spin Command', `Rotation signal sent to **${workers.length}** bot(s).`)] });
    }

    // ===== !chat [message] =====
    else if (command === 'chat') {
        const chatMsg = args.join(' ');
        if (!chatMsg) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}chat [message]\``, 0xff4444)] });
        botConfig.chatSpam = chatMsg;
        saveConfig();
        message.reply({ embeds: [createEmbed('💬 Chat Updated', `Spam message set to: "${chatMsg}"`)] });
    }

    // ===== !key [key] =====
    else if (command === 'key') {
        const keyInput = args.join(' ');
        if (!keyInput) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}key [key]\` (e.g. e, space)`, 0xff4444)] });
        const keyCode = mapInputToCode(keyInput);
        if (!keyCode) return message.reply({ embeds: [createEmbed('❌ Unknown Key', `"${keyInput}" is not recognized.`, 0xff4444)] });
        simulateKey(keyCode);
        message.reply({ embeds: [createEmbed('⌨️ Key Simulated', `Sent **${keyCode}** to **${workers.length}** bot(s).`)] });
        logCommand(message, 'key', { Key: keyCode });
    }

    // ===== !split =====
    else if (command === 'split') {
        simulateKey('Space');
        message.reply({ embeds: [createEmbed('💥 Split Force', `Split signal sent to **${workers.length}** bot(s).`)] });
    }

    // ===== !setjoin [keys] =====
    else if (command === 'setjoin') {
        const keys = args.map(k => k.toUpperCase());
        if (keys.length === 0) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}setjoin H I I Y\``, 0xff4444)] });
        botConfig.joinSequence = keys;
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Join Sequence', `Keys configured: \`${keys.join(', ')}\``)] });
    }

    // ===== !clearjoin =====
    else if (command === 'clearjoin') {
        botConfig.joinSequence = [];
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Sequence Cleared', 'Spawn join sequence has been reset.')] });
    }

    // ===== !clearchat =====
    else if (command === 'clearchat') {
        botConfig.chatSpam = '';
        saveConfig();
        message.reply({ embeds: [createEmbed('✅ Chat Cleared', 'Chat spam loop disabled.')] });
    }

    // ===== !feed =====
    else if (command === 'feed') {
        simulateKey('KeyR');
        message.reply({ embeds: [createEmbed('🍖 Feed Command', `Toggled feeding signal for **${workers.length}** bot(s).`)] });
    }

    // ===== !follow =====
    else if (command === 'follow') {
        const embed = createEmbed('ℹ️ Follow Protocol', 'The follow system is active via WebSocket.')
            .addFields(
                { name: 'Squad ID', value: `\`${botConfig.squadId}\``, inline: true },
                { name: 'Port', value: '`8080`', inline: true },
                { name: 'Leader', value: 'Use `userscript.js` in browser.', inline: false }
            );
        message.reply({ embeds: [embed] });
        logCommand(message, 'follow', { Note: 'Follow protocol info requested' });
    }

    // ===== !resetproxies =====
    else if (command === 'resetproxies') {
        usedProxies = new Set();
        saveProxyUsage();
        loadProxies();
        message.reply({ embeds: [createEmbed('✅ Proxies Reset', `Usage history cleared. **${Object.keys(proxies).length}** proxies available.`)] });
    }

    // ===== !proxyinfo =====
    else if (command === 'proxyinfo') {
        loadProxies();
        const embed = createEmbed('🌐 Proxy Network', 'Current proxy availability and health.')
            .addFields(
                { name: 'Available', value: `\`${Object.keys(proxies).length}\``, inline: true },
                { name: 'Used', value: `\`${usedProxies.size}\``, inline: true }
            );
        message.reply({ embeds: [embed] });
    }

    // ===== !status =====
    else if (command === 'status') {
        const embed = createEmbed('🤖 Bot Network Status', `Overview of the current headless fleet.`)
            .addFields(
                { name: 'Fleet', value: `Workers: \`${workers.length}\`\nPaused: \`${paused ? 'Yes' : 'No'}\``, inline: true },
                { name: 'Target', value: `Squad: \`#${botConfig.squadId}\`\nMode: \`${botConfig.tankMode}\``, inline: true },
                {
                    name: 'Active Config', value:
                        `Name: \`${botConfig.name}\`\n` +
                        `Tank: \`${botConfig.tankMode === 'preset' ? botConfig.activePreset : botConfig.tank}\`\n` +
                        `Stats: \`[${botConfig.stats.join(', ')}]\`\n` +
                        `AutoFire: \`${botConfig.autoFire ? 'ON' : 'OFF'}\`\n` +
                        `Delay: \`${botConfig.launchDelay}ms\``
                }
            );
        message.reply({ embeds: [embed] });
    }

    // ===== !config =====
    else if (command === 'config') {
        try {
            const raw = JSON.stringify(botConfig, null, 2);
            message.reply({ embeds: [createEmbed('⚙️ System Configuration', `Current \`bot_config.json\` data:\n\`\`\`json\n${raw}\n\`\`\``)] });
        } catch (e) {
            message.reply({ embeds: [createEmbed('❌ Error', 'Failed to parse configuration.', 0xff4444)] });
        }
    }

    // ===== !advanced =====
    else if (command === 'advanced') {
        const embed = createEmbed('Advanced Control', 'Technical settings for power users:')
            .addFields(
                {
                    name: 'System', value:
                        `**${PREFIX}config** — View raw config\n` +
                        `**${PREFIX}proxyinfo** — Show proxy stats\n` +
                        `**${PREFIX}resetproxies** — Clear proxy cache`
                },
                {
                    name: 'Parameters', value:
                        `**${PREFIX}setdelay** — Bot spawn spacing\n` +
                        `**${PREFIX}setmode** — Single/Preset/Multi\n` +
                        `**${PREFIX}chat** — Setup spam loop`
                }
            );
        message.reply({ embeds: [embed] });
    }

    // ===== ?nodes [add|remove|list] =====
    else if (command === 'nodes') {
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'add') {
            // ?nodes add <codespace-name> [account-alias]
            const name = args[1];
            const account = args[2] || null; // optional account alias
            if (!name) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}nodes add <codespace-name> [account-alias]\`\n\nAccount alias links to \`GITHUB_TOKEN_<ALIAS>\` in .env`, 0xff4444)] });
            if (nodeConfig.satellites.find(s => s.name === name))
                return message.reply({ embeds: [createEmbed('⚠️ Already Added', `\`${name}\` is already in your satellite list.`, 0xffaa00)] });
            nodeConfig.satellites.push({ name, maxBots: 30, account });
            saveNodeConfig();
            const acctInfo = account ? `\nAccount: \`${account}\` → uses \`GITHUB_TOKEN_${account.toUpperCase()}\`` : '\nNo account set → uses \`GITHUB_TOKEN\`';
            return message.reply({ embeds: [createEmbed('✅ Satellite Added', `\`${name}\` registered.${acctInfo}\n\nUse \`${PREFIX}wake ${name}\` to start it.`)] });
        }

        if (sub === 'remove') {
            const name = args[1];
            const before = nodeConfig.satellites.length;
            nodeConfig.satellites = nodeConfig.satellites.filter(s => s.name !== name);
            saveNodeConfig();
            return message.reply({ embeds: [createEmbed(before !== nodeConfig.satellites.length ? '✅ Removed' : '❌ Not Found', `\`${name}\``)] });
        }

        // ?nodes setaccount <codespace-name> <account-alias>
        if (sub === 'setaccount') {
            const name = args[1];
            const account = args[2];
            if (!name || !account) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}nodes setaccount <codespace-name> <account-alias>\``, 0xff4444)] });
            const sat = nodeConfig.satellites.find(s => s.name === name);
            if (!sat) return message.reply({ embeds: [createEmbed('❌ Not Found', `\`${name}\` is not in your satellite list.`, 0xff4444)] });
            sat.account = account;
            saveNodeConfig();
            const envKey = `GITHUB_TOKEN_${account.toUpperCase()}`;
            const tokenSet = !!process.env[envKey];
            return message.reply({ embeds: [createEmbed('✅ Account Linked', `\`${name}\` → account \`${account}\`\nToken key: \`${envKey}\` ${tokenSet ? '✅ Found in .env' : '⚠️ NOT found in .env — add it!'}`)] });
        }

        // ?nodes accounts — list all configured account aliases and their token status
        if (sub === 'accounts') {
            const aliases = new Set();
            nodeConfig.satellites.forEach(s => { if (s.account) aliases.add(s.account); });

            let desc = '**Configured account aliases:**\n';
            if (aliases.size === 0) {
                desc += '*None. All satellites use the default `GITHUB_TOKEN`.*';
            } else {
                aliases.forEach(alias => {
                    const envKey = `GITHUB_TOKEN_${alias.toUpperCase()}`;
                    const set = !!process.env[envKey];
                    desc += `• \`${alias}\` → \`${envKey}\` ${set ? '✅' : '❌ NOT SET'}\n`;
                });
            }
            const defaultSet = !!process.env.GITHUB_TOKEN;
            desc += `\n**Fallback:** \`GITHUB_TOKEN\` ${defaultSet ? '✅ Set' : '❌ Not set'}`;
            return message.reply({ embeds: [createEmbed('🔑 Account Tokens', desc)] });
        }

        // Default: show status
        const onlineMap = new Map(nodes);
        let desc = `**🖥️ Master** (local): \`${workers.length} bots\`\n`;
        desc += `**Master URL:** \`${MASTER_PUBLIC_URL}\`\n\n`;

        if (nodeConfig.satellites.length === 0) {
            desc += '*No satellites configured.\nUse `?nodes add <codespace-name>` to register one.*';
        } else {
            desc += '**Satellites:**\n';
            nodeConfig.satellites.forEach(sat => {
                const online = onlineMap.has(sat.name);
                const nd = online ? onlineMap.get(sat.name) : null;
                const status = online ? `🟢 Online — ${nd.activeBots}/${nd.maxBots} bots` : '🔴 Offline';
                const acct = sat.account ? ` \`[${sat.account}]\`` : '';
                desc += `• \`${sat.name}\`${acct} — ${status}\n`;
            });
        }

        const totalBots = workers.length + Array.from(nodes.values()).reduce((s, n) => s + n.activeBots, 0);
        desc += `\n**Total fleet:** \`${totalBots} bots\` across \`${nodes.size + 1}\` node(s)`;
        return message.reply({ embeds: [createEmbed('📡 Node Status', desc)] });
    }

    // ===== ?wake [name|all] =====
    else if (command === 'wake') {
        const target = args[0];
        if (!target) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}wake <codespace-name|all>\``, 0xff4444)] });

        const toWake = target === 'all'
            ? nodeConfig.satellites
            : [nodeConfig.satellites.find(s => s.name === target) || { name: target, account: null }];

        if (toWake.length === 0) return message.reply({ embeds: [createEmbed('⚠️ No Satellites', 'No satellites configured. Use `?nodes add <name>` first.', 0xffaa00)] });

        await message.reply({ embeds: [createEmbed('⏳ Waking Nodes', `Sending wake signal to **${toWake.length}** node(s)...`)] });

        for (const sat of toWake) {
            try {
                await wakeCodespace(sat.name);
                const acct = sat.account ? ` (account: \`${sat.account}\`)` : '';
                message.channel.send({ embeds: [createEmbed('✅ Waking Up', `\`${sat.name}\`${acct} is starting. Auto-connects in ~30s.`)] });
            } catch (e) {
                message.channel.send({ embeds: [createEmbed('❌ Wake Failed', `\`${sat.name}\`: ${e.message}`, 0xff4444)] });
            }
        }
    }

    // ===== ?sleep [name|all] =====
    else if (command === 'sleep') {
        const target = args[0];
        if (!target) return message.reply({ embeds: [createEmbed('❌ Usage', `\`${PREFIX}sleep <codespace-name|all>\``, 0xff4444)] });

        const toSleep = target === 'all'
            ? nodeConfig.satellites
            : [nodeConfig.satellites.find(s => s.name === target) || { name: target, account: null }];

        for (const sat of toSleep) {
            // Kill its bots first
            const node = nodes.get(sat.name);
            if (node && node.ws.readyState === 1) {
                try { node.ws.send(msgpack.encode([23])); } catch (e) { }
            }
            try {
                await sleepCodespace(sat.name);
                message.channel.send({ embeds: [createEmbed('😴 Stopped', `\`${sat.name}\` has been suspended.`)] });
            } catch (e) {
                message.channel.send({ embeds: [createEmbed('❌ Sleep Failed', `\`${sat.name}\`: ${e.message}`, 0xff4444)] });
            }
        }
    }

    // ===== !help =====
    else if (command === 'help') {
        const embed = createEmbed('Available Commands', 'Efficient bot management for Arras.io')
            .addFields(
                {
                    name: 'Basic', value:
                        `**${PREFIX}spawn** — Deploy bot swarm\n` +
                        `**${PREFIX}spawn2** — Deploy pattern bots\n` +
                        `**${PREFIX}codes** — Get server hashes\n` +
                        `**${PREFIX}kill** — Recall all bots\n` +
                        `**${PREFIX}status** — View current stats\n` +
                        `**${PREFIX}help** — Show this menu`
                },
                {
                    name: 'Settings', value:
                        `**${PREFIX}setup** — Configure log channel\n` +
                        `**${PREFIX}advanced** — Technical settings`
                }
            );
        message.reply({ embeds: [embed] });
    }
});

// ===== START DISCORD BOT =====
if (!process.env.DISCORD_TOKEN) {
    console.warn('[DISCORD] WARNING: DISCORD_TOKEN is not set in .env file.');
    console.warn('[DISCORD] The follow server and keep-alive are running, but Discord bot will not connect.');
} else {
    client.login(process.env.DISCORD_TOKEN);
}

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT]', err);
});

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Cleaning up...');
    disconnectBots();
    process.exit();
});
