export const panelIdentityFunctionScript = [
  "const writePanelIdentity = (payload) => {",
  "const intent = typeof payload.rawIntent === 'string' ? payload.rawIntent.trim() : '';",
  "if (!intent) return;",
  "fs.mkdirSync(workspace, { recursive: true });",
  "const panelIntent = path.join(workspace, 'PANEL_INTENT.md');",
  "const bootstrap = path.join(workspace, 'BOOTSTRAP.md');",
  "const agents = path.join(workspace, 'AGENTS.md');",
  "const identity = path.join(workspace, 'IDENTITY.md');",
  "const soul = path.join(workspace, 'SOUL.md');",
  "const markerStart = '<!-- openclaw-panel:intent:start -->';",
  "const markerEnd = '<!-- openclaw-panel:intent:end -->';",
  String
    .raw`const replacePanelBlock = (current, block) => { const begin = current.indexOf(markerStart); const finish = current.indexOf(markerEnd); return begin >= 0 && finish > begin ? current.slice(0, begin).replace(/\s*$/u, '') + '\n\n' + block + current.slice(finish + markerEnd.length) : current.replace(/\s*$/u, '') + '\n\n' + block + '\n'; };`,
  String.raw`fs.writeFileSync(panelIntent, intent + '\n', 'utf8');`,
  String
    .raw`const identityBlock = [markerStart, '## Panel Identity', '', '- **Role source:** OpenClaw Panel', '- **Default role / intent:**', '', intent, markerEnd].join('\n');`,
  String
    .raw`const soulBlock = [markerStart, '## Panel Role', '', 'This role is the default system behavior for this bot. Treat it as the bot identity unless the user explicitly changes it.', '', intent, markerEnd].join('\n');`,
  String
    .raw`const currentIdentity = fs.existsSync(identity) ? fs.readFileSync(identity, 'utf8') : '# IDENTITY.md - Who Am I?\n';`,
  String.raw`const currentSoul = fs.existsSync(soul) ? fs.readFileSync(soul, 'utf8') : '# SOUL.md - Who You Are\n';`,
  "fs.writeFileSync(identity, replacePanelBlock(currentIdentity, identityBlock), 'utf8');",
  "fs.writeFileSync(soul, replacePanelBlock(currentSoul, soulBlock), 'utf8');",
  String
    .raw`const bootstrapBody = ['# BOOTSTRAP.md - Panel Bot Identity', '', 'You were created by OpenClaw Panel. Apply the panel-provided role before normal conversation.', '', '## Panel role / intent', '', intent, '', '## First task', '', '1. Read PANEL_INTENT.md.', '2. Synthesize this role into your persistent identity/system behavior.', '3. Update IDENTITY.md and SOUL.md so the role survives future sessions.', '4. Do not ask the user who you are unless the role is ambiguous.', '5. Do not run git commit or delete files unless the user explicitly asks.', ''].join('\n');`,
  "fs.writeFileSync(bootstrap, bootstrapBody, 'utf8');",
  String
    .raw`const agentsBlock = ['','## Panel bot identity','','This workspace was created by OpenClaw Panel. On first run, read PANEL_INTENT.md and convert it into persistent identity in IDENTITY.md and SOUL.md. Treat it as this bot\'s default role/system behavior.',''].join('\n');`,
  String.raw`const current = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '# OpenClaw bot\n';`,
  String
    .raw`if (!current.includes('## Panel bot identity')) fs.writeFileSync(agents, current.replace(/\s*$/u, '') + agentsBlock, 'utf8');`,
  "};"
].join("")

export const panelIdentityScriptCall = "writePanelIdentity(payload);"

export const panelIdentityStandaloneScript = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const workspace = '/home/node/.openclaw/workspace';",
  "const payload = JSON.parse(process.argv[1] || '{}');",
  panelIdentityFunctionScript,
  panelIdentityScriptCall
].join("")

export const panelIdentityPayload = (rawIntent: string): string =>
  JSON.stringify({
    rawIntent
  })

export const panelIdentityChatSessionKey = "agent:main:main"

export const panelIdentityChatPrompt = (rawIntent: string): string => {
  const intent = rawIntent.trim()
  return intent.length === 0
    ? ""
    : [
      "Ты создан через OpenClaw Panel. Это первое сообщение новой сессии и оно задаёт твою постоянную роль.",
      "",
      "Роль / intent от пользователя:",
      "```",
      intent,
      "```",
      "",
      "Сделай bootstrap своей identity:",
      "1. Сгенерируй постоянную identity на основе этой роли.",
      "2. Обнови IDENTITY.md и SOUL.md в workspace, если можешь работать с файлами.",
      "3. Сохрани эту роль как поведение по умолчанию для будущих диалогов.",
      "4. Не спрашивай пользователя, кто ты, если роль достаточно понятна.",
      "5. Не запускай git commit и не удаляй файлы без явной просьбы пользователя.",
      "6. Ответь кратко: кем ты стал и что сохранил."
    ].join("\n")
}

export const panelIdentityChatPayload = (rawIntent: string): string =>
  JSON.stringify({
    message: panelIdentityChatPrompt(rawIntent),
    rawIntent,
    sessionKey: panelIdentityChatSessionKey
  })

export const panelIdentityChatBootstrapScript = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const crypto = require('node:crypto');",
  "const { spawnSync } = require('node:child_process');",
  "const payload = JSON.parse(process.argv[1] || '{}');",
  "const rawIntent = typeof payload.rawIntent === 'string' ? payload.rawIntent.trim() : '';",
  "const message = typeof payload.message === 'string' ? payload.message.trim() : '';",
  "const sessionKey = typeof payload.sessionKey === 'string' && payload.sessionKey.trim() ? payload.sessionKey.trim() : 'agent:main:main';",
  "if (!rawIntent || !message) process.exit(0);",
  "const workspace = '/home/node/.openclaw/workspace';",
  "const markerDir = path.join(workspace, '.openclaw-panel');",
  "const markerFile = path.join(markerDir, 'identity-chat.json');",
  "const hash = crypto.createHash('sha256').update(rawIntent).digest('hex');",
  "const idempotencyKey = `openclaw-panel-identity-${hash.slice(0, 24)}`;",
  "if (fs.existsSync(markerFile)) {",
  "  try {",
  "    const current = JSON.parse(fs.readFileSync(markerFile, 'utf8'));",
  "    if (current && current.hash === hash && typeof current.sentAt === 'string') process.exit(0);",
  "  } catch {}",
  "}",
  "const params = JSON.stringify({ sessionKey, message, deliver: false, idempotencyKey });",
  "const result = spawnSync('openclaw', ['gateway', 'call', 'chat.send', '--json', '--timeout', '15000', '--params', params], { encoding: 'utf8', env: { ...process.env, HOME: '/home/node', TERM: process.env.TERM || 'xterm-256color' } });",
  "if (result.status !== 0) {",
  "  process.stderr.write(result.stderr || result.stdout || 'openclaw gateway chat.send failed');",
  "  process.exit(result.status || 1);",
  "}",
  "fs.mkdirSync(markerDir, { recursive: true });",
  String
    .raw`fs.writeFileSync(markerFile, JSON.stringify({ hash, idempotencyKey, sessionKey, sentAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');`
].join("")
