// ==UserScript==
// @name         Follow Me arras.io (Server Name as Squad ID)
// @namespace    http://tampermonkey.net/
// @version      1.0.7_precision_fix
// @description  Leader script. Uses a manual input for Squad ID. Press ESC to toggle GUI.
// @author       Damocles, CX & You
// @match        https://arras.io/
// @match        http://arras.io/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=arras.io
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    const LOG_PREFIX = '[FollowMe_ServerNameSquad]';
    const FOLLOW_SERVER_TOKEN = 'follow-3c8f2e';
    const FOLLOW_SERVER_WS_URL = "wss://scaling-spork-jjqgrjxv67wr2j77x-3000.app.github.dev";

    let uiPanel, uiCheckboxFollow, uiCheckboxAction, uiCheckboxPause,
        uiSpawnStatus, uiCoordsStatus, uiFollowWsStatus, uiGdStatus,
        uiSquadNameInput;

    let position = [0, 0, 0];
    let hasSpawned = false;
    let followSocket = null;
    let followSocketConnected = false;
    let mouseGameCoords = [0, 0];
    let mouseScreenDelta = [0, 0];
    let gd = 0;
    let activeFollowName = null;
    let isBroadcastingPaused = false;
    let isGuiVisible = true;

    function createUIPanel() {
        if (document.getElementById('followme-sns-panel')) return;
        uiPanel = document.createElement('div');
        uiPanel.id = 'followme-sns-panel';
        Object.assign(uiPanel.style, {
            position: 'fixed', top: '10px', right: '10px', width: '240px',
            background: 'rgba(0, 0, 0, 0.8)', color: 'white', fontFamily: 'Arial, sans-serif',
            fontSize: '12px', padding: '10px', borderRadius: '5px', border: '1px solid #444',
            zIndex: '10001', userSelect: 'none'
        });
        uiPanel.innerHTML = `
            <h3 style="margin-top:0; margin-bottom:8px; text-align:center; font-size:14px;">FollowMe Control</h3>
            <div style="margin-bottom:5px;">
                <label for="fm-sns-squad-name" style="display:block; margin-bottom:3px;">Broadcasting As (Squad ID):</label>
                <input type="text" id="fm-sns-squad-name" placeholder="Enter Squad ID here" style="width: 95%; background: #333; color: white; border: 1px solid #555; padding: 3px;">
            </div>
            <div style="margin-bottom:5px;">
                <input type="checkbox" id="fm-sns-chkbx-follow" style="vertical-align:middle; accent-color:rgb(255,155,0);">
                <label for="fm-sns-chkbx-follow" style="vertical-align:middle;">Enable Follow (F)</label>
            </div>
            <div style="margin-bottom:5px;">
                <input type="checkbox" id="fm-sns-chkbx-pause" style="vertical-align:middle; accent-color:rgb(0,155,255);">
                <label for="fm-sns-chkbx-pause" style="vertical-align:middle;">Pause Broadcast (P)</label>
            </div>
            <div style="margin-bottom:8px;">
                <input type="checkbox" id="fm-sns-chkbx-action" style="vertical-align:middle; accent-color:rgb(255,155,0);">
                <label for="fm-sns-chkbx-action" style="vertical-align:middle;">Alt Action (RMB)</label>
            </div>
            <p id="fm-sns-spawn-status" style="margin:3px 0;">Spawned: NO</p>
            <p id="fm-sns-coords-status" style="margin:3px 0;">Coords: Waiting...</p>
            <p id="fm-sns-follow-ws-status" style="margin:3px 0;">Follow WS: Disconnected</p>
            <p id="fm-sns-gd-status" style="margin:3px 0;">GD Scale: Calculating...</p>
        `;
        document.body.appendChild(uiPanel);

        uiSquadNameInput = document.getElementById('fm-sns-squad-name');
        uiCheckboxFollow = document.getElementById('fm-sns-chkbx-follow');
        uiCheckboxPause = document.getElementById('fm-sns-chkbx-pause');
        uiCheckboxAction = document.getElementById('fm-sns-chkbx-action');
        uiSpawnStatus = document.getElementById('fm-sns-spawn-status');
        uiCoordsStatus = document.getElementById('fm-sns-coords-status');
        uiFollowWsStatus = document.getElementById('fm-sns-follow-ws-status');
        uiGdStatus = document.getElementById('fm-sns-gd-status');

        uiCheckboxFollow.addEventListener('input', () => {
            if (uiCheckboxFollow.checked) connectToFollowServer();
            else if (followSocketConnected) sendToFollowServer([3, activeFollowName]);
        });

        window.addEventListener('keydown', (e) => {
            if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Escape') { isGuiVisible = !isGuiVisible; uiPanel.style.display = isGuiVisible ? 'block' : 'none'; }
            if (e.code === 'KeyF') { uiCheckboxFollow.checked = !uiCheckboxFollow.checked; uiCheckboxFollow.dispatchEvent(new Event('input')); }
        });
        window.addEventListener('mousedown', (e) => { if (e.button === 2) uiCheckboxAction.checked = true; });
        window.addEventListener('mouseup', (e) => { if (e.button === 2) uiCheckboxAction.checked = false; });
        window.addEventListener('mousemove', (e) => {
            mouseScreenDelta[0] = (e.clientX - window.innerWidth * 0.5);
            mouseScreenDelta[1] = (e.clientY - window.innerHeight * 0.5);
        }, true);
    }

    // Coord & Spawn Sniffer
    try {
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = new Proxy(originalFillText, {
            apply: (target, thisArg, args) => {
                const text = args[0];
                if (typeof text === 'string') {
                    if (text.includes('Welcome') || text.includes('You have spawned')) {
                        hasSpawned = true;
                        updateUIField(uiSpawnStatus, 'Spawned: YES', 'lime');
                    } else if (text.startsWith('Coordinates: (')) {
                        const m = text.match(/\(([^,]+),\s*([^)]+)\)/);
                        if (m) {
                            position[0] = parseFloat(m[1]);
                            position[1] = parseFloat(m[2]);
                            hasSpawned = true; // Failsafe
                            updateUIField(uiSpawnStatus, 'Spawned: YES', 'lime');
                            updateUIField(uiCoordsStatus, `Coords: (${position[0].toFixed(1)}, ${position[1].toFixed(1)})`);
                        }
                    }
                }
                return Reflect.apply(target, thisArg, args);
            }
        });
    } catch (e) { }

    // GD Math
    let st = 0, lx = 0, ca = {}, sr = 1, gdSamples = [];
    try {
        const originalRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = new Proxy(originalRAF, {
            apply: (t, ta, a) => {
                st = 20; if (ca.width) sr = ca.width / window.innerWidth;
                return Reflect.apply(t, ta, a);
            }
        });
        const originalMoveTo = CanvasRenderingContext2D.prototype.moveTo;
        CanvasRenderingContext2D.prototype.moveTo = new Proxy(originalMoveTo, {
            apply: (t, ta, a) => {
                ca = ta.canvas;
                if (st > 0) {
                    st--; let diff = Math.abs(a[0] - lx);
                    if (lx !== 0 && diff > 5 && diff < 500) {
                        gdSamples.push(sr / diff);
                        if (gdSamples.length > 50) gdSamples.shift();
                        gd = gdSamples.reduce((a, b) => a + b, 0) / gdSamples.length;
                        if (uiGdStatus) updateUIField(uiGdStatus, `GD Scale: ${gd.toFixed(4)}`, 'lime');
                    }
                    lx = a[0];
                }
                return Reflect.apply(t, ta, a);
            }
        });
    } catch (e) { }

    function updateUIField(e, t, c = 'lime') { if (e) { e.textContent = t; e.style.color = c; } }

    function connectToFollowServer() {
        if (followSocket) return;
        followSocket = new WebSocket(FOLLOW_SERVER_WS_URL);
        followSocket.binaryType = 'arraybuffer';
        followSocket.onopen = () => {
            followSocketConnected = true; updateUIField(uiFollowWsStatus, 'Follow WS: Connected');
            sendToFollowServer([0, FOLLOW_SERVER_TOKEN, 2]);
        };
        followSocket.onclose = () => {
            followSocketConnected = false; followSocket = null;
            updateUIField(uiFollowWsStatus, 'Follow WS: Disconnected', 'red');
            if (uiCheckboxFollow.checked) setTimeout(connectToFollowServer, 2000);
        };
    }

    function sendToFollowServer(p) { if (followSocketConnected && window.msgpack) followSocket.send(window.msgpack.encode(p)); }

    const msgpackScript = document.createElement('script');
    msgpackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js';
    document.head.appendChild(msgpackScript);

    setInterval(() => {
        if (!uiPanel) createUIPanel();
        if (!uiCheckboxFollow.checked || uiCheckboxPause.checked || !hasSpawned || !followSocketConnected) return;

        activeFollowName = uiSquadNameInput.value.trim();
        if (!activeFollowName) return;

        // Perfect aim calculation every tick
        mouseGameCoords[0] = Math.round((position[0] + mouseScreenDelta[0] * gd) * 10);
        mouseGameCoords[1] = Math.round((position[1] + mouseScreenDelta[1] * gd) * 10);

        sendToFollowServer([1, Math.round(position[0] * 10), Math.round(position[1] * 10), activeFollowName, mouseGameCoords[0], mouseGameCoords[1], uiCheckboxAction.checked]);
    }, 45);
})();