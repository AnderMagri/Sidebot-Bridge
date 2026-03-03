#!/usr/bin/env node

/**
 * SIDEBOT BRIDGE SERVER
 * Connects Figma Plugin <-> Anthropic API (Claude)
 * Run: node bridge-server.js
 */

const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const os = require('os');
const fs = require('fs');
const path = require('path');

const WS_PORT = 3001;

// ─── CONFIG / API KEY PERSISTENCE ───
const CONFIG_DIR  = path.join(os.homedir(), '.sidebot');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

let anthropicApiKey = null;
let anthropic       = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.apiKey && config.apiKey.startsWith('sk-ant-')) {
        anthropicApiKey = config.apiKey;
        anthropic = new Anthropic({ apiKey: anthropicApiKey });
        console.log('[KEY] Loaded saved Anthropic API key');
      } else if (config.apiKey) {
        console.log('[KEY] Ignoring saved key — not a valid Anthropic key (sk-ant-...)');
      }
    }
  } catch (e) {
    // ignore — first run
  }
}

function saveConfig(key) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey: key }));
  } catch (e) {
    console.error('[KEY] Failed to save config:', e.message);
  }
}

loadConfig();

// ─── CRASH HANDLER (keeps window open on Windows so user can read the error) ───
process.on('uncaughtException', (err) => {
  console.error('');
  console.error('[ERR] FATAL ERROR: ' + err.message);
  console.error('');
  if (process.platform === 'win32') {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Press Enter to exit...', () => process.exit(1));
  } else {
    process.exit(1);
  }
});

// ─── STATE ───
let pluginSocket = null;
let pluginData = {
  connected: false,
  projects: [],
  activeProject: null,
  lastDesignData: null
};

// ─── AI ANALYSIS PROMPTS ───
const PROMPTS = {
  grammar: `Analyze the Figma design data below for grammar, spelling, and punctuation errors in all text nodes (including nested ones).
Return ONLY a valid JSON array. Each item must have exactly these fields:
[{"nodeId": "...", "nodeName": "...", "current": "original text", "corrected": "corrected text", "description": "brief explanation"}]
If no issues found, return [].`,

  autolayout: `Analyze the Figma design data below for auto-layout, spacing, and padding inconsistencies.
Return ONLY a valid JSON array. Each item must have exactly these fields:
[{"nodeId": "...", "nodeName": "...", "issue": "problem description", "suggestion": "how to fix it"}]
If no issues found, return [].`,

  alignment: `Analyze the Figma design data below for alignment and positioning issues between elements.
Return ONLY a valid JSON array. Each item must have exactly these fields:
[{"nodeId": "...", "nodeName": "...", "issue": "alignment problem", "suggestion": "recommended fix"}]
If no issues found, return [].`,

  contrast: `Analyze the Figma design data below for color contrast and accessibility issues.
Return ONLY a valid JSON array. Each item must have exactly these fields:
[{"nodeId": "...", "nodeName": "...", "issue": "contrast problem", "suggestion": "recommended color fix"}]
If no issues found, return [].`,

  consistency: `Analyze the Figma design data below for visual consistency issues — elements that don't align to a shared grid, font styles inconsistent with the design system, spacing or colour values that vary unexpectedly across similar elements.
Return ONLY a valid JSON array. Each item must have exactly these fields:
[{"nodeId": "...", "nodeName": "...", "issue": "consistency problem", "suggestion": "recommended fix"}]
If no issues found, return [].`,

  'edge-cases': `You are reviewing a Figma screen design. List all edge cases a developer must handle for this screen.
Cover: empty states, loading states, error states, boundary/extreme inputs, long text overflow, offline/network errors, permission errors, and accessibility edge cases.
Return ONLY a JSON array of plain strings, one edge case per item (no nested objects):
["Edge case description 1", "Edge case description 2", ...]
Return between 5 and 15 items.`
};

