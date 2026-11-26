import {Simulation, WORLD, TAU, wrap} from "./engine.mjs";

const $ = id => document.getElementById(id);
const map = $("map"), chart = $("chart");
const context = map.getContext("2d"), chartContext = chart.getContext("2d");
export let simulation = new Simulation();
let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
let speed = 1, accumulator = 0, lastFrame = performance.now(), lastMetrics = 0;
let fpsStart = lastFrame, frames = 0, fps = 0, pendingObservation = false;
let zoom = 1, panX = 0, panY = 0, drag = null;
let mapSize = {width: 1, height: 1}, chartSize = {width: 1, height: 1};
let camera = {scale: 1, x: 0, y: 0};
let displayedRobot = {...simulation.robot}, displayedEstimate = {...simulation.filter.estimate};
const costs = [];
const layers = {particles: true, sensors: true, truth: true};
const format = new Intl.NumberFormat("en-US");

function fatal(error) {
    console.error("Localization lab:", error);
    paused = true;
    $("fatal").hidden = false;
    $("fatal").textContent = "The lab stopped: " + (error.message || String(error)) + ". Reload or switch to Classic.";
    ["pause", "reset", "relocate", "speed"].forEach(id => { $(id).disabled = true; });
}
addEventListener("error", event => fatal(event.error || event.message));
addEventListener("unhandledrejection", event => fatal(event.reason));
if (!context || !chartContext) throw new Error("Canvas rendering is not supported.");

function announce(message) { $("announcement").textContent = message; }
function transport() {
    $("pause").querySelector("span").textContent = paused ? "Resume" : "Pause";
    $("pause").querySelector("use").setAttribute("href", paused ? "#i-play" : "#i-pause");
    $("pause").setAttribute("aria-pressed", String(paused));
}
function togglePause() {
    paused = !paused; accumulator = 0; transport();
    announce(paused ? "Simulation paused." : "Simulation running.");
    refresh();
}
function relocate() {
    simulation.relocate();
    displayedRobot = {...simulation.robot};
    pendingObservation = true;
    announce(paused ? "Robot relocated. Resume to let the filter recover." : "Robot relocated. The filter must recover from new sensor readings.");
    refresh();
}
function reset() {
    simulation = new Simulation({...simulation.settings, count: simulation.filter.count});
    displayedRobot = {...simulation.robot}; displayedEstimate = {...simulation.filter.estimate};
    pendingObservation = false; accumulator = 0; costs.length = 0;
    announce("Replaying seed 42 with the current sensor settings.");
    refresh(); drawChart();
}
$("pause").addEventListener("click", togglePause);
$("reset").addEventListener("click", reset);
$("relocate").addEventListener("click", relocate);
$("speed").addEventListener("click", () => {
    speed = speed === 4 ? 1 : speed * 2;
    $("speed").textContent = speed + "x";
    $("speed").setAttribute("aria-label", "Simulation speed: " + speed + "x");
    announce("Simulation speed set to " + speed + "x.");
});
for (const id of ["pause", "reset", "relocate", "speed"]) $(id).disabled = false;

