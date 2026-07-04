/* CyberSense — Social Engineering Chat Lab
   Educational simulation. No real phishing, no real links.
*/

const SCENARIOS = [
  { id: "mfa-helpdesk", file: "scenarios/mfa-helpdesk.json" },
  { id: "fake-recruiter", file: "scenarios/fake-recruiter.json" },
  { id: "delivery-scam", file: "scenarios/delivery-scam.json" }
];

const els = {
  tabGame: document.getElementById("tabGame"),
  tabAnalytics: document.getElementById("tabAnalytics"),
  viewGame: document.getElementById("viewGame"),
  viewAnalytics: document.getElementById("viewAnalytics"),

  scenarioSelect: document.getElementById("scenarioSelect"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  riskBadge: document.getElementById("riskBadge"),
  badgesBadge: document.getElementById("badgesBadge"),
  scenarioIntro: document.getElementById("scenarioIntro"),

  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),

  chat: document.getElementById("chat"),
  typing: document.getElementById("typing"),
  explain: document.getElementById("explain"),
  choices: document.getElementById("choices"),
  result: document.getElementById("result"),

  exportBtn: document.getElementById("exportBtn"),
  copyBtn: document.getElementById("copyBtn"),

  resetStatsBtn: document.getElementById("resetStatsBtn"),
  statRuns: document.getElementById("statRuns"),
  statAvgRisk: document.getElementById("statAvgRisk"),
  statBestRisk: document.getElementById("statBestRisk"),
  statMostMissed: document.getElementById("statMostMissed"),
  scenarioTableBody: document.getElementById("scenarioTableBody")
};

const STORAGE_KEY = "cybersense_stats_v1";

let scenario = null;
let state = null;

/** -----------------------------
 *  Utilities
 *  ----------------------------*/
function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeText(s) {
  // Minimal safety: ensure string
  return (s ?? "").toString();
}

function scoreToBand(risk) {
  // risk can exceed 100; clamp for display
  const r = clamp(risk, 0, 100);
  if (r <= 15) return { label: "Secure", cls: "good" };
  if (r <= 40) return { label: "At Risk", cls: "warn" };
  return { label: "Compromised", cls: "bad" };
}

function uniqueArray(arr) {
  return Array.from(new Set(arr));
}

/** -----------------------------
 *  Stats (localStorage)
 *  ----------------------------*/
function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { runs: 0, bestRisk: null, avgRisk: 0, perScenario: {}, missedFlags: {} };
    const obj = JSON.parse(raw);
    return obj;
  } catch {
    return { runs: 0, bestRisk: null, avgRisk: 0, perScenario: {}, missedFlags: {} };
  }
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function recordRun({ scenarioId, scenarioTitle, riskScore, missedFlags }) {
  const stats = loadStats();

  stats.runs += 1;

  // global best
  if (stats.bestRisk === null || riskScore < stats.bestRisk) stats.bestRisk = riskScore;

  // global avg incremental
  // avg = (prevAvg*(n-1) + x)/n
  stats.avgRisk = Math.round(((stats.avgRisk * (stats.runs - 1)) + riskScore) / stats.runs);

  // per scenario
  if (!stats.perScenario[scenarioId]) {
    stats.perScenario[scenarioId] = {
      title: scenarioTitle,
      runs: 0,
      bestRisk: null,
      avgRisk: 0,
      missedFlags: {}
    };
  }
  const s = stats.perScenario[scenarioId];
  s.runs += 1;
  if (s.bestRisk === null || riskScore < s.bestRisk) s.bestRisk = riskScore;
  s.avgRisk = Math.round(((s.avgRisk * (s.runs - 1)) + riskScore) / s.runs);

  // missed flags counts
  for (const f of missedFlags) {
    stats.missedFlags[f] = (stats.missedFlags[f] || 0) + 1;
    s.missedFlags[f] = (s.missedFlags[f] || 0) + 1;
  }

  saveStats(stats);
  renderAnalytics();
}

function resetStats() {
  localStorage.removeItem(STORAGE_KEY);
  renderAnalytics();
}

