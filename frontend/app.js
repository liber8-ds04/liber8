/**
 * app.js — Liber8 Clinical VR Exposure Dashboard & Patient Management SPA
 * =======================================================================
 * Ultra-Responsive Full-Width Oceanic Glassmorphism Single-Page Application
 *
 * Core Capabilities:
 *   • Three-tier SPA navigation (Welcome Landing -> Patient Directory CRUD -> Full-Width VR Dashboard).
 *   • Full browser localStorage Patient CRUD Engine with Edit lifecycle:
 *       - Enrolls new patient profiles with dual unit anthropometrics (cm/ft-in, kg/lbs).
 *       - Updates existing patient records in-place without generating duplicate IDs.
 *       - Custom target phobia support with inline dynamic toggle.
 *       - Injects active patient demographics into the live VR telemetry header.
 *   • Pre-Session Safety Screening Checklist Modal:
 *       - 6 mandatory physiological & autonomic questions (coffee, exercise, smoking, illness).
 *       - Interactive Yes/No toggles with autonomic stimulant warning indicators.
 *       - Blocks entry to VR exposure until clinician confirmation.
 *   • Post-Session Clinical Debrief Modal:
 *       - Replaces legacy STAI with an intuitive debrief workflow triggered by "Conclude Session".
 *       - Evaluates VR-induced cybersickness, exposure completion, and overall clinical assessment.
 *       - Commits last session date (new Date().toLocaleDateString()) and debrief dossier to localStorage.
 *       - Cleanly halts telemetry, resets session state, and routes back to the directory.
 *   • Full-Width Unconstrained Live Dashboard:
 *       - Unconstrained horizontal stretching for high-resolution clinician workstations.
 *       - 16:9 Aspect-Ratio Unity POV Viewport Monitor with live status HUD.
 *       - Instant calming emerald Safe Room override on sensor fault or clinician Pause.
 *   • Dual Chart.js live visualizers for Heart Rate (Emerald) and EDA Conductance (Amber).
 *   • Real-Time Clinical Safety Monitors:
 *       - 30-Second Resting Baseline calibration tracker.
 *       - 15-Second Boredom / Phase 2 "Ready for Step Up" soft teal recommendation aura.
 *       - 5-Second Sustained Panic failsafe gauge.
 *       - Sensor Fault detection banner with immediate "Safe Room: Beautiful Scenery" fallback.
 *       - Subjective Patient Feedback pill badge (Stable / Challenging / Overwhelmed).
 *   • Authoritative Clinician Controls with 100% button wiring and water ripple feedback.
 */

'use strict';

/* =========================================================================
   SYSTEM CONFIGURATION & CLINICAL CONSTANTS
   ========================================================================= */

const PANIC_MAX_SECONDS    = 5;       // 5-second sustained panic failsafe threshold
const POLL_INTERVAL_MS     = 1000;    // 1 Hz clinical polling rate
const CHART_MAX_POINTS     = 60;      // 60-second sliding history buffer
const API_BASE             = '';      // Same-origin relative path for FastAPI
const CIRCLE_CIRCUMFERENCE = 119.38;  // 2 * PI * r (r=19) for SVG radial gauge
const STORAGE_KEY          = 'liber8_patients';

/* =========================================================================
   ACTIVE SESSION & MODAL STATE
   ========================================================================= */

let currentActivePatientId = null;
let currentHeightUnit      = 'cm';
let currentWeightUnit      = 'kg';

// Pre-Session Safety Checklist State
let preSessionChecklist = {
  coffee_today: false,
  coffee_hour: false,
  sports_today: false,
  smoker: false,
  smoke_hour: false,
  ill_today: false,
};

// Post-Session Clinical Debrief State
let postSessionDebrief = {
  nausea: false,
  completed: true,
  assessment: 'Tolerated Well',
  notes: '',
};

/* =========================================================================
   COLOR & PHYSIOLOGICAL SCORING UTILITIES
   ========================================================================= */

/**
 * Evaluates stress score severity into colorway and status semantics.
 * @param {number} score - Normalized [0.0, 1.0]
 * @returns {{ label: string, textColor: string, tagText: string, tagClass: string }}
 */
function evaluateStressTier(score) {
  if (score < 0.40) {
    return {
      label: 'LOW',
      textColor: 'text-teal-300',
      tagText: 'STABLE',
      tagClass: 'text-teal-400 font-semibold',
    };
  } else if (score < 0.85) {
    return {
      label: 'ELEV',
      textColor: 'text-amber-300',
      tagText: 'ELEVATED AROUSAL',
      tagClass: 'text-amber-400 font-semibold',
    };
  } else {
    return {
      label: 'PANIC',
      textColor: 'text-rose-400',
      tagText: 'CRITICAL PANIC RISK',
      tagClass: 'text-rose-400 font-bold animate-pulse',
    };
  }
}

/**
 * Formats numeric values to fixed decimal places with NaN fallback.
 * @param {number|string} val
 * @param {number} dp
 * @returns {string}
 */
function fmt(val, dp = 1) {
  const num = parseFloat(val);
  return isNaN(num) ? (0).toFixed(dp) : num.toFixed(dp);
}

/**
 * Escapes unsafe characters for HTML injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Extracts initials for avatar glyph.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return 'PT';
  const clean = name.trim();
  if (clean.toUpperCase().includes('WESAD-S15')) return 'S15';
  if (clean.toUpperCase().startsWith('SUBJECT')) {
    const parts = clean.split(/\s+/);
    return parts[1] ? parts[1].substring(0, 3).toUpperCase() : 'SUB';
  }
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.substring(0, 2).toUpperCase();
}

/* =========================================================================
   PATIENT STORAGE & CRUD ENGINE (localStorage)
   ========================================================================= */

/**
 * Default pre-loaded patient profiles for committee evaluation.
 */
const DEFAULT_PATIENTS = [
  {
    id: 'wesad-s15',
    name: 'Subject WESAD-S15',
    age: 26,
    gender: 'Male',
    hand: 'Right',
    height: '178 cm',
    weight: '72 kg',
    date: '2026-11-10',
    lastSessionDate: '2026-11-04',
    phobia: 'Acrophobia (Heights)',
    createdAt: '2026-11-01',
  },
  {
    id: 'pat-102',
    name: 'Elena Rostova',
    age: 31,
    gender: 'Female',
    hand: 'Right',
    height: '165 cm',
    weight: '58 kg',
    date: '2026-11-10',
    lastSessionDate: '2026-11-03',
    phobia: 'Claustrophobia (Enclosed Spaces)',
    createdAt: '2026-11-02',
  },
  {
    id: 'pat-103',
    name: 'Marcus Vance',
    age: 42,
    gender: 'Male',
    hand: 'Ambidextrous',
    height: '185 cm',
    weight: '84 kg',
    date: '2026-11-11',
    lastSessionDate: '2026-11-02',
    phobia: 'Arachnophobia (Spiders)',
    createdAt: '2026-11-03',
  },
];

/**
 * Retrieves enrolled patients from localStorage with automatic seed fallback.
 * @returns {Array<Object>}
 */
