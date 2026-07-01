/* ===========================================================
   app.js - IMPROVED
   Webcam handling + capture + wiring solver/overlay together.
   NOW WITH: Better animation cancellation on reset
   Loaded LAST in index.html, after solver.js and overlay.js.
   =========================================================== */

const video = document.getElementById("webcam");
const photoCanvas = document.getElementById("photoCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const photoCtx = photoCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");

const placeholderMsg = document.getElementById("placeholderMsg");
const scanLine = document.getElementById("scanLine");

const btnCamera = document.getElementById("btnCamera");
const btnCapture = document.getElementById("btnCapture");
const btnAnimate = document.getElementById("btnAnimate");
const btnReset = document.getElementById("btnReset");

const statusText = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");
const gridPreview = document.getElementById("gridPreview");
const cellsSolved = document.getElementById("cellsSolved");
const solveTime = document.getElementById("solveTime");
const errorMsg = document.getElementById("errorMsg");
const helpBox = document.getElementById("helpBox");
const stepCounter = document.getElementById("stepCounter");

const speedSlider = document.getElementById("speedSlider");
const speedVal = document.getElementById("speedVal");

let stream = null;
let originalGrid = null;
let solvedGrid = null;
let solveSteps = [];

speedSlider.oninput = () => {
  speedVal.textContent = speedSlider.value + "ms";
};

function setStatus(msg, pct) {
  statusText.textContent = msg;
  if (pct !== undefined) progressFill.style.width = pct + "%";
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function clearError() {
  errorMsg.style.display = "none";
  helpBox.style.display = "none";
}

function showHelp(msg) {
  helpBox.textContent = msg;
  helpBox.style.display = "block";
}

/* ---------------------------------------------------------
   1. CAMERA
   --------------------------------------------------------- */

btnCamera.onclick = async () => {
  clearError();
  setStatus("Requesting camera permission…", 5);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError("Camera API not available in this browser context.");
    showHelp(
      "This usually means the page is not served over HTTPS/localhost. Make sure you opened this with Live Server, not by double-clicking the file.",
    );
    setStatus("Camera unavailable", 0);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { exact: 640 },
        height: { exact: 480 },
      },
    });

    video.srcObject = stream;
    await video.play();

    placeholderMsg.style.display = "none";
    btnCamera.disabled = true;
    btnCapture.disabled = false;
    setStatus("Camera live — align grid inside the frame markers", 20);
  } catch (err) {
    setStatus("Permission denied or no camera found", 0);

    if (
      err.name === "NotAllowedError" ||
      err.name === "PermissionDeniedError"
    ) {
      showError("Camera permission was blocked.");
      showHelp(
        'Click the camera/lock icon in your browser address bar, set Camera to "Allow", then click Start camera again.',
      );
    } else if (
      err.name === "NotFoundError" ||
      err.name === "DevicesNotFoundError"
    ) {
      showError("No camera was found on this device.");
      showHelp(
        "Connect a webcam, or open this page on a phone/laptop with a built-in camera.",
      );
    } else if (err.name === "NotReadableError") {
      showError("Camera is already in use by another app.");
      showHelp(
        "Close other apps/tabs using the camera (Zoom, Meet, another browser tab), then try again.",
      );
    } else {
      showError("Could not access camera: " + err.message);
      showHelp(
        "Try reloading the page, or check your OS camera privacy settings.",
      );
    }
  }
};

/* ---------------------------------------------------------
   2. CAPTURE + BACKEND GRID DETECTION + SOLVE
   --------------------------------------------------------- */

const BACKEND_URL = "http://localhost:8001/extract-and-solve";