// ─── AI ANALYSIS ───
async function analyzeDesignWithClaude(ws, designData, action) {
  const prompt = PROMPTS[action];
  if (!prompt) return;

  console.log(`[AI ] Analyzing "${action}" for: ${designData.projectName || 'unknown'}`);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nDesign data:\n${JSON.stringify(designData, null, 2)}`
      }]
    });

    const text = response.content[0].text.trim();
    // Extract JSON array (handles plain JSON and markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const fixes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const fixesWithAction = fixes.map(fix => ({ ...fix, action }));

    ws.send(JSON.stringify({
      type: 'add-fixes-from-claude',
      fixes: fixesWithAction,
      projectName: designData.projectName || ''
    }));

    console.log(`[AI ] Sent ${fixes.length} ${action} fix(es)`);

  } catch (err) {
    console.error('[AI ] Error:', err.message);
    ws.send(JSON.stringify({
      type: 'add-fixes-from-claude',
      fixes: [{
        action,
        nodeId: '',
        nodeName: 'Error',
        issue: `Analysis failed: ${err.message}`,
        description: 'Check your API key in the plugin Settings tab'
      }]
    }));
  }
}

// ─── AI EDGE CASES ───
async function analyzeEdgeCasesWithClaude(ws, designData) {
  const prompt = PROMPTS['edge-cases'];
  console.log(`[AI ] Analyzing edge cases for: ${designData.projectName || 'unknown'}`);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nDesign data:\n${JSON.stringify(designData, null, 2)}`
      }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const cases = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    ws.send(JSON.stringify({
      type: 'add-edge-cases-from-claude',
      cases: cases,
      frameName: designData.projectName || 'Screen'
    }));

    console.log(`[AI ] Sent ${cases.length} edge case(s)`);

  } catch (err) {
    console.error('[AI ] Error:', err.message);
    ws.send(JSON.stringify({
      type: 'add-edge-cases-from-claude',
      cases: [`Analysis failed: ${err.message}. Check your API key in the plugin Settings tab.`],
      frameName: 'Error'
    }));
  }
}

// ─── CHAT SYSTEM PROMPT ───
const CHAT_SYSTEM_PROMPT = `You are Sidebot, an AI assistant embedded directly inside a Figma plugin. You are NOT Claude Desktop — you are the Figma plugin's built-in AI. The user is talking to you from within the Figma plugin UI.

## What you can do

**Design analysis** — You receive a screenshot and/or structured data about the selected Figma frame (text nodes with IDs, colors, spacing, fonts).

**Direct actions in Figma:**
- Fix typos/grammar → "Fix in Figma ✦" button lets the user apply text changes directly on the canvas
- Add annotation callouts → "Annotate 📌" button creates a yellow ATTENTION frame on the canvas for contrast/consistency issues
- Add items to the Goals list → "Add to Goals 🎯" button saves a task to the user's active project

## Plugin features you know about
- **Projects** — user has projects, each with a Goals list and a Fixes log
- **Goals list** — checklist of design requirements the user tracks; you can add items here
- **Chat** — that's you, right here; you are the plugin's built-in AI
- **Settings** — API key configuration

## Response formats — ALWAYS use these for structured feedback

For **grammar/spelling** — return ONLY a JSON block (no plain-text description of errors):
\`\`\`json
[{"nodeId":"1:23","originalText":"exact text from node","correctedText":"corrected text","issue":"Typo: 'devlopment'","suggestion":"Change to 'development'"}]
\`\`\`
Use the exact characters string from the text node list provided for originalText. Copy it verbatim.

For **contrast** (WCAG AA: 4.5:1 normal text, 3:1 large text):
\`\`\`json
[{"category":"contrast","nodeId":"1:23","issue":"Text/bg ratio 2.1:1 (needs 4.5:1)","suggestion":"Darken text color to #333"}]
\`\`\`

For **consistency** (mismatched fonts, spacing, colors):
\`\`\`json
[{"category":"consistency","nodeId":"1:23","issue":"Font 12px here vs 14px elsewhere","suggestion":"Standardize to 14px"}]
\`\`\`

For **goals/tasks** — when the user asks to save something to their goals list:
\`\`\`json
[{"type":"goal","text":"Fix navigation bar spacing","category":"UX"}]
\`\`\`

For **edge cases / free chat** — respond conversationally, no JSON needed.

## Rules
- Always use JSON blocks for grammar, contrast, consistency — NEVER describe issues in plain prose when you have node data
- Use exact node IDs from the text node list provided with the design
- Use the exact characters string for originalText (copy it verbatim from the list)
- Keep conversational replies under 150 words
- You ARE the plugin. Never say "open the Figma plugin" or "use Claude Desktop" — you are already inside it`;

