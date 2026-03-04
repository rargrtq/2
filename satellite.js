/**
 * satellite.js — Satellite Node Runner
 *
 * Run this on each secondary Codespace. It connects to the master's
 * follow server, announces itself as a node, and receives spawn/kill
 * commands from the master's Discord bot.
 *
 * Required env vars (set as Codespace secrets on each satellite):
 *   MASTER_URL       — e.g. wss://username-reponame-abc123-3000.preview.app.github.dev
 *   MAX_BOTS         — max bots this node can handle (default: 30)
 *   CODESPACE_NAME   — set automatically by GitHub Codespaces
 *
 * The headless workers spawned here connect directly to the master
 * follow server via FOLLOW_SERVER_URL, so leader position data flows
 * without any relay overhead.
 */

require('dotenv').config();
const { fork } = require('child_process');
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');
const path = require('path');
const fs = require('fs');

const MASTER_URL = process.env.MASTER_URL;
const NODE_ID = process.env.CODESPACE_NAME || `satellite-${Date.now().toString(36)}`;
const MAX_BOTS = parseInt(process.env.MAX_BOTS) || 999;

if (!MASTER_URL) {
    console.error('[SATELLITE] ❌ MASTER_URL is not set. Add it as a Codespace secret.');
    console.error('[SATELLITE]    Format: wss://<master-codespace-name>-3000.app.github.dev');
    process.exit(1);
}

console.log(`[SATELLITE] ═══════════════════════════════════════`);
console.log(`[SATELLITE] Node ID  : ${NODE_ID}`);
console.log(`[SATELLITE] Master   : ${MASTER_URL}`);
console.log(`[SATELLITE] Max bots : ${MAX_BOTS}`);
console.log(`[SATELLITE] ═══════════════════════════════════════`);

// ── Shared Utilities ─────────────────────────────────────────────────────────
const { tree, getPath, indicesToKeys, convertStats } = require('./shared');

// ── State ─────────────────────────────────────────────────────────────────────
let workers = [];
let masterSocket = null;
let proxies = {};

