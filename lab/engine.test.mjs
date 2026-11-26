import {test} from "node:test";
import assert from "node:assert/strict";
import {Simulation, ParticleFilter, WORLD, isFree, raycast} from "./engine.mjs";

test("rays hit the drawn walls and obstacles, including parallel and tangent rays", () => {
    assert.equal(raycast(100, 100, 0), WORLD.maxRange);
    assert.ok(Math.abs(raycast(100, 100, Math.PI) - 100) < 1e-8);
    assert.ok(Math.abs(raycast(100, 100, -Math.PI / 2) - 100) < 1e-8);
    assert.ok(Math.abs(raycast(200, 250, 0) - 100) < 1e-8);
    assert.ok(Math.abs(raycast(370, 100, Math.PI / 2) - 85) < 1e-8);
    assert.equal(raycast(200, 185, 0), 100);
    assert.equal(isFree(305, 190), false);
    assert.equal(isFree(10, 200), false);
    assert.equal(isFree(285, 250), true);
    assert.equal(isFree(290, 250), false);
});

test("fused localization converges and recovers without a ground-truth reset", () => {
    for (const seed of [1, 42, 123]) {
        const sim = new Simulation({seed});
        for (let i = 0; i < 150; i++) {
            sim.step();
            if (i > 30) assert.equal(sim.filter.recovering, false, `seed ${seed}: normal motion is not a lost pose`);
        }
        assert.ok(sim.error < 12, `seed ${seed}: error ${sim.error} cm`);
        assert.ok(sim.headingError < 0.0873, `seed ${seed}: heading error`);
        assert.ok(sim.history.slice(-50).every(sample => sample.error < 20), `seed ${seed}: sustained tracking`);
        const before = {x: sim.filter.x.slice(), weights: sim.filter.weights.slice(), estimate: {...sim.filter.estimate}};
        sim.relocate();
        assert.deepEqual(sim.filter.x, before.x);
        assert.deepEqual(sim.filter.weights, before.weights);
        assert.deepEqual(sim.filter.estimate, before.estimate);
        let stable = 0, recoveredAt = null;
        for (let i = 0; i < 120; i++) {
            sim.step();
            stable = sim.error < 20 && sim.headingError < 0.15 ? stable + 1 : 0;
            if (stable === 10 && recoveredAt === null) recoveredAt = i + 1;
        }
        assert.ok(recoveredAt !== null && recoveredAt <= 80, `seed ${seed}: recovery took ${recoveredAt} steps`);
        assert.ok(sim.error < 12, `seed ${seed}: recovered error ${sim.error} cm`);
    }
});

test("sensor modes and zero/high noise preserve finite, normalized, collision-free hypotheses", () => {
    for (const mode of ["fused", "lidar", "uwb"]) {
        for (const noise of [0, 30]) {
            const sim = new Simulation({mode, noise, count: 400, motionNoise: 4});
            for (let step = 0; step < 40; step++) {
                sim.step();
                assert.ok(isFree(sim.robot.x, sim.robot.y));
                assert.ok(Number.isFinite(sim.error));
                assert.ok(sim.filter.ess > 0 && sim.filter.ess <= sim.filter.count + 1e-6);
                assert.ok(Math.abs(sim.filter.weights.reduce((a, b) => a + b) - 1) < 1e-10);
                for (let i = 0; i < sim.filter.count; i++) {
                    assert.ok(isFree(sim.filter.x[i], sim.filter.y[i]));
                    assert.ok(Number.isFinite(sim.filter.heading[i]));
                }
            }
        }
    }
});

test("systematic resampling uses an immutable population and supports live population changes", () => {
    const filter = new ParticleFilter({count: 400});
    filter.weights.fill(0);
    filter.weights[399] = 1;
    const expected = {x: filter.x[399], y: filter.y[399], heading: filter.heading[399]};
    filter.resample(800, 0);
    assert.equal(filter.count, 800);
    assert.ok(filter.x.every(x => x === expected.x));
    assert.ok(filter.y.every(y => y === expected.y));
    // Heading roughening is intentional, but parents must all come from the weighted ancestor.
    assert.ok(filter.heading.every(angle => Math.abs(angle - expected.heading) < 0.1));
    const sim = new Simulation();
    for (let i = 0; i < 40; i++) sim.step();
    const robot = {...sim.robot};
    sim.configure({count: 3000, beams: 32, noise: 12});
    assert.equal(sim.filter.count, 3000);
    assert.deepEqual(sim.robot, robot);
    for (let i = 0; i < 20; i++) sim.step();
    assert.ok(sim.error < 20);
    assert.throws(() => sim.configure({count: 0}), RangeError);
    assert.equal(sim.filter.count, 3000);
    assert.throws(() => sim.configure({noise: NaN}), RangeError);
    assert.throws(() => sim.configure({beams: 0}), RangeError);
    assert.throws(() => sim.configure({mode: "gps"}), RangeError);
});

test("fixed seed replays the same experiment and the route respects physical boundaries", () => {
    const a = new Simulation({count: 400}), b = new Simulation({count: 400});
    const visited = new Set();
    for (let i = 0; i < 500; i++) {
        a.step(); b.step();
        visited.add(a.waypoint);
        assert.ok(isFree(a.robot.x, a.robot.y));
    }
    assert.deepEqual(a.robot, b.robot);
    assert.deepEqual(a.filter.x, b.filter.x);
    assert.deepEqual(a.history, b.history);
    assert.equal(visited.size, WORLD.route.length, "robot should complete the entire route");
    assert.throws(() => a.step(2), RangeError);
});