const descriptions = {
    fused: "Lidar reads the walls. Four radio anchors resolve position. Together, they reduce ambiguity.",
    lidar: "Wall geometry is the only clue. Similar views can create competing hypotheses; recovery may take longer.",
    uwb: "Four radio ranges constrain position, not heading. Motion is needed to resolve orientation.",
};
document.querySelectorAll('[name="sensor-mode"]').forEach(input => {
    input.addEventListener("change", () => {
        simulation.configure({mode: input.value});
        $("sensor-description").textContent = descriptions[input.value];
        pendingObservation = true;
        announce(input.value.toUpperCase() + " sensing selected. Waiting for the next observation.");
        refresh();
    });
});
function range(id, key, formatValue) {
    $(id).addEventListener("input", () => {
        const value = $(id).valueAsNumber;
        simulation.configure({[key]: value});
        $(id + "-value").textContent = formatValue(value);
        pendingObservation = true;
        refresh();
    });
}
range("particles", "count", value => format.format(value));
range("noise", "noise", value => value + " cm");
range("beams", "beams", String);
range("motion", "motionNoise", value => value.toFixed(2) + "x");
Object.keys(layers).forEach(layer => {
    $("show-" + layer).addEventListener("change", event => { layers[layer] = event.target.checked; });
});
$("zoom-in").addEventListener("click", () => { zoom = Math.min(3, zoom * 1.25); });
$("zoom-out").addEventListener("click", () => { zoom = Math.max(0.7, zoom / 1.25); });
function fit() { zoom = 1; panX = 0; panY = 0; }
$("fit").addEventListener("click", fit);
map.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    map.focus({preventScroll: true});
    drag = {x: event.clientX, y: event.clientY, panX, panY};
    map.setPointerCapture(event.pointerId);
});
map.addEventListener("pointermove", event => {
    if (drag) {
        panX = Math.max(-mapSize.width, Math.min(mapSize.width, drag.panX + event.clientX - drag.x));
        panY = Math.max(-mapSize.height, Math.min(mapSize.height, drag.panY + event.clientY - drag.y));
    }
    const rect = map.getBoundingClientRect();
    const x = (event.clientX - rect.left - camera.x) / camera.scale / 100;
    const y = (event.clientY - rect.top - camera.y) / camera.scale / 100;
    $("coordinates").textContent = `X ${x.toFixed(2)} m / Y ${y.toFixed(2)} m`;
});
map.addEventListener("pointerup", () => { drag = null; });
map.addEventListener("pointercancel", () => { drag = null; });
map.addEventListener("lostpointercapture", () => { drag = null; });
map.addEventListener("pointerleave", () => { if (!drag) $("coordinates").textContent = "SEED 0042 / DRAG TO PAN"; });
map.addEventListener("keydown", event => {
    if (event.code === "Space") { event.preventDefault(); togglePause(); }
    else if (event.key.toLowerCase() === "k") relocate();
    else if (event.key === "Escape") fit();
});

function sizeCanvas(canvas) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    return {width, height};
}
const resize = new ResizeObserver(() => {
    mapSize = sizeCanvas(map); chartSize = sizeCanvas(chart); drawChart();
});
// The first animation frame can precede ResizeObserver's initial delivery.
mapSize = sizeCanvas(map);
chartSize = sizeCanvas(chart);
resize.observe(map); resize.observe(chart);

