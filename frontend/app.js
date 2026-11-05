/**
 * app.js — Liber8 Clinical Exposure Dashboard
 * ============================================
 * Premium Oceanic Glassmorphism Edition
 *
 * Responsibilities:
 *   • Real-time WebSocket/REST polling (GET /state) every 1000ms.
 *   • Biometric Chart.js visualisations for Heart Rate (emerald) and EDA (amber).
 *   • Dynamic Oceanic UI/UX reactive updates (gauges, glowing panic bar,
 *     environmental stage pills, and animated SVG radial sweeps).
 *   • Authoritative clinician command transmission (POST /command).
 *   • Interactive session timer & post-session STAI psychometric reporting.
 */

'use strict';

/* =========================================================================
   SYSTEM CONFIGURATION & CONSTANTS
   ========================================================================= */

const PANIC_MAX_SECONDS   = 5;      // Must match backend config.py PANIC_DURATION_SECONDS
const POLL_INTERVAL_MS    = 1000;   // 1s sampling rate matching biosensor streams
const CHART_MAX_POINTS    = 60;     // 60 data points rolling window (~60s telemetry)
const API_BASE            = '';     // Same-origin relative path for FastAPI

/* =========================================================================
   COLOR & METRIC UTILITIES
   ========================================================================= */

/**
 * Categorises normalized stress scores into clinical severity tiers.
 * @param {number} score - Normalized [0.0, 1.0]
 * @returns {{ tier: string, label: string, textColor: string, tagText: string, tagClass: string }}
 */
function evaluateStressTier(score) {
  if (score < 0.40) {
    return {
      tier: 'LOW',
      label: 'LOW',
      textColor: 'text-teal-300',
      tagText: 'STABLE',
      tagClass: 'text-teal-400 font-semibold',
    };
  } else if (score < 0.85) {
    return {
      tier: 'ELEVATED',
      label: 'ELEV',
      textColor: 'text-amber-300',
      tagText: 'ELEVATED AROUSAL',
      tagClass: 'text-amber-400 font-semibold',
    };
  } else {
    return {
      tier: 'PANIC',
      label: 'PANIC',
      textColor: 'text-rose-400',
      tagText: 'INTERVENTION RISK',
      tagClass: 'text-rose-400 font-bold animate-pulse',
    };
  }
}

/**
 * Formats numeric values to fixed decimal precision with NaN safety.
 * @param {number|string} val
 * @param {number} dp
 * @returns {string}
 */
function fmt(val, dp = 1) {
  const num = parseFloat(val);
  return isNaN(num) ? (0).toFixed(dp) : num.toFixed(dp);
}

/* =========================================================================
   CHART.JS FACTORY (Oceanic Translucent Theme)
   ========================================================================= */

/**
 * Initialises a high-frequency, dark-translucent Line Chart.
 *
 * @param {string} canvasId - Target canvas element ID
 * @param {string} label    - Dataset label
 * @param {string} strokeRgb - 'r, g, b' string representation
 * @returns {Chart}
 */
