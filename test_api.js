const fetch = require('node-fetch');

const API_KEY = "NV1lc5MgqpYyhS4ml8WmXiZAHzNr0smrhW5SoFBW";
const PLAN_ID = "69a104f811198d25f7f520e3";

async function testApi() {
    console.log("Testing LightningProxies V1 Public API...");
    // Trying to find a sibling info/usage endpoint for the public API
    const urls = [
        `https://app.lightningproxies.net/api/v1/public/info/${API_KEY}/${PLAN_ID}`,
        `https://app.lightningproxies.net/api/v1/public/usage/${API_KEY}/${PLAN_ID}`,
        `https://app.lightningproxies.net/api/v1/public/plan/${API_KEY}/${PLAN_ID}`,
        `https://app.lightningproxies.net/api/v1/public/status/${API_KEY}/${PLAN_ID}`
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            console.log(`[${res.status}] ${url} =>`, JSON.stringify(data).slice(0, 200));
        } catch (e) {
            // Error usually means not JSON or 404
        }
    }
}

testApi();
