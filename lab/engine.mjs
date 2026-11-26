export const WORLD = Object.freeze({
    width: 1000, height: 700, radius: 14, maxRange: 650,
    obstacles: [
        {x: 300, y: 185, w: 140, h: 230, label: "STORAGE 01"},
        {x: 690, y: 410, w: 165, h: 160, label: "STORAGE 02"},
        {x: 750, y: 135, w: 135, h: 85, label: "CHARGING"},
    ],
    anchors: [{x: 55, y: 55}, {x: 945, y: 55}, {x: 945, y: 645}, {x: 55, y: 645}],
    route: [
        {x: 140, y: 120}, {x: 570, y: 120}, {x: 650, y: 300},
        {x: 925, y: 300}, {x: 925, y: 620}, {x: 570, y: 620},
        {x: 520, y: 470}, {x: 150, y: 530}, {x: 120, y: 300},
    ],
});
export const TAU = Math.PI * 2;
export const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class Random {
    constructor(seed = 42) { this.state = (seed >>> 0) || 1; }
    uniform() {
        let x = this.state;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.state = x >>> 0;
        return (this.state + 0.5) / 4294967296;
    }
    normal() {
        return Math.sqrt(-2 * Math.log(this.uniform())) * Math.cos(TAU * this.uniform());
    }
}

export function isFree(x, y, radius = WORLD.radius) {
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        x < radius || y < radius || x > WORLD.width - radius || y > WORLD.height - radius) return false;
    return WORLD.obstacles.every(box => {
        const dx = x - clamp(x, box.x, box.x + box.w);
        const dy = y - clamp(y, box.y, box.y + box.h);
        return dx * dx + dy * dy > radius * radius;
    });
}