function getPatients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PATIENTS));
      return DEFAULT_PATIENTS.map((p) => ({ sessions: [], ...p }));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PATIENTS));
      return DEFAULT_PATIENTS.map((p) => ({ sessions: [], ...p }));
    }
    // Backward-compat: ensure every patient has a sessions array
    return parsed.map((p) => ({ sessions: [], ...p }));
  } catch (err) {
    console.error('[Liber8] Error reading localStorage:', err);
    return DEFAULT_PATIENTS.map((p) => ({ sessions: [], ...p }));
  }
}

/**
 * Saves patients array to localStorage.
 * @param {Array<Object>} list
 */
function savePatientsToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('[Liber8] Error writing to localStorage:', err);
  }
}

/**
 * Renders the patient cards in Section B grid with Edit and Delete actions.
 */
function loadPatients() {
  const grid = document.getElementById('patient-grid');
  const countBadge = document.getElementById('total-patients-count');
  if (!grid) return;

  const patients = getPatients();
  if (countBadge) countBadge.textContent = String(patients.length);

  grid.innerHTML = '';

  patients.forEach((p) => {
    const card = document.createElement('div');
    card.className =
      'glass-card !p-5 relative flex flex-col justify-between hover:border-teal-400/40 cursor-pointer group transition-all duration-300';
    // Clicking card opens the Pre-Flight Checklist modal
    card.onclick = () => openPreSessionModal(p.id);

    const initials = getInitials(p.name);
    const displayDate = p.lastSessionDate ? `Last: ${p.lastSessionDate}` : (p.date || 'Scheduled');

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-cyan-900/40 font-mono-numbers text-xs">
              ${escapeHtml(initials)}
            </div>
            <div>
              <h4 class="text-base font-bold text-white group-hover:text-teal-300 transition-colors font-mono-numbers">${escapeHtml(p.name)}</h4>
              <p class="text-[11px] text-slate-400 uppercase font-mono-numbers">${p.age} YRS · ${escapeHtml(p.gender)} · ${escapeHtml(p.hand)} Hand</p>
            </div>
          </div>

          <!-- Edit & Delete Action Buttons -->
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick="event.stopPropagation(); editPatient('${p.id}')"
              title="Edit Patient Profile"
              class="p-1.5 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/15 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
            <button
              type="button"
              onclick="event.stopPropagation(); deletePatient('${p.id}')"
              title="Delete Patient Profile"
              class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>

        <div class="space-y-2 my-4 text-xs">
          <div class="flex items-center justify-between text-slate-400">
            <span>Target Phobia:</span>
            <span class="font-bold text-teal-300 font-mono-numbers px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/20">${escapeHtml(p.phobia)}</span>
          </div>
          <div class="flex items-center justify-between text-slate-400">
            <span>Anthropometrics:</span>
            <span class="font-mono-numbers text-slate-300">${escapeHtml(p.height || 'N/A')} · ${escapeHtml(p.weight || 'N/A')}</span>
          </div>
          <div class="flex items-center justify-between text-slate-400">
            <span>Session Date:</span>
            <span class="font-mono-numbers text-cyan-300">${escapeHtml(displayDate)}</span>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-white/5">
        <button
          type="button"
          onclick="event.stopPropagation(); openPreSessionModal('${p.id}')"
          class="w-full btn-capsule flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300 hover:bg-teal-500/25 hover:border-teal-400 text-xs font-bold uppercase font-mono-numbers tracking-wider shadow-sm transition-all"
        >
          <span>Launch VR Session</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
}

/**
 * Populates patient form with existing data for editing.
 * @param {string} patientId
 */
function editPatient(patientId) {
  const patients = getPatients();
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return;

  const idInp        = document.getElementById('inp-patient-id');
  const nameInp      = document.getElementById('inp-patient-name');
  const ageInp       = document.getElementById('inp-patient-age');
  const genderInp    = document.getElementById('inp-patient-gender');
  const handInp      = document.getElementById('inp-patient-hand');
  const dateInp      = document.getElementById('inp-patient-date');
  const phobiaSelect = document.getElementById('inp-patient-phobia-select');
  const customWrap   = document.getElementById('wrap-custom-phobia');
  const customInp    = document.getElementById('inp-custom-phobia');
  const modalTitle   = document.getElementById('patient-modal-title');
  const modalDesc    = document.getElementById('patient-modal-desc');
  const modalBtn     = document.getElementById('btn-patient-modal-submit');

  if (idInp) idInp.value = patient.id;
  if (nameInp) nameInp.value = patient.name || '';
  if (ageInp) ageInp.value = patient.age || 25;
  if (genderInp) genderInp.value = patient.gender || 'Male';
  if (handInp) handInp.value = patient.hand || 'Right';
  if (dateInp) dateInp.value = patient.date || new Date().toISOString().split('T')[0];

  // Parse height
  const heightStr = patient.height || '175 cm';
  if (heightStr.includes("'") || heightStr.includes('"')) {
    toggleHeightUnit('ft');
    const match = heightStr.match(/(\d+)'(\d+)"?/);
    if (match) {
      const ftInp = document.getElementById('inp-height-ft');
      const inInp = document.getElementById('inp-height-in');
      if (ftInp) ftInp.value = match[1];
      if (inInp) inInp.value = match[2];
    }
  } else {
    toggleHeightUnit('cm');
    const cmMatch = heightStr.match(/(\d+)/);
    const cmInp = document.getElementById('inp-height-cm');
    if (cmInp) cmInp.value = cmMatch ? cmMatch[1] : 175;
  }

  // Parse weight
  const weightStr = patient.weight || '70 kg';
  if (weightStr.toLowerCase().includes('lbs')) {
    toggleWeightUnit('lbs');
    const lbsMatch = weightStr.match(/(\d+)/);
    const lbsInp = document.getElementById('inp-weight-lbs');
    if (lbsInp) lbsInp.value = lbsMatch ? lbsMatch[1] : 154;
  } else {
    toggleWeightUnit('kg');
    const kgMatch = weightStr.match(/(\d+)/);
    const kgInp = document.getElementById('inp-weight-kg');
    if (kgInp) kgInp.value = kgMatch ? kgMatch[1] : 70;
  }

  // Parse phobia
  const phobia = patient.phobia || 'Acrophobia (Heights)';
  const standardOptions = [
    'Acrophobia (Heights)',
    'Arachnophobia (Spiders)',
    'Claustrophobia (Enclosed Spaces)',
  ];

  if (standardOptions.includes(phobia)) {
    if (phobiaSelect) phobiaSelect.value = phobia;
    if (customWrap) customWrap.classList.add('hidden');
    if (customInp) customInp.value = '';
  } else {
    if (phobiaSelect) phobiaSelect.value = 'Acrophobia (Heights)';
    if (customWrap) customWrap.classList.remove('hidden');
    if (customInp) customInp.value = phobia;
  }

  // Update modal header & button semantics for edit
  if (modalTitle) modalTitle.textContent = 'Edit Patient Profile';
  if (modalDesc) modalDesc.textContent = 'Update clinical demographics & session settings';
  if (modalBtn) modalBtn.textContent = 'Update Patient';

  const modal = document.getElementById('patient-modal');
  if (modal) modal.classList.remove('hidden');
}

/**
 * Saves or updates a patient profile from the modal form.
 * @param {Event} event
 */
function savePatient(event) {
  event.preventDefault();

  const idInput           = document.getElementById('inp-patient-id');
  const nameInput         = document.getElementById('inp-patient-name');
  const ageInput          = document.getElementById('inp-patient-age');
  const genderInput       = document.getElementById('inp-patient-gender');
  const handInput         = document.getElementById('inp-patient-hand');
  const dateInput         = document.getElementById('inp-patient-date');
  const phobiaSelect      = document.getElementById('inp-patient-phobia-select');
  const customPhobiaInput = document.getElementById('inp-custom-phobia');
  const customPhobiaWrap  = document.getElementById('wrap-custom-phobia');

  const editingId = idInput ? idInput.value : '';
  const name      = nameInput ? nameInput.value.trim() : '';
  const age       = ageInput ? parseInt(ageInput.value, 10) : 25;
  const gender    = genderInput ? genderInput.value : 'Male';
  const hand      = handInput ? handInput.value : 'Right';
  const date      = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

  if (!name) {
    alert('Please enter a patient name.');
    return;
  }

  // Determine Height string
  let heightStr = '175 cm';
  if (currentHeightUnit === 'cm') {
    const cmVal = document.getElementById('inp-height-cm')?.value;
    if (cmVal) heightStr = `${cmVal} cm`;
  } else {
    const ftVal = document.getElementById('inp-height-ft')?.value;
    const inVal = document.getElementById('inp-height-in')?.value;
    if (ftVal) {
      heightStr = `${ftVal}'${inVal || 0}"`;
    }
  }

  // Determine Weight string
  let weightStr = '70 kg';
  if (currentWeightUnit === 'kg') {
    const kgVal = document.getElementById('inp-weight-kg')?.value;
    if (kgVal) weightStr = `${kgVal} kg`;
  } else {
    const lbsVal = document.getElementById('inp-weight-lbs')?.value;
    if (lbsVal) weightStr = `${lbsVal} lbs`;
  }

  // Determine Target Phobia
  let phobiaStr = phobiaSelect ? phobiaSelect.value : 'Acrophobia (Heights)';
  if (customPhobiaWrap && !customPhobiaWrap.classList.contains('hidden') && customPhobiaInput) {
    const customVal = customPhobiaInput.value.trim();
    if (customVal) {
      phobiaStr = customVal;
    }
  }

  const currentList = getPatients();

  if (editingId) {
    // Edit existing patient at exact index
    const idx = currentList.findIndex((p) => p.id === editingId);
    if (idx !== -1) {
      currentList[idx] = {
        ...currentList[idx],
        name,
        age,
        gender,
        hand,
        height: heightStr,
        weight: weightStr,
        date,
        phobia: phobiaStr,
        updatedAt: new Date().toISOString(),
      };
    }
  } else {
    // Enroll new patient
    const newPatient = {
      id: `pat-${Date.now()}`,
      name,
      age,
      gender,
      hand,
      height: heightStr,
      weight: weightStr,
      date,
      lastSessionDate: null,
      phobia: phobiaStr,
      createdAt: new Date().toISOString(),
    };
    currentList.push(newPatient);
  }

  savePatientsToStorage(currentList);
  loadPatients();
  closePatientModal();

  // Reset form
  event.target.reset();
  if (idInput) idInput.value = '';
  if (customPhobiaWrap) customPhobiaWrap.classList.add('hidden');
  toggleHeightUnit('cm');
  toggleWeightUnit('kg');
}

/**
 * Deletes a patient profile by ID.
 * @param {string} patientId
 */
function deletePatient(patientId) {
  if (!confirm('Are you sure you want to remove this patient profile from the directory?')) {
    return;
  }
  const currentList = getPatients();
  const updated = currentList.filter((p) => p.id !== patientId);
  savePatientsToStorage(updated);
  loadPatients();
}

/**
 * Opens the New Patient Intake Modal.
 */
function openPatientModal() {
  const modal = document.getElementById('patient-modal');
  const idInput = document.getElementById('inp-patient-id');
  const modalTitle = document.getElementById('patient-modal-title');
  const modalDesc = document.getElementById('patient-modal-desc');
  const modalBtn = document.getElementById('btn-patient-modal-submit');
  const form = document.getElementById('new-patient-form');

  if (idInput) idInput.value = '';
  if (form) form.reset();
  if (modalTitle) modalTitle.textContent = 'Enroll New Patient Profile';
  if (modalDesc) modalDesc.textContent = 'Clinical trial intake & baseline anthropometrics';
  if (modalBtn) modalBtn.textContent = 'Save Patient Profile';

  // Pre-populate today's date
  const dateInput = document.getElementById('inp-patient-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  toggleHeightUnit('cm');
  toggleWeightUnit('kg');

  const customWrap = document.getElementById('wrap-custom-phobia');
  if (customWrap) customWrap.classList.add('hidden');

  if (modal) {
    modal.classList.remove('hidden');
    const nameInp = document.getElementById('inp-patient-name');
    if (nameInp) nameInp.focus();
  }
}

/**
 * Closes the Patient Modal.
 */
function closePatientModal() {
  const modal = document.getElementById('patient-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Toggles height unit inputs between cm and ft/in.
 * @param {'cm'|'ft'} unit
 */
function toggleHeightUnit(unit) {
  currentHeightUnit = unit;
  const wrapCm = document.getElementById('wrap-height-cm');
  const wrapFt = document.getElementById('wrap-height-ft');
  const btnCm  = document.getElementById('btn-height-cm');
  const btnFt  = document.getElementById('btn-height-ft');

  if (unit === 'cm') {
    if (wrapCm) wrapCm.classList.remove('hidden');
    if (wrapFt) wrapFt.classList.add('hidden');
    if (btnCm) btnCm.className = 'px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    if (btnFt) btnFt.className = 'px-2.5 py-0.5 rounded-md text-slate-400 hover:text-white transition-all';
  } else {
    if (wrapCm) wrapCm.classList.add('hidden');
    if (wrapFt) wrapFt.classList.remove('hidden');
    if (btnFt) btnFt.className = 'px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    if (btnCm) btnCm.className = 'px-2.5 py-0.5 rounded-md text-slate-400 hover:text-white transition-all';
  }
}

/**
 * Toggles weight unit inputs between kg and lbs.
 * @param {'kg'|'lbs'} unit
 */
function toggleWeightUnit(unit) {
  currentWeightUnit = unit;
  const wrapKg = document.getElementById('wrap-weight-kg');
  const wrapLbs = document.getElementById('wrap-weight-lbs');
  const btnKg  = document.getElementById('btn-weight-kg');
  const btnLbs = document.getElementById('btn-weight-lbs');

  if (unit === 'kg') {
    if (wrapKg) wrapKg.classList.remove('hidden');
    if (wrapLbs) wrapLbs.classList.add('hidden');
    if (btnKg) btnKg.className = 'px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    if (btnLbs) btnLbs.className = 'px-2.5 py-0.5 rounded-md text-slate-400 hover:text-white transition-all';
  } else {
    if (wrapKg) wrapKg.classList.add('hidden');
    if (wrapLbs) wrapLbs.classList.remove('hidden');
    if (btnLbs) btnLbs.className = 'px-2.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    if (btnKg) btnKg.className = 'px-2.5 py-0.5 rounded-md text-slate-400 hover:text-white transition-all';
  }
}

/**
 * Toggles custom phobia text input field.
 */
function toggleCustomPhobiaInput() {
  const wrap = document.getElementById('wrap-custom-phobia');
  const inp  = document.getElementById('inp-custom-phobia');
  if (!wrap) return;

  if (wrap.classList.contains('hidden')) {
    wrap.classList.remove('hidden');
    if (inp) inp.focus();
  } else {
    wrap.classList.add('hidden');
  }
}

/* =========================================================================
   PRE-SESSION SAFETY CHECKLIST MODAL CONTROLLER
   ========================================================================= */

/**
 * Opens Pre-Session Safety Checklist before launching VR exposure.
 * @param {string} patientId
 */
function openPreSessionModal(patientId) {
  currentActivePatientId = patientId;
  const patients = getPatients();
  const patient = patients.find((p) => p.id === patientId) || DEFAULT_PATIENTS[0];

  const nameEl = document.getElementById('pre-session-patient-name');
  if (nameEl) nameEl.textContent = `${patient.name} (${patient.phobia})`;

  // Reset checklist responses to default (all No)
  preSessionChecklist = {
    coffee_today: false,
    coffee_hour: false,
    sports_today: false,
    smoker: false,
    smoke_hour: false,
    ill_today: false,
  };

  // Synchronize button styling
  const keys = ['coffee-today', 'coffee-hour', 'sports-today', 'smoker', 'smoke-hour', 'ill-today'];
  keys.forEach((key) => {
    const noBtn = document.getElementById(`btn-pre-${key}-no`);
    const yesBtn = document.getElementById(`btn-pre-${key}-yes`);
    if (noBtn) {
      noBtn.className = 'checklist-btn px-3 py-1 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    }
    if (yesBtn) {
      yesBtn.className = 'checklist-btn px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
    }
  });

  const modal = document.getElementById('pre-session-modal');
  if (modal) modal.classList.remove('hidden');
}

/**
 * Closes Pre-Session Safety Checklist.
 */
function closePreSessionModal() {
  const modal = document.getElementById('pre-session-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Sets answer for a checklist question and updates button state.
 * @param {string} questionKey - e.g. 'coffee_today'
 * @param {boolean} value
 */
function setChecklistAnswer(questionKey, value) {
  preSessionChecklist[questionKey] = value;
  const domKey = questionKey.replace(/_/g, '-');
  const noBtn  = document.getElementById(`btn-pre-${domKey}-no`);
  const yesBtn = document.getElementById(`btn-pre-${domKey}-yes`);

  if (!noBtn || !yesBtn) return;

  if (value === true) {
    yesBtn.className =
      'checklist-btn px-3 py-1 rounded-md bg-amber-500/25 text-amber-300 font-bold border border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.25)] transition-all';
    noBtn.className = 'checklist-btn px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
  } else {
    noBtn.className =
      'checklist-btn px-3 py-1 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
    yesBtn.className = 'checklist-btn px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
  }
}

/**
 * Confirms checklist completion and launches live VR Dashboard.
 */
function confirmAndLaunchSession() {
  closePreSessionModal();
  showDashboard(currentActivePatientId);
}

/* =========================================================================
   POST-SESSION CLINICAL DEBRIEF MODAL CONTROLLER
   ========================================================================= */

/**
 * Opens Post-Session Debrief modal upon clicking "Conclude Session".
 * Pauses telemetry stream and session clock.
 */
function openPostSessionModal() {
  // Pause live telemetry polling immediately
  if (window._liber8Controller) {
    window._liber8Controller.stop();
  }

  const patients = getPatients();
  const patient = patients.find((p) => p.id === currentActivePatientId) || DEFAULT_PATIENTS[0];

  const nameEl = document.getElementById('post-session-patient-name');
  if (nameEl) nameEl.textContent = `${patient.name} · ${patient.phobia}`;

  // Reset debrief answers
  postSessionDebrief = {
    nausea: false,
    completed: true,
    assessment: 'Tolerated Well',
    notes: '',
  };

  // Synchronize debrief toggles
  setDebriefAnswer('nausea', false);
  setDebriefAnswer('completed', true);

  const select = document.getElementById('inp-debrief-assessment');
  if (select) select.value = 'Tolerated Well';

  const notes = document.getElementById('inp-debrief-notes');
  if (notes) notes.value = '';

  const modal = document.getElementById('post-session-modal');
  if (modal) modal.classList.remove('hidden');
}

/**
 * Closes Post-Session Debrief modal.
 */
function closePostSessionModal() {
  const modal = document.getElementById('post-session-modal');
  if (modal) modal.classList.add('hidden');

  // Resume telemetry if clinician returns to live monitoring without concluding
  const secDash = document.getElementById('section-dashboard');
  if (secDash && !secDash.classList.contains('hidden') && window._liber8Controller) {
    window._liber8Controller.start();
  }
}

/**
 * Sets debrief answer for nausea or completion.
 * @param {'nausea'|'completed'} key
 * @param {boolean} value
 */
function setDebriefAnswer(key, value) {
  postSessionDebrief[key] = value;

  if (key === 'nausea') {
    const noBtn  = document.getElementById('btn-debrief-nausea-no');
    const yesBtn = document.getElementById('btn-debrief-nausea-yes');
    if (!noBtn || !yesBtn) return;

    if (value === true) {
      yesBtn.className =
        'debrief-btn px-3.5 py-1.5 rounded-md bg-rose-500/25 text-rose-300 font-bold border border-rose-400/40 shadow-[0_0_12px_rgba(244,63,94,0.3)] transition-all';
      noBtn.className = 'debrief-btn px-3.5 py-1.5 rounded-md text-slate-400 hover:text-white transition-all';
    } else {
      noBtn.className =
        'debrief-btn px-3.5 py-1.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
      yesBtn.className = 'debrief-btn px-3.5 py-1.5 rounded-md text-slate-400 hover:text-white transition-all';
    }
  } else if (key === 'completed') {
    const yesBtn = document.getElementById('btn-debrief-completed-yes');
    const noBtn  = document.getElementById('btn-debrief-completed-no');
    if (!yesBtn || !noBtn) return;

    if (value === true) {
      yesBtn.className =
        'debrief-btn px-3.5 py-1.5 rounded-md bg-teal-500/20 text-teal-300 font-bold transition-all';
      noBtn.className = 'debrief-btn px-3.5 py-1.5 rounded-md text-slate-400 hover:text-white transition-all';
    } else {
      noBtn.className =
        'debrief-btn px-3.5 py-1.5 rounded-md bg-amber-500/25 text-amber-300 font-bold border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)] transition-all';
      yesBtn.className = 'debrief-btn px-3.5 py-1.5 rounded-md text-slate-400 hover:text-white transition-all';
    }
  }
}

/**
 * Saves session debrief, updates active patient's last session date to today,
 * commits array back to localStorage, and immediately routes to Patient Directory.
 */
function saveAndEndSession() {
  const assessmentEl = document.getElementById('inp-debrief-assessment');
  const notesEl      = document.getElementById('inp-debrief-notes');

  const assessmentVal = assessmentEl ? assessmentEl.value : 'Tolerated Well';
  const notesVal      = notesEl ? notesEl.value.trim() : '';

  const todayDateStr = new Date().toLocaleDateString();

  // Find active patient in localStorage array and commit session debrief
  const patients = getPatients();
  const idx = patients.findIndex((p) => p.id === currentActivePatientId);

  if (idx !== -1) {
    patients[idx] = {
      ...patients[idx],
      date: todayDateStr,
      lastSessionDate: todayDateStr,
      lastAssessment: assessmentVal,
      lastDebrief: {
        ...postSessionDebrief,
        assessment: assessmentVal,
        notes: notesVal,
        checklist: { ...preSessionChecklist },
        concludedAt: new Date().toISOString(),
      },
    };
    savePatientsToStorage(patients);
    console.info(`[Liber8] Patient session dossier committed for: ${patients[idx].name} (${todayDateStr})`);
  }

  // Send end_session command to backend
  sendCommand('end_session');

  // Reset dashboard state & stop polling
  if (window._liber8Controller) {
    window._liber8Controller.reset();
  }

  // Close debrief modal and return directly to Patient Directory
  closePostSessionModal();
  showCRUD();
}

/* =========================================================================
   SPA NAVIGATION ROUTING CONTROLLER
   ========================================================================= */

/**
 * Navigates to Section A: Welcome Screen.
 */
function showWelcome() {
  const secWelcome = document.getElementById('section-welcome');
  const secCRUD    = document.getElementById('section-patient-mgmt');
  const secDash    = document.getElementById('section-dashboard');

  if (secWelcome) secWelcome.classList.remove('hidden');
  if (secCRUD) secCRUD.classList.add('hidden');
  if (secDash) secDash.classList.add('hidden');

  if (window._liber8Controller) {
    window._liber8Controller.stop();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Navigates to Section B: Patient Management Directory.
 */
function showCRUD() {
  const secWelcome = document.getElementById('section-welcome');
  const secCRUD    = document.getElementById('section-patient-mgmt');
  const secDash    = document.getElementById('section-dashboard');

  if (secWelcome) secWelcome.classList.add('hidden');
  if (secCRUD) secCRUD.classList.remove('hidden');
  if (secDash) secDash.classList.add('hidden');

  if (window._liber8Controller) {
    window._liber8Controller.stop();
  }

  loadPatients();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Clears dashboard state and safely navigates back to Patient Directory.
 */
function exitDashboardToCRUD() {
  if (window._liber8Controller) {
    window._liber8Controller.reset();
  }
  showCRUD();
}

/**
 * Injects selected patient into Section C and starts live full-width VR Dashboard.
 * @param {string} patientId
 */
function showDashboard(patientId) {
  currentActivePatientId = patientId;

  const secWelcome = document.getElementById('section-welcome');
  const secCRUD    = document.getElementById('section-patient-mgmt');
  const secDash    = document.getElementById('section-dashboard');

  if (secWelcome) secWelcome.classList.add('hidden');
  if (secCRUD) secCRUD.classList.add('hidden');
  if (secDash) secDash.classList.remove('hidden');

  // Look up patient from storage
  const patients = getPatients();
  const patient = patients.find((p) => p.id === patientId) || patients[0] || DEFAULT_PATIENTS[0];

  // Injected Patient Demographics
  const nameEl           = document.getElementById('patient-display-name');
  const detailsEl        = document.getElementById('patient-display-details');
  const phobiaEl         = document.getElementById('patient-display-phobia');
  const avatarInitialsEl = document.getElementById('patient-avatar-initials');

  if (nameEl) nameEl.textContent = patient.name;
  if (detailsEl) {
    detailsEl.textContent = `${patient.age} YRS · ${patient.gender.toUpperCase()} · ${patient.hand.toUpperCase()} HAND`;
  }
  if (phobiaEl) phobiaEl.textContent = patient.phobia;
  if (avatarInitialsEl) avatarInitialsEl.textContent = getInitials(patient.name);

  // Autoplay live video feedport
  const vrVideo = document.getElementById('vr-live-video');
  if (vrVideo) {
    vrVideo.play().catch(() => {});
  }

  // Start (or resume) Dashboard Telemetry Polling Engine
  if (window._liber8Controller) {
    window._liber8Controller.start();
    // Refresh full-width chart dimensions now that Section C is displayed
    setTimeout(() => {
      if (window._liber8Controller.hrChart) window._liber8Controller.hrChart.resize();
      if (window._liber8Controller.edaChart) window._liber8Controller.edaChart.resize();
    }, 50);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================================
   CHART.JS FACTORY (Oceanic Translucent Theme)
   ========================================================================= */

/**
 * Creates a dark translucent Line Chart with zero-latency live updates.
 *
 * @param {string} canvasId  - Canvas element ID
 * @param {string} label     - Dataset name
 * @param {string} strokeRgb - 'r, g, b' color string
 * @returns {Chart|null}
 */
function createOceanicChart(canvasId, label, strokeRgb) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');

  // Translucent vertical gradient fill under curve
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
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
        pointHoverRadius: 4,
        pointHoverBackgroundColor: `rgba(${strokeRgb}, 1)`,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(6, 20, 29, 0.92)',
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
    // Biometric Telemetry Elements
    this.$hrValue              = document.getElementById('hr-value');
    this.$edaValue             = document.getElementById('eda-value');
    this.$stressValue          = document.getElementById('stress-value');
    this.$stressCard           = document.getElementById('stress-card');
    this.$stressArc            = document.getElementById('stress-arc');
    this.$stressLevelLabel     = document.getElementById('stress-level-label');
    this.$stressStatusTag      = document.getElementById('stress-status-tag');
    this.$heartIcon            = document.getElementById('heart-icon');

    // Clinical Safety Indicators
    this.$baselineValue        = document.getElementById('baseline-value');
    this.$patientFeedbackBadge = document.getElementById('patient-feedback-badge');
    this.$sensorAlertBanner    = document.getElementById('sensor-alert-banner');
    this.$stepupBadge          = document.getElementById('stepup-recommendation-badge');

    // "Current VR Environment" Viewport Card Elements
    this.$vrViewportCard       = document.getElementById('vr-viewport-card');
    this.$vrViewportGlow       = document.getElementById('vr-viewport-glow');
    this.$vrEnvironmentTitle   = document.getElementById('vr-environment-title');
    this.$vrEnvironmentDesc    = document.getElementById('vr-environment-desc');
    this.$vrEnvironmentTag     = document.getElementById('vr-environment-tag');
    this.$levelText            = document.getElementById('level-text');
    this.$stagePills           = document.querySelectorAll('.stage-pill');

    // Clock & Mode Controls
    this.$elapsedTime          = document.getElementById('elapsed-time');
    this.$modeBadge            = document.getElementById('mode-badge');
    this.$modeToggle           = document.getElementById('mode-toggle');
    this.$modeToggleText       = document.getElementById('mode-toggle-text');

    // Panic Detector
    this.$panicBar             = document.getElementById('panic-bar');
    this.$panicSecondsLabel    = document.getElementById('panic-seconds-label');

    // Clinician Action Buttons
    this.$btnStepUp            = document.getElementById('btn-stepup');
    this.$btnStepDown          = document.getElementById('btn-stepdown');
    this.$btnPause             = document.getElementById('btn-pause');
    this.$pauseBtnLabel        = document.getElementById('pause-btn-label');
    this.$btnConclude          = document.getElementById('btn-conclude');

    // Dual Chart.js Line Engines
    this.hrChart  = createOceanicChart('hr-chart', 'Heart Rate', '43, 240, 175');
    this.edaChart = createOceanicChart('eda-chart', 'EDA Conductance', '251, 191, 36');

    // Internal Controller State
    this._tickIndex        = 0;
    this._sessionSeconds   = 0;
    this._sessionTimer     = null;
    this._pollInterval     = null;
    this._isRunning        = false;
    this._isSessionEnded   = false;
    this._currentLevel     = 'Baseline';
    this._isManuallyPaused = false;

    // Session Peak Biometric Trackers (for clinical report generation)
    this._sessionMaxHR     = 0;
    this._sessionMaxScore  = 0;

    this._bindEvents();
    this._setupRipples();
  }

  /* ----------------------------------------------------------------------
     Lifecycle & Event Binding
     ---------------------------------------------------------------------- */

  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    // 1-second elapsed clock timer
    if (!this._sessionTimer) {
      this._sessionTimer = setInterval(() => {
        if (!this._isSessionEnded) {
          this._sessionSeconds++;
          this._renderStopwatch();
        }
      }, 1000);
    }

    // Immediate polling tick & continuous interval
    this.pollServer();
    if (!this._pollInterval) {
      this._pollInterval = setInterval(() => {
        if (this._isRunning) {
          this.pollServer();
        }
      }, POLL_INTERVAL_MS);
    }
  }

  stop() {
    this._isRunning = false;
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._sessionTimer) {
      clearInterval(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  reset() {
    this.stop();
    this._tickIndex = 0;
    this._sessionSeconds = 0;
    this._isSessionEnded = false;
    this._currentLevel = 'Baseline';
    this._isManuallyPaused = false;

    // Reset session peak trackers
    this._sessionMaxHR = 0;
    this._sessionMaxScore = 0;

    if (this.$elapsedTime) this.$elapsedTime.textContent = '00:00';
    if (this.$hrValue) this.$hrValue.textContent = '72';
    if (this.$edaValue) this.$edaValue.textContent = '2.50';
    if (this.$stressValue) this.$stressValue.textContent = '0.20';
    if (this.$stressArc) this.$stressArc.style.strokeDashoffset = '95.5';
    if (this.$panicBar) this.$panicBar.style.width = '0%';
    if (this.$panicSecondsLabel) this.$panicSecondsLabel.textContent = '0 / 5s';

    if (this.hrChart) {
      this.hrChart.data.labels = [];
      this.hrChart.data.datasets[0].data = [];
      this.hrChart.update('none');
    }
    if (this.edaChart) {
      this.edaChart.data.labels = [];
      this.edaChart.data.datasets[0].data = [];
      this.edaChart.update('none');
    }

    this._renderVREnvironment('Baseline', false, false);
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
    if (this.$btnConclude) {
      this.$btnConclude.addEventListener('click', () => openPostSessionModal());
    }
    if (this.$modeToggle) {
      this.$modeToggle.addEventListener('click', () => sendCommand('toggle_mode'));
    }
  }

  /**
   * Adds glowing water ripple click animation to button capsules.
   */
  _setupRipples() {
    document.querySelectorAll('.btn-capsule').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple-wave';
        const diameter = Math.max(rect.width, rect.height);
        const radius = diameter / 2;
        ripple.style.width = ripple.style.height = `${diameter}px`;
        ripple.style.left = `${e.clientX - rect.left - radius}px`;
        ripple.style.top = `${e.clientY - rect.top - radius}px`;
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });
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
      console.warn('[Liber8] Telemetry Polling Disconnected:', err.message);
    }
  }

  /* ----------------------------------------------------------------------
     Reactive UI Rendering Engine
     ---------------------------------------------------------------------- */

  render(state) {
    if (!state) return;
    this._currentLevel = state.level || state.current_level || 'Baseline';
    const isSensorError = state.sensor_error === true;

    // Check if state is in Safe Room
    if (this._currentLevel.includes('Safe Room')) {
      this._isManuallyPaused = true;
    } else {
      this._isManuallyPaused = false;
    }

    this._renderBiometrics(state);
    this._renderClinicalSafety(state);
    this._renderPanicTimer(state.panic_sustained_seconds || 0);
    this._renderVREnvironment(this._currentLevel, isSensorError, this._isManuallyPaused);
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
    const hr = parseFloat(state.hr) || 0;

    // 1. Heart Rate Display & Dynamic Pulse Animation Speed
    if (this.$hrValue) {
      this.$hrValue.textContent = fmt(hr, 0);
      if (this.$heartIcon) {
        // Update heartbeat animation duration based on actual BPM
        const duration = hr > 100 ? '0.6s' : hr > 80 ? '0.9s' : '1.2s';
        this.$heartIcon.style.animationDuration = duration;
        this.$heartIcon.classList.remove('anim-heartbeat');
        void this.$heartIcon.offsetWidth;
        this.$heartIcon.classList.add('anim-heartbeat');
      }
    }

    // Track session peak HR
    this._sessionMaxHR = Math.max(this._sessionMaxHR, hr);

    // 2. EDA Conductance Reading & Animated Progress Bar
    const eda = parseFloat(state.eda) || 0;
    if (this.$edaValue) {
      this.$edaValue.textContent = fmt(eda, 2);
    }
    // Update the EDA glowing bar width (normalized: 0–5 µS → 0–100%)
    const edaBar = document.getElementById('eda-wave-bar');
    if (edaBar) {
      edaBar.style.width = Math.min(100, (eda / 5.0) * 100) + '%';
    }

    // 3. AI Stress Score
    const score = Math.max(0, Math.min(parseFloat(state.score) || 0, 1.0));

    // Track session peak stress score
    this._sessionMaxScore = Math.max(this._sessionMaxScore, score);

    if (this.$stressValue) {
      this.$stressValue.textContent = fmt(score, 2);
    }

    // Radial Visual Arc Sweep
    if (this.$stressArc) {
      const offset = CIRCLE_CIRCUMFERENCE * (1 - score);
      this.$stressArc.style.strokeDashoffset = offset.toFixed(2);
    }

    // Stress Tier Semantic Badging
    const tierInfo = evaluateStressTier(score);
    if (this.$stressLevelLabel) {
      this.$stressLevelLabel.textContent = tierInfo.label;
      this.$stressLevelLabel.className = `absolute text-[10px] font-bold font-mono-numbers ${tierInfo.textColor}`;
    }
    if (this.$stressStatusTag) {
      this.$stressStatusTag.textContent = tierInfo.tagText;
      this.$stressStatusTag.className = tierInfo.tagClass;
    }

    // Emergency Panic Card Border Glow
    if (this.$stressCard) {
      if (score >= 0.85) {
        this.$stressCard.classList.add('panic-card-active');
      } else {
        this.$stressCard.classList.remove('panic-card-active');
      }
    }
  }

  _renderClinicalSafety(state) {
    // A. Sensor Fault / Beautiful Scenery Warning Banner
    const isSafeRoomFallback =
      state.sensor_error === true ||
      (state.level && state.level.includes('Safe Room'));

    if (this.$sensorAlertBanner) {
      if (isSafeRoomFallback) {
        this.$sensorAlertBanner.classList.remove('hidden');
      } else {
        this.$sensorAlertBanner.classList.add('hidden');
      }
    }

    // B. Patient Subjective Feedback Badge
    const feedback = state.patient_feedback || 'Stable';
    if (this.$patientFeedbackBadge) {
      if (feedback === 'Overwhelmed') {
        this.$patientFeedbackBadge.className =
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono-numbers bg-rose-500/20 border border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse transition-all duration-300';
        this.$patientFeedbackBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span> Overwhelmed`;
      } else if (feedback === 'Challenging') {
        this.$patientFeedbackBadge.className =
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono-numbers bg-amber-500/15 border border-amber-500/30 text-amber-300 transition-all duration-300';
        this.$patientFeedbackBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Challenging`;
      } else {
        this.$patientFeedbackBadge.className =
          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono-numbers bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 transition-all duration-300';
        this.$patientFeedbackBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Stable`;
      }
    }

    // C. 30-Second Baseline Indicator
    if (this.$baselineValue) {
      const baselinePct = (parseFloat(state.baseline_stress || 0.2) * 100).toFixed(1);
      if (state.baseline_ready) {
        this.$baselineValue.textContent = `Resting: ${baselinePct}% (Calibrated)`;
        this.$baselineValue.className =
          'text-xs font-bold text-emerald-300 font-mono-numbers bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg shadow-[0_0_10px_rgba(43,240,175,0.2)]';
      } else {
        const samples = state.baseline_sample_count || 0;
        this.$baselineValue.textContent = `${baselinePct}% (${samples}/30s Calibrating)`;
        this.$baselineValue.className =
          'text-xs font-bold text-teal-300 font-mono-numbers bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 rounded-lg';
      }
    }

    // D. Step-Up Recommendation Alert (Boredom Plateau Detector)
    const isRecommended = state.step_up_recommended === true;
    if (this.$stepupBadge) {
      if (isRecommended) {
        this.$stepupBadge.classList.remove('hidden');
      } else {
        this.$stepupBadge.classList.add('hidden');
      }
    }

    if (this.$btnStepUp) {
      if (isRecommended) {
        this.$btnStepUp.classList.add('stepup-recommended-glow');
      } else {
        this.$btnStepUp.classList.remove('stepup-recommended-glow');
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

  /**
   * "Current VR Environment" Viewport Engine
   * Updates live environment title, description, and status tags.
   */
  _renderVREnvironment(level, isSensorError, isPaused) {
    if (this.$levelText) {
      this.$levelText.textContent = level;
    }

    const isSafeRoom = isSensorError || isPaused || (level && level.includes('Safe Room'));

    let title = '';
    let desc = '';
    let tag = '';
    let titleClass = '';
    let tagClass = '';

    if (isSafeRoom) {
      title = 'Safe Room: Beautiful Scenery';
      desc = isSensorError
        ? '⚠️ Electrode Disconnection Detected · Automatic Safe Room Fallback Active with Calming Alpine Soundscape'
        : 'Doctor Pause / Intervene Active · Exposure Halted · Calming Mountain Valley Active';
      tag = 'SAFE ROOM ACTIVE';
      titleClass = 'text-[#2bf0af] drop-shadow-[0_0_18px_rgba(43,240,175,0.6)]';
      tagClass = 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50';
    } else if (level === 'Baseline') {
      title = 'Baseline: Acclimatization Room';
      desc = 'Neutral Indoor Sanctuary · Patient Acclimatization & Resting Physiological Baseline Calibration';
      tag = 'BASELINE ACTIVE';
      titleClass = 'text-cyan-300 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]';
      tagClass = 'bg-cyan-500/25 text-cyan-300 border-cyan-400/40';
    } else if (level === 'Level 1') {
      title = 'Level 1: Ground Floor Lobby';
      desc = 'Enclosed Modern Atrium · Initial Low-Elevation Exposure Trial (Ground Elevation)';
      tag = 'LEVEL 1 EXPOSURE';
      titleClass = 'text-teal-200 drop-shadow-[0_0_15px_rgba(43,240,175,0.4)]';
      tagClass = 'bg-teal-500/20 text-teal-300 border-teal-400/40';
    } else if (level === 'Level 2') {
      title = 'Level 2: Open-Air Balcony';
      desc = 'Semi-Open Architectural Balcony · Moderate Height Stimulus with Protective Guardrails';
      tag = 'LEVEL 2 EXPOSURE';
      titleClass = 'text-[#fbbf24] drop-shadow-[0_0_18px_rgba(251,191,36,0.5)]';
      tagClass = 'bg-amber-500/25 text-amber-300 border-amber-400/50';
    } else if (level === 'Level 3') {
      title = 'Level 3: Suspended Glass Walkway';
      desc = 'Transparent Glass Floor Overlook · High-Salience Visual Vestibular Challenge';
      tag = 'LEVEL 3 EXPOSURE';
      titleClass = 'text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]';
      tagClass = 'bg-amber-600/25 text-amber-200 border-amber-400/50';
    } else if (level === 'Level 4') {
      title = 'Level 4: High-Altitude Edge';
      desc = 'Elevated Rooftop Perimeter · Open Skyline & Reduced Visual Anchoring';
      tag = 'LEVEL 4 EXPOSURE';
      titleClass = 'text-rose-300 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]';
      tagClass = 'bg-rose-500/25 text-rose-300 border-rose-400/50';
    } else if (level === 'Level 5') {
      title = 'Level 5: Peak Exposure Deck';
      desc = 'Apex Skyscraper Observation Platform · Maximum Systematic Desensitization Challenge';
      tag = 'MAX EXPOSURE DECK';
      titleClass = 'text-[#ff5c5c] drop-shadow-[0_0_24px_rgba(255,92,92,0.6)]';
      tagClass = 'bg-rose-600/30 text-rose-200 border-rose-500/60 animate-pulse';
    } else if (level === 'Step Down Triggered') {
      title = 'Step Down Triggered';
      desc = 'Panic Failsafe Automatically Engaged · Virtual Exposure Level Safely Decremented';
      tag = 'STEP DOWN FAILSAFE';
      titleClass = 'text-rose-400 drop-shadow-[0_0_18px_rgba(244,63,94,0.5)]';
      tagClass = 'bg-rose-500/25 text-rose-300 border-rose-400/50 animate-pulse';
    } else if (level === 'Session Complete') {
      title = 'Session Complete';
      desc = 'Clinical Exposure Protocol Finished · Patient Ready for Post-Session Debrief';
      tag = 'TRIAL CONCLUDED';
      titleClass = 'text-slate-300';
      tagClass = 'bg-slate-700/40 text-slate-300 border-slate-600';
    } else {
      title = level;
      desc = 'Active Virtual Exposure Session';
      tag = 'ENVIRONMENT ACTIVE';
      titleClass = 'text-white';
      tagClass = 'bg-white/10 text-slate-200 border-white/20';
    }

    if (this.$vrEnvironmentTitle) {
      this.$vrEnvironmentTitle.textContent = title;
      this.$vrEnvironmentTitle.className = `text-xl sm:text-2xl font-extrabold font-mono-numbers transition-all duration-300 ${titleClass}`;
    }

    if (this.$vrEnvironmentDesc) {
      this.$vrEnvironmentDesc.textContent = desc;
    }

    if (this.$vrEnvironmentTag) {
      this.$vrEnvironmentTag.textContent = tag;
      this.$vrEnvironmentTag.className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono-numbers uppercase tracking-wider backdrop-blur-md transition-all duration-300 ${tagClass}`;
    }

    // Update Pause / Resume Button Label & Styling
    if (this.$pauseBtnLabel) {
      if (isSafeRoom) {
        this.$pauseBtnLabel.textContent = 'Resume Exposure';
        if (this.$btnPause) {
          this.$btnPause.className =
            'btn-capsule flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase font-mono-numbers bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 shadow-[0_0_15px_rgba(43,240,175,0.3)]';
        }
      } else {
        this.$pauseBtnLabel.textContent = 'Pause / Safe Room';
        if (this.$btnPause) {
          this.$btnPause.className =
            'btn-capsule flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase font-mono-numbers bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 hover:border-rose-400 hover:shadow-[0_0_15px_rgba(244,63,94,0.3)] shadow-sm';
        }
      }
    }

    // Update Stage Pills Highlighting
    if (this.$stagePills && this.$stagePills.length > 0) {
      const stageMap = {
        'Baseline': 0,
        'Level 1': 1,
        'Level 2': 2,
        'Level 3': 3,
        'Level 4': 4,
        'Level 5': 5,
      };

      const activeIdx = isSafeRoom ? -1 : (stageMap[level] !== undefined ? stageMap[level] : -1);

      this.$stagePills.forEach((pill, idx) => {
        if (idx === activeIdx) {
          pill.className =
            'stage-pill text-[10px] font-bold font-mono-numbers px-2.5 py-1 rounded-lg bg-teal-500/25 text-teal-200 border border-teal-400/50 shadow-[0_0_10px_rgba(43,240,175,0.3)]';
        } else if (activeIdx !== -1 && idx < activeIdx) {
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
          'btn-capsule relative inline-flex items-center gap-2.5 px-4 py-2 rounded-full font-mono-numbers text-xs font-bold transition-all duration-300 bg-[#0c2838] border border-cyan-400/40 text-cyan-200 shadow-[0_0_15px_#06b6d4] hover:border-cyan-300';
        this.$modeToggleText.textContent = 'AUTO MODE: ON';
      } else {
        this.$modeToggle.className =
          'btn-capsule relative inline-flex items-center gap-2.5 px-4 py-2 rounded-full font-mono-numbers text-xs font-bold transition-all duration-300 bg-[#1e1b2e] border border-amber-400/40 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)] hover:border-amber-300';
        this.$modeToggleText.textContent = 'MANUAL CLINICIAN';
      }
    }
  }

  _pushChartMetrics(hr, eda) {
    const tick = `${this._tickIndex++}s`;

    const pushToChart = (chart, value) => {
      if (!chart) return;
      chart.data.labels.push(tick);
      chart.data.datasets[0].data.push(value);
      if (chart.data.labels.length > CHART_MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update('none');
    };

    pushToChart(this.hrChart, hr);
    pushToChart(this.edaChart, eda);
  }

  _checkSessionTermination(isComplete) {
    if (isComplete && !this._isSessionEnded) {
      this._isSessionEnded = true;
      this.stop();
      // Session complete — show a subtle indicator in the viewport card.
      // The Post-Session Debrief modal is ONLY triggered by the clinician
      // clicking the "Conclude Session" button, never automatically.
      const envTitle = document.getElementById('vr-environment-title');
      if (envTitle && !envTitle.textContent.includes('Session Complete')) {
        this._renderVREnvironment('Session Complete', false, false);
      }
    }
  }
}

/* =========================================================================
   UNIVERSAL CLINICIAN COMMAND SENDER
   ========================================================================= */

/**
 * Universal dispatcher sending JSON to POST /command.
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
    console.error(`[Liber8] Command network error for "${action}":`, err.message);
  }
}

/**
 * Smart toggle for Pause / Safe Room vs Resume.
 * Immediately applies calming emerald Safe Room override on Pause click for instant feedback.
 */
function handlePauseResume() {
  if (!window._liber8Controller) return;
  const isSafeRoom =
    window._liber8Controller._currentLevel &&
    window._liber8Controller._currentLevel.includes('Safe Room');

  if (!isSafeRoom) {
    // Instantly switch UI to Safe Room with Calming Emerald
    window._liber8Controller._renderVREnvironment('Safe Room: Beautiful Scenery', false, true);
    sendCommand('pause');
  } else {
    sendCommand('resume');
  }
}

/* =========================================================================
   GLOBAL FUNCTION EXPORTS (Expose to inline HTML event handlers)
   ========================================================================= */

window.showWelcome             = showWelcome;
window.showCRUD                = showCRUD;
window.showDashboard           = showDashboard;
window.exitDashboardToCRUD     = exitDashboardToCRUD;

window.openPatientModal        = openPatientModal;
window.closePatientModal       = closePatientModal;
window.editPatient             = editPatient;
window.deletePatient           = deletePatient;
window.savePatient             = savePatient;

window.toggleHeightUnit        = toggleHeightUnit;
window.toggleWeightUnit        = toggleWeightUnit;
window.toggleCustomPhobiaInput = toggleCustomPhobiaInput;

window.openPreSessionModal     = openPreSessionModal;
window.closePreSessionModal    = closePreSessionModal;
window.setChecklistAnswer      = setChecklistAnswer;
window.confirmAndLaunchSession = confirmAndLaunchSession;

window.openPostSessionModal    = openPostSessionModal;
window.closePostSessionModal   = closePostSessionModal;
window.setDebriefAnswer        = setDebriefAnswer;
window.saveAndEndSession       = saveAndEndSession;

window.sendCommand             = sendCommand;
window.handlePauseResume       = handlePauseResume;

/* =========================================================================
   APPLICATION BOOTSTRAP
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Controller
  window._liber8Controller = new DashboardController();

  // 2. Pre-seed default patients into localStorage if empty
  getPatients();

  // 3. Close modals on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePatientModal();
      closePreSessionModal();
      closePostSessionModal();
    }
  });

  // 4. Initial Screen: Welcome Screen (polling remains idle until Section C is launched)
  const secDash = document.getElementById('section-dashboard');
  if (secDash && !secDash.classList.contains('hidden')) {
    window._liber8Controller.start();
  } else {
    window._liber8Controller.stop();
  }

  console.info('[Liber8] Full-Width Oceanic SPA with Pre-Flight & Debrief initialized.');
});
