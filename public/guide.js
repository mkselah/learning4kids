const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Escape text, then turn **bold** into <b>bold</b>
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
// ---------- Percentage → score (1–5) ----------
// A percentage gets the score of the first row where pct >= from
const SCALE = [
  { from: 80, to: 100, score: 5 },
  { from: 60, to: 80, score: 4 },
  { from: 40, to: 60, score: 3 },
  { from: 20, to: 40, score: 2 },
  { from: 0, to: 20, score: 1 },
];
const scoreFor = (pct) => (SCALE.find((s) => pct >= s.from) || SCALE[SCALE.length - 1]).score;
// ---------- Rubric: levels are [3 points, 2 points, 1 point, 0 points] ----------
const RUBRIC = [
  { section: "Technical skills", skills: [
    { name: "First touch / ball control", levels: [
      "First touch is controlled **and** improves next action: into space, away from defender, toward goal/pass option, or sets up shot/pass. Possession kept.",
      "First touch is controlled and possession kept, but ball stops or does not improve next action.",
      "First touch is loose/heavy, but he recovers before opponent wins it.",
      "First touch loses possession, goes out, or gives opponent clear chance to win ball.",
    ] },
    { name: "Passing", levels: [
      "Pass reaches teammate **and** improves play: breaks line, creates chance, escapes pressure, or gives teammate forward advantage.",
      "Pass reaches teammate and keeps possession, but does not improve attack or pressure situation.",
      "Pass reaches teammate but is weak/late/behind and puts teammate under pressure, or deflects but team keeps ball.",
      "Pass goes to opponent/out, is not reachable, or creates immediate danger for own team.",
    ] },
    { name: "Dribbling / 1v1", levels: [
      "Beats defender or escapes pressure while keeping possession, creating space to pass/shoot/continue attack.",
      "Keeps possession under pressure but does not beat defender or improve position.",
      "Attempts dribble, touch is poor or direction bad, but he recovers possession.",
      "Dribble loses ball, runs out of play, or defender wins it cleanly.",
    ] },
    { name: "Shooting", levels: [
      "Shot is on target **and** has enough power/placement to challenge keeper or score.",
      "Shot is on target but easy to save, or narrowly misses from a realistic shooting position.",
      "Shot is blocked/mishit, but decision to shoot was reasonable.",
      "Shot is far off target, too weak to reach goal, or taken when a pass/dribble was clearly better.",
    ] },
    { name: "Finishing", levels: [
      "Scores, or forces a difficult save from close/clear chance.",
      "Shot is on target from a clear chance but keeper saves comfortably.",
      "Makes contact but misses target or hits weakly from a clear chance.",
      "Does not get shot away, loses ball, or misses ball completely in a clear finishing moment.",
    ] },
    { name: "Weak foot", note: "Score only actions using weak foot.", levels: [
      "Weak-foot action succeeds and improves play: completed pass, controlled touch, successful dribble touch, or shot on target.",
      "Weak-foot action succeeds but does not improve play much: safe pass, controlled touch standing still, shot weak but on target.",
      "Weak-foot action partly works but creates pressure: poor touch recovered, weak pass reaches teammate under pressure, shot mishit but continues attack.",
      "Weak-foot action fails: lost possession, pass to opponent/out, missed shot badly, touch loses ball.",
    ] },
    { name: "Turns / change direction", levels: [
      "Turn/change beats defender, escapes pressure, or creates clear forward space. Possession kept.",
      "Turn/change keeps possession and avoids pressure but does not beat defender or improve attack.",
      "Turn/change is slow or poorly timed but he recovers possession.",
      "Turn/change loses ball, runs out, or turns directly into defender.",
    ] },
    { name: "Finter / body feints", levels: [
      "Feint makes defender move/react and he beats defender or creates space to pass/shoot.",
      "Feint keeps possession and creates small space, but no defender is fully beaten.",
      "Feint attempted, defender does not react, but he keeps/recover ball.",
      "Feint causes loss of ball, bad touch, fall, or missed chance to pass/shoot.",
    ] },
    { name: "Top før bund", levels: [
      "Uses body first to block/steer opponent, then wins ball or forces turnover/out.",
      "Uses body first and stops/slows opponent, but does not win ball.",
      "Some body contact, but goes for foot/ball too early and opponent keeps ball.",
      "No body use; dives foot-first, gets beaten, fouls, or creates danger.",
    ] },
  ] },
  { section: "Boldholder", skills: [
    { name: "Technique", levels: [
      "Uses controlled touch/dribble/pass/shot and keeps possession while improving play.",
      "Uses controlled technique and keeps possession, but play is not improved.",
      "Technique is loose/heavy/awkward, but he recovers possession.",
      "Technical action loses possession, goes out, or gives opponent the ball.",
    ] },
    { name: "Decision-making", levels: [
      "Chooses an action that succeeds and improves attack: pass, dribble, shoot, turn, or protect.",
      "Chooses an action that succeeds and keeps possession, but better forward option was available.",
      "Chooses late/risky action that creates pressure, but team keeps ball.",
      "Choice causes possession loss, missed clear chance, or immediate danger.",
    ] },
    { name: "Scanning", levels: [
      "Looks before receiving/action and uses information to choose successful next action.",
      "Looks before receiving/action, but choice is safe or does not improve play.",
      "Looks too late/only after receiving, causing delay or pressure, but possession kept.",
      "Does not scan, misses obvious option/pressure, and loses ball or attack breaks down.",
    ] },
    { name: "Timing", levels: [
      "Action happens at correct moment: before tackle, when teammate is open, or when space appears.",
      "Action succeeds but is slightly early/late and does not improve play.",
      "Delayed/rushed action creates pressure, but possession kept.",
      "Timing causes turnover, missed pass/shot chance, or defender wins ball.",
    ] },
    { name: "Positioning / body orientation", levels: [
      "Body/touch faces next action and allows forward play or pressure escape.",
      "Body/touch allows possession but limits forward options.",
      "Closed body/poor angle causes pressure, but he recovers.",
      "Poor body position leads directly to losing ball or failed action.",
    ] },
    { name: "Pressure handling", levels: [
      "Under pressure, keeps ball and escapes, passes, shields, or wins foul.",
      "Under pressure, keeps ball safely but does not progress.",
      "Pressure causes poor touch/choice, but he recovers or team keeps ball.",
      "Pressure causes possession loss or dangerous turnover.",
    ] },
    { name: "Maskering / disguise", levels: [
      "Disguise/fake moves defender and creates successful pass, dribble, shot, or space.",
      "Uses disguise and keeps possession, but defender is not moved or play not improved.",
      "Attempts disguise but timing/technique weak; no advantage, but possession kept.",
      "Disguise attempt causes loss of ball, bad pass, or missed clear option.",
    ] },
  ] },
  { section: "Medspiller", skills: [
    { name: "Support position / Positionering", levels: [
      "Gives ballholder a clear passing option and helps attack: open body, reachable angle, not hidden behind defender, space to receive.",
      "Is available as a safe option, but does not improve attack: too flat, too close, or only backward/sideways option.",
      "Tries to support but is partly covered, too close/far, or pass would put him under immediate pressure.",
      "Not available: hidden behind defender, standing still in blocked lane, or too far to receive.",
    ] },
    { name: "Scanning", levels: [
      "Looks away from ball before/during movement and adjusts position based on teammate, defender, or space.",
      "Looks around but does not clearly change position or body shape.",
      "Only looks after ball is already coming, causing late reaction or pressure.",
      "Does not scan and is surprised by defender, space, or pass.",
    ] },
    { name: "Movement / Bevægelse", levels: [
      "Moves to create/use space: changes speed or direction and becomes free/reachable.",
      "Moves into support position but without speed/direction change, or only stays safe.",
      "Moves late or into crowded/blocked space, but still partly available.",
      "No useful movement: stands still, follows defender, or blocks teammate’s space.",
    ] },
    { name: "Timing", levels: [
      "Movement happens at the right moment so he is open when ballholder can pass.",
      "Movement is slightly early/late but still available.",
      "Movement is too early/late, making pass difficult or pressured.",
      "Timing removes option: arrives after chance is gone or runs offside/out of play.",
    ] },
    { name: "Body position / Kropsposition", levels: [
      "Body is open to see ball and next action; can receive forward/sideways with first touch.",
      "Body can receive safely but mostly backward/closed.",
      "Body shape makes first touch difficult or invites pressure.",
      "Body position prevents receiving or causes immediate loss/danger.",
    ] },
    { name: "Communication", levels: [
      "Clear useful call/gesture improves ballholder decision: “turn,” “man on,” “time,” “pass,” or points to space.",
      "Communicates availability but without extra information, e.g. calls name or asks for ball.",
      "Communicates late, unclear, or when not actually available.",
      "No communication when needed, or misleading call causes pressure/loss.",
    ] },
    { name: "Forfinteløb", levels: [
      "Fake run moves defender or creates space, then he becomes available or opens space for teammate.",
      "Fake run changes defender’s attention/position, but benefit is small or not used.",
      "Attempts fake run, but defender does not react or run is mistimed.",
      "No fake run when useful, or run blocks teammate/space.",
    ] },
  ] },
  { section: "Presspiller", skills: [
    { name: "Press timing", levels: [
      "Starts press immediately after clear trigger and arrives before opponent can turn/pass forward.",
      "Starts press after trigger but arrives late; opponent must still play sideways/back.",
      "Starts press late; opponent can turn or pass forward, but pressure affects action.",
      "No press after trigger, or presses so late opponent has free action.",
    ] },
    { name: "Press angle", levels: [
      "Curved/angled run blocks one clear option while pressuring ball.",
      "Run pressures ball but only partly blocks pass/dribble lane.",
      "Straight run allows opponent easy exit, but still adds some pressure.",
      "Wrong angle opens dangerous forward pass/dribble.",
    ] },
    { name: "Speed intensity", levels: [
      "Sprint to close space, then slows under control within tackling distance.",
      "Fast run closes space but lacks final control or is slightly slow.",
      "Jog/half-speed press; opponent has time but notices pressure.",
      "No intensity; opponent plays freely.",
    ] },
    { name: "Body position", levels: [
      "Side-on stance, knees bent, balanced, forces opponent away from danger.",
      "Mostly balanced but stance/feet allow one possible escape.",
      "Square/flat stance; easily turned, but delays slightly.",
      "Off-balance or wrong side; beaten immediately.",
    ] },
    { name: "Top-før-bund", levels: [
      "Uses upper body/shoulder legally to control space before tackling with feet.",
      "Uses body first but not strongly enough to stop turn/drive.",
      "Uses feet first but avoids foul and slows opponent.",
      "Dives with foot, fouls, or gets beaten cleanly.",
    ] },
    { name: "Reaction after trigger", levels: [
      "Reacts within 1 second to trigger: bad touch, back pass, loose ball, receiver facing own goal.",
      "Reacts within 2 seconds and still affects opponent.",
      "Reacts late but joins pressure.",
      "Does not react.",
    ] },
    { name: "Discipline", levels: [
      "Presses only when trigger is there and stops/holds shape if press is beaten.",
      "Usually presses correct moment, but once overcommits.",
      "Chases ball too often, leaving space, but recovers sometimes.",
      "Constant chasing or gives up after beaten.",
    ] },
    { name: "Scanning", levels: [
      "Checks ball, opponent, nearby pass options before/during press and blocks most dangerous option.",
      "Checks ball and opponent but misses one nearby option.",
      "Mostly watches ball only, but still pressures.",
      "Ball-watches only and leaves obvious dangerous option open.",
    ] },
  ] },
  { section: "Støttespiller", skills: [
    { name: "Cover position", levels: [
      "Takes position behind/inside press player so if presser is beaten, he can challenge or delay within 2 seconds.",
      "Covers generally correct side, but angle means opponent still has one easy escape route.",
      "Is near the press but not behind/inside enough to stop next action.",
      "No cover; opponent can beat presser and attack freely.",
    ] },
    { name: "Tracking", levels: [
      "Tracks nearest dangerous runner until threat ends or teammate takes over.",
      "Tracks runner but loses distance/side briefly without immediate danger.",
      "Starts tracking but stops before threat ends.",
      "Does not track runner, creating free opponent or clear danger.",
    ] },
    { name: "Distance", levels: [
      "Stays close enough to help if presser is beaten, but far enough not to be beaten by same touch/pass.",
      "Slightly too close or far, but can still delay next action.",
      "Too close/far; cannot affect next action quickly.",
      "Distance makes support useless.",
    ] },
    { name: "Scanning", levels: [
      "Looks at ball and checks runner/space before or during press, then adjusts position.",
      "Scans once but does not fully adjust.",
      "Looks only at ball but reacts late to runner/space.",
      "No scan; loses runner or leaves dangerous space.",
    ] },
    { name: "Blocking lanes", levels: [
      "Position blocks pass/dribble lane behind presser and forces opponent away from goal/danger.",
      "Blocks one lane but leaves another clear dangerous lane.",
      "Tries to block but angle does not affect opponent’s choice.",
      "Blocks no lane; opponent has easy forward pass/dribble.",
    ] },
    { name: "Recovery movement", levels: [
      "After ball/opponent moves, sprints back goal-side or inside and can affect next action.",
      "Recovers in correct direction but too slow to affect immediate action.",
      "Reacts late or jogs, only becomes useful after danger reduces.",
      "Does not recover, stays ahead/wrong side.",
    ] },
    { name: "Communication", levels: [
      "Gives clear useful call before/during action: “left,” “right,” “cover,” “runner,” “I’m here.”",
      "Communicates, but late or not specific.",
      "Talks, but message does not help the press/support.",
      "No communication when support information is needed.",
    ] },
  ] },
  { section: "Mentality", skills: [
    { name: "Confidence / bravery", levels: [
      "Actively tries challenging actions: asks for ball, goes into 1v1, shoots/passes forward, presses opponent, or tries again after failure.",
      "Participates normally and does not avoid the ball, but mostly chooses safe actions.",
      "Sometimes avoids involvement: hides behind opponents, hesitates, or gives ball away quickly to avoid pressure.",
      "Repeatedly avoids the ball, duels, shots, or defending when clearly involved.",
    ] },
    { name: "Handling mistakes", levels: [
      "After mistake, immediately continues: presses, recovers position, asks for ball again, or tries same skill again.",
      "Shows short frustration but returns to play within 5 seconds.",
      "Stops, complains, walks, or loses focus for more than 5 seconds, but later rejoins.",
      "Mistake causes him to quit the action, blame others, refuse to continue, or disrupt play.",
    ] },
    { name: "Work rate", levels: [
      "Runs both ways: attacks, defends, presses, recovers, and supports repeatedly without needing reminders.",
      "Works hard in some phases, but sometimes stops after passing, losing ball, or being beaten.",
      "Needs repeated reminders to run, press, recover, or support.",
      "Mostly walks/stands during active play or avoids effort when team needs him.",
    ] },
    { name: "Concentration", levels: [
      "Follows play continuously: watches ball/opponents, reacts quickly, and is ready before receiving or defending.",
      "Mostly focused, with 1–2 short lapses that do not clearly hurt play.",
      "Several lapses: distracted, talking, looking away, late reactions, or misses instructions.",
      "Frequently disconnected from play; distraction directly causes lost ball, missed defensive action, or confusion.",
    ] },
    { name: "Coachability / listening", levels: [
      "Listens, shows he understood, and applies instruction in next relevant action.",
      "Listens and tries instruction, but applies it inconsistently.",
      "Needs instruction repeated or only follows after reminder.",
      "Ignores, talks over, argues, or does opposite of clear instruction.",
    ] },
    { name: "Teamwork / kindness", levels: [
      "Helps teammates: passes when teammate has better option, encourages, shares turns, supports after mistakes.",
      "Plays fairly and cooperates, but little active encouragement/help.",
      "Sometimes selfish, negative, excludes others, or complains, but corrects when reminded.",
      "Blames, mocks, refuses to pass/share, or disrupts teammate participation.",
    ] },
    { name: "Communication", levels: [
      "Uses clear useful communication: calls for ball, warns “man on,” gives support option, or organizes defending.",
      "Communicates sometimes, but mostly simple calls like name/ball.",
      "Rare communication or calls too late/unclear to help play.",
      "Silent when communication is needed, or communication distracts/confuses teammates.",
    ] },
    { name: "Enjoyment / fun", levels: [
      "Smiles/laughs, stays engaged, asks to continue, and fun does not reduce focus.",
      "Enjoys session and participates, but energy/fun drops during harder parts.",
      "Mixed mood: complains, bored, or distracted, but still participates.",
      "Does not want to play, refuses activities, or fun-seeking repeatedly stops the session/play.",
    ] },
  ] },
];
// Flat list of all skills, each with its section and a unique id
const SKILLS = RUBRIC.flatMap((sec) =>
  sec.skills.map((s) => ({ ...s, section: sec.section, id: `${sec.section} · ${s.name}` })));
