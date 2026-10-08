// List of processes entered by the user.
// Each process looks like: { id: "P1", arrival: 0, burst: 8 }
let processes = [];
 
// Colors so each process looks different in the animation and Gantt chart
const COLORS = ["#f4a261", "#7fc8a9", "#f28482", "#8ab4f8", "#e9c46a",
                "#c9a7eb", "#90be6d", "#f7b7a3", "#84a59d", "#d4a5a5"];
let colorMap = {};            // process id -> color
 
// Data used by the animation
let sim = null;              // result returned by runSRTF()
let currentStep = 0;         // which step the animation is showing
let timer = null;            // setInterval handle
let paused = false;
 
// Shortcut to get an element by id
const $ = (id) => document.getElementById(id);
 
 
/* =====================================================
   2. PROCESS INPUT
   ===================================================== */
 
// Sample data from the project requirements
const SAMPLE = [
  { id: "P1", arrival: 0, burst: 8 },
  { id: "P2", arrival: 1, burst: 4 },
  { id: "P3", arrival: 2, burst: 2 },
  { id: "P4", arrival: 3, burst: 1 }
];
 
// Show a small error/info message under the form
function showMessage(text) {
  $("message").textContent = text;
}
 
// Suggest the next process id (P1, P2, P3 ...)
function suggestNextId() {
  let max = 0;
  processes.forEach((p) => {
    const num = parseInt(p.id.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return "P" + (max + 1);
}
 
// ADD PROCESS button
function addProcess() {
  const id = $("pid").value.trim().toUpperCase();
  const arrival = Number($("arrival").value);
  const burst = Number($("burst").value);
 
  // --- validation ---
  if (id === "") { showMessage("Please enter a process ID."); return; }
  if (processes.some((p) => p.id === id)) { showMessage("Process ID " + id + " already exists."); return; }
  if ($("arrival").value === "" || !Number.isInteger(arrival) || arrival < 0) {
    showMessage("Arrival time must be a whole number (0 or more)."); return;
  }
  if ($("burst").value === "" || !Number.isInteger(burst) || burst < 1) {
    showMessage("Burst time must be a whole number (1 or more)."); return;
  }
 
  processes.push({ id: id, arrival: arrival, burst: burst });
  showMessage("");
  renderProcessTable();
 
  // prepare the form for the next process
  $("pid").value = suggestNextId();
  $("arrival").value = 0;
  $("burst").value = 1;
}
 
// Remove one process by its id (used by the Remove button in each row)
function removeProcess(id) {
  processes = processes.filter((p) => p.id !== id);
  renderProcessTable();
  $("pid").value = suggestNextId();
}
 
// REMOVE LAST button
function removeLast() {
  if (processes.length > 0) removeProcess(processes[processes.length - 1].id);
}
 
// CLEAR ALL button
function clearAll() {
  stopTimer();
  processes = [];
  renderProcessTable();
  resetOutput();
  showMessage("");
  $("pid").value = "P1";
}
 
// LOAD SAMPLE button
function loadSample() {
  stopTimer();
  processes = SAMPLE.map((p) => ({ ...p }));   // copy so the original stays unchanged
  renderProcessTable();
  resetOutput();
  showMessage("");
  $("pid").value = suggestNextId();
}
 
// Draw the process table
function renderProcessTable() {
  const body = $("processBody");
  body.innerHTML = "";
 
  if (processes.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No processes yet. Add one or load the sample data.</td></tr>';
    return;
  }
 
  processes.forEach((p) => {
    const row = document.createElement("tr");
    row.innerHTML =
      "<td>" + p.id + "</td>" +
      "<td>" + p.arrival + "</td>" +
      "<td>" + p.burst + "</td>" +
      '<td><button class="remove-btn">Remove</button></td>';
    row.querySelector("button").addEventListener("click", () => removeProcess(p.id));
    body.appendChild(row);
  });
}
 
 
/* =====================================================
   3. SRTF ALGORITHM
   -----------------------------------------------------
   The function runSRTF() calculates the WHOLE schedule
   from the user's input. It simulates the CPU one time
   unit at a time, starting at time 0.
 
   For every time unit it saves one "step" object so the
   animation can replay it later.
   ===================================================== */
 
function runSRTF(inputList) {
 
  // Make a working copy of each process and add "remaining" time.
  // (We never change the user's original list.)
  const procs = inputList.map((p) => ({
    id: p.id,
    arrival: p.arrival,
    burst: p.burst,
    remaining: p.burst,     // remaining time starts equal to burst time
    completion: 0
  }));
 
  const steps = [];          // one entry per time unit
  let time = 0;              // current clock, starts at 0
  let finished = 0;          // how many processes are completed
  let running = null;        // process that used the CPU in the previous time unit
 
  // Keep going until every process is completed
  while (finished < procs.length) {
 
    const events = [];       // text messages for this time unit
 
    // ---- STEP 1: find processes that arrive exactly now ----
    const arrivals = procs.filter((p) => p.arrival === time);
    arrivals.forEach((p) => events.push(p.id + " arrives"));
 
    // ---- STEP 2: ready list = arrived AND not yet finished ----
    const ready = procs.filter((p) => p.arrival <= time && p.remaining > 0);
 
    // ---- STEP 3: CPU idle if nobody has arrived yet ----
    if (ready.length === 0) {
      events.push("CPU idle");
      steps.push({
        time: time, running: null, before: 0, after: 0,
        queue: [], events: events, type: "idle",
        message: events.join(" → ")
      });
      time++;
      continue;
    }
 
    // ---- STEP 4: pick the process with the SHORTEST REMAINING TIME ----
    let next = ready[0];
    for (const p of ready) {
      if (p.remaining < next.remaining) {
        next = p;                                  // strictly shorter -> better choice
      } else if (p.remaining === next.remaining) {
        // Tie-breaker: keep the process that is already running
        // (no pointless switch). Otherwise the earlier arrival wins.
        if (p === running) next = p;
        else if (next !== running && p.arrival < next.arrival) next = p;
      }
    }
 
    // ---- STEP 5: PREEMPTION CHECK ----
    // If a different process was running and it still has work left,
    // then the CPU is being taken away from it = preemption.
    let type = "run";
    if (running !== null && running.remaining > 0 && next !== running) {
      events.push(running.id + " preempted by " + next.id +
                  " (" + next.remaining + " < " + running.remaining + " remaining)");
      type = "preempt";
    }
 
    // ---- STEP 6: run the chosen process for ONE time unit ----
    const before = next.remaining;
    next.remaining = next.remaining - 1;
    const after = next.remaining;
 
    events.push(next.id + (next === running ? " continues" : " running"));
 
    // ---- STEP 7: check if it finished ----
    if (next.remaining === 0) {
      next.completion = time + 1;          // it finishes at the END of this time unit
      finished++;
      events.push(next.id + " completes at time " + next.completion);
      if (type === "run") type = "complete";
      else type = "preempt-complete";
    }
 
    // ---- STEP 8: save this step for the animation ----
    // Ready queue = processes waiting (everything in ready except the one running)
    const queue = ready
      .filter((p) => p !== next)
      .sort((a, b) => a.remaining - b.remaining)
      .map((p) => ({ id: p.id, remaining: p.remaining }));
 
    steps.push({
      time: time,
      running: next.id,
      before: before,
      after: after,
      queue: queue,
      events: events,
      type: type,
      message: events.join(" → ")
    });
 
    // Remember who used the CPU, then move the clock forward
    running = next;
    time++;
  }
 
  // ---- RESULTS: calculate TAT and WT for each process ----
  const results = procs.map((p) => {
    const tat = p.completion - p.arrival;   // Turnaround = Completion - Arrival
    const wt = tat - p.burst;               // Waiting    = Turnaround - Burst
    return { id: p.id, arrival: p.arrival, burst: p.burst,
             completion: p.completion, tat: tat, wt: wt };
  });
 
  // ---- AVERAGES ----
  let totalWT = 0, totalTAT = 0;
  results.forEach((r) => { totalWT += r.wt; totalTAT += r.tat; });
 
  return {
    steps: steps,
    results: results,
    avgWT: totalWT / results.length,
    avgTAT: totalTAT / results.length
  };
}
 
 
/* =====================================================
   4. ANIMATION
   -----------------------------------------------------
   runSRTF() already produced all the steps. Here we show
   them one by one using setInterval (a JavaScript timer).
   ===================================================== */
 
// START SIMULATION button
function startSimulation() {
  if (processes.length === 0) {
    showMessage("Add at least one process first.");
    return;
  }
  showMessage("");
  stopTimer();
  resetOutput();
 
  // Give every process a color
  colorMap = {};
  processes.forEach((p, i) => { colorMap[p.id] = COLORS[i % COLORS.length]; });
 
  // Run the algorithm on the user's input
  sim = runSRTF(processes);
  currentStep = 0;
  paused = false;
 
  $("ganttChart").innerHTML = "";
  $("pauseBtn").disabled = false;
  $("skipBtn").disabled = false;
  $("pauseBtn").textContent = "Pause";
 
  tick();                                         // show first step immediately
  timer = setInterval(tick, getDelay());          // then one step every X ms
}
 
// How long each step lasts (from the slider)
function getDelay() {
  return Number($("speed").value);
}
 
// Called once for every time unit
function tick() {
  if (currentStep >= sim.steps.length) {          // no more steps -> done
    finishSimulation();
    return;
  }
  showStep(currentStep);
  currentStep++;
}
 
// Update the whole screen for one step
function showStep(index) {
  const step = sim.steps[index];
 
  // Clock
  $("timeDisplay").textContent = step.time;
 
  // CPU box
  const cpuBox = $("cpuBox");
  if (step.running === null) {
    $("cpuName").textContent = "Idle";
    $("cpuRemaining").textContent = "Remaining: -";
    cpuBox.style.backgroundColor = "";
  } else {
    $("cpuName").textContent = step.running;
    $("cpuRemaining").textContent =
      "Remaining: " + step.before + " → " + step.after;
    cpuBox.style.backgroundColor = colorMap[step.running];
  }
  $("cpuStatus").textContent = step.message;
 
  // Restart the CSS animation class
  cpuBox.classList.remove("running", "preempted", "completed");
  void cpuBox.offsetWidth;                        // forces the browser to restart animation
  if (step.type === "preempt" || step.type === "preempt-complete") cpuBox.classList.add("preempted");
  else if (step.type === "complete") cpuBox.classList.add("completed");
  else cpuBox.classList.add("running");
 
  // Ready queue
  drawReadyQueue(step.queue);
 
  // Event log
  addLog(step);
 
  // Gantt chart (drawn up to this step)
  drawGantt(index);
}
 
// Draw the ready queue boxes
function drawReadyQueue(queue) {
  const box = $("readyQueue");
  box.innerHTML = "";
  if (queue.length === 0) {
    box.innerHTML = '<span class="empty">(empty)</span>';
    return;
  }
  queue.forEach((q) => {
    const item = document.createElement("div");
    item.className = "queue-item";
    item.style.backgroundColor = colorMap[q.id];
    item.innerHTML = q.id + "<small>left: " + q.remaining + "</small>";
    box.appendChild(item);
  });
}
 
// Add one line to the event log
function addLog(step) {
  const li = document.createElement("li");
  li.textContent = "Time " + step.time + " → " + step.message;
 
  if (step.type === "preempt" || step.type === "preempt-complete") li.className = "preempt";
  else if (step.type === "complete") li.className = "complete";
  else if (step.type === "idle") li.className = "idle";
 
  const log = $("logList");
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;               // auto scroll to newest line
}
 
// Pause / Resume button
function togglePause() {
  if (!sim) return;
  if (!paused) {
    stopTimer();
    paused = true;
    $("pauseBtn").textContent = "Resume";
  } else {
    paused = false;
    $("pauseBtn").textContent = "Pause";
    timer = setInterval(tick, getDelay());
  }
}
 
// Skip to End button: show all remaining steps at once
function skipToEnd() {
  if (!sim) return;
  stopTimer();
  while (currentStep < sim.steps.length) {
    showStep(currentStep);
    currentStep++;
  }
  finishSimulation();
}
 
// Called when every step has been shown
function finishSimulation() {
  stopTimer();
  const last = sim.steps[sim.steps.length - 1];
  $("timeDisplay").textContent = last.time + 1;
  $("cpuName").textContent = "Done";
  $("cpuRemaining").textContent = "All processes completed";
  $("cpuBox").style.backgroundColor = "";
  $("cpuStatus").textContent = "Simulation finished at time " + (last.time + 1);
  drawReadyQueue([]);
  $("pauseBtn").disabled = true;
  $("skipBtn").disabled = true;
  showResults();
}
 
function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
 
// Clear the animation, Gantt chart and results
function resetOutput() {
  sim = null;
  $("timeDisplay").textContent = "0";
  $("cpuName").textContent = "Idle";
  $("cpuRemaining").textContent = "Remaining: -";
  $("cpuBox").style.backgroundColor = "";
  $("cpuBox").classList.remove("running", "preempted", "completed");
  $("cpuStatus").textContent = 'Press "Start Simulation"';
  $("readyQueue").innerHTML = '<span class="empty">(empty)</span>';
  $("logList").innerHTML = "";
  $("ganttChart").innerHTML = '<span class="empty">The chart is drawn while the simulation runs.</span>';
  $("resultsBody").innerHTML = '<tr><td colspan="6" class="empty">Results appear after the simulation finishes.</td></tr>';
  $("avgWT").textContent = "-";
  $("avgTAT").textContent = "-";
  $("pauseBtn").disabled = true;
  $("skipBtn").disabled = true;
}
 
 
/* =====================================================
   5. GANTT CHART + RESULTS TABLE
   ===================================================== */
 
// Build the Gantt chart from the steps shown so far.
// Idea: if the same process runs in consecutive time units,
// join them into ONE block. A new block starts whenever the
// running process changes (that is a preemption / switch).
function drawGantt(upToIndex) {
  const blocks = [];
 
  for (let i = 0; i <= upToIndex; i++) {
    const step = sim.steps[i];
    const id = step.running === null ? "Idle" : step.running;
    const last = blocks[blocks.length - 1];
 
    if (last && last.id === id) {
      last.end = step.time + 1;                    // same process -> make block longer
    } else {
      blocks.push({ id: id, start: step.time, end: step.time + 1 });   // new block
    }
  }
 
  const chart = $("ganttChart");
  chart.innerHTML = "";
 
  blocks.forEach((b, i) => {
    const div = document.createElement("div");
    div.className = "gantt-block";
    div.style.flexGrow = b.end - b.start;          // wider block = longer execution
    div.style.flexBasis = (b.end - b.start) * 30 + "px";
    div.style.backgroundColor = b.id === "Idle" ? "#ddd" : colorMap[b.id];
    div.innerHTML =
      b.id +
      '<span class="t-start">' + b.start + "</span>" +
      // only the LAST block shows an end time (the others share it with the next block's start)
      (i === blocks.length - 1 ? '<span class="t-end">' + b.end + "</span>" : "");
    chart.appendChild(div);
  });
}
 
// Fill the results table and averages
function showResults() {
  const body = $("resultsBody");
  body.innerHTML = "";
 
  sim.results.forEach((r) => {
    const row = document.createElement("tr");
    row.innerHTML =
      "<td>" + r.id + "</td>" +
      "<td>" + r.arrival + "</td>" +
      "<td>" + r.burst + "</td>" +
      "<td>" + r.completion + "</td>" +
      "<td>" + r.tat + "</td>" +
      "<td>" + r.wt + "</td>";
    body.appendChild(row);
  });
 
  $("avgWT").textContent = sim.avgWT.toFixed(2);
  $("avgTAT").textContent = sim.avgTAT.toFixed(2);
}
 
 
/* =====================================================
   BUTTON EVENTS + STARTUP
   ===================================================== */
 
$("addBtn").addEventListener("click", addProcess);
$("removeLastBtn").addEventListener("click", removeLast);
$("clearBtn").addEventListener("click", clearAll);
$("sampleBtn").addEventListener("click", loadSample);
$("startBtn").addEventListener("click", startSimulation);
$("pauseBtn").addEventListener("click", togglePause);
$("skipBtn").addEventListener("click", skipToEnd);
 
// Speed slider: update the label, and restart the timer if running
$("speed").addEventListener("input", () => {
  $("speedLabel").textContent = (getDelay() / 1000).toFixed(1) + " s";
  if (timer !== null) {
    stopTimer();
    timer = setInterval(tick, getDelay());
  }
});
 
// Pressing Enter in the burst box adds the process
$("burst").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addProcess();
});
 
// Load the sample data when the page opens so it can be tested immediately
loadSample();
 