/* ========================================
   NURTHURE MONITOR - Data Export
   CSV and JSON export functionality
   ======================================== */

class ExportManager {
    constructor() {
        // Export time ranges
        this.timeRanges = {
            '1h': 1,
            '24h': 24,
            '7d': 24 * 7,
            '1m': 24 * 30,
            'all': null
        };
    }

    // Export readings as CSV
    async exportCSV(timeRange = 'all') {
        const readings = await this.getReadings(timeRange);

        if (readings.length === 0) {
            console.warn('[Export] No data to export');
            return null;
        }

        const csv = await window.storageManager.exportReadingsCSV(
            this.getStartTime(timeRange),
            Date.now()
        );

        this.downloadFile(csv, `nurthure-readings-${timeRange}.csv`, 'text/csv');

        return csv;
    }

    // Export readings as JSON
    async exportJSON(timeRange = 'all') {
        const readings = await this.getReadings(timeRange);

        if (readings.length === 0) {
            console.warn('[Export] No data to export');
            return null;
        }

        const json = JSON.stringify({
            exported: new Date().toISOString(),
            timeRange,
            count: readings.length,
            readings
        }, null, 2);

        this.downloadFile(json, `nurthure-readings-${timeRange}.json`, 'application/json');

        return json;
    }

    // Export alerts
    async exportAlerts() {
        if (!window.storageManager || !window.storageManager.db) {
            return null;
        }

        const alerts = await window.storageManager.getAlerts();

        if (alerts.length === 0) {
            console.warn('[Export] No alerts to export');
            return null;
        }

        const json = JSON.stringify({
            exported: new Date().toISOString(),
            count: alerts.length,
            alerts
        }, null, 2);

        this.downloadFile(json, 'nurthure-alerts.json', 'application/json');

        return json;
    }

    // Get readings for time range
    async getReadings(timeRange) {
        if (!window.storageManager || !window.storageManager.db) {
            return [];
        }

        if (timeRange === 'all') {
            return await window.storageManager.getReadings(0, Date.now());
        }

        const hours = this.timeRanges[timeRange] || 24;
        return await window.storageManager.getReadingsLastHours(hours);
    }

    // Get start time for time range
    getStartTime(timeRange) {
        if (timeRange === 'all') return 0;

        const hours = this.timeRanges[timeRange] || 24;
        return Date.now() - (hours * 60 * 60 * 1000);
    }

    // Trigger file download
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`[Export] Downloaded ${filename}`);
    }

    // Generate summary report
    async generateReport(timeRange = '24h') {
        const readings = await this.getReadings(timeRange);

        if (readings.length === 0) {
            return {
                error: 'No data available for report'
            };
        }

        // Calculate statistics for each sensor
        const stats = {
            timeRange,
            period: {
                start: new Date(Math.min(...readings.map(r => r.timestamp))).toISOString(),
                end: new Date(Math.max(...readings.map(r => r.timestamp))).toISOString()
            },
            totalReadings: readings.length,
            sensors: {}
        };

        // Respiration stats
        const respValues = readings.map(r => r.respiration?.value).filter(v => v !== null);
        if (respValues.length > 0) {
            stats.sensors.respiration = {
                min: Math.min(...respValues),
                max: Math.max(...respValues),
                avg: (respValues.reduce((a, b) => a + b, 0) / respValues.length).toFixed(1),
                unit: 'rpm'
            };
        }

        // Body temperature stats
        const tempValues = readings.map(r => r.bodyTemp?.value).filter(v => v !== null);
        if (tempValues.length > 0) {
            stats.sensors.bodyTemp = {
                min: Math.min(...tempValues).toFixed(1),
                max: Math.max(...tempValues).toFixed(1),
                avg: (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(1),
                unit: '°C'
            };
        }

        // CO2 stats
        const co2Values = readings.map(r => r.environment?.co2?.value).filter(v => v !== null);
        if (co2Values.length > 0) {
            stats.sensors.co2 = {
                min: Math.min(...co2Values),
                max: Math.max(...co2Values),
                avg: Math.round(co2Values.reduce((a, b) => a + b, 0) / co2Values.length),
                unit: 'ppm'
            };
        }

        // Get alerts count
        if (window.storageManager && window.storageManager.db) {
            const alerts = await window.storageManager.getAlerts();
            const startTime = this.getStartTime(timeRange);
            stats.alerts = alerts.filter(a => a.timestamp >= startTime).length;
        }

        return stats;
    }
}

// Create global instance
window.exportManager = new ExportManager();
