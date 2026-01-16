/* ========================================
   NURTHURE MONITOR - Local Storage (IndexedDB)
   Stores readings, alerts, and settings
   ======================================== */

class StorageManager {
    constructor() {
        this.dbName = 'nurthure-monitor';
        this.dbVersion = 1;
        this.db = null;
        this.maxReadings = 10000; // Keep last 10k readings
        this.maxAlerts = 500;     // Keep last 500 alerts
    }

    // Initialize database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('[Storage] Failed to open database');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[Storage] Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Readings store - indexed by timestamp
                if (!db.objectStoreNames.contains('readings')) {
                    const readingsStore = db.createObjectStore('readings', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    readingsStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Alerts store
                if (!db.objectStoreNames.contains('alerts')) {
                    const alertsStore = db.createObjectStore('alerts', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    alertsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    alertsStore.createIndex('severity', 'severity', { unique: false });
                    alertsStore.createIndex('acknowledged', 'acknowledged', { unique: false });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                console.log('[Storage] Database schema created');
            };
        });
    }

    // ========== READINGS ==========

    // Save a reading
    async saveReading(reading) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['readings'], 'readwrite');
            const store = transaction.objectStore('readings');

            const record = {
                ...reading,
                timestamp: reading.timestamp || Date.now()
            };

            const request = store.add(record);

            request.onsuccess = () => {
                resolve(request.result);
                this.cleanupOldReadings();
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Get readings by time range
    async getReadings(startTime, endTime) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['readings'], 'readonly');
            const store = transaction.objectStore('readings');
            const index = store.index('timestamp');
            const range = IDBKeyRange.bound(startTime, endTime);

            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get readings for last N hours
    async getReadingsLastHours(hours) {
        const endTime = Date.now();
        const startTime = endTime - (hours * 60 * 60 * 1000);
        return this.getReadings(startTime, endTime);
    }

    // Get latest reading
    async getLatestReading() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['readings'], 'readonly');
            const store = transaction.objectStore('readings');
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'prev');

            request.onsuccess = () => {
                const cursor = request.result;
                resolve(cursor ? cursor.value : null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Cleanup old readings (keep only maxReadings)
    async cleanupOldReadings() {
        const transaction = this.db.transaction(['readings'], 'readwrite');
        const store = transaction.objectStore('readings');

        const countRequest = store.count();
        countRequest.onsuccess = () => {
            const count = countRequest.result;
            if (count > this.maxReadings) {
                const deleteCount = count - this.maxReadings;
                const cursorRequest = store.openCursor();
                let deleted = 0;

                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor && deleted < deleteCount) {
                        cursor.delete();
                        deleted++;
                        cursor.continue();
                    }
                };
            }
        };
    }

    // ========== ALERTS ==========

    // Save an alert
    async saveAlert(alert) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alerts'], 'readwrite');
            const store = transaction.objectStore('alerts');

            const record = {
                ...alert,
                timestamp: alert.timestamp || Date.now(),
                acknowledged: false
            };

            const request = store.add(record);

            request.onsuccess = () => {
                resolve(request.result);
                this.cleanupOldAlerts();
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Get all alerts (optionally filter by acknowledged status)
    async getAlerts(acknowledgedOnly = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alerts'], 'readonly');
            const store = transaction.objectStore('alerts');

            let request;
            if (acknowledgedOnly !== null) {
                const index = store.index('acknowledged');
                request = index.getAll(acknowledgedOnly);
            } else {
                request = store.getAll();
            }

            request.onsuccess = () => {
                // Sort by timestamp descending
                const alerts = request.result.sort((a, b) => b.timestamp - a.timestamp);
                resolve(alerts);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Acknowledge an alert
    async acknowledgeAlert(alertId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alerts'], 'readwrite');
            const store = transaction.objectStore('alerts');

            const getRequest = store.get(alertId);

            getRequest.onsuccess = () => {
                const alert = getRequest.result;
                if (alert) {
                    alert.acknowledged = true;
                    const putRequest = store.put(alert);
                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve(false);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Clear all alerts
    async clearAlerts() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['alerts'], 'readwrite');
            const store = transaction.objectStore('alerts');
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Cleanup old alerts
    async cleanupOldAlerts() {
        const transaction = this.db.transaction(['alerts'], 'readwrite');
        const store = transaction.objectStore('alerts');

        const countRequest = store.count();
        countRequest.onsuccess = () => {
            const count = countRequest.result;
            if (count > this.maxAlerts) {
                const index = store.index('timestamp');
                const cursorRequest = index.openCursor();
                let deleted = 0;
                const toDelete = count - this.maxAlerts;

                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor && deleted < toDelete) {
                        cursor.delete();
                        deleted++;
                        cursor.continue();
                    }
                };
            }
        };
    }

    // ========== SETTINGS ==========

    // Save a setting
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');

            const request = store.put({ key, value });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Get a setting
    async getSetting(key, defaultValue = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');

            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result ? request.result.value : defaultValue);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Get all settings
    async getAllSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');

            const request = store.getAll();

            request.onsuccess = () => {
                const settings = {};
                request.result.forEach(item => {
                    settings[item.key] = item.value;
                });
                resolve(settings);
            };

            request.onerror = () => reject(request.error);
        });
    }

    // ========== EXPORT ==========

    // Export all readings as JSON
    async exportReadingsJSON(startTime = 0, endTime = Date.now()) {
        const readings = await this.getReadings(startTime, endTime);
        return JSON.stringify(readings, null, 2);
    }

    // Export readings as CSV
    async exportReadingsCSV(startTime = 0, endTime = Date.now()) {
        const readings = await this.getReadings(startTime, endTime);

        if (readings.length === 0) return '';

        const headers = [
            'timestamp', 'datetime',
            'respiration_value', 'respiration_unit',
            'audio_state', 'audio_level',
            'body_temp_value', 'body_temp_unit',
            'posture_state',
            'radar_active', 'radar_movement',
            'env_temp_value', 'env_co2_value', 'env_voc_value', 'env_gas_safe'
        ];

        const rows = readings.map(r => [
            r.timestamp,
            new Date(r.timestamp).toISOString(),
            r.respiration?.value ?? '',
            r.respiration?.unit ?? '',
            r.audio?.state ?? '',
            r.audio?.level ?? '',
            r.bodyTemp?.value ?? '',
            r.bodyTemp?.unit ?? '',
            r.posture?.state ?? '',
            r.radar?.active ?? '',
            r.radar?.movement ?? '',
            r.environment?.temp?.value ?? '',
            r.environment?.co2?.value ?? '',
            r.environment?.voc?.value ?? '',
            r.environment?.gas?.safe ?? ''
        ]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
}

// Create global instance
window.storageManager = new StorageManager();
