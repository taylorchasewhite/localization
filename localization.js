/* global Processing */
"use strict";

const canvas = document.getElementById("weblocalization");
const status = document.getElementById("status");
const error = document.getElementById("error");

canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
canvas.addEventListener("keydown", event => {
	if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
		event.preventDefault();
	}
});

window.sketchReady = (async () => {
	const response = await fetch("web_localization.pde");
	if (!response.ok) throw new Error("Sketch request failed: HTTP " + response.status);
	const source = await response.text();
	if (typeof Processing !== "function") throw new Error("Processing.js could not be loaded.");
	const sketch = new Processing(canvas, source);
	const placeLandmark = sketch.mousePressed;
	sketch.mousePressed = () => {
		// Processing.js reports CSS pixels, but the sketch uses a 1000px world.
		const bounds = canvas.getBoundingClientRect();
		const x = sketch.mouseX;
		const y = sketch.mouseY;
		sketch.mouseX = x * canvas.width / bounds.width;
		sketch.mouseY = y * canvas.height / bounds.height;
		try {
			placeLandmark();
		} finally {
			sketch.mouseX = x;
			sketch.mouseY = y;
		}
	};
	status.textContent = "Click to add landmarks. Blue: Tupac. Pink: possible positions. Lower mean error is better.";
	return sketch;
})();

window.sketchReady.catch(reason => {
	status.textContent = "The localization simulation could not start.";
	error.hidden = false;
	error.textContent = reason.message || String(reason);
	console.error("Localization startup failed:", reason);
});
