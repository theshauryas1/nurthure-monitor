/* ========================================
   NURTHURE MONITOR - Trends Manager
   Chart data processing from stored readings
   ======================================== */

class TrendsManager {
    constructor() {
        this.timeRanges = {
            '1h': 1,
            '24h': 24,
            '7d': 24 * 7,
            '1m': 24 * 30
        };

        this.cachedData = {};
        this.cacheExpiry = 60000; // 1 minute cache
        this.lastCacheTime = {};
    }

    // Get chart data for a sensor over time range
    async getChartData(sensor, timeRange) {
        const cacheKey = `${sensor}_${timeRange}`;
        const now = Date.now();

        // Check cache
        if (this.cachedData[cacheKey] &&
            now - this.lastCacheTime[cacheKey] < this.cacheExpiry) {
            return this.cachedData[cacheKey];
        }

        // Get hours for time range
        const hours = this.timeRanges[timeRange] || 1;

        // Fetch readings from storage
        if (!window.storageManager || !window.storageManager.db) {
            return this.getEmptyData();
        }

        const readings = await window.storageManager.getReadingsLastHours(hours);

        if (readings.length === 0) {
            return this.getEmptyData();
        }

        // Extract sensor values
        const data = this.extractSensorData(readings, sensor);

        // Calculate statistics
        const stats = this.calculateStats(data.values);

        const result = {
            points: data.points,
            values: data.values,
            timestamps: data.timestamps,
            stats,
            timeRange,
            sensor
        };

        // Cache result
        this.cachedData[cacheKey] = result;
        this.lastCacheTime[cacheKey] = now;

        return result;
    }

    // Extract sensor data from readings
    extractSensorData(readings, sensor) {
        const points = [];
        const values = [];
        const timestamps = [];

        readings.forEach(reading => {
            let value = null;

            switch (sensor) {
                case 'respiration':
                    value = reading.respiration?.value;
                    break;
                case 'bodyTemp':
                    value = reading.bodyTemp?.value;
                    break;
                case 'co2':
                    value = reading.environment?.co2?.value;
                    break;
                case 'voc':
                    value = reading.environment?.voc?.value;
                    break;
                case 'envTemp':
                    value = reading.environment?.temp?.value;
                    break;
                case 'audioLevel':
                    value = reading.audio?.level;
                    break;
                case 'movement':
                    value = reading.radar?.movement;
                    break;
            }

            if (value !== null && value !== undefined) {
                values.push(value);
                timestamps.push(reading.timestamp);
                points.push({
                    x: reading.timestamp,
                    y: value
                });
            }
        });

        return { points, values, timestamps };
    }

    // Calculate statistics
    calculateStats(values) {
        if (values.length === 0) {
            return { min: null, max: null, avg: null, count: 0 };
        }

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        return {
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            avg: Math.round(avg * 100) / 100,
            count: values.length
        };
    }

    // Get empty data structure
    getEmptyData() {
        return {
            points: [],
            values: [],
            timestamps: [],
            stats: { min: null, max: null, avg: null, count: 0 },
            isEmpty: true
        };
    }

    // Downsample data for chart display (reduce points for performance)
    downsample(data, maxPoints = 100) {
        if (data.points.length <= maxPoints) {
            return data;
        }

        const step = Math.ceil(data.points.length / maxPoints);
        const sampledPoints = [];
        const sampledValues = [];
        const sampledTimestamps = [];

        for (let i = 0; i < data.points.length; i += step) {
            sampledPoints.push(data.points[i]);
            sampledValues.push(data.values[i]);
            sampledTimestamps.push(data.timestamps[i]);
        }

        return {
            ...data,
            points: sampledPoints,
            values: sampledValues,
            timestamps: sampledTimestamps
        };
    }

    // Clear cache
    clearCache() {
        this.cachedData = {};
        this.lastCacheTime = {};
    }

    // Format timestamp for chart axis
    formatTimestamp(timestamp, timeRange) {
        const date = new Date(timestamp);

        if (timeRange === '1h') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '24h') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }
}

// Create global instance
window.trendsManager = new TrendsManager();
