/* ========================================
   NURTHURE MONITOR - Connection Manager
   Handles Raspberry Pi connectivity
   ======================================== */

class ConnectionManager {
    constructor() {
        this.isConnected = false;
        this.piAddress = localStorage.getItem('piAddress') || '192.168.4.1';
        this.piPort = localStorage.getItem('piPort') || '80';
        this.pollInterval = parseInt(localStorage.getItem('pollInterval')) || 2000;
        this.retryDelay = 5000;
        this.maxRetries = 3;
        this.currentRetries = 0;
        this.pollTimer = null;
        this.lastReading = null;
        this.listeners = {
            connected: [],
            disconnected: [],
            data: [],
            error: []
        };
    }

    // Get the full URL to the Pi
    get url() {
        return `http://${this.piAddress}:${this.piPort}`;
    }

    // Event system
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    // Configure connection settings
    configure(address, port, interval) {
        this.piAddress = address;
        this.piPort = port;
        this.pollInterval = interval;

        localStorage.setItem('piAddress', address);
        localStorage.setItem('piPort', port);
        localStorage.setItem('pollInterval', interval.toString());

        // Restart polling with new settings
        this.stop();
        this.start();
    }

    // Start polling for data
    start() {
        console.log(`[Connection] Starting polling to ${this.url}`);
        this.poll();
    }

    // Stop polling
    stop() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    // Single poll attempt
    async poll() {
        try {
            const reading = await this.fetchReadings();

            if (reading) {
                // Success - we're connected
                if (!this.isConnected) {
                    this.isConnected = true;
                    this.currentRetries = 0;
                    this.emit('connected', { address: this.piAddress });
                    console.log('[Connection] Connected to Pi');
                }

                this.lastReading = reading;
                this.emit('data', reading);
            }
        } catch (error) {
            this.handleError(error);
        }

        // Schedule next poll
        this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }

    // Fetch readings from Pi
    async fetchReadings() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(`${this.url}/readings`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return this.normalizeReading(data);
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    }

    // Normalize reading data to consistent format
    normalizeReading(data) {
        return {
            timestamp: data.timestamp || Date.now(),
            respiration: {
                value: data.respiration?.value ?? null,
                unit: data.respiration?.unit || 'rpm',
                confidence: data.respiration?.confidence ?? 1
            },
            audio: {
                state: data.audio?.state || 'unknown',
                level: data.audio?.level ?? 0
            },
            bodyTemp: {
                value: data.body_temp?.value ?? null,
                unit: data.body_temp?.unit || 'C'
            },
            posture: {
                state: data.posture?.state || 'unknown',
                confidence: data.posture?.confidence ?? 1
            },
            radar: {
                active: data.radar?.active ?? false,
                movement: data.radar?.movement ?? 0
            },
            environment: {
                temp: {
                    value: data.environment?.temp?.value ?? data.environment?.temp ?? null,
                    unit: data.environment?.temp?.unit || 'C'
                },
                co2: {
                    value: data.environment?.co2?.value ?? data.environment?.co2 ?? null,
                    unit: data.environment?.co2?.unit || 'ppm'
                },
                voc: {
                    value: data.environment?.voc?.value ?? data.environment?.voc ?? null
                },
                gas: {
                    safe: data.environment?.gas?.safe ?? data.environment?.gas ?? true
                }
            }
        };
    }

    // Handle connection errors
    handleError(error) {
        console.warn('[Connection] Error:', error.message);

        this.currentRetries++;

        if (this.isConnected) {
            // We were connected but now lost connection
            this.isConnected = false;
            this.lastReading = null;
            this.emit('disconnected', { error: error.message });
            console.log('[Connection] Disconnected from Pi');
        }

        this.emit('error', {
            message: error.message,
            retries: this.currentRetries
        });
    }

    // Check if currently connected
    getStatus() {
        return {
            connected: this.isConnected,
            address: this.piAddress,
            port: this.piPort,
            lastReading: this.lastReading
        };
    }
}

// Create global instance
window.connectionManager = new ConnectionManager();