// ── Proxy Handling (Satellite side) ───────────────────────────────────────────
function loadProxies() {
    try {
        const filePath = path.join(__dirname, 'proxies.txt');
        if (!fs.existsSync(filePath)) return;
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n').filter(l => l.trim().length > 0);
        let allFound = 0;
        for (const line of lines) {
            allFound++;
            const raw = line.trim();
            let proxyUrl = '', type = 'http';
            const protocolMatch = raw.match(/^(socks[45h]*|https?):\/\//i);
            const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : 'http';
            const cleanRaw = protocolMatch ? raw.substring(protocolMatch[0].length) : raw;
            const parts = cleanRaw.split(':');

            if (parts.length === 4) {
                const [host, port, user, pass] = parts;
                proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;
                type = protocol.startsWith('socks') ? 'socks' : 'http';
            } else if (parts.length === 2) {
                const [host, port] = parts;
                proxyUrl = `${protocol}://${host}:${port}`;
                type = protocol.startsWith('socks') ? 'socks' : 'http';
            }
            if (proxyUrl) proxies[proxyUrl] = type;
        }
        console.log(`[SATELLITE] Loaded ${allFound} proxies.`);
    } catch (e) {
        console.log('[SATELLITE] Error loading proxies.txt:', e.message);
    }
}

function getFreshProxy() {
    const keys = Object.keys(proxies);
    if (keys.length === 0) return null;
    const url = keys[0];
    const type = proxies[url];
    if (keys.length > 1) {
        delete proxies[url];
    }
    return { url, type };
}

loadProxies();

// ── Bot Spawning ──────────────────────────────────────────────────────────────
function launchBots(count, spawnConfig) {
    const followUrl = spawnConfig.followServerUrl;
    const launchDelay = spawnConfig.launchDelay || 2000;
    const botIdBase = Date.now() % 100000;
    const launchQueue = [];

    // Build launch queue from spawnConfig (mirrors index.js logic)
    if (spawnConfig.tankMode === 'preset' && Array.isArray(spawnConfig.preset)) {
        const preset = spawnConfig.preset;
        for (let i = 0; i < count; i++) {
            const entry = preset[i % preset.length];
            launchQueue.push({
                tank: entry.tanks ? indicesToKeys(entry.tanks) : spawnConfig.tank,
                stats: entry.stats ? convertStats(entry.stats) : (spawnConfig.stats || [2, 2, 2, 6, 6, 8, 8, 8, 0]),
                keys: [],
                autospin: entry.autospin || false,
                growth_order: entry.growth_extended_upgrades_order_to_max || [],
                angle_offset: entry.pathfinding_facing_angle_offset || 0
            });
        }
    } else {
        for (let i = 0; i < count; i++) {
            launchQueue.push({
                tank: spawnConfig.tank,
                stats: spawnConfig.stats,
                keys: spawnConfig.keys || [],
                autospin: spawnConfig.autospin || false,
                growth_order: [],
                angle_offset: 0
            });
        }
    }

    function launchBotInstance(botSpec, i, botIdBase) {
        const nextProxy = getFreshProxy();

        let tankVal = botSpec.tank;
        if (/^[\d\s]+$/.test(tankVal)) {
            tankVal = indicesToKeys(tankVal);
        } else if (!tankVal.startsWith('Key')) {
            // Only try to resolve path if it's not a direct key code
            tankVal = getPath(tankVal, tree) || tankVal;
        }

        const config = {
            id: botIdBase + i,
            proxy: nextProxy ? { type: nextProxy.type, url: nextProxy.url } : false,
            hash: '#' + (spawnConfig.squadId || 'epb'),
            name: spawnConfig.name || '[SAT]',
            stats: botSpec.stats,
            type: spawnConfig.type || 'follow',
            token: 'follow-3c8f2e',
            autoFire: spawnConfig.autoFire || false,
            autoRespawn: spawnConfig.autoRespawn !== false,
            target: spawnConfig.target || 'player',
            aim: spawnConfig.aim || 'drone',
            keys: [...(botSpec.keys || [])],
            joinSequence: spawnConfig.joinSequence || [],
            tank: tankVal,
            chatSpam: spawnConfig.chatSpam || '',
            squadId: spawnConfig.squadId || 'epb',
            loadFromCache: true,
            cache: false,
            arrasCache: path.join(__dirname, 'ah.txt'),
            autospin: botSpec.autospin,
            growth_order: botSpec.growth_order,
            angle_offset: botSpec.angle_offset,
            pathfinding: spawnConfig.pathfinding || false
        };

        const workerProcess = fork(path.join(__dirname, 'headless.js'), [], {
            env: {
                ...process.env,
                IS_WORKER: 'true',
                FOLLOW_SERVER_URL: followUrl
            },
            execArgv: ['--max-old-space-size=128'],
            silent: false
        });

        const entry = { process: workerProcess, id: config.id };
        workers.push(entry);

        workerProcess.on('message', (msg) => {
            if (msg.type === 'blacklisted' || msg.type === 'proxy_failed') {
                const reason = msg.type === 'blacklisted' ? `Blacklisted: ${msg.reason || 'Unknown'}` : 'Connection Failed/Timeout';
                console.log(`[SAT-BOT ${config.id}] Proxy issue! (${reason}). Rotating...`);
                workerProcess.kill();
                setTimeout(() => {
                    workers = workers.filter(w => w !== entry);
                    launchBotInstance(botSpec, i, botIdBase);
                }, 2000);
            }
        });

        workerProcess.on('exit', () => {
            workers = workers.filter(w => w !== entry);
            sendStatus();
        });

        workerProcess.send({ type: 'start', config });
        console.log(`[SATELLITE] Bot #${config.id} launched (${config.tank}). Total: ${workers.length}`);
        sendStatus();
    }

    launchQueue.forEach((botSpec, i) => {
        setTimeout(() => launchBotInstance(botSpec, i, botIdBase), launchDelay * i);
    });

    console.log(`[SATELLITE] Queued ${count} bot(s) with ${launchDelay}ms delay each.`);
}

function killAll() {
    const count = workers.length;
    console.log(`[SATELLITE] Killing all ${count} bots...`);
    workers.forEach(w => { try { w.process.kill(); } catch (e) { } });
    workers = [];
    sendStatus();
    console.log(`[SATELLITE] All bots killed.`);
}

// ── Master Communication ──────────────────────────────────────────────────────
function sendStatus() {
    if (masterSocket && masterSocket.readyState === 1) {
        masterSocket.send(msgpack.encode([22, NODE_ID, workers.length, MAX_BOTS]));
    }
}

function connectToMaster() {
    console.log(`[SATELLITE] Connecting to master...`);
    masterSocket = new WebSocket(MASTER_URL, { rejectUnauthorized: false });

    masterSocket.on('open', () => {
        console.log(`[SATELLITE] ✅ Connected to master!`);
        // Announce: [20, nodeId, maxBots]
        masterSocket.send(msgpack.encode([20, NODE_ID, MAX_BOTS]));
        sendStatus();
    });

    masterSocket.on('message', (data) => {
        try {
            const msg = msgpack.decode(data);
            const type = msg[0];

            switch (type) {
                case 21: {
                    // Spawn command: [21, count, spawnConfig]
                    const count = msg[1];
                    const spawnConfig = msg[2];
                    console.log(`[SATELLITE] 📥 Spawn command received: ${count} bot(s)`);
                    launchBots(count, spawnConfig);
                    break;
                }
                case 23: {
                    // Kill all bots
                    console.log(`[SATELLITE] 📥 Kill command received`);
                    killAll();
                    break;
                }
                case 24: {
                    // Status request
                    sendStatus();
                    break;
                }
                case 25: {
                    // Config update (for future use)
                    console.log(`[SATELLITE] 📥 Config update received`);
                    break;
                }
            }
        } catch (e) {
            console.error('[SATELLITE] Message parse error:', e.message);
        }
    });

    masterSocket.on('close', () => {
        console.log('[SATELLITE] ⚠️ Disconnected from master. Reconnecting in 5s...');
        setTimeout(connectToMaster, 5000);
    });

    masterSocket.on('error', (e) => {
        console.error('[SATELLITE] Connection error:', e.message);
    });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
setInterval(sendStatus, 15000);

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => { killAll(); process.exit(0); });
process.on('SIGINT', () => { killAll(); process.exit(0); });
process.on('uncaughtException', (e) => console.error('[SATELLITE] Uncaught:', e.message));
process.on('unhandledRejection', (e) => console.error('[SATELLITE] Rejection:', e));

// ── Start ─────────────────────────────────────────────────────────────────────
connectToMaster();