function createOceanicChart(canvasId, label, strokeRgb) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');

  // Gradient fill under the curve
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, `rgba(${strokeRgb}, 0.22)`);
  gradient.addColorStop(1, `rgba(${strokeRgb}, 0.00)`);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: `rgba(${strokeRgb}, 1)`,
        backgroundColor: gradient,
        borderWidth: 2.2,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHoverBackgroundColor: `rgba(${strokeRgb}, 1)`,
        fill: true,
        tension: 0.36,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 }, // Zero animation latency for live streaming
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(6, 20, 29, 0.90)',
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          display: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            lineWidth: 1,
          },
          border: {
            dash: [4, 4],
            color: 'rgba(255, 255, 255, 0.08)',
          },
          ticks: {
            color: '#64748b',
            font: {
              family: 'JetBrains Mono, monospace',
              size: 10,
            },
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

/* =========================================================================
   DASHBOARD CONTROLLER CLASS
   ========================================================================= */

class DashboardController {
  constructor() {
    // Cached DOM elements
    this.$hrValue           = document.getElementById('hr-value');
    this.$edaValue          = document.getElementById('eda-value');
    this.$stressValue       = document.getElementById('stress-value');
    this.$stressCard        = document.getElementById('stress-card');
    this.$stressArc         = document.getElementById('stress-arc');
    this.$stressLevelLabel  = document.getElementById('stress-level-label');
    this.$stressStatusTag   = document.getElementById('stress-status-tag');
    this.$heartIcon         = document.getElementById('heart-icon');

    this.$levelText         = document.getElementById('level-text');
    this.$stagePills        = document.querySelectorAll('.stage-pill');
    this.$vrStatus          = document.getElementById('vr-status');
    this.$liveDot           = document.getElementById('live-dot');
    this.$elapsedTime       = document.getElementById('elapsed-time');

    this.$modeBadge         = document.getElementById('mode-badge');
    this.$modeToggle        = document.getElementById('mode-toggle');
    this.$modeToggleText    = document.getElementById('mode-toggle-text');

    this.$panicBar          = document.getElementById('panic-bar');
    this.$panicSecondsLabel = document.getElementById('panic-seconds-label');

    this.$btnStepUp         = document.getElementById('btn-stepup');
    this.$btnStepDown       = document.getElementById('btn-stepdown');
    this.$btnPause          = document.getElementById('btn-pause');
    this.$pauseBtnLabel     = document.getElementById('pause-btn-label');
    this.$btnEnd            = document.getElementById('btn-end');

    this.$postSessionReport = document.getElementById('post-session-report');
    this.$staiForm          = document.getElementById('stai-form');
    this.$staiSubmitted     = document.getElementById('stai-submitted');

    // Chart.js Instances (Heart Rate: emerald 43, 240, 175 | EDA: amber 251, 191, 36)
    this.hrChart  = createOceanicChart('hr-chart', 'Heart Rate', '43, 240, 175');
    this.edaChart = createOceanicChart('eda-chart', 'EDA Conductance', '251, 191, 36');

    // Internal state
    this._tickIndex        = 0;
    this._sessionSeconds   = 0;
    this._sessionTimer     = null;
    this._pollInterval     = null;
    this._isSessionEnded   = false;
    this._currentLevel     = 'Baseline';

    this._bindEvents();
  }

  /* ----------------------------------------------------------------------
     Lifecycle & Event Binding
     ---------------------------------------------------------------------- */

  start() {
    // Start session stopwatch
    this._sessionTimer = setInterval(() => {
      if (!this._isSessionEnded) {
        this._sessionSeconds++;
        this._renderStopwatch();
      }
    }, 1000);

    // Initial server fetch + polling interval
    this.pollServer();
    this._pollInterval = setInterval(() => this.pollServer(), POLL_INTERVAL_MS);
  }

  stop() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._sessionTimer) {
      clearInterval(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  _bindEvents() {
    if (this.$btnStepUp) {
      this.$btnStepUp.addEventListener('click', () => sendCommand('step_up'));
    }
    if (this.$btnStepDown) {
      this.$btnStepDown.addEventListener('click', () => sendCommand('step_down'));
    }
    if (this.$btnPause) {
      this.$btnPause.addEventListener('click', () => handlePauseResume());
    }
    if (this.$btnEnd) {
      this.$btnEnd.addEventListener('click', () => sendCommand('end_session'));
    }
    if (this.$modeToggle) {
      this.$modeToggle.addEventListener('click', () => sendCommand('toggle_mode'));
    }
  }

  /* ----------------------------------------------------------------------
     Server Polling & Network Dispatch
     ---------------------------------------------------------------------- */

  async pollServer() {
    try {
      const response = await fetch(`${API_BASE}/state`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = await response.json();
      this.render(state);
    } catch (err) {
      console.warn('[Liber8] Polling status: Disconnected', err.message);
      this._setLiveStatus(false);
    }
  }

  /* ----------------------------------------------------------------------
     Reactive UI Rendering
     ---------------------------------------------------------------------- */

  render(state) {
    if (!state) return;
    this._currentLevel = state.level || 'Baseline';

    this._setLiveStatus(true);
    this._renderBiometrics(state);
    this._renderPanicTimer(state.panic_sustained_seconds || 0);
    this._renderEnvironment(state);
    this._renderControlMode(state.mode);
    this._pushChartMetrics(state.hr, state.eda);
    this._checkSessionTermination(state.session_complete);
  }

  _renderStopwatch() {
    const mins = String(Math.floor(this._sessionSeconds / 60)).padStart(2, '0');
    const secs = String(this._sessionSeconds % 60).padStart(2, '0');
    if (this.$elapsedTime) {
      this.$elapsedTime.textContent = `${mins}:${secs}`;
    }
  }

  _renderBiometrics(state) {
    // 1. Heart Rate
    if (this.$hrValue) {
      this.$hrValue.textContent = fmt(state.hr, 0);
      // Trigger a brief beat pulse effect on fetch
      if (this.$heartIcon) {
        this.$heartIcon.classList.remove('anim-heartbeat');
        void this.$heartIcon.offsetWidth; // Reflow
        this.$heartIcon.classList.add('anim-heartbeat');
      }
    }

    // 2. EDA Conductance
    if (this.$edaValue) {
      this.$edaValue.textContent = fmt(state.eda, 2);
    }

    // 3. AI Stress Score
    const score = Math.max(0, Math.min(parseFloat(state.score) || 0, 1.0));
    if (this.$stressValue) {
      this.$stressValue.textContent = fmt(score, 2);
    }

    // Visual Sweep Arc (circumference: 2 * PI * 19 ≈ 119.38)
    if (this.$stressArc) {
      const totalLen = 119.38;
      const offset = totalLen * (1 - score);
      this.$stressArc.style.strokeDashoffset = offset.toFixed(2);
    }

    // Stress severity badge and styling
    const tierInfo = evaluateStressTier(score);
    if (this.$stressLevelLabel) {
      this.$stressLevelLabel.textContent = tierInfo.label;
      this.$stressLevelLabel.className = `absolute text-[10px] font-bold font-mono-numbers ${tierInfo.textColor}`;
    }
    if (this.$stressStatusTag) {
      this.$stressStatusTag.textContent = tierInfo.tagText;
      this.$stressStatusTag.className = tierInfo.tagClass;
    }

    // Alert border pulse when in panic zone
    if (this.$stressCard) {
      if (score >= 0.85) {
        this.$stressCard.classList.add('panic-card-active');
      } else {
        this.$stressCard.classList.remove('panic-card-active');
      }
    }
  }

  _renderPanicTimer(sustainedSeconds) {
    const clamped = Math.min(Math.max(sustainedSeconds, 0), PANIC_MAX_SECONDS);
    const pct = (clamped / PANIC_MAX_SECONDS) * 100;

    if (this.$panicBar) {
      this.$panicBar.style.width = `${pct}%`;
    }
    if (this.$panicSecondsLabel) {
      this.$panicSecondsLabel.textContent = `${clamped} / ${PANIC_MAX_SECONDS}s`;
    }
  }

  _renderEnvironment(state) {
    const level = state.level || 'Baseline';
    if (this.$levelText) {
      this.$levelText.textContent = level;
    }

    // Update pause/intervene button state
    if (this.$pauseBtnLabel) {
      if (level === 'Paused') {
        this.$pauseBtnLabel.textContent = 'Resume Exposure';
        if (this.$btnPause) {
          this.$btnPause.className =
            'btn-capsule flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase font-mono-numbers bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(43,240,175,0.3)]';
        }
      } else {
        this.$pauseBtnLabel.textContent = 'Pause / Intervene';
        if (this.$btnPause) {
          this.$btnPause.className =
            'btn-capsule flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase font-mono-numbers bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 hover:border-rose-400 hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] shadow-sm';
        }
      }
    }

    // Stage Pills Indicator
    if (this.$stagePills && this.$stagePills.length > 0) {
      const stageMap = {
        'Baseline': 0,
        'Level 1': 1,
        'Level 2': 2,
        'Level 3': 3,
        'Level 4': 4,
        'Level 5': 5,
      };

      const activeIdx = stageMap[level] !== undefined ? stageMap[level] : -1;

      this.$stagePills.forEach((pill, idx) => {
        if (idx === activeIdx) {
          pill.className =
            'stage-pill text-[10px] font-bold font-mono-numbers px-2.5 py-1 rounded-lg bg-teal-500/25 text-teal-200 border border-teal-400/50 shadow-[0_0_10px_rgba(43,240,175,0.3)]';
        } else if (idx < activeIdx) {
          pill.className =
            'stage-pill text-[10px] font-bold font-mono-numbers px-2.5 py-1 rounded-lg bg-white/10 text-teal-300/80 border border-teal-500/20';
        } else {
          pill.className =
            'stage-pill text-[10px] font-bold font-mono-numbers px-2.5 py-1 rounded-lg bg-white/5 text-slate-500 border border-white/5';
        }
      });
    }
  }

  _renderControlMode(mode) {
    const isAuto = (mode || 'AUTO').toUpperCase() === 'AUTO';

    if (this.$modeBadge) {
      if (isAuto) {
        this.$modeBadge.className =
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono-numbers bg-teal-500/15 border border-teal-500/40 text-teal-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]';
        this.$modeBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span> AUTO`;
      } else {
        this.$modeBadge.className =
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono-numbers bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.25)]';
        this.$modeBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> CLINICIAN`;
      }
    }

    if (this.$modeToggle && this.$modeToggleText) {
      if (isAuto) {
        this.$modeToggle.className =
          'relative inline-flex items-center gap-2.5 px-4 py-2 rounded-full font-mono-numbers text-xs font-bold transition-all duration-300 bg-[#0c2838] border border-cyan-400/40 text-cyan-200 shadow-[0_0_15px_#06b6d4] hover:border-cyan-300';
        this.$modeToggleText.textContent = 'AUTO MODE: ON';
      } else {
        this.$modeToggle.className =
          'relative inline-flex items-center gap-2.5 px-4 py-2 rounded-full font-mono-numbers text-xs font-bold transition-all duration-300 bg-[#1e1b2e] border border-amber-400/40 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)] hover:border-amber-300';
        this.$modeToggleText.textContent = 'MANUAL CLINICIAN';
      }
    }
  }

  _pushChartMetrics(hr, eda) {
    const tick = `${this._tickIndex++}s`;

    const appendData = (chart, value) => {
      if (!chart) return;
      chart.data.labels.push(tick);
      chart.data.datasets[0].data.push(value);
      if (chart.data.labels.length > CHART_MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update('none'); // Update without animation lag
    };

    appendData(this.hrChart, hr);
    appendData(this.edaChart, eda);
  }

  _checkSessionTermination(isComplete) {
    if (isComplete && !this._isSessionEnded) {
      this._isSessionEnded = true;
      this.stop(); // Cease polling loop

      if (this.$vrStatus) {
        this.$vrStatus.textContent = 'SESSION ARCHIVED';
        this.$vrStatus.className = 'text-xs font-bold text-slate-400 font-mono-numbers';
      }
      if (this.$liveDot) {
        this.$liveDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
      }

      // Smooth slide-up transition of the post-session report
      if (this.$postSessionReport) {
        this.$postSessionReport.classList.remove('hidden');
        requestAnimationFrame(() => {
          this.$postSessionReport.classList.remove('opacity-0', 'translate-y-8');
          this.$postSessionReport.classList.add('opacity-100', 'translate-y-0');
        });
        this.$postSessionReport.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  _setLiveStatus(isOnline) {
    if (this._isSessionEnded) return;

    if (isOnline) {
      if (this.$vrStatus) {
        this.$vrStatus.textContent = 'SYNCHRONIZED';
        this.$vrStatus.className = 'text-xs font-bold text-emerald-400 font-mono-numbers';
      }
      if (this.$liveDot) {
        this.$liveDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]';
      }
    } else {
      if (this.$vrStatus) {
        this.$vrStatus.textContent = 'RECONNECTING';
        this.$vrStatus.className = 'text-xs font-bold text-rose-400 font-mono-numbers';
      }
      if (this.$liveDot) {
        this.$liveDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping';
      }
    }
  }
}

/* =========================================================================
   GLOBAL COMMAND DISPATCHERS (Window Scope)
   ========================================================================= */

/**
 * Universal command dispatcher sending structured JSON to POST /command.
 * @param {string} action - 'step_up' | 'step_down' | 'pause' | 'resume' | 'toggle_mode' | 'end_session'
 */
async function sendCommand(action) {
  try {
    const payload = { action, source: 'doctor' };
    const response = await fetch(`${API_BASE}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error(`[Liber8] Command "${action}" failed:`, err);
      return;
    }

    const data = await response.json();
    if (data && data.state && window._liber8Controller) {
      window._liber8Controller.render(data.state);
    }
  } catch (err) {
    console.error(`[Liber8] Network error sending command "${action}":`, err.message);
  }
}

/**
 * Smart toggle for Pause / Resume action.
 */
function handlePauseResume() {
  if (!window._liber8Controller) return;
  const isPaused = window._liber8Controller._currentLevel === 'Paused';
  sendCommand(isPaused ? 'resume' : 'pause');
}

/**
 * Handles STAI psychometric evaluation submission.
 */
function submitSTAI(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const survey = {};

  for (const [key, value] of formData.entries()) {
    survey[key] = parseInt(value, 10);
  }

  const totalScore = Object.values(survey).reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);
  console.info('[Liber8] STAI Record Committed:', survey, '| Aggregate Score:', totalScore);

  form.style.display = 'none';
  const confirmation = document.getElementById('stai-submitted');
  if (confirmation) {
    confirmation.classList.remove('hidden');
  }
}

/* =========================================================================
   APPLICATION BOOTSTRAP
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  window._liber8Controller = new DashboardController();
  window._liber8Controller.start();
  console.info('[Liber8] Oceanic Glassmorphism Dashboard initialized.');
});
