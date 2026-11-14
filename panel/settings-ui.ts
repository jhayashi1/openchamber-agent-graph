import { mountButton, mountCheckbox, mountSelect, mountSwitch } from "@openchamber/sdk/ui";
import { nodeColor, PALETTE_IDS, PALETTES, type PaletteId } from "./color";
import { autoPauseRange, DEFAULT_SETTINGS, RANGES, type AgentGraphSettings } from "./settings";

export const settingsCss = `
.ag-header-buttons { margin-left: auto; display: flex; gap: 2px; }
.ag-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; color: var(--oc-muted, gray); background: transparent; border: 0; border-radius: var(--oc-radius, 6px); cursor: pointer; }
.ag-icon-button:hover, .ag-icon-button[aria-expanded="true"] { color: var(--oc-fg, currentColor); background: var(--oc-hover, rgba(128, 128, 128, 0.18)); }
.ag-icon-button:focus-visible { outline: 2px solid var(--oc-focus, currentColor); outline-offset: 1px; }
.ag-icon-button svg { width: 16px; height: 16px; display: block; }
.ag-popover { position: absolute; top: 28px; right: 0; z-index: 10; box-sizing: border-box; width: 260px; max-width: 100%; max-height: calc(100% - 36px); overflow-y: auto; padding: 8px 12px 12px; font-size: 0.75rem; color: var(--oc-elevated-fg, currentColor); background: var(--oc-elevated, #fff); border: 1px solid var(--oc-border, rgba(128, 128, 128, 0.4)); border-radius: var(--oc-radius, 8px); box-shadow: var(--oc-sdk-float, 0 6px 20px rgba(0, 0, 0, 0.25)); }
.ag-popover[hidden] { display: none; }
.ag-popover:not([hidden]) { transform-origin: top right; animation: ag-popover-in 140ms ease-out; }
@keyframes ag-popover-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } }
@media (prefers-reduced-motion: reduce) { .ag-popover:not([hidden]) { animation-name: ag-popover-fade; } @keyframes ag-popover-fade { from { opacity: 0; } } }
.ag-setting { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; min-height: 24px; }
.ag-setting input[type="range"] { grid-column: 1 / -1; width: 100%; height: 16px; margin: 0; accent-color: var(--oc-primary, #3b82f6); }
.ag-setting-value { color: var(--oc-muted, gray); font-variant-numeric: tabular-nums; }
.ag-setting-colour { display: flex; align-items: center; gap: 8px; }
.ag-setting-colour .oc-sdk-check { width: auto; align-items: center; }
.ag-setting-colour .oc-sdk-check-label { font-size: 0.75rem; }
.ag-setting input[type="color"] { width: 28px; height: 20px; padding: 0; border: 1px solid var(--oc-border, rgba(128, 128, 128, 0.4)); border-radius: calc(var(--oc-radius, 6px) / 2); background: transparent; }
.ag-setting input:disabled { opacity: 0.4; }
.ag-popover .oc-sdk-check { padding: 2px 0; }
.ag-popover .oc-sdk-check-label, .ag-popover .oc-sdk-field-label, .ag-setting-name { font-size: 0.75rem; font-weight: 400; color: var(--oc-muted, gray); }
.ag-section-header { display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 4px 0 0; padding: 4px 6px; font: inherit; font-size: 0.8125rem; font-weight: 500; color: var(--oc-elevated-fg, currentColor); background: transparent; border: 0; border-radius: var(--oc-radius, 6px); cursor: pointer; text-align: left; }
.ag-section-header:hover { background: var(--oc-hover, rgba(128, 128, 128, 0.18)); }
.ag-section-header:focus-visible { outline: 2px solid var(--oc-focus, currentColor); outline-offset: 1px; }
.ag-section-header svg { width: 12px; height: 12px; flex: none; transition: transform 150ms ease; }
.ag-section-header[aria-expanded="true"] svg { transform: rotate(90deg); }
.ag-section { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition: grid-template-rows 150ms ease, opacity 150ms ease, visibility 150ms; }
.ag-section[data-open="true"] { grid-template-rows: 1fr; opacity: 1; visibility: visible; }
.ag-section-body { min-height: 0; overflow: hidden; padding: 0 6px; }
@media (prefers-reduced-motion: reduce) { .ag-section, .ag-section-header svg { transition: none; } }
.ag-palette-preview { display: flex; gap: 4px; margin: 4px 0 2px; }
.ag-palette-preview span { width: 14px; height: 14px; border-radius: 50%; }
.ag-reset { margin-top: 12px; }
.ag-reset .oc-sdk-btn { width: 100%; }
`;

