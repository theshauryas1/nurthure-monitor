/* ========================================
   NURTHURE MONITOR - Alerts System
   Threshold checking and notifications
   ======================================== */

class AlertsManager {
    constructor() {
        // Default thresholds
        this.thresholds = {
            respiration: { min: 20, max: 60 },
            co2: { max: 1000 },
            bodyTemp: { min: 36, max: 38 },
            voc: { max: 1.0 }
        };

        this.soundEnabled = true;
        this.vibrationEnabled = true;
        this.notificationsEnabled = true;

        // Alert sound
        this.alertSound = null;
        this.criticalSound = null;

        // Cooldown to prevent alert spam (ms)
        this.alertCooldown = 30000; // 30 seconds
        this.lastAlerts = {};

        this.listeners = {
            alert: [],
            alertCleared: []
        };
    }

    // Initialize
    async init() {
        // Load saved thresholds
        await this.loadThresholds();

        // Create audio elements
        this.createAlertSounds();

        // Request notification permission
        if (this.notificationsEnabled && 'Notification' in window) {
            Notification.requestPermission();
        }

        console.log('[Alerts] Initialized with thresholds:', this.thresholds);
    }

    // Event system
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    // Create alert sounds using Web Audio API
    createAlertSounds() {
        // We'll use oscillator for beeps (no external file needed)
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[Alerts] Web Audio API not available');
        }
    }

    // Play alert sound
    playSound(severity) {
        if (!this.soundEnabled || !this.audioContext) return;

        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Different tones for different severities
        if (severity === 'CRITICAL') {
            oscillator.frequency.value = 880; // A5 - higher, more urgent
            oscillator.type = 'square';
            gainNode.gain.value = 0.3;

            // Beep pattern: beep-beep-beep
            oscillator.start();
            setTimeout(() => oscillator.stop(), 150);

            setTimeout(() => this.playBeep(880, 150), 200);
            setTimeout(() => this.playBeep(880, 150), 400);
        } else {
            oscillator.frequency.value = 523; // C5 - lower, less urgent
            oscillator.type = 'sine';
            gainNode.gain.value = 0.2;

            oscillator.start();
            setTimeout(() => oscillator.stop(), 300);
        }
    }

    playBeep(frequency, duration) {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = 'square';
        gainNode.gain.value = 0.3;

        oscillator.start();
        setTimeout(() => oscillator.stop(), duration);
    }

    // Trigger vibration
    vibrate(pattern) {
        if (!this.vibrationEnabled) return;

        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    }

    // Show browser notification
    showNotification(title, body, severity) {
        if (!this.notificationsEnabled) return;
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const icon = severity === 'CRITICAL'
            ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff1744"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
            : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ffc107"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-8h2v8z"/></svg>';

        new Notification(title, {
            body,
            icon,
            tag: `nurthure-${Date.now()}`,
            requireInteraction: severity === 'CRITICAL'
        });
    }

    // Load thresholds from storage
    async loadThresholds() {
        if (window.storageManager && window.storageManager.db) {
            const saved = await window.storageManager.getSetting('thresholds');
            if (saved) {
                this.thresholds = { ...this.thresholds, ...saved };
            }
        }
    }

    // Save thresholds to storage
    async saveThresholds() {
        if (window.storageManager && window.storageManager.db) {
            await window.storageManager.saveSetting('thresholds', this.thresholds);
        }
    }

    // Update a threshold
    async setThreshold(sensor, min, max) {
        if (this.thresholds[sensor]) {
            if (min !== undefined) this.thresholds[sensor].min = min;
            if (max !== undefined) this.thresholds[sensor].max = max;
            await this.saveThresholds();
        }
    }

    // Check reading against thresholds
    checkReading(reading) {
        const alerts = [];
        const now = Date.now();

        // Check respiration
        if (reading.respiration?.value !== null) {
            const resp = reading.respiration.value;

            if (resp < this.thresholds.respiration.min) {
                alerts.push(this.createAlert(
                    'CRITICAL',
                    'Apnea Detected (mmWave)',
                    `No respiration detected for 15 seconds. Current: ${resp} rpm`,
                    'respiration_low'
                ));
            } else if (resp > this.thresholds.respiration.max) {
                alerts.push(this.createAlert(
                    'WARNING',
                    'High Respiration Rate',
                    `Respiration rate elevated at ${resp} rpm`,
                    'respiration_high'
                ));
            }
        }

        // Check CO2
        if (reading.environment?.co2?.value !== null) {
            const co2 = reading.environment.co2.value;

            if (co2 > this.thresholds.co2.max) {
                alerts.push(this.createAlert(
                    'WARNING',
                    'High CO₂ (MH-Z19C)',
                    `Carbon dioxide levels exceeded ${this.thresholds.co2.max} ppm. Current: ${co2} ppm`,
                    'co2_high'
                ));
            }
        }

        // Check body temperature
        if (reading.bodyTemp?.value !== null) {
            const temp = reading.bodyTemp.value;

            if (temp < this.thresholds.bodyTemp.min) {
                alerts.push(this.createAlert(
                    'WARNING',
                    'Low Body Temperature',
                    `Body temperature below normal at ${temp}°C`,
                    'temp_low'
                ));
            } else if (temp > this.thresholds.bodyTemp.max) {
                alerts.push(this.createAlert(
                    'CRITICAL',
                    'High Body Temperature',
                    `Fever detected at ${temp}°C`,
                    'temp_high'
                ));
            }
        }

        // Check posture
        if (reading.posture?.state === 'prone') {
            alerts.push(this.createAlert(
                'WARNING',
                'Prone Position (Camera)',
                'Infant rolled onto stomach detected by vision system.',
                'posture_prone'
            ));
        }

        // Check VOC
        if (reading.environment?.voc?.value !== null) {
            const voc = reading.environment.voc.value;

            if (voc > this.thresholds.voc.max) {
                alerts.push(this.createAlert(
                    'WARNING',
                    'High VOC Levels',
                    `Volatile organic compounds elevated at ${voc}`,
                    'voc_high'
                ));
            }
        }

        // Check gas safety
        if (reading.environment?.gas?.safe === false) {
            alerts.push(this.createAlert(
                'CRITICAL',
                'Gas Safety Alert',
                'Unsafe gas levels detected by MQ-135 sensor.',
                'gas_unsafe'
            ));
        }

        // Check audio for choking
        if (reading.audio?.state === 'choking') {
            alerts.push(this.createAlert(
                'CRITICAL',
                'Choking Sound (MEMS)',
                'Audio pattern matching choking detected.',
                'audio_choking'
            ));
        }

        // Process and emit alerts (respecting cooldown)
        alerts.forEach(alert => {
            if (this.shouldTriggerAlert(alert.key)) {
                this.triggerAlert(alert);
            }
        });

        return alerts;
    }

    // Create alert object
    createAlert(severity, title, description, key) {
        return {
            severity,
            title,
            description,
            key,
            timestamp: Date.now()
        };
    }

    // Check cooldown
    shouldTriggerAlert(key) {
        const lastTime = this.lastAlerts[key] || 0;
        return Date.now() - lastTime > this.alertCooldown;
    }

    // Trigger an alert
    async triggerAlert(alert) {
        this.lastAlerts[alert.key] = alert.timestamp;

        // Save to storage
        if (window.storageManager && window.storageManager.db) {
            await window.storageManager.saveAlert(alert);
        }

        // Play sound
        this.playSound(alert.severity);

        // Vibrate
        if (alert.severity === 'CRITICAL') {
            this.vibrate([200, 100, 200, 100, 200]);
        } else {
            this.vibrate([200, 100, 200]);
        }

        // Show notification
        this.showNotification(alert.title, alert.description, alert.severity);

        // Emit event
        this.emit('alert', alert);

        console.log(`[Alerts] ${alert.severity}: ${alert.title}`);
    }
}

// Create global instance
window.alertsManager = new AlertsManager();