function mostFrequentFlag(flagMap) {
  const entries = Object.entries(flagMap || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/** -----------------------------
 *  UI helpers
 *  ----------------------------*/
function setActiveTab(tab) {
  const isGame = tab === "game";
  els.tabGame.classList.toggle("active", isGame);
  els.tabAnalytics.classList.toggle("active", !isGame);
  els.viewGame.classList.toggle("hidden", !isGame);
  els.viewAnalytics.classList.toggle("hidden", isGame);
  if (!isGame) renderAnalytics();
}

function scrollChatToBottom() {
  els.chat.scrollTop = els.chat.scrollHeight;
}

function clearGameUI() {
  els.chat.innerHTML = "";
  els.choices.innerHTML = "";
  els.result.classList.add("hidden");
  els.result.innerHTML = "";
  hideExplain();
  hideTyping();
  els.riskBadge.textContent = "0";
  els.badgesBadge.textContent = "0";
  els.exportBtn.disabled = true;
  els.copyBtn.disabled = true;
}

function showTyping() {
  els.typing.classList.remove("hidden");
}
function hideTyping() {
  els.typing.classList.add("hidden");
}

function showExplain(text) {
  els.explain.textContent = safeText(text);
  els.explain.classList.remove("hidden");
}
function hideExplain() {
  els.explain.textContent = "";
  els.explain.classList.add("hidden");
}

function addMessageBubble({ from, text, meta }) {
  const row = document.createElement("div");
  row.className = `msgrow ${from}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${from}`;

  // initials / labels
  if (from === "attacker") avatar.textContent = "SC"; // scammer
  else if (from === "you") avatar.textContent = "ME";
  else avatar.textContent = "SYS";

  const bubble = document.createElement("div");
  bubble.className = `msg ${from}`;
  bubble.textContent = safeText(text);

  const metaDiv = document.createElement("div");
  metaDiv.className = "meta";
  const timeSpan = document.createElement("span");
  timeSpan.textContent = nowTime();
  metaDiv.appendChild(timeSpan);

  if (meta) {
    const meta2 = document.createElement("span");
    meta2.textContent = `• ${safeText(meta)}`;
    metaDiv.appendChild(meta2);
  }

  bubble.appendChild(metaDiv);

  // Order: attacker/system avatar left; you avatar right
  if (from === "you") {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  els.chat.appendChild(row);
  scrollChatToBottom();
}

function setChoices(choices) {
  els.choices.innerHTML = "";
  if (!choices || !choices.length) return;

  for (const c of choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn choice";
    btn.textContent = c.label;
    btn.addEventListener("click", () => handleChoice(c));
    els.choices.appendChild(btn);
  }
}

/** -----------------------------
 *  Badges / Achievements
 *  ----------------------------*/
const ACHIEVEMENTS = [
  {
    id: "first_safe_move",
    name: "First Safe Move",
    check: (st) => st.safeChoices >= 1
  },
  {
    id: "no_mfa_share",
    name: "Protected MFA",
    check: (st) => st.flags.has("mfa_theft") && st.mfaShared === false
  },
  {
    id: "spot_urgency",
    name: "Ignored Urgency",
    check: (st) => st.flags.has("urgency") && st.safeAgainstUrgency === true
  },
  {
    id: "perfect_run",
    name: "Clean Run",
    check: (st) => st.riskScore === 0
  }
];

function updateAchievements() {
  // award achievements based on current state
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements.has(a.id) && a.check(state)) {
      state.achievements.add(a.id);
      addMessageBubble({
        from: "system",
        text: `🏅 Badge unlocked: ${a.name}`,
        meta: "achievement"
      });
    }
  }
  els.badgesBadge.textContent = String(state.achievements.size);
}

/** -----------------------------
 *  Game Engine
 *  ----------------------------*/
async function loadScenario(file) {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load scenario: ${file}`);
  return res.json();
}

function initState() {
  state = {
    scenarioId: getSelectedScenarioId(),
    startTime: Date.now(),
    currentNodeId: scenario.startNode,
    riskScore: 0,
    flags: new Set(),
    missedFlags: new Set(), // flags encountered but player failed to respond safely
    seenFlags: new Set(),   // all flags encountered (from choices)
    safeChoices: 0,
    riskyChoices: 0,
    achievements: new Set(),
    // special trackers
    mfaShared: null, // null unknown, true shared, false protected
    safeAgainstUrgency: null
  };
  els.riskBadge.textContent = "0";
  els.badgesBadge.textContent = "0";
}

function getSelectedScenarioId() {
  return els.scenarioSelect.value;
}

function getScenarioMetaById(id) {
  return SCENARIOS.find(s => s.id === id);
}

function setScenarioHeaderInfo() {
  els.difficultyBadge.textContent = scenario.difficulty || "—";
  els.scenarioIntro.textContent = scenario.intro || "—";
}

async function startGame() {
  clearGameUI();

  const id = getSelectedScenarioId();
  const meta = getScenarioMetaById(id);
  if (!meta) return;

  // load
  scenario = await loadScenario(meta.file);
  setScenarioHeaderInfo();

  // init state
  initState();

  // enable controls
  els.restartBtn.disabled = false;

  // intro system message
  addMessageBubble({
    from: "system",
    text: `Scenario started: ${scenario.title}`,
    meta: scenario.difficulty || ""
  });

  // show first node
  await showNode(state.currentNodeId);
}

async function restartGame() {
  if (!scenario) return startGame();
  clearGameUI();
  initState();
  els.restartBtn.disabled = false;

  addMessageBubble({
    from: "system",
    text: `Restarted: ${scenario.title}`,
    meta: "restart"
  });

  await showNode(state.currentNodeId);
}

async function showNode(nodeId) {
  const node = scenario.nodes[nodeId];
  if (!node) {
    addMessageBubble({ from: "system", text: "Error: missing node.", meta: "error" });
    return endGame();
  }

  // typing delay for attacker/system messages (feels real)
  if (node.from === "attacker") {
    showTyping();
    await sleep(scenario.typingDelayMs ?? 700);
    hideTyping();
  }

  addMessageBubble({ from: node.from, text: node.text, meta: node.meta || null });

  // end?
  if (node.end === true) {
    return endGame();
  }

  // render choices
  setChoices(node.choices || []);
}

function applyChoiceEffects(choice) {
  const risk = Number(choice.risk || 0);
  state.riskScore += risk;

  // risk cap display
  els.riskBadge.textContent = String(clamp(state.riskScore, 0, 999));

  // flags
  const flags = Array.isArray(choice.flags) ? choice.flags : [];
  for (const f of flags) {
    state.flags.add(f);
    state.seenFlags.add(f);
  }

  // safe vs risky tally
  if (risk === 0) state.safeChoices += 1;
  else state.riskyChoices += 1;

  // special trackers
  if (flags.includes("mfa_theft")) {
    // user is interacting with MFA-theft context
    // if they choose "share code" we set mfaShared true
    if ((choice.effects || []).includes("mfa_shared")) state.mfaShared = true;
    if ((choice.effects || []).includes("mfa_protected")) state.mfaShared = false;
  }
  if (flags.includes("urgency")) {
    if ((choice.effects || []).includes("resisted_urgency")) state.safeAgainstUrgency = true;
    if ((choice.effects || []).includes("fell_for_urgency")) state.safeAgainstUrgency = false;
  }

  // missed flags logic:
  // if choice contains a flag and risk > 0, we treat those flags as "missed" (player didn’t respond safely)
  if (risk > 0) {
    for (const f of flags) state.missedFlags.add(f);
  }

  updateAchievements();
}

async function handleChoice(choice) {
  // disable choices while processing
  const btns = Array.from(els.choices.querySelectorAll("button"));
  btns.forEach(b => b.disabled = true);

  // show player's message bubble
  addMessageBubble({ from: "you", text: choice.label });

  // show explanation panel (optional)
  if (choice.explain) {
    showExplain(choice.explain);
  } else {
    hideExplain();
  }

  applyChoiceEffects(choice);

  // clear choices while next loads
  els.choices.innerHTML = "";

  // go next
  const nextId = choice.next;
  await sleep(250);
  await showNode(nextId);
}

function computeMissedFlagsForReport() {
  // missedFlags are flags where the user took risky choices in that flagged context.
  return uniqueArray(Array.from(state.missedFlags));
}

function buildMarkdownReport() {
  const ms = Date.now() - state.startTime;
  const seconds = Math.max(1, Math.round(ms / 1000));

  const band = scoreToBand(state.riskScore);
  const allFlags = uniqueArray(Array.from(state.seenFlags));
  const missedFlags = computeMissedFlagsForReport();
  const earnedBadges = uniqueArray(Array.from(state.achievements)).map(id => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    return a ? a.name : id;
  });

  const advice = scenario.advice || [
    "Verify requests using official channels (call back using known numbers).",
    "Never share MFA/OTP codes with anyone.",
    "Do not click unexpected links; navigate directly to official sites/apps.",
    "Report suspicious messages to the appropriate team."
  ];

  const lines = [];
  lines.push(`# CyberSense Report — ${scenario.title}`);
  lines.push(``);
  lines.push(`- **Difficulty:** ${scenario.difficulty || "—"}`);
  lines.push(`- **Duration:** ${seconds}s`);
  lines.push(`- **Risk Score:** ${state.riskScore} (${band.label})`);
  lines.push(``);
  lines.push(`## Red Flags Encountered`);
  lines.push(allFlags.length ? allFlags.map(f => `- ${f}`).join("\n") : `- None recorded`);
  lines.push(``);
  lines.push(`## Red Flags Missed`);
  lines.push(missedFlags.length ? missedFlags.map(f => `- ${f}`).join("\n") : `- None`);
  lines.push(``);
  lines.push(`## Badges Earned`);
  lines.push(earnedBadges.length ? earnedBadges.map(b => `- ${b}`).join("\n") : `- None`);
  lines.push(``);
  lines.push(`## Recommended Real-World Actions`);
  lines.push(advice.map(a => `- ${a}`).join("\n"));
  lines.push(``);
  lines.push(`## Notes`);
  lines.push(`This is an educational simulation. Do not use it to target real people or systems.`);
  lines.push(``);

  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

function renderResults() {
  const band = scoreToBand(state.riskScore);
  const missedFlags = computeMissedFlagsForReport();
  const allFlags = uniqueArray(Array.from(state.seenFlags));
  const earnedBadges = uniqueArray(Array.from(state.achievements)).map(id => {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    return a ? a.name : id;
  });

  els.result.classList.remove("hidden");
  els.result.innerHTML = `
    <div class="result-head">
      <div class="result-title">Result</div>
      <div class="pill ${band.cls}">${band.label}</div>
    </div>

    <div class="kv">
      <div class="k">Risk Score</div>
      <div class="v"><strong>${state.riskScore}</strong></div>

      <div class="k">Red flags encountered</div>
      <div class="v">
        <div class="taglist">
          ${allFlags.length ? allFlags.map(f => `<span class="tag">${escapeHtml(f)}</span>`).join("") : `<span class="tag">None</span>`}
        </div>
      </div>

      <div class="k">Red flags missed</div>
      <div class="v">
        <div class="taglist">
          ${missedFlags.length ? missedFlags.map(f => `<span class="tag">${escapeHtml(f)}</span>`).join("") : `<span class="tag">None</span>`}
        </div>
      </div>

      <div class="k">Badges</div>
      <div class="v">
        <div class="taglist">
          ${earnedBadges.length ? earnedBadges.map(b => `<span class="tag">${escapeHtml(b)}</span>`).join("") : `<span class="tag">None</span>`}
        </div>
      </div>
    </div>

    <div class="kv" style="margin-top:16px;">
      <div class="k">What to do IRL</div>
      <div class="v">
        <ul>
          ${(scenario.advice || []).map(a => `<li>${escapeHtml(a)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return safeText(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function endGame() {
  // enable export tools
  els.exportBtn.disabled = false;
  els.copyBtn.disabled = false;

  renderResults();

  // record stats
  recordRun({
    scenarioId: state.scenarioId,
    scenarioTitle: scenario.title,
    riskScore: state.riskScore,
    missedFlags: computeMissedFlagsForReport()
  });

  addMessageBubble({
    from: "system",
    text: `Run complete. Risk score: ${state.riskScore}.`,
    meta: "summary"
  });
}

/** -----------------------------
 *  Analytics rendering
 *  ----------------------------*/
function renderAnalytics() {
  const stats = loadStats();

  els.statRuns.textContent = String(stats.runs || 0);
  els.statAvgRisk.textContent = String(stats.avgRisk || 0);
  els.statBestRisk.textContent = (stats.bestRisk === null || stats.bestRisk === undefined) ? "—" : String(stats.bestRisk);

  const mostMissed = mostFrequentFlag(stats.missedFlags);
  els.statMostMissed.textContent = mostMissed || "—";

  // Per scenario table
  els.scenarioTableBody.innerHTML = "";

  for (const meta of SCENARIOS) {
    const row = document.createElement("tr");
    const s = stats.perScenario[meta.id];

    const title = s?.title || meta.id;
    const runs = s?.runs || 0;
    const best = (s?.bestRisk === null || s?.bestRisk === undefined) ? "—" : String(s.bestRisk);
    const avg = s?.avgRisk ?? 0;
    const mm = mostFrequentFlag(s?.missedFlags) || "—";

    row.innerHTML = `
      <td>${escapeHtml(title)}</td>
      <td>${runs}</td>
      <td>${best}</td>
      <td>${avg}</td>
      <td>${escapeHtml(mm)}</td>
    `;
    els.scenarioTableBody.appendChild(row);
  }
}

/** -----------------------------
 *  Scenario selection UI
 *  ----------------------------*/
async function updateScenarioPreview() {
  const id = getSelectedScenarioId();
  const meta = getScenarioMetaById(id);
  if (!meta) return;

  try {
    const preview = await loadScenario(meta.file);
    els.difficultyBadge.textContent = preview.difficulty || "—";
    els.scenarioIntro.textContent = preview.intro || "—";
  } catch {
    els.difficultyBadge.textContent = "—";
    els.scenarioIntro.textContent = "Failed to load preview.";
  }
}

/** -----------------------------
 *  Event wiring
 *  ----------------------------*/
function populateScenarioSelect() {
  els.scenarioSelect.innerHTML = "";
  for (const s of SCENARIOS) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.id.replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase());
    els.scenarioSelect.appendChild(opt);
  }
}

function wireEvents() {
  els.tabGame.addEventListener("click", () => setActiveTab("game"));
  els.tabAnalytics.addEventListener("click", () => setActiveTab("analytics"));

  els.scenarioSelect.addEventListener("change", async () => {
    await updateScenarioPreview();
  });

  els.startBtn.addEventListener("click", async () => {
    els.startBtn.disabled = true;
    try {
      await startGame();
    } finally {
      els.startBtn.disabled = false;
    }
  });

  els.restartBtn.addEventListener("click", async () => {
    await restartGame();
  });

  els.exportBtn.addEventListener("click", () => {
    if (!scenario || !state) return;
    const md = buildMarkdownReport();
    const fname = `${state.scenarioId}-report.md`;
    downloadText(fname, md);
  });

  els.copyBtn.addEventListener("click", async () => {
    if (!scenario || !state) return;
    const md = buildMarkdownReport();
    await copyToClipboard(md);
    addMessageBubble({ from: "system", text: "Report copied to clipboard.", meta: "export" });
  });

  els.resetStatsBtn.addEventListener("click", () => {
    resetStats();
  });
}

async function init() {
  populateScenarioSelect();
  wireEvents();
  renderAnalytics();
  await updateScenarioPreview();

  // initial state
  els.restartBtn.disabled = true;
  clearGameUI();
}

init();
