/* ===========================================================
   overlay.js - IMPROVED
   Draws the solved digits onto the transparent overlay canvas,
   replaying the recorded solver steps as an animation.
   NOW with cancellation support for reset button.
   Loaded AFTER solver.js, BEFORE app.js in index.html.
   =========================================================== */

let animationController = null;

/**
 * Replays a list of solver steps onto the overlay canvas, one at a time,
 * with a delay between each so the backtracking is visible.
 *
 * @param {Array} steps - array of [row, col, num, action] from solve()
 * @param {number[][]} origGrid - the ORIGINAL recognized grid (before solving)
 * @param {HTMLCanvasElement} canvas - the overlay canvas element
 * @param {CanvasRenderingContext2D} ctx - its 2d context
 * @returns {Promise<void>} resolves when the animation finishes
 */
function animateSolution(steps, origGrid, canvas, ctx) {
  return new Promise((resolve) => {
    // Cancel any previous animation
    if (animationController) {
      animationController.cancel = true;
    }

    const controller = { cancel: false };
    animationController = controller;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / 9;
    const cellH = height / 9;

    ctx.clearRect(0, 0, width, height);

    const speedSlider = document.getElementById("speedSlider");
    const delay = speedSlider ? parseInt(speedSlider.value, 10) : 40;

    let i = 0;
    let timeoutId = null;

    function next() {
      // Stop if animation was cancelled
      if (controller.cancel) {
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
        return;
      }

      if (i >= steps.length) {
        resolve();
        return;
      }

      const [row, col, num, action] = steps[i];
      i++;

      const x = col * cellW + cellW / 2;
      const y = row * cellH + cellH / 2;

      // Clear just this cell before redrawing
      ctx.clearRect(col * cellW, row * cellH, cellW, cellH);

      // Never draw over a cell that had a printed number in the original photo
      if (num !== 0 && origGrid[row][col] === 0) {
        ctx.font = `bold ${Math.floor(cellH * 0.52)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillStyle =
          action === "place"
            ? "rgba(74, 222, 128, 0.9)" // green = placing a number
            : "rgba(248, 113, 113, 0.85)"; // red = backtracking

        ctx.fillText(num, x, y);
      }

      timeoutId = setTimeout(next, delay);
    }

    next();
  });
}

/**
 * Renders the recognized/solved grid as an HTML <table> for the
 * "Recognized grid" preview panel underneath the camera view.
 *
 * @param {number[][]} orig - original recognized grid (0 = blank)
 * @param {number[][]|null} solved - solved grid, or null if not solved yet
 */
function renderTable(orig, solved) {
  const table = document.getElementById("sudokuTable");
  table.innerHTML = "";

  for (let row = 0; row < 9; row++) {
    const tr = document.createElement("tr");

    for (let col = 0; col < 9; col++) {
      const td = document.createElement("td");
      const value = orig[row][col];

      let classes = "";
      if (col === 2 || col === 5) classes += " box-right";
      if (row === 2 || row === 5) classes += " box-bottom";

      if (value !== 0) {
        td.textContent = value;
        td.className = "given" + classes;
      } else if (solved) {
        td.textContent = solved[row][col];
        td.className = "solved" + classes;
      } else {
        td.textContent = "";
        td.className = classes;
      }

      tr.appendChild(td);
    }

    table.appendChild(tr);
  }
}
