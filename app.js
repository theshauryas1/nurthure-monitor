/* ========================================
   NURTHURE MONITOR - Main Application
   Integrates all modules and handles UI
   ======================================== */

// App state
const appState = {
    isConnected: false,
    currentScreen: 'monitor',
    lastReading: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Initializing Nurthure Monitor...');

    // Initialize storage first
    try {
        await window.storageManager.init();
        console.log('[App] Storage initialized');
    } catch (error) {
        console.error('[App] Storage init failed:', error);
    }

    // Initialize alerts
    await window.alertsManager.init();

    // Load last Gemini analysis
    await window.geminiManager.loadLastAnalysis();

    // Setup UI
    initNavigation();
    initTimeTabs();
    initSliders();
    initClearAlerts();
    initSettingsUI();
    initExportButtons();

    // Setup connection listeners
    setupConnectionListeners();

    // Start connection to Pi
    window.connectionManager.start();

    // Initial UI state (disconnected)
    updateConnectionUI(false);

    console.log('[App] Initialization complete');
});

/* ========================================
   CONNECTION HANDLING
   ======================================== */

function setupConnectionListeners() {
    const cm = window.connectionManager;

    cm.on('connected', (data) => {
        appState.isConnected = true;
        updateConnectionUI(true);
        console.log('[App] Connected to Pi at', data.address);
    });

    cm.on('disconnected', (data) => {
        appState.isConnected = false;
        updateConnectionUI(false);
        console.log('[App] Disconnected from Pi:', data.error);
    });

    cm.on('data', async (reading) => {
        appState.lastReading = reading;

        // Update UI with real data
        updateMonitorUI(reading);

        // Store reading
        try {
            await window.storageManager.saveReading(reading);
        } catch (error) {
            console.error('[App] Failed to save reading:', error);
        }

        // Check for alerts
        window.alertsManager.checkReading(reading);
    });

    cm.on('error', (data) => {
        console.warn('[App] Connection error:', data.message);
    });

    // Listen for alerts
    window.alertsManager.on('alert', (alert) => {
        refreshAlertsUI();
        updateAlertBadge();
    });
}

function updateConnectionUI(isConnected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-indicator .status-text');
    const disconnectedOverlay = document.getElementById('disconnected-overlay');

    if (isConnected) {
        statusDot?.classList.add('active');
        if (statusText) statusText.textContent = 'System Nominal';
        if (statusText) statusText.style.color = '#4caf50';
        disconnectedOverlay?.classList.add('hidden');

        // Update hardware status in settings
        updateHardwareStatus(true);
    } else {
        statusDot?.classList.remove('active');
        if (statusText) statusText.textContent = 'Device Not Connected';
        if (statusText) statusText.style.color = '#ff1744';
        disconnectedOverlay?.classList.remove('hidden');

        // Clear values - show "--"
        clearSensorValues();

        // Update hardware status in settings
        updateHardwareStatus(false);
    }
}

function clearSensorValues() {
    // Respiration
    const respValue = document.getElementById('resp-value');
    if (respValue) respValue.textContent = '--';

    // Body temp
    const bodyTemp = document.getElementById('body-temp');
    if (bodyTemp) bodyTemp.textContent = '--';

    // Audio status
    const audioStatus = document.getElementById('audio-status');
    if (audioStatus) audioStatus.textContent = '--';

    // Posture
    const postureValue = document.getElementById('posture-value');
    if (postureValue) postureValue.textContent = '--';

    // Radar
    const radarStatus = document.getElementById('radar-status');
    if (radarStatus) radarStatus.textContent = '--';

    // Environment
    const envTemp = document.getElementById('env-temp');
    const envCO2 = document.getElementById('env-co2');
    const envVOC = document.getElementById('env-voc');
    if (envTemp) envTemp.textContent = '--';
    if (envCO2) envCO2.textContent = '--';
    if (envVOC) envVOC.textContent = '--';

    // Clear waveform
    clearWaveform();
}

function updateHardwareStatus(isOnline) {
    const hardwareItems = document.querySelectorAll('.hardware-status');
    hardwareItems.forEach(item => {
        if (isOnline) {
            item.textContent = item.dataset.status || 'Active';
            item.className = 'hardware-status active';
        } else {
            item.dataset.status = item.textContent;
            item.textContent = 'Offline';
            item.className = 'hardware-status offline';
        }
    });
}