// ─── AI CHAT ───
async function chatWithClaude(ws, text, history, designData, screenshotBase64) {
  try {
    console.log(`[AI ] Chat message: "${(text || '').slice(0, 60)}" ${screenshotBase64 ? '(+screenshot)' : ''}`);
    const messages = [];
    history.slice(0, -1).forEach(m => messages.push({ role: m.role, content: m.content }));

    // Build user content — when screenshot present use image+text only (skip JSON dump,
    // the image already provides visual context and the dump can be huge)
    let userContent;
    if (screenshotBase64) {
      // Append compact text node list so Claude can reference nodeIds in fix JSON
      const textSummary = (designData && designData.textNodes && designData.textNodes.length)
        ? '\n\nText node IDs (use in fix JSON):\n' +
          designData.textNodes.map(n =>
            '  ' + n.id + ': "' + (n.characters || '').replace(/\n/g, '\\n') + '"'
          ).join('\n')
        : '';
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } },
        { type: 'text', text: text + textSummary }
      ];
    } else {
      const contextStr = designData
        ? `\n\nCurrent Figma selection:\n${JSON.stringify(designData, null, 2)}`
        : '\n\n(No frame selected — responding without design context)';
      userContent = text + contextStr;
    }
    messages.push({ role: 'user', content: userContent });
    console.log(`[AI ] Sending to Claude (messages: ${messages.length}, hasImage: ${!!screenshotBase64})`);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: CHAT_SYSTEM_PROMPT,
      messages
    });

    const responseText = response.content[0].text.trim();
    console.log(`[AI ] Raw response (first 200): ${responseText.slice(0, 200)}`);

    let fixes = [];
    let cleanText = responseText;

    // 1st try: fenced ```json [...] ``` block
    const fencedMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (fencedMatch) {
      try { fixes = JSON.parse(fencedMatch[1]); } catch(e) { console.warn('[AI ] JSON parse failed (fenced):', e.message); }
      cleanText = responseText.replace(/```(?:json)?[\s\S]*?```/g, '').trim();
    } else {
      // 2nd try: bare JSON array of objects anywhere in the response
      const bareMatch = responseText.match(/(\[\s*\{[\s\S]*?\}\s*\])/);
      if (bareMatch) {
        try {
          fixes = JSON.parse(bareMatch[1]);
          cleanText = responseText.replace(bareMatch[1], '').trim();
        } catch(e) { console.warn('[AI ] JSON parse failed (bare):', e.message); }
      }
    }

    console.log(`[AI ] Parsed ${fixes.length} fix(es) from response`);
    ws.send(JSON.stringify({ type: 'chat-response', text: cleanText, fixes }));
    console.log(`[AI ] Chat response sent (${response.usage.output_tokens} tokens)`);

  } catch (err) {
    console.error('[AI ] Chat error:', err.message);
    try {
      ws.send(JSON.stringify({ type: 'chat-response', text: `Error: ${err.message}`, fixes: [] }));
    } catch (sendErr) {
      console.error('[AI ] Could not send error to plugin:', sendErr.message);
    }
  }
}

// ─── WEBSOCKET SERVER (for Plugin connection) ───
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('[ERR] Port ' + WS_PORT + ' is already in use.');
    console.error('      Another copy of the bridge may already be running.');
    console.error('      Close it first, then try again.');
    console.error('');
    process.exit(1);
  }
});