btnCapture.onclick = async () => {
  clearError();
  btnCapture.disabled = true;
  btnAnimate.disabled = true;
  btnReset.disabled = false;
  solveSteps = [];

  const W = video.videoWidth || 640;
  const H = video.videoHeight || 480;
  photoCanvas.width = W;
  photoCanvas.height = H;
  overlayCanvas.width = W;
  overlayCanvas.height = H;

  photoCtx.drawImage(video, 0, 0, W, H);
  overlayCtx.clearRect(0, 0, W, H);

  scanLine.style.display = "block";
  setStatus("Reading grid from photo…", 35);

  try {
    const grid = await recognizeGrid(photoCanvas);
    scanLine.style.display = "none";

    if (
      !Array.isArray(grid) ||
      grid.length !== 9 ||
      !grid.every((r) => Array.isArray(r) && r.length === 9)
    ) {
      throw new Error("Invalid grid format returned");
    }

    originalGrid = grid.map((r) => [...r]);
    setStatus("Grid recognized — solving with backtracking…", 60);
    renderTable(originalGrid, null);
    gridPreview.style.display = "block";

    const t0 = performance.now();
    const working = grid.map((r) => [...r]);
    const steps = [];
    const solved = solve(working, steps);
    const t1 = performance.now();

    if (!solved) throw new Error("No solution found for this puzzle");

    solvedGrid = working;
    solveSteps = steps;
    const blanks = originalGrid.flat().filter((v) => v === 0).length;

    cellsSolved.textContent = `${blanks} cells filled`;
    solveTime.textContent = `Solved in ${
      t1 - t0 < 1 ? "<1" : (t1 - t0).toFixed(1)
    }ms · ${steps.length} steps`;
    setStatus("Solved! Animating solution overlay…", 80);

    renderTable(originalGrid, solvedGrid);
    await animateSolution(steps, originalGrid, overlayCanvas, overlayCtx);

    setStatus("Done — solution overlaid on image", 100);
    btnAnimate.disabled = false;
    stepCounter.textContent = `${steps.length} backtrack steps`;
  } catch (err) {
    scanLine.style.display = "none";
    showError("Error: " + err.message);
    setStatus("Failed — see error above", 0);
    btnCapture.disabled = false;
  }
};

/* ---------------------------------------------------------
   3. GRID RECOGNITION (Backend)
   --------------------------------------------------------- */

async function recognizeGrid(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Image = e.target.result;

          setStatus("Sending to backend…", 40);

          const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image: base64Image }),
          });

          if (!response.ok) {
            throw new Error(`Server error: HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.success && data.grid) {
            resolve(data.grid);
          } else {
            throw new Error(data.error || "Grid detection failed");
          }
        } catch (err) {
          reject(new Error("Backend: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(blob);
    });
  });
}

// Fallback: manual entry if backend fails
window.useManualEntry = () => {
  recognizeGrid = async () => {
    const input = window.prompt(
      "Backend error. Fallback to manual entry.\n\n" +
        "Type 81 digits (0 for blanks), comma-separated:\n" +
        "Example: 5,3,0,0,7,0,0,0,0,6,0,0,1,9,5,0,0,0,...",
    );
    if (!input) throw new Error("No grid entered");
    const nums = input
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (nums.length !== 81) {
      throw new Error(`Expected 81 numbers, got ${nums.length}`);
    }
    const grid = [];
    for (let r = 0; r < 9; r++) {
      grid.push(nums.slice(r * 9, r * 9 + 9));
    }
    return grid;
  };
  console.log("Switched to manual digit entry for next capture.");
};

/* ---------------------------------------------------------
   4. REPLAY + RESET
   --------------------------------------------------------- */

btnAnimate.onclick = async () => {
  if (!originalGrid || !solveSteps.length) return;
  btnAnimate.disabled = true;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  await animateSolution(solveSteps, originalGrid, overlayCanvas, overlayCtx);
  btnAnimate.disabled = false;
};

btnReset.onclick = () => {
  // CRITICAL: Cancel any running animation
  if (animationController) {
    animationController.cancel = true;
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  placeholderMsg.style.display = "flex";
  gridPreview.style.display = "none";

  btnCamera.disabled = false;
  btnCapture.disabled = true;
  btnAnimate.disabled = true;
  btnReset.disabled = true;

  originalGrid = null;
  solvedGrid = null;
  solveSteps = [];

  setStatus("Ready — start camera to begin", 0);
  clearError();
  stepCounter.textContent = "";
};