/* ========================================
   MONITOR UI UPDATE
   ======================================== */

function updateMonitorUI(reading) {
    // Respiration
    if (reading.respiration?.value !== null) {
        const respValue = document.getElementById('resp-value');
        if (respValue) respValue.textContent = Math.round(reading.respiration.value);
    }

    // Audio
    if (reading.audio?.state) {
        const audioStatus = document.getElementById('audio-status');
        if (audioStatus) {
            const stateMap = {
                'quiet': 'Quiet',
                'crying': 'Crying',
                'babbling': 'Babbling',
                'choking': 'Choking!',
                'unknown': 'Analyzing...'
            };
            audioStatus.textContent = stateMap[reading.audio.state] || reading.audio.state;
        }
    }

    // Body temperature
    if (reading.bodyTemp?.value !== null) {
        const bodyTemp = document.getElementById('body-temp');
        if (bodyTemp) bodyTemp.textContent = reading.bodyTemp.value.toFixed(1);
    }

    // Posture
    if (reading.posture?.state) {
        const postureValue = document.getElementById('posture-value');
        const postureIcon = document.querySelector('.posture-icon svg');
        if (postureValue) {
            const stateMap = {
                'supine': 'Back',
                'side': 'Side',
                'prone': 'Prone',
                'sitting': 'Sitting',
                'unknown': 'Unknown'
            };
            postureValue.textContent = stateMap[reading.posture.state] || reading.posture.state;

            // Update icon color based on safety
            if (postureIcon) {
                if (reading.posture.state === 'prone') {
                    postureIcon.setAttribute('fill', '#ff1744');
                } else {
                    postureIcon.setAttribute('fill', '#4caf50');
                }
            }
        }
    }

    // Radar status
    if (reading.radar !== undefined) {
        const radarStatus = document.getElementById('radar-status');
        if (radarStatus) {
            radarStatus.textContent = reading.radar.active ? 'Active' : 'Inactive';
        }
    }

    // Environment
    if (reading.environment) {
        if (reading.environment.temp?.value !== null) {
            const envTemp = document.getElementById('env-temp');
            if (envTemp) envTemp.textContent = reading.environment.temp.value.toFixed(1);
        }

        if (reading.environment.co2?.value !== null) {
            const envCO2 = document.getElementById('env-co2');
            if (envCO2) envCO2.textContent = Math.round(reading.environment.co2.value);
        }

        if (reading.environment.voc?.value !== null) {
            const envVOC = document.getElementById('env-voc');
            if (envVOC) envVOC.textContent = reading.environment.voc.value.toFixed(2);
        }

        // Gas safety icon
        const gasIcon = document.querySelector('.env-status-icon svg');
        if (gasIcon && reading.environment.gas !== undefined) {
            if (reading.environment.gas.safe) {
                gasIcon.setAttribute('fill', '#4caf50');
            } else {
                gasIcon.setAttribute('fill', '#ff1744');
            }
        }
    }

    // Update waveform with actual respiration signal
    updateWaveformWithReading(reading);
}

/* ========================================
   WAVEFORM
   ======================================== */

let waveformData = [];
const WAVEFORM_POINTS = 100;

function initWaveform() {
    for (let i = 0; i < WAVEFORM_POINTS; i++) {
        waveformData.push(0);
    }
}

function clearWaveform() {
    waveformData = new Array(WAVEFORM_POINTS).fill(0);
    drawWaveform();
}

function updateWaveformWithReading(reading) {
    // Shift data left
    waveformData.shift();

    // Add new point based on respiration value
    if (reading.respiration?.value !== null) {
        const normalizedValue = (reading.respiration.value - 30) / 30; // Normalize around 30 rpm
        waveformData.push(Math.sin(Date.now() / 300) * Math.min(1, Math.max(-1, normalizedValue * 0.8)));
    } else {
        waveformData.push(0);
    }

    drawWaveform();
}