wss.on('connection', (ws) => {
  console.log('[WS ] Plugin connected!');
  pluginSocket = ws;
  pluginData.connected = true;

  // Tell plugin we're connected + whether API key is already saved
  ws.send(JSON.stringify({
    type: 'connection-established',
    message: 'Bridge server connected!',
    hasApiKey: !!anthropicApiKey
  }));

  ws.on('message', (data) => {
    try {
      const raw = data.toString();
      const message = JSON.parse(raw);
      console.log('[MSG] From plugin: ' + message.type + ' (' + Math.round(raw.length / 1024) + 'KB)');

      // ─ API key from Settings tab ─
      if (message.type === 'set-api-key') {
        const key = message.key;
        if (!key.startsWith('sk-ant-')) {
          console.log('[KEY] Rejected key — must start with sk-ant-');
          ws.send(JSON.stringify({ type: 'api-key-confirmed', success: false, error: 'Invalid key — Anthropic keys start with sk-ant-' }));
        } else {
          anthropicApiKey = key;
          anthropic = new Anthropic({ apiKey: key });
          saveConfig(key);
          console.log('[KEY] Anthropic API key updated and saved');
          ws.send(JSON.stringify({ type: 'api-key-confirmed', success: true }));
        }
      }

      // ─ Plugin state update ─
      if (message.type === 'state-update') {
        pluginData.projects      = message.projects      || [];
        pluginData.activeProject = message.activeProject || null;
      }

      // ─ Chat message ─
      if (message.type === 'chat-message') {
        console.log('[CHAT] anthropic ready:', !!anthropic, '| text:', JSON.stringify((message.text || '').slice(0, 40)));
        if (anthropic) {
          chatWithClaude(ws, message.text, message.history || [], message.designData, message.screenshot || null);
        } else {
          ws.send(JSON.stringify({ type: 'chat-response', text: 'No API key configured. Go to Settings tab and paste your Anthropic API key.', fixes: [] }));
        }
      }

      // ─ Design data — auto-trigger AI if a Fixes action is attached ─
      if (message.type === 'design-data') {
        pluginData.lastDesignData = message.data;
        console.log('[DATA] Design data stored: ' + message.data.mode);

        const action = message.data.action;
        const fixesActions = ['grammar', 'autolayout', 'alignment', 'contrast', 'consistency'];

        if (action === 'edge-cases') {
          if (anthropic) {
            analyzeEdgeCasesWithClaude(ws, message.data);
          } else {
            console.log('[AI ] No API key configured — cannot analyze');
            ws.send(JSON.stringify({
              type: 'add-edge-cases-from-claude',
              cases: ['No Anthropic API key configured. Go to Settings tab and paste your key from console.anthropic.com.'],
              frameName: 'Error'
            }));
          }
        } else if (action && fixesActions.includes(action)) {
          if (anthropic) {
            analyzeDesignWithClaude(ws, message.data, action);
          } else {
            console.log('[AI ] No API key configured — cannot analyze');
            ws.send(JSON.stringify({
              type: 'add-fixes-from-claude',
              fixes: [{
                action,
                nodeId: '',
                nodeName: 'No API Key',
                issue: 'No Anthropic API key configured',
                description: 'Go to Settings tab and paste your Anthropic API key from console.anthropic.com'
              }]
            }));
          }
        }
      }

    } catch (e) {
      console.error('[ERR] Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WS ] Plugin disconnected');
    pluginSocket = null;
    pluginData.connected = false;
  });

  ws.on('error', (error) => {
    console.error('[ERR] WebSocket error:', error);
  });
});

console.log('');
console.log('===========================================');
console.log('  SIDEBOT BRIDGE SERVER');
console.log('===========================================');
console.log('');
console.log('[WS ] ws://localhost:' + WS_PORT);
console.log('[AI ] ' + (anthropicApiKey ? 'Anthropic key configured' : 'no key — enter in plugin Settings tab'));
console.log('');
console.log('Waiting for Figma plugin to connect...');
console.log('');
console.log('Press Ctrl+C to stop  |  Close this window to stop');
console.log('===========================================');
console.log('');

// ─── GRACEFUL SHUTDOWN ───
process.on('SIGINT', () => {
  console.log('\nShutting down bridge server...');
  if (pluginSocket) pluginSocket.close();
  wss.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});
