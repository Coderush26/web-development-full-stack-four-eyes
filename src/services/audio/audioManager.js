const SOUND_FILES = {
  ping: '/audio/ping.mp3',
  warning: '/audio/warning.mp3',
  critical: '/audio/critical.mp3',
  emergency: '/audio/emergency.mp3',
  aiAlert: '/audio/ai-alert.mp3'
};

const FALLBACK_SOUND_FILES = {
  ping: '/sounds/beep.mp3',
  warning: '/sounds/beep.mp3',
  critical: '/sounds/alert.mp3',
  emergency: '/sounds/emergency.mp3',
  aiAlert: '/sounds/alert.mp3'
};

const LEVEL_RANK = {
  NORMAL: 0,
  WARNING: 1,
  CRITICAL: 2,
  EMERGENCY: 3
};

const INTERVAL_MS = {
  WARNING: 12000,
  CRITICAL: 4500
};

class AudioManager {
  constructor() {
    this.currentLevel = 'NORMAL';
    this.cadenceTimer = null;
    this.emergencyAudio = null;
    this.emergencyRetryTimer = null;
    this.lastAiCueAt = 0;
  }

  normalize(level) {
    if (!level) return 'NORMAL';
    const normalized = String(level).toUpperCase();
    if (normalized === 'HIGH') return 'CRITICAL';
    if (normalized === 'MEDIUM') return 'WARNING';
    if (normalized === 'LOW') return 'NORMAL';
    return LEVEL_RANK[normalized] != null ? normalized : 'NORMAL';
  }

  playAsset(primaryPath, fallbackPath, loop = false) {
    if (typeof window === 'undefined') return null;
    const audio = new Audio(primaryPath);
    audio.loop = loop;
    audio.currentTime = 0;
    audio.play().catch(() => {
      const fallback = new Audio(fallbackPath);
      fallback.loop = loop;
      fallback.currentTime = 0;
      fallback.play().catch(() => {});
    });
    return audio;
  }

  clearCadence() {
    if (this.cadenceTimer) {
      clearInterval(this.cadenceTimer);
      this.cadenceTimer = null;
    }
  }

  clearEmergencyRetry() {
    if (this.emergencyRetryTimer) {
      clearInterval(this.emergencyRetryTimer);
      this.emergencyRetryTimer = null;
    }
  }

  stopEmergency() {
    this.clearEmergencyRetry();
    if (!this.emergencyAudio) return;
    this.emergencyAudio.pause();
    this.emergencyAudio.currentTime = 0;
    this.emergencyAudio = null;
  }

  startEmergency() {
    if (this.emergencyAudio || typeof window === 'undefined') return;
    this.emergencyAudio = this.playAsset(
      SOUND_FILES.emergency,
      FALLBACK_SOUND_FILES.emergency,
      true
    );

    this.emergencyRetryTimer = setInterval(() => {
      if (!this.emergencyAudio) {
        this.clearEmergencyRetry();
        return;
      }
      if (!this.emergencyAudio.paused) return;
      this.emergencyAudio.play().catch(() => {});
    }, 2500);
  }

  startCadence(level) {
    this.clearCadence();
    if (level === 'WARNING') {
      this.playAsset(SOUND_FILES.ping, FALLBACK_SOUND_FILES.ping, false);
      this.cadenceTimer = setInterval(() => {
        if (this.currentLevel !== 'WARNING') return;
        this.playAsset(SOUND_FILES.warning, FALLBACK_SOUND_FILES.warning, false);
      }, INTERVAL_MS.WARNING);
      return;
    }

    if (level === 'CRITICAL') {
      this.playAsset(SOUND_FILES.critical, FALLBACK_SOUND_FILES.critical, false);
      this.cadenceTimer = setInterval(() => {
        if (this.currentLevel !== 'CRITICAL') return;
        this.playAsset(SOUND_FILES.critical, FALLBACK_SOUND_FILES.critical, false);
      }, INTERVAL_MS.CRITICAL);
    }
  }

  setSeverity(level) {
    const next = this.normalize(level);
    if (next === this.currentLevel) return this.currentLevel;

    // Always enforce single highest-priority active sound.
    this.currentLevel = next;
    this.clearCadence();

    if (next !== 'EMERGENCY') {
      this.stopEmergency();
    }

    if (next === 'NORMAL') return this.currentLevel;
    if (next === 'EMERGENCY') {
      this.startEmergency();
      return this.currentLevel;
    }

    this.startCadence(next);
    return this.currentLevel;
  }

  triggerAiEscalationCue() {
    if (this.currentLevel === 'EMERGENCY') return;
    const now = Date.now();
    if (now - this.lastAiCueAt < 7000) return;
    this.lastAiCueAt = now;
    this.playAsset(SOUND_FILES.aiAlert, FALLBACK_SOUND_FILES.aiAlert, false);
  }

  stopAll() {
    this.currentLevel = 'NORMAL';
    this.clearCadence();
    this.stopEmergency();
  }
}

const audioManager = new AudioManager();
export default audioManager;
