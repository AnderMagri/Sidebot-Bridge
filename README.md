# Sidebot Bridge Server

**Seamless connection between Figma Plugin ↔ Claude Desktop**

No more copy/paste! Real-time communication via localhost bridge.

---

## Download & Run (Recommended)

> No Node.js required. Just download and double-click.

Go to the [Releases page](https://github.com/AnderMagri/Sidebot/releases) and download the file for your platform.

### Mac (all models — M1/M2/M3/M4 and Intel)

1. Download `SidebotBridge-mac.zip`
2. Double-click the zip to extract — you get `SidebotBridge.app`
3. Put `SidebotBridge.app` anywhere — Desktop works great
4. Double-click `SidebotBridge.app`
5. **First time only:** macOS shows a security warning → click **"Done"**
6. **First time only:** Allow the app using one of these two ways:
   - **Option A:** Right-click `SidebotBridge.app` → **"Open"** → **"Open"** in the dialog
   - **Option B:** Go to **System Settings → Privacy & Security** → scroll down → click **"Open Anyway"**
7. Terminal opens and the bridge starts ✅

> After the first time, just double-click to launch — no warnings.

### Windows

1. Download `sidebot-bridge-win-x64.exe`
2. Put it anywhere — Desktop is fine
3. Double-click the `.exe`
4. **First time only:** Windows SmartScreen warning → click **"More info"** then **"Run anyway"**
5. Command Prompt opens and the bridge starts ✅

### Stop the Bridge

Close the Terminal / Command Prompt window. That's it.

---

## Developer Setup (Node.js required)

If you want to run from source or contribute:

```bash
# Install dependencies
npm install

# Start bridge
npm start

# Development mode (auto-reload)
npm run dev
```

### Build standalone binaries locally

```bash
# Install pkg
npm install

# Build for your current platform
npm run build:mac-arm64   # Apple Silicon Mac
npm run build:mac-x64     # Intel Mac
npm run build:win         # Windows

# Build all platforms at once
npm run build
```

Binaries appear in `bridge/dist/`.

---

## Architecture

```
+----------------+         +----------------+         +-----------------+
| Figma Plugin   |<------->| Bridge Server  |<------->| Claude Desktop  |
|                | WebSocket| localhost      |   HTTP  | (Chat Interface)|
|  - Sends data  |         | - Port 3000    |         | - Analyzes data |
|  - Gets fixes  |         | - Port 3001    |         | - Sends commands|
+----------------+         +----------------+         +-----------------+
```

### Endpoints (for Claude)

**HTTP on port 3000:**
- `GET /health` — Server status
- `GET /state` — Current plugin state
- `GET /design-data` — Latest design data from plugin
- `POST /add-goals` — Send goals to plugin
- `POST /add-fixes` — Send fixes to plugin

**WebSocket on port 3001:**
- `ws://localhost:3001` — Real-time plugin connection

---

## Troubleshooting

### Bridge won't start — "port already in use"

Another instance may be running. Close it and try again, or restart your computer.

### Mac: "cannot be opened because it is from an unidentified developer"

Right-click `SidebotBridge.app` → **Open** → **Open** again in the dialog. This only happens the first time.

### Windows: SmartScreen blocks the .exe

Click **"More info"** → **"Run anyway"**. This only happens the first time.

### Plugin LED stays red after bridge starts

1. Restart the Sidebot plugin in Figma (close and reopen it)
2. Hit ↻ Refresh in the Settings tab
3. Check the bridge terminal shows no errors

### Check bridge is running

```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok","pluginConnected":true,...}`

---

## Security

- Bridge only listens on **localhost** — no external access
- All data stays on your machine
- No external network calls
- Safe for sensitive projects ✅

---

## What's Included

```
bridge/
├── bridge-server.js              # Main server (Node.js source)
├── package.json                  # Dependencies + build config
├── sidebot-bridge-mac.command    # Mac double-click launcher
├── start.sh                      # Mac/Linux developer launcher
├── start.bat                     # Windows developer launcher
└── README.md                     # This file
```

Release assets (built by CI, not committed to git):
```
SidebotBridge-mac.zip             # Mac app (works on all Macs — M1/M2/M3/M4 and Intel)
sidebot-bridge-win-x64.exe        # Windows standalone
```

---

**Built with love for seamless AI-powered design workflows**