function rounded(x, y, w, h, radius, fill, stroke) {
    context.beginPath(); context.roundRect(x, y, w, h, radius);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.stroke(); }
}
function path(points, xKey, yKey, color, width) {
    if (!points.length) return;
    context.beginPath();
    points.forEach((point, index) => {
        if (!index) context.moveTo(point[xKey], point[yKey]); else context.lineTo(point[xKey], point[yKey]);
    });
    context.strokeStyle = color; context.lineWidth = width / camera.scale; context.stroke();
}
function poseMarker(pose, color, estimate) {
    context.save();
    context.translate(pose.x, pose.y); context.rotate(pose.heading);
    context.strokeStyle = color; context.fillStyle = estimate ? "#123f37" : "#352b24";
    context.lineWidth = 1.5 / camera.scale;
    context.beginPath(); context.arc(0, 0, estimate ? 20 : 14, 0, TAU); context.fill(); context.stroke();
    if (estimate) {
        context.setLineDash([3 / camera.scale, 4 / camera.scale]);
        context.beginPath(); context.arc(0, 0, 28, 0, TAU); context.stroke(); context.setLineDash([]);
    }
    context.fillStyle = color;
    context.beginPath(); context.moveTo(estimate ? 22 : 19, 0); context.lineTo(-6, -7); context.lineTo(-3, 0); context.lineTo(-6, 7); context.closePath(); context.fill();
    context.restore();
}
function drawWorld() {
    const {width, height} = mapSize;
    if (width <= 62 || height <= 85) return;
    context.clearRect(0, 0, width, height);
    camera.scale = Math.min((width - 62) / WORLD.width, (height - 85) / WORLD.height) * zoom;
    camera.x = (width - WORLD.width * camera.scale) / 2 + panX;
    camera.y = (height - WORLD.height * camera.scale) / 2 + panY + 6;
    const s = camera.scale;
    context.save(); context.translate(camera.x, camera.y); context.scale(s, s);
    context.lineWidth = 1 / s;
    rounded(0, 0, WORLD.width, WORLD.height, 5, "#101f2d", "#4c6075");
    context.beginPath();
    for (let x = 50; x < WORLD.width; x += 50) { context.moveTo(x, 0); context.lineTo(x, WORLD.height); }
    for (let y = 50; y < WORLD.height; y += 50) { context.moveTo(0, y); context.lineTo(WORLD.width, y); }
    context.strokeStyle = "#6689a315"; context.lineWidth = 0.65 / s; context.stroke();
    context.font = `${8 / s}px ui-monospace, monospace`; context.fillStyle = "#7992aa";
    context.textAlign = "center";
    for (let x = 100; x < WORLD.width; x += 100) context.fillText(String(x / 100), x, -9 / s);
    context.textAlign = "right";
    for (let y = 100; y < WORLD.height; y += 100) context.fillText(String(y / 100), -9 / s, y + 3 / s);

    context.setLineDash([3 / s, 8 / s]);
    path([...WORLD.route, WORLD.route[0]], "x", "y", "#a1b8c11a", 1);
    context.setLineDash([]);
    for (const box of WORLD.obstacles) {
        context.lineWidth = 1 / s;
        rounded(box.x + 6, box.y + 7, box.w, box.h, 4, "#050c1760");
        rounded(box.x, box.y, box.w, box.h, 4, "#203347", "#435d74");
        context.save(); context.beginPath(); context.rect(box.x, box.y, box.w, box.h); context.clip();
        context.beginPath();
        for (let x = box.x - box.h; x < box.x + box.w; x += 18) {
            context.moveTo(x, box.y); context.lineTo(x + box.h, box.y + box.h);
        }
        context.strokeStyle = "#7194b019"; context.lineWidth = 0.6 / s; context.stroke(); context.restore();
        context.fillStyle = "#b1c5d8"; context.textAlign = "center"; context.font = `${8 / s}px ui-monospace, monospace`;
        const label = s < 0.45 ? box.label.replace("STORAGE ", "S-").replace("CHARGING", "CHARGE") : box.label;
        context.fillText(label, box.x + box.w / 2, box.y + box.h / 2 + 3 / s);
    }
    if (simulation.settings.mode !== "lidar") {
        WORLD.anchors.forEach((a, index) => {
            context.strokeStyle = "#69b4d17a"; context.lineWidth = 1 / s;
            context.beginPath(); context.arc(a.x, a.y, 14, 0, TAU); context.stroke();
            context.save(); context.translate(a.x, a.y); context.rotate(Math.PI / 4);
            context.fillStyle = "#83d8f1"; context.fillRect(-4, -4, 8, 8); context.restore();
            context.fillStyle = "#8bbbd1"; context.font = `${7 / s}px ui-monospace, monospace`; context.textAlign = "center";
            context.fillText("U" + (index + 1), a.x, a.y + 28);
        });
    }
    if (layers.truth) path(simulation.trail, "x", "y", "#efb77745", 1.2);
    path(simulation.trail, "ex", "ey", "#9ef4d154", 1.3);
    if (layers.sensors && layers.truth && !pendingObservation) {
        const readings = simulation.observation.ranges;
        if (simulation.settings.mode !== "uwb") {
            context.beginPath();
            for (let i = 0; i < readings.length; i++) {
                const angle = displayedRobot.heading + i * TAU / readings.length;
                context.moveTo(displayedRobot.x, displayedRobot.y);
                context.lineTo(displayedRobot.x + readings[i] * Math.cos(angle), displayedRobot.y + readings[i] * Math.sin(angle));
            }
            context.strokeStyle = "#98a8ef36"; context.lineWidth = 0.85 / s; context.stroke();
            context.beginPath();
            for (let i = 0; i < readings.length; i++) {
                const angle = displayedRobot.heading + i * TAU / readings.length;
                const x = displayedRobot.x + readings[i] * Math.cos(angle), y = displayedRobot.y + readings[i] * Math.sin(angle);
                context.moveTo(x + 2 / s, y); context.arc(x, y, 2 / s, 0, TAU);
            }
            context.fillStyle = "#a9bdf1aa"; context.fill();
        }
        if (simulation.settings.mode !== "lidar") {
            context.setLineDash([2 / s, 9 / s]);
            context.beginPath();
            for (const a of WORLD.anchors) { context.moveTo(a.x, a.y); context.lineTo(displayedRobot.x, displayedRobot.y); }
            context.strokeStyle = "#6ac7d923"; context.lineWidth = 0.75 / s; context.stroke(); context.setLineDash([]);
        }
    }
    const filter = simulation.filter;
    if (layers.particles) {
        context.beginPath();
        for (let i = 0; i < filter.count; i++) {
            context.moveTo(filter.x[i] + 1.1 / s, filter.y[i]);
            context.arc(filter.x[i], filter.y[i], 1.1 / s, 0, TAU);
        }
        context.fillStyle = "#79cdea75"; context.fill();
    }
    if (simulation.steps) {
        const e = filter.estimate;
        const delta = Math.sqrt((e.xx - e.yy) ** 2 + 4 * e.xy ** 2);
        const major = Math.sqrt(Math.max(0.01, (e.xx + e.yy + delta) / 2) * 5.991);
        const minor = Math.sqrt(Math.max(0.01, (e.xx + e.yy - delta) / 2) * 5.991);
        context.beginPath(); context.ellipse(displayedEstimate.x, displayedEstimate.y, major, minor, Math.atan2(2 * e.xy, e.xx - e.yy) / 2, 0, TAU);
        context.fillStyle = "#9ef4d113"; context.fill(); context.strokeStyle = "#9ef4d199"; context.lineWidth = 1 / s; context.stroke();
        poseMarker(displayedEstimate, "#9ef4d1", true);
    }
    if (layers.truth) poseMarker(displayedRobot, "#efb777", false);
    context.restore();
    document.querySelector(".scale > span").style.width = (100 * s) + "px";
}

