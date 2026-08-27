/**
 * The dog inspector (PRD §37).
 *
 * Essential precisely because the shipped design hides all of this from the
 * player. If the dog ever looks random, this panel is where we prove it wasn't --
 * every behaviour should be explainable from drives, personality, environment
 * or memory (§36).
 *
 * Never shown in the normal player experience; toggled with `d` or ?debug=1.
 */

import { placeMemory, recall } from "../dog/memory.js";
import { describePlayerModel, modelConfidence } from "../dog/learning.js";

export function renderInspector(el, sim) {
  const s = sim.state;
  const trace = sim.lastTrace;
  const mem = placeMemory(s.dog.memory, s.dog.spot);

  el.innerHTML = `
    <h3>Inspector <span class="hint">seed ${s.game.seed} · tick ${s.game.tick}</span></h3>

    ${section("Drives", bars(s.dog.drives))}
    ${section("Emotion", bars(s.dog.emotion) + row("expressed", sim.expressed))}
    ${section("Traits", bars(s.dog.traits))}

    ${section("Here", `
      ${row("place", s.dog.place)}
      ${row("spot", s.dog.spot)}
      ${row("stimuli", (s.world.stimuli[s.dog.spot] || []).join(", ") || "—")}
      ${row("familiarity", mem.familiarity.toFixed(3))}
      ${row("interesting", mem.associations.interesting.toFixed(3))}
      ${row("frightening", mem.associations.frightening.toFixed(3))}
      ${row("safe", mem.associations.safe.toFixed(3))}
    `)}

    ${section("Decision", trace ? traceTable(trace) : "<em>no decision yet</em>")}

    ${section("Memories here", recall(s.dog.memory, s.dog.spot)
      .map((e) => row(e.type + (e.subject ? ` (${e.subject})` : ""),
                      `imp ${e.importance.toFixed(2)} val ${e.valence.toFixed(2)}`)).join("")
      || "<em>none</em>")}

    ${section("Player model", `
      ${describePlayerModel(s.playerModel).map((t) => `<div class="note">${t}</div>`).join("")}
      ${row("confidence", modelConfidence(s.playerModel).toFixed(2))}
      ${row("observations", s.playerModel.observations)}
    `)}

    ${section("AI layer", `
      ${row("source", trace?.source || "—")}
      <div class="note">Phase 3 will add the Worker call here. Local utility AI
      is always the fallback (§25), so this never blocks.</div>
    `)}
  `;
}

/**
 * The utility breakdown. This is the single most useful thing in the panel:
 * it shows every candidate, every factor of the §7 formula, and which one won.
 */
function traceTable(trace) {
  const rows = trace.scored.slice(0, 9).map((s) => {
    const f = s.factors;
    const chosen = trace.chosen && s.id === trace.chosen.id;
    const short = trace.shortlist?.some((x) => x.id === s.id);
    return `<tr class="${chosen ? "chosen" : short ? "shortlisted" : ""}">
      <td>${chosen ? "▸ " : ""}${s.id}</td>
      <td class="num">${s.utility.toFixed(2)}</td>
      <td class="num">${f.drive.toFixed(2)}</td>
      <td class="num">${f.personality.toFixed(2)}</td>
      <td class="num">${f.environment.toFixed(2)}</td>
      <td class="num">${f.memory.toFixed(2)}</td>
      <td class="num">${f.expectation.toFixed(2)}</td>
      <td class="num">${f.situational.toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `<table class="trace">
    <tr><th>behaviour</th><th>util</th><th>drv</th><th>per</th><th>env</th><th>mem</th><th>exp</th><th>sit</th></tr>
    ${rows}
  </table>
  <div class="note">util = drv × per × env × mem × exp × sit + noise.
  Shortlisted candidates are within 62% of the best; the winner is drawn from
  them by weight, so she is not a pure argmax machine (§7).</div>`;
}

const section = (title, body) => `<section><h4>${title}</h4>${body}</section>`;
const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;

function bars(obj) {
  return Object.entries(obj).map(([k, v]) => {
    const pct = Math.round(Math.abs(v) * 100);
    const negative = v < 0;
    return `<div class="bar-row">
      <span>${k}</span>
      <div class="bar"><i class="${negative ? "neg" : ""}" style="width:${pct}%"></i></div>
      <b>${typeof v === "number" ? v.toFixed(2) : v}</b>
    </div>`;
  }).join("");
}
