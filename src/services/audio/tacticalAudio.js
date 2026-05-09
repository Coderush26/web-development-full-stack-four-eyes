const SOUND_FILES = {
  warning: '/audio/warning.mp3',
  critical: '/audio/critical.mp3',
  emergency: '/audio/emergency.mp3'
};

const FALLBACK_SOUND_FILES = {
  warning: '/sounds/beep.mp3',
  critical: '/sounds/alert.mp3',
  emergency: '/sounds/emergency.mp3'
};

const INTERVAL_MS = {
  warning: 7000,
  critical: 2500
};

let activeLevel = 'normal';
let cadenceTimer = null;
let emergencyAudio = null;
let emergencyRetryTimer = null;

function clearEmergencyRetry() {
  if (emergencyRetryTimer) {
    clearInterval(emergencyRetryTimer);
    emergencyRetryTimer = null;
  }
}

function stopEmergencyLoop() {
  clearEmergencyRetry();
  if (!emergencyAudio) return;
  emergencyAudio.pause();
  emergencyAudio.currentTime = 0;
  emergencyAudio = null;
}

function playOneShot(level) {
  if (typeof window === 'undefined') return;
  const primary = SOUND_FILES[level] || SOUND_FILES.warning;
  const fallback = FALLBACK_SOUND_FILES[level] || FALLBACK_SOUND_FILES.warning;
  const audio = new Audio(primary);
  audio.loop = false;
  audio.currentTime = 0;
  audio.play().catch(() => {
    const fallbackAudio = new Audio(fallback);
    fallbackAudio.currentTime = 0;
    fallbackAudio.play().catch(() => {});
  });
}

function startEmergencyLoop() {
  if (typeof window === 'undefined') return;
  if (emergencyAudio) return;

  emergencyAudio = new Audio(SOUND_FILES.emergency);
  emergencyAudio.loop = true;
  emergencyAudio.currentTime = 0;
  emergencyAudio.play().catch(() => {
    emergencyAudio = new Audio(FALLBACK_SOUND_FILES.emergency);
    emergencyAudio.loop = true;
    emergencyAudio.currentTime = 0;
    emergencyAudio.play().catch(() => {});
  });

  // Retry loop start in case autoplay policy blocked initial attempt.
  emergencyRetryTimer = setInterval(() => {
    if (!emergencyAudio) {
      clearEmergencyRetry();
      return;
    }
    if (!emergencyAudio.paused) return;
    emergencyAudio.play().catch(() => {});
  }, 2500);
}

function clearCadence() {
  if (cadenceTimer) {
    clearInterval(cadenceTimer);
    cadenceTimer = null;
  }
}

function startCadence(level) {
  clearCadence();
  if (level !== 'warning' && level !== 'critical') return;
  playOneShot(level);
  cadenceTimer = setInterval(() => {
    if (activeLevel !== level) return;
    playOneShot(level);
  }, INTERVAL_MS[level]);
}

function normalizeLevel(level) {
  if (!level) return 'normal';
  const normalized = String(level).toLowerCase();
  if (normalized === 'emergency') return 'emergency';
  if (normalized === 'high' || normalized === 'critical') return 'critical';
  if (normalized === 'medium' || normalized === 'warning') return 'warning';
  if (normalized === 'low' || normalized === 'normal') return 'normal';
  if (normalized === 'critical') return 'critical';
  return 'normal';
}

export function applyTacticalAudioLevel(level) {
  const nextLevel = normalizeLevel(level);

  if (nextLevel === 'normal') {
    activeLevel = 'normal';
    clearCadence();
    stopEmergencyLoop();
    return;
  }

  if (nextLevel === 'emergency') {
    activeLevel = 'emergency';
    clearCadence();
    startEmergencyLoop();
    return;
  }

  // Downgrade from emergency to non-emergency should stop siren.
  if (activeLevel === 'emergency') {
    stopEmergencyLoop();
  }

  activeLevel = nextLevel;
  startCadence(nextLevel);
}

export function stopTacticalAudio() {
  activeLevel = 'normal';
  clearCadence();
  stopEmergencyLoop();
}