function drawChart() {
    const ctx = chartContext, {width: w, height: h} = chartSize, history = simulation.history;
    ctx.clearRect(0, 0, w, h);
    const ceiling = Math.max(25, ...history.map(p => Math.max(p.error, p.spread))) * 1.15;
    ctx.strokeStyle = "#8196b420"; ctx.lineWidth = 1;
    for (const y of [4, h / 2, h - 4]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (!history.length) {
        ctx.fillStyle = "#8b9fb8"; ctx.font = "8px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText("AWAITING OBSERVATIONS", w / 2, h / 2 - 7);
        return;
    }
    const x = record => (record.time - simulation.time + 30) / 30 * w;
    const y = value => h - 4 - value / ceiling * (h - 9);
    for (const key of ["spread", "error"]) {
        ctx.beginPath();
        history.forEach((record, i) => { if (i) ctx.lineTo(x(record), y(record[key])); else ctx.moveTo(x(record), y(record[key])); });
        ctx.lineWidth = key === "error" ? 1.5 : 1;
        ctx.strokeStyle = key === "error" ? "#9ef4d1" : "#8298d2";
        ctx.setLineDash(key === "spread" ? [3, 3] : []); ctx.stroke(); ctx.setLineDash([]);
        if (key === "error") {
            ctx.lineTo(w, h); ctx.lineTo(x(history[0]), h); ctx.closePath();
            const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, "#9ef4d12c"); gradient.addColorStop(1, "#9ef4d100");
            ctx.fillStyle = gradient; ctx.fill();
        }
    }
    $("chart-range").textContent = "0 - " + (ceiling / 100).toFixed(1) + " m";
    chart.setAttribute("aria-label", `Last 30 simulated seconds: position error ${(simulation.error / 100).toFixed(3)} meters; posterior spread ${(simulation.filter.estimate.spread / 100).toFixed(3)} meters.`);
}