function drawWaveform() {
    const canvas = document.getElementById('respiration-wave');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.parentElement.clientWidth - 32;
    const height = 40;

    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(2, 2);

    ctx.clearRect(0, 0, width, height);

    // Don't draw if not connected
    if (!appState.isConnected) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No signal', width / 2, height / 2 + 4);
        return;
    }

    // Draw waveform
    ctx.beginPath();
    waveformData.forEach((point, i) => {
        const x = (width / WAVEFORM_POINTS) * i;
        const y = (height / 2) + point * (height / 3);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = '#00b8d4';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// Initialize waveform data
initWaveform();

// Animate waveform when connected
setInterval(() => {
    if (appState.isConnected && appState.lastReading) {
        updateWaveformWithReading(appState.lastReading);
    }
}, 50);

/* ========================================
   NAVIGATION
   ======================================== */

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetScreen = item.dataset.screen;
            appState.currentScreen = targetScreen;

            // Update nav active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show target screen
            screens.forEach(screen => {
                screen.classList.remove('active');
                if (screen.id === `screen-${targetScreen}`) {
                    screen.classList.add('active');
                }
            });

            // Refresh screen-specific content
            if (targetScreen === 'history') {
                refreshTrendsUI();
            } else if (targetScreen === 'alerts') {
                refreshAlertsUI();
            }
        });
    });
}

/* ========================================
   TIME TABS (Trends)
   ======================================== */

function initTimeTabs() {
    const tabs = document.querySelectorAll('.time-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            refreshTrendsUI();
        });
    });
}

async function refreshTrendsUI() {
    const activeTab = document.querySelector('.time-tab.active');
    const timeRange = activeTab?.dataset.range || '1h';

    // Get chart data from trends manager
    const respData = await window.trendsManager.getChartData('respiration', timeRange);
    const co2Data = await window.trendsManager.getChartData('co2', timeRange);

    // Update averages
    const respAvg = document.getElementById('resp-avg');
    const co2Avg = document.getElementById('co2-avg');

    if (respAvg) {
        respAvg.textContent = respData.stats.avg !== null ? respData.stats.avg : '--';
    }
    if (co2Avg) {
        co2Avg.textContent = co2Data.stats.avg !== null ? co2Data.stats.avg : '--';
    }

    // Draw charts
    drawTrendChart('chart-respiration', respData, '#00b8d4');
    drawTrendChart('chart-co2', co2Data, '#78909c');
}

function drawTrendChart(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.parentElement.clientWidth - 32;
    const height = 120;

    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(2, 2);

    ctx.clearRect(0, 0, width, height);

    // If no data, show message
    if (data.isEmpty || data.values.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', width / 2, height / 2);
        return;
    }

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;

    for (let i = 0; i < 4; i++) {
        const y = (height / 4) * i + 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    // Downsample for display
    const displayData = window.trendsManager.downsample(data, 100);
    const values = displayData.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, height);

    values.forEach((value, i) => {
        const x = (width / (values.length - 1)) * i;
        const y = height - ((value - min) / range) * (height - 30) - 15;
        ctx.lineTo(x, y);
    });

    ctx.lineTo(width, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color + '33');
    gradient.addColorStop(1, color + '08');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    values.forEach((value, i) => {
        const x = (width / (values.length - 1)) * i;
        const y = height - ((value - min) / range) * (height - 30) - 15;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
}

/* ========================================
   ALERTS UI
   ======================================== */

async function refreshAlertsUI() {
    if (!window.storageManager || !window.storageManager.db) return;

    const alerts = await window.storageManager.getAlerts(false);
    const alertsList = document.getElementById('alerts-list');

    if (!alertsList) return;

    if (alerts.length === 0) {
        alertsList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p>No alerts</p>
                <p class="empty-subtitle">All clear! No issues detected.</p>
            </div>
        `;
        return;
    }

    alertsList.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.severity.toLowerCase()}">
            <div class="alert-content">
                <span class="alert-badge ${alert.severity.toLowerCase()}">${alert.severity}</span>
                <span class="alert-time">${formatAlertTime(alert.timestamp)}</span>
                <h4 class="alert-title">${alert.title}</h4>
                <p class="alert-desc">${alert.description}</p>
            </div>
        </div>
    `).join('');
}

function formatAlertTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function updateAlertBadge() {
    // This would update the badge count on the nav item
    const alertsNav = document.querySelector('.nav-item[data-screen="alerts"]');
    if (alertsNav && !alertsNav.classList.contains('has-badge')) {
        alertsNav.classList.add('has-badge');
    }
}

function initClearAlerts() {
    const clearBtn = document.getElementById('clear-alerts');

    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (window.storageManager && window.storageManager.db) {
                await window.storageManager.clearAlerts();
            }

            refreshAlertsUI();

            // Remove badge
            const alertsNav = document.querySelector('.nav-item.has-badge');
            if (alertsNav) {
                alertsNav.classList.remove('has-badge');
            }
        });
    }
}