export function raycast(x, y, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let nearest = Math.min(WORLD.maxRange,
        Math.abs(dx) < 1e-12 ? Infinity : (dx > 0 ? WORLD.width - x : -x) / dx,
        Math.abs(dy) < 1e-12 ? Infinity : (dy > 0 ? WORLD.height - y : -y) / dy);
    for (const box of WORLD.obstacles) {
        let near = -Infinity, far = Infinity;
        if (Math.abs(dx) < 1e-12) {
            if (x < box.x || x > box.x + box.w) continue;
        } else {
            const a = (box.x - x) / dx, b = (box.x + box.w - x) / dx;
            near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
        if (Math.abs(dy) < 1e-12) {
            if (y < box.y || y > box.y + box.h) continue;
        } else {
            const a = (box.y - y) / dy, b = (box.y + box.h - y) / dy;
            near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
        if (far >= Math.max(0, near) && near >= 0) nearest = Math.min(nearest, near);
    }
    return nearest;
}

function randomPose(rng) {
    let x, y;
    do { x = rng.uniform() * WORLD.width; y = rng.uniform() * WORLD.height; } while (!isFree(x, y));
    return {x, y, heading: rng.uniform() * TAU - Math.PI};
}

function move(pose, distance, turn) {
    const direction = pose.heading + turn / 2;
    const x = pose.x + distance * Math.cos(direction), y = pose.y + distance * Math.sin(direction);
    return {x: isFree(x, y) ? x : pose.x, y: isFree(x, y) ? y : pose.y, heading: wrap(pose.heading + turn)};
}

export function observe(pose, beams, noise, rng) {
    const ranges = new Float64Array(beams);
    for (let i = 0; i < beams; i++) {
        ranges[i] = clamp(raycast(pose.x, pose.y, pose.heading + i * TAU / beams) + noise * rng.normal(), 0, WORLD.maxRange);
    }
    const anchors = WORLD.anchors.map(a => Math.max(0, Math.hypot(a.x - pose.x, a.y - pose.y) + 2 * noise * rng.normal()));
    return {ranges, anchors};
}

export class ParticleFilter {
    constructor({count = 1600, seed = 42} = {}) {
        this.rng = new Random(seed);
        this.allocate(count);
        for (let i = 0; i < count; i++) this.randomize(i);
        this.weights.fill(1 / count);
        this.estimate = {x: 500, y: 350, heading: 0, xx: 80000, yy: 40000, xy: 0, mass: 0, spread: 350};
        this.ess = count;
        this.innovation = Infinity;
        this.resamples = 0;
        this.recovering = true;
        this.stableSteps = 0;
    }
    allocate(count) {
        if (!Number.isInteger(count) || count < 200 || count > 3000) throw new RangeError("Particle count must be 200–3000.");
        this.count = count;
        this.x = new Float64Array(count);
        this.y = new Float64Array(count);
        this.heading = new Float64Array(count);
        this.weights = new Float64Array(count);
    }
    randomize(i) {
        const pose = randomPose(this.rng);
        this.x[i] = pose.x; this.y[i] = pose.y; this.heading[i] = pose.heading;
    }
    predict(distance, turn, motionNoise = 1) {
        for (let i = 0; i < this.count; i++) {
            const d = distance + this.rng.normal() * (0.15 + Math.abs(distance) * 0.035) * motionNoise;
            const t = turn + this.rng.normal() * (0.006 + Math.abs(turn) * 0.04) * motionNoise;
            const angle = this.heading[i] + t / 2;
            const x = this.x[i] + d * Math.cos(angle), y = this.y[i] + d * Math.sin(angle);
            if (isFree(x, y)) { this.x[i] = x; this.y[i] = y; }
            this.heading[i] = wrap(this.heading[i] + t);
        }
        this.estimate = {...this.estimate, ...move(this.estimate, distance, turn)};
    }
    residual(pose, observation, mode) {
        let squared = 0, count = 0;
        if (mode !== "uwb") {
            for (let j = 0; j < observation.ranges.length; j++) {
                const delta = raycast(pose.x, pose.y, pose.heading + j * TAU / observation.ranges.length) - observation.ranges[j];
                // An occlusion boundary can change one beam abruptly without a lost pose.
                squared += Math.min(delta * delta, 10000); count++;
            }
        }
        if (mode !== "lidar") {
            for (let j = 0; j < WORLD.anchors.length; j++) {
                const a = WORLD.anchors[j];
                const delta = Math.hypot(a.x - pose.x, a.y - pose.y) - observation.anchors[j];
                squared += delta * delta; count++;
            }
        }
        return Math.sqrt(squared / count);
    }
    update(observation, {noise = 6, mode = "fused"} = {}) {
        if (!["fused", "lidar", "uwb"].includes(mode)) throw new RangeError("Unknown sensor mode.");
        const priorResidual = this.residual(this.estimate, observation, mode);
        this.recovering = priorResidual > Math.max(40, noise * 3);
        if (this.recovering) {
            // Global proposals recover from a changed pose using sensor disagreement, never ground truth.
            for (let i = 0; i < this.count; i++) {
                if (this.rng.uniform() < 0.3) this.randomize(i);
            }
            this.weights.fill(1 / this.count);
        }
        const sigma = Math.max(2, noise, this.recovering ? 28 : 0);
        let maxLog = -Infinity;
        const logs = new Float64Array(this.count);
        for (let i = 0; i < this.count; i++) {
            let score = Math.log(Math.max(this.weights[i], 1e-300));
            if (mode !== "uwb") {
                for (let j = 0; j < observation.ranges.length; j++) {
                    const expected = raycast(this.x[i], this.y[i], this.heading[i] + j * TAU / observation.ranges.length);
                    const z = (expected - observation.ranges[j]) / sigma;
                    // A uniform outlier component keeps a single bad beam from annihilating a hypothesis.
                    score += 0.45 * Math.log(0.95 * Math.exp(-0.5 * z * z) + 0.05 * sigma / WORLD.maxRange);
                }
            }
            if (mode !== "lidar") {
                for (let j = 0; j < WORLD.anchors.length; j++) {
                    const a = WORLD.anchors[j];
                    const z = (Math.hypot(a.x - this.x[i], a.y - this.y[i]) - observation.anchors[j]) / (sigma * 2);
                    score -= 0.5 * Math.min(z * z, 100);
                }
            }
            logs[i] = score; maxLog = Math.max(maxLog, score);
        }
        let sum = 0;
        for (let i = 0; i < this.count; i++) { this.weights[i] = Math.exp(logs[i] - maxLog); sum += this.weights[i]; }
        let squared = 0;
        for (let i = 0; i < this.count; i++) { this.weights[i] /= sum; squared += this.weights[i] ** 2; }
        this.ess = 1 / squared;
        this.measureEstimate();
        this.innovation = this.residual(this.estimate, observation, mode);
        const stable = this.estimate.spread < 20 && this.estimate.headingSpread < 0.15 &&
            this.estimate.mass > 0.7 && this.innovation < Math.max(20, noise * 3);
        this.stableSteps = stable && !this.recovering ? this.stableSteps + 1 : 0;
        this.resampled = this.ess < this.count * 0.55;
        if (this.resampled) this.resample(this.count, this.recovering ? 12 : 1.3);
        return this.estimate;
    }
    measureEstimate() {
        let best = 0;
        for (let i = 1; i < this.count; i++) if (this.weights[i] > this.weights[best]) best = i;
        let mass = 0, x = 0, y = 0, sin = 0, cos = 0;
        const included = [];
        for (let i = 0; i < this.count; i++) {
            if (Math.hypot(this.x[i] - this.x[best], this.y[i] - this.y[best]) > 150) continue;
            const w = this.weights[i];
            mass += w; x += w * this.x[i]; y += w * this.y[i];
            sin += w * Math.sin(this.heading[i]); cos += w * Math.cos(this.heading[i]);
            included.push(i);
        }
        x /= mass; y /= mass;
        let xx = 0, yy = 0, xy = 0;
        for (const i of included) {
            const dx = this.x[i] - x, dy = this.y[i] - y, w = this.weights[i] / mass;
            xx += w * dx * dx; yy += w * dy * dy; xy += w * dx * dy;
        }
        const resultant = Math.max(1e-12, Math.min(1, Math.hypot(sin, cos) / mass));
        this.estimate = {x, y, heading: Math.atan2(sin, cos), xx, yy, xy, mass,
            spread: Math.sqrt(xx + yy), headingSpread: Math.sqrt(-2 * Math.log(resultant))};
    }
    resample(count, roughness = 1.3) {
        const old = {x: this.x, y: this.y, heading: this.heading, weights: this.weights, count: this.count};
        this.allocate(count);
        let parent = 0, cumulative = old.weights[0];
        const offset = this.rng.uniform() / count;
        for (let i = 0; i < count; i++) {
            const target = offset + i / count;
            while (target > cumulative && parent < old.count - 1) cumulative += old.weights[++parent];
            const x = old.x[parent] + this.rng.normal() * roughness;
            const y = old.y[parent] + this.rng.normal() * roughness;
            const free = isFree(x, y);
            this.x[i] = free ? x : old.x[parent];
            this.y[i] = free ? y : old.y[parent];
            this.heading[i] = wrap(old.heading[parent] + this.rng.normal() * (roughness > 2 ? 0.09 : 0.009));
        }
        this.weights.fill(1 / count);
        this.resamples++;
    }
}

export class Simulation {
    constructor({seed = 42, count = 1600, noise = 6, beams = 16, mode = "fused", motionNoise = 1} = {}) {
        this.seed = seed;
        this.rng = new Random(seed);
        this.filter = new ParticleFilter({seed: seed + 1000, count});
        this.settings = {noise, beams, mode, motionNoise};
        this.configure(this.settings);
        this.robot = {...WORLD.route[0], heading: 0};
        this.waypoint = 1;
        this.time = 0; this.steps = 0;
        this.observation = observe(this.robot, beams, noise, this.rng);
        this.history = [];
        this.trail = [];
    }
    step(dt = 0.1) {
        if (!(dt > 0 && dt <= 0.2)) throw new RangeError("Simulation steps must be between 0 and 0.2 seconds.");
        let goal = WORLD.route[this.waypoint];
        if (Math.hypot(goal.x - this.robot.x, goal.y - this.robot.y) < 28) {
            this.waypoint = (this.waypoint + 1) % WORLD.route.length;
            goal = WORLD.route[this.waypoint];
        }
        const error = wrap(Math.atan2(goal.y - this.robot.y, goal.x - this.robot.x) - this.robot.heading);
        const turn = clamp(error, -1.6 * dt, 1.6 * dt);
        const distance = 58 * dt * Math.max(0, Math.cos(error));
        this.robot = move(this.robot,
            distance + this.rng.normal() * 0.15 * this.settings.motionNoise,
            turn + this.rng.normal() * 0.006 * this.settings.motionNoise);
        this.filter.predict(distance, turn, this.settings.motionNoise);
        this.observation = observe(this.robot, this.settings.beams, this.settings.noise, this.rng);
        this.filter.update(this.observation, this.settings);
        this.time += dt; this.steps++;
        const estimate = this.filter.estimate;
        this.error = Math.hypot(estimate.x - this.robot.x, estimate.y - this.robot.y);
        this.headingError = Math.abs(wrap(estimate.heading - this.robot.heading));
        this.history.push({time: this.time, error: this.error, spread: estimate.spread});
        if (this.history.length > 300) this.history.shift();
        this.trail.push({x: this.robot.x, y: this.robot.y, ex: estimate.x, ey: estimate.y});
        if (this.trail.length > 240) this.trail.shift();
    }
    relocate() {
        const candidates = WORLD.route.map((point, index) => ({point, index}))
            .filter(({point}) => Math.hypot(point.x - this.robot.x, point.y - this.robot.y) > 450);
        const selected = candidates[Math.floor(this.rng.uniform() * candidates.length)];
        this.robot = {...selected.point, heading: this.rng.uniform() * TAU - Math.PI};
        this.waypoint = (selected.index + 1) % WORLD.route.length;
        this.trail = [];
        // Do not reset or inform the filter: this is the kidnapped-robot experiment.
    }
    configure(values) {
        const next = {...this.settings, ...values};
        if (!Number.isFinite(next.noise) || next.noise < 0 || next.noise > 40) throw new RangeError("Sensor noise must be 0–40 cm.");
        if (!Number.isInteger(next.beams) || next.beams < 4 || next.beams > 32) throw new RangeError("Use 4–32 lidar beams.");
        if (!["fused", "lidar", "uwb"].includes(next.mode)) throw new RangeError("Unknown sensor mode.");
        if (!Number.isFinite(next.motionNoise) || next.motionNoise < 0 || next.motionNoise > 4) throw new RangeError("Motion noise must be 0–4.");
        if (values.count !== undefined && values.count !== this.filter.count) this.filter.resample(values.count, 2);
        this.settings = next;
        this.filter.stableSteps = 0;
    }
}