const SVG_NS = "http://www.w3.org/2000/svg";
const GEAR_PATH =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

const PALETTE_SAMPLE_IDS = ["s1", "k2", "x", "s2", "k1", "y"];

type NumberKey = keyof typeof RANGES;
type ToggleKey = "beamsOn" | "autoPause" | "beamGlow" | "pulseRunning" | "waitingGlow" | "recencyFade" | "toolPulses";
type ColourKey = "beamColor" | "messageColor";

export function createSettingsPopover(
  initial: AgentGraphSettings,
  onChange: (settings: AgentGraphSettings) => void,
  initialSections: readonly string[] = [],
  onSectionsChange: (sections: string[]) => void = () => {},
) {
  let current = initial;
  let nodeCount = 0;
  const syncers: Array<() => void> = [];

  const button = document.createElement("button");
  button.className = "ag-icon-button ag-settings-button";
  button.type = "button";
  button.setAttribute("aria-label", "Graph settings");
  button.title = "Graph settings";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "ag-settings-popover");
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", GEAR_PATH);
  for (const [name, value] of Object.entries({
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })) {
    path.setAttribute(name, value);
  }
  icon.append(path);
  button.append(icon);

  const panel = document.createElement("div");
  panel.className = "ag-popover";
  panel.id = "ag-settings-popover";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Graph settings");
  panel.hidden = true;

  function update(patch: Partial<AgentGraphSettings>) {
    current = { ...current, ...patch };
    if (current.beamPauseMax < current.beamPauseMin) {
      current = "beamPauseMin" in patch ? { ...current, beamPauseMax: current.beamPauseMin } : { ...current, beamPauseMin: current.beamPauseMax };
    }
    for (const sync of syncers) sync();
    onChange(current);
  }

  let target: HTMLElement = panel;
  const openSections = new Set(initialSections);
  const sectionToggles = new Map<string, (open: boolean) => void>();

  function section(id: string, title: string, build: () => void) {
    const header = document.createElement("button");
    header.type = "button";
    header.className = "ag-section-header";
    header.id = `ag-section-${id}-header`;
    header.setAttribute("aria-controls", `ag-section-${id}`);
    const label = document.createElement("span");
    label.textContent = title;
    const chevron = document.createElementNS(SVG_NS, "svg");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    const chevronPath = document.createElementNS(SVG_NS, "path");
    chevronPath.setAttribute("d", "M9 6l6 6-6 6");
    for (const [name, value] of Object.entries({ fill: "none", stroke: "currentColor", "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round" })) {
      chevronPath.setAttribute(name, value);
    }
    chevron.append(chevronPath);
    header.append(label, chevron);
    const region = document.createElement("div");
    region.className = "ag-section";
    region.id = `ag-section-${id}`;
    region.setAttribute("role", "region");
    region.setAttribute("aria-labelledby", header.id);
    const body = document.createElement("div");
    body.className = "ag-section-body";
    region.append(body);
    const show = (open: boolean) => {
      header.setAttribute("aria-expanded", String(open));
      region.dataset.open = String(open);
    };
    show(openSections.has(id));
    sectionToggles.set(id, show);
    header.addEventListener("click", () => {
      const open = !openSections.has(id);
      if (open) openSections.add(id);
      else openSections.delete(id);
      show(open);
      onSectionsChange([...openSections]);
    });
    panel.append(header, region);
    target = body;
    build();
    target = panel;
  }

  function setSections(ids: readonly string[]) {
    openSections.clear();
    for (const id of ids) openSections.add(id);
    for (const [id, show] of sectionToggles) show(openSections.has(id));
  }

  function slider(key: NumberKey, label: string, unit: string, auto?: "min" | "max") {
    const row = document.createElement("label");
    row.className = "ag-setting";
    const name = document.createElement("span");
    name.className = "ag-setting-name";
    name.textContent = label;
    const value = document.createElement("span");
    value.className = "ag-setting-value";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(RANGES[key].min);
    input.max = String(RANGES[key].max);
    input.step = String(RANGES[key].step);
    input.addEventListener("input", () => update({ [key]: Number(input.value) }));
    syncers.push(() => {
      input.value = String(current[key]);
      const isAuto = auto !== undefined && current.autoPause;
      input.disabled = !current.beamsOn || isAuto;
      const shown = isAuto ? Math.round(autoPauseRange(nodeCount)[auto] * 10) / 10 : current[key];
      value.textContent = `${isAuto ? "auto " : ""}${shown} ${unit}`.trim();
    });
    row.append(name, value, input);
    target.append(row);
  }

  function toggle(key: ToggleKey, label: string) {
    const row = document.createElement("div");
    target.append(row);
    const control = mountSwitch(row, { label, checked: current[key], onChange: (checked) => update({ [key]: checked }) });
    syncers.push(() => control.update({ checked: current[key], disabled: (key === "beamGlow" || key === "autoPause") && !current.beamsOn }));
  }

  function colourRow(key: ColourKey, label: string, fallback: string) {
    const row = document.createElement("div");
    row.className = "ag-setting";
    const name = document.createElement("span");
    name.className = "ag-setting-name";
    name.textContent = label;
    const controls = document.createElement("span");
    controls.className = "ag-setting-colour";
    const themeRoot = document.createElement("span");
    const picker = document.createElement("input");
    picker.type = "color";
    picker.setAttribute("aria-label", label);
    const theme = mountCheckbox(themeRoot, {
      label: "Theme",
      checked: current[key] === "theme",
      onChange: (checked) => update({ [key]: checked ? "theme" : picker.value }),
    });
    picker.addEventListener("input", () => update({ [key]: picker.value }));
    syncers.push(() => {
      const isTheme = current[key] === "theme";
      theme.update({ checked: isTheme });
      picker.disabled = isTheme || (key === "beamColor" && !current.beamsOn);
      picker.value = isTheme ? fallback : current[key];
    });
    controls.append(themeRoot, picker);
    row.append(name, controls);
    target.append(row);
  }

  function paletteRow() {
    const row = document.createElement("div");
    target.append(row);
    const select = mountSelect(row, {
      label: "Palette",
      value: current.nodePalette,
      options: PALETTE_IDS.map((id) => ({ id, label: PALETTES[id].label })),
      onChange: (id) => update({ nodePalette: PALETTE_IDS.find((known) => known === id) ?? DEFAULT_SETTINGS.nodePalette }),
    });
    const preview = document.createElement("div");
    preview.className = "ag-palette-preview";
    preview.setAttribute("aria-hidden", "true");
    const dots = PALETTE_SAMPLE_IDS.map(() => preview.appendChild(document.createElement("span")));
    row.append(preview);
    syncers.push(() => {
      select.update({ value: current.nodePalette });
      dots.forEach((dot, index) => {
        dot.style.background = nodeColor(PALETTE_SAMPLE_IDS[index] ?? "", current.nodePalette);
      });
    });
  }

  section("nodes", "Nodes", () => {
    paletteRow();
    toggle("pulseRunning", "Pulse running agents");
    toggle("waitingGlow", "Glow waiting agents");
    toggle("recencyFade", "Fade older sessions");
    toggle("toolPulses", "Tool pulses");
  });
  section("beams", "Beams", () => {
    toggle("beamsOn", "Show beams");
    colourRow("beamColor", "Colour", "#60a5fa");
    slider("beamLength", "Length", "px");
    slider("beamSeconds", "Travel time", "s");
    toggle("autoPause", "Auto pause by graph size");
    slider("beamPauseMin", "Pause min", "s", "min");
    slider("beamPauseMax", "Pause max", "s", "max");
    slider("beamWidth", "Width", "px");
    toggle("beamGlow", "Glow");
  });
  section("message-edges", "Subagent edges", () => {
    colourRow("messageColor", "Colour", "#22d3ee");
    slider("messageOpacity", "Opacity", "%");
  });
  section("forces", "Physics", () => {
    slider("centerForce", "Center force", "");
    slider("hubPull", "Hub pull", "");
    slider("repelForce", "Repel force", "");
    slider("linkForce", "Link force", "");
    slider("linkDistance", "Link distance", "px");
  });

  const resetRoot = document.createElement("div");
  resetRoot.className = "ag-reset";
  panel.append(resetRoot);
  mountButton(resetRoot, { label: "Reset to defaults", variant: "outline", size: "sm", onClick: () => update({ ...DEFAULT_SETTINGS }) });

  function isOpen() {
    return !panel.hidden;
  }

  function setOpen(open: boolean, restoreFocus = false) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (!open && restoreFocus) button.focus();
  }

  function sync(settings: AgentGraphSettings) {
    current = settings;
    for (const fn of syncers) fn();
  }
  sync(initial);

  button.addEventListener("click", () => setOpen(!isOpen(), true));

  function setNodeCount(count: number) {
    if (count === nodeCount) return;
    nodeCount = count;
    for (const fn of syncers) fn();
  }

  return { button, panel, isOpen, setOpen, sync, setNodeCount, setSections };
}