// ---------- Saved state (on this device) ----------
const tallies = JSON.parse(localStorage.getItem("guideTallies") || "{}"); // id -> [points, ...]
const saveTallies = () => localStorage.setItem("guideTallies", JSON.stringify(tallies));
let current = Math.max(0, SKILLS.findIndex((s) => s.id === localStorage.getItem("guideSkill")));
// ---------- Skill picker ----------
function buildPicker() {
  let n = 0;
  $("skill").innerHTML = RUBRIC.map((sec) =>
    `<optgroup label="${esc(sec.section)}">${sec.skills.map((s) =>
      `<option value="${n++}">${esc(s.name)}</option>`).join("")}</optgroup>`
  ).join("");
  $("skill").onchange = () => go(Number($("skill").value));
  $("prevBtn").onclick = () => go((current - 1 + SKILLS.length) % SKILLS.length);
  $("nextBtn").onclick = () => go((current + 1) % SKILLS.length);
}
function go(i) {
  current = i;
  localStorage.setItem("guideSkill", SKILLS[i].id);
  render();
  window.scrollTo({ top: 0 });
}
// ---------- Page ----------
function render() {
  const s = SKILLS[current];
  $("skill").value = String(current);
  const taps = tallies[s.id] || [];
  const points = taps.reduce((a, b) => a + b, 0);
  const max = taps.length * 3;
  const pct = max ? (points * 100) / max : NaN;
  const score = max ? scoreFor(pct) : null;
  const levelsHtml = s.levels.map((text, i) => {
    const p = 3 - i;
    return `<li class="level c${p}">
      <span class="level-pts">${p}</span>
      <span class="level-text">${rich(text)}</span>
    </li>`;
  }).join("");
  const scaleRows = SCALE.map((r) =>
    `<tr class="${r.score === score ? "hit" : ""}">
      <td>${r.from}–${r.to === 100 ? "100" : r.to - 1}%</td>
      <td class="num">${r.score}</td>
    </tr>`).join("");
  $("guide").innerHTML = `
    <div class="card">
      <div class="skill-section">${esc(s.section)} · ${current + 1}/${SKILLS.length}</div>
      <h2 class="skill-title">${esc(s.name)}</h2>
      ${s.note ? `<div class="skill-note">${rich(s.note)}</div>` : ""}
      <ul class="levels">${levelsHtml}</ul>
    </div>
    <div class="card">
      <div class="card-head"><span>Counter</span><span class="muted">tap once per action</span></div>
      <div class="tap-row">
        ${[0, 1, 2, 3].map((p) => `<button class="tap c${p}" data-p="${p}">${p}</button>`).join("")}
      </div>
      <div class="result">
        <div class="result-nums">
          Actions: <b>${taps.length}</b><br>
          Points: <b>${points}</b> / ${max}<br>
          Percentage: <b>${max ? Math.round(pct) + "%" : "–"}</b>
        </div>
        <div class="result-score">
          <div class="big">${score ?? "–"}</div>
          <div class="lbl">score (1–5)</div>
        </div>
      </div>
      ${taps.length ? `<div class="history">${taps.map((p) => `<span class="hist c${p}">${p}</span>`).join("")}</div>` : ""}
      <div class="counter-actions">
        <button id="undoBtn" ${taps.length ? "" : "disabled"}>↶ Undo</button>
        <button id="resetBtn" ${taps.length ? "" : "disabled"}>Reset</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span>How the score is calculated</span></div>
      <ol class="how">
        <li>Every observed action gets <b>0–3 points</b> using the descriptions above.</li>
        <li>Add up all points. Max = number of actions × 3.</li>
        <li>Percentage = points ÷ max.</li>
        <li>Convert the percentage to a score with the table below.</li>
      </ol>
      <table class="scale">
        <thead><tr><th>Percentage</th><th style="text-align:center">Score</th></tr></thead>
        <tbody>${scaleRows}</tbody>
      </table>
    </div>`;
  // --- Counter buttons ---
  $("guide").querySelectorAll(".tap").forEach((b) => {
    b.onclick = () => {
      (tallies[s.id] ||= []).push(Number(b.dataset.p));
      saveTallies();
      render();
    };
  });
  $("undoBtn").onclick = () => {
    tallies[s.id]?.pop();
    if (!tallies[s.id]?.length) delete tallies[s.id];
    saveTallies();
    render();
  };
  $("resetBtn").onclick = () => {
    if (!confirm(`Reset counter for "${s.name}"?`)) return;
    delete tallies[s.id];
    saveTallies();
    render();
  };
}
buildPicker();
render();