function refresh() {
    const sim = simulation, filter = sim.filter, valid = sim.steps > 0 && !pendingObservation;
    $("position-error").textContent = valid ? (sim.error / 100).toFixed(3) : "--";
    $("heading-error").textContent = valid ? (sim.headingError * 180 / Math.PI).toFixed(1) : "--";
    $("ess").textContent = valid ? format.format(Math.round(filter.ess)) : "--";
    $("ess-total").textContent = "/ " + format.format(filter.count);
    if (costs.length) {
        const sorted = [...costs].sort((a, b) => a - b);
        $("filter-time").textContent = sorted[Math.floor((sorted.length - 1) * 0.95)].toFixed(1);
    } else $("filter-time").textContent = "--";
    $("frame-rate").textContent = (paused ? "Paused / " : fps ? Math.round(fps) + " fps / " : "") + "p95 update cost";
    $("clock").textContent = String(Math.floor(sim.time / 60)).padStart(2, "0") + ":" + (sim.time % 60).toFixed(1).padStart(4, "0");
    $("scan-label").textContent = sim.settings.mode === "fused" ? "LIDAR + UWB" : sim.settings.mode.toUpperCase() + " ONLY";
    const status = $("tracking");
    const tracking = filter.stableSteps >= 8 && !pendingObservation;
    const text = paused ? "PAUSED" : pendingObservation ? "AWAITING SCAN" : tracking ? "TRACKING" : sim.time > 3 ? "REACQUIRING" : "ACQUIRING";
    status.className = "state " + (paused ? "paused" : tracking ? "tracking" : "acquiring");
    status.innerHTML = "<i></i>" + text;
    $("resampling").textContent = !sim.steps ? "Awaiting first scan" : filter.resampled ? "ESS < 55% / " + filter.resamples + " total" : "Posterior retained";
    drawChart();
}

function smoothPose(display, target, amount) {
    display.x += (target.x - display.x) * amount;
    display.y += (target.y - display.y) * amount;
    display.heading = wrap(display.heading + wrap(target.heading - display.heading) * amount);
}
function frame(timestamp) {
    const elapsed = Math.min(0.1, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (!document.hidden) {
        frames++;
        if (timestamp - fpsStart > 1000) {
            fps = frames * 1000 / (timestamp - fpsStart); frames = 0; fpsStart = timestamp;
        }
        if (!paused) {
            accumulator = Math.min(0.4, accumulator + elapsed * speed);
            while (accumulator >= 0.1) {
                const start = performance.now();
                simulation.step();
                costs.push(performance.now() - start);
                if (costs.length > 60) costs.shift();
                pendingObservation = false; accumulator -= 0.1;
            }
            smoothPose(displayedRobot, simulation.robot, 1 - Math.exp(-elapsed * 20));
            smoothPose(displayedEstimate, simulation.filter.estimate, 1 - Math.exp(-elapsed * 20));
        }
        drawWorld();
        if (timestamp - lastMetrics > 180) { refresh(); lastMetrics = timestamp; }
    } else {
        accumulator = 0; frames = 0; fpsStart = timestamp;
    }
    requestAnimationFrame(frame);
}
transport(); refresh();
announce(paused ? "Reduced motion is enabled. Press Resume to start the experiment." : "Experiment running. The particle filter is finding the robot.");
requestAnimationFrame(frame);