/* ========================================
   SETTINGS UI
   ======================================== */

function initSettingsUI() {
    // WiFi Configuration
    const wifiBtn = document.getElementById('wifi-config-btn');
    const wifiModal = document.getElementById('wifi-modal');
    const wifiSaveBtn = document.getElementById('wifi-save-btn');
    const wifiCancelBtn = document.getElementById('wifi-cancel-btn');
    const wifiAddressInput = document.getElementById('wifi-address');
    const wifiPortInput = document.getElementById('wifi-port');

    if (wifiBtn && wifiModal) {
        wifiBtn.addEventListener('click', () => {
            wifiModal.classList.remove('hidden');
            if (wifiAddressInput) wifiAddressInput.value = window.connectionManager.piAddress;
            if (wifiPortInput) wifiPortInput.value = window.connectionManager.piPort;
        });

        wifiCancelBtn?.addEventListener('click', () => {
            wifiModal.classList.add('hidden');
        });

        wifiSaveBtn?.addEventListener('click', () => {
            const address = wifiAddressInput?.value || '192.168.4.1';
            const port = wifiPortInput?.value || '80';
            window.connectionManager.configure(address, port, 2000);
            wifiModal.classList.add('hidden');
        });
    }

    // Gemini API Key
    const geminiInput = document.getElementById('gemini-api-key');
    const geminiSaveBtn = document.getElementById('gemini-save-btn');

    if (geminiInput) {
        geminiInput.value = window.geminiManager.apiKey ? '••••••••' : '';

        geminiSaveBtn?.addEventListener('click', () => {
            if (geminiInput.value && geminiInput.value !== '••••••••') {
                window.geminiManager.setApiKey(geminiInput.value);
                geminiInput.value = '••••••••';
                alert('API key saved!');
            }
        });
    }

    // Smart Analysis refresh button
    const refreshAnalysisBtn = document.getElementById('refresh-analysis-btn');
    if (refreshAnalysisBtn) {
        refreshAnalysisBtn.addEventListener('click', async () => {
            refreshAnalysisBtn.disabled = true;
            refreshAnalysisBtn.textContent = 'Analyzing...';

            const result = await window.geminiManager.generateAnalysis(true);

            const smartContent = document.getElementById('smart-analysis-content');
            if (smartContent) {
                if (result.success) {
                    smartContent.textContent = result.analysis;
                } else {
                    smartContent.textContent = result.error;
                }
            }

            refreshAnalysisBtn.disabled = false;
            refreshAnalysisBtn.textContent = 'Refresh Analysis';
        });
    }
}

function initSliders() {
    const am = window.alertsManager;

    // CO2 slider
    const co2Slider = document.getElementById('co2-max');
    const co2Value = document.getElementById('co2-threshold-val');

    if (co2Slider && co2Value) {
        co2Slider.value = am.thresholds.co2.max;
        co2Value.textContent = am.thresholds.co2.max + ' ppm';

        co2Slider.addEventListener('input', () => {
            co2Value.textContent = co2Slider.value + ' ppm';
        });

        co2Slider.addEventListener('change', () => {
            am.setThreshold('co2', undefined, parseInt(co2Slider.value));
        });
    }

    // Temperature slider would be similar...
}

/* ========================================
   EXPORT BUTTONS
   ======================================== */

function initExportButtons() {
    const exportCSVBtn = document.getElementById('export-csv-btn');
    const exportJSONBtn = document.getElementById('export-json-btn');

    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', async () => {
            await window.exportManager.exportCSV('all');
        });
    }

    if (exportJSONBtn) {
        exportJSONBtn.addEventListener('click', async () => {
            await window.exportManager.exportJSON('all');
        });
    }
}

/* ========================================
   WINDOW RESIZE
   ======================================== */

window.addEventListener('resize', () => {
    drawWaveform();
    if (appState.currentScreen === 'history') {
        refreshTrendsUI();
    }
});
