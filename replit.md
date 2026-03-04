# Discord Bot - Arras.io Bot Controller

## Overview
A Discord bot that spawns and controls headless Arras.io game bots via Discord commands. Uses discord.js for Discord integration and a custom headless browser-like environment to run the game client in Node.js.

## Project Structure
- `index.js` - Main entry point: Discord bot setup, command handling, and keep-alive HTTP server on port 5000
- `headless_client.js` - Headless Arras.io game client that mocks browser APIs to run the game in Node.js
- `proxies.txt` - Proxy list for bot connections (format: host:port:user:pass)
- `package.json` - Node.js dependencies

## Key Dependencies
- `discord.js` - Discord API client
- `dotenv` - Environment variable management
- `ws` - WebSocket client for game connections
- `msgpackr` - MessagePack serialization
- `node-fetch` - HTTP requests
- `https-proxy-agent` / `socks-proxy-agent` - Proxy support

## Environment Variables
- `DISCORD_TOKEN` (secret) - Discord bot token, required for bot to connect to Discord

## Commands
- `!spawn [count] [hash] [name]` - Connect bots to a game
- `!chat [message]` - Send chat from all bots
- `!split` - Split all bots
- `!feed` - Toggle feed/R key
- `!spin` - Toggle auto-spin
- `!autofire` - Toggle auto-fire
- `!status` - Check bot count
- `!kill` - Disconnect all bots

## Running
The bot runs via `node index.js` and listens on port 5000 for keep-alive checks.
