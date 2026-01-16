/* ========================================
   NURTHURE MONITOR - Gemini AI Integration
   Smart analysis using Google Gemini API
   ======================================== */

class GeminiManager {
    constructor() {
        this.apiKey = localStorage.getItem('geminiApiKey') || '';
        this.model = 'gemini-1.5-flash';
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
        this.lastAnalysis = null;
        this.analysisInterval = 5 * 60 * 1000; // 5 minutes
        this.lastAnalysisTime = 0;
    }

    // Set API key
    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('geminiApiKey', key);
    }

    // Check if API key is configured
    isConfigured() {
        return this.apiKey && this.apiKey.length > 0;
    }

    // Generate analysis from recent sensor data
    async generateAnalysis(forceRefresh = false) {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'Gemini API key not configured. Please add your API key in Settings.'
            };
        }

        // Check if we should use cached analysis
        const now = Date.now();
        if (!forceRefresh &&
            this.lastAnalysis &&
            now - this.lastAnalysisTime < this.analysisInterval) {
            return {
                success: true,
                analysis: this.lastAnalysis,
                cached: true
            };
        }

        try {
            // Get recent readings (last hour)
            const readings = await this.getRecentReadings();

            if (readings.length === 0) {
                return {
                    success: false,
                    error: 'No sensor data available for analysis.'
                };
            }

            // Build prompt
            const prompt = this.buildPrompt(readings);

            // Call Gemini API
            const response = await this.callGeminiAPI(prompt);

            this.lastAnalysis = response;
            this.lastAnalysisTime = now;

            // Save to storage
            if (window.storageManager && window.storageManager.db) {
                await window.storageManager.saveSetting('lastAnalysis', {
                    text: response,
                    timestamp: now
                });
            }

            return {
                success: true,
                analysis: response,
                cached: false
            };
        } catch (error) {
            console.error('[Gemini] Error:', error);
            return {
                success: false,
                error: error.message || 'Failed to generate analysis'
            };
        }
    }

    // Get recent readings for analysis
    async getRecentReadings() {
        if (!window.storageManager || !window.storageManager.db) {
            return [];
        }

        return await window.storageManager.getReadingsLastHours(1);
    }

    // Build analysis prompt
    buildPrompt(readings) {
        // Calculate summary statistics
        const summary = this.summarizeReadings(readings);

        const prompt = `You are a pediatric health monitoring assistant for a SIDS (Sudden Infant Death Syndrome) prevention device. Analyze the following sensor data summary from the last hour and provide a brief, reassuring report for parents. Keep the response to 2-3 sentences. Do not provide medical advice or diagnosis - only observations.

IMPORTANT GUIDELINES:
- Be calm and reassuring in tone
- Focus on patterns and stability
- Never mention SIDS directly or create anxiety
- Use sensor names in parentheses for context
- If values are normal, emphasize stability

SENSOR DATA SUMMARY (Last Hour):
- Respiration (mmWave radar): ${summary.respiration}
- Audio Analysis (MEMS mic): ${summary.audio}
- Body Temperature (MLX90614): ${summary.bodyTemp}
- Room CO₂ (MH-Z19C): ${summary.co2}
- Air Quality (BME688): ${summary.voc}
- Detected Posture (Camera): ${summary.posture}

Number of readings: ${readings.length}
Time period: Last 1 hour

Generate a brief analysis:`;

        return prompt;
    }

    // Summarize readings for prompt
    summarizeReadings(readings) {
        if (readings.length === 0) {
            return {
                respiration: 'No data',
                audio: 'No data',
                bodyTemp: 'No data',
                co2: 'No data',
                voc: 'No data',
                posture: 'No data'
            };
        }

        // Calculate averages and modes
        const respValues = readings.map(r => r.respiration?.value).filter(v => v !== null);
        const tempValues = readings.map(r => r.bodyTemp?.value).filter(v => v !== null);
        const co2Values = readings.map(r => r.environment?.co2?.value).filter(v => v !== null);
        const vocValues = readings.map(r => r.environment?.voc?.value).filter(v => v !== null);
        const audioStates = readings.map(r => r.audio?.state).filter(v => v);
        const postures = readings.map(r => r.posture?.state).filter(v => v);

        const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
        const mode = (arr) => {
            if (arr.length === 0) return null;
            const counts = {};
            arr.forEach(v => counts[v] = (counts[v] || 0) + 1);
            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        };

        return {
            respiration: respValues.length ? `Average ${avg(respValues)} rpm (range: ${Math.min(...respValues)}-${Math.max(...respValues)} rpm)` : 'No data',
            audio: audioStates.length ? `Predominantly ${mode(audioStates)}` : 'No data',
            bodyTemp: tempValues.length ? `Average ${avg(tempValues)}°C` : 'No data',
            co2: co2Values.length ? `Average ${avg(co2Values)} ppm` : 'No data',
            voc: vocValues.length ? `Average ${avg(vocValues)}` : 'No data',
            posture: postures.length ? `Most common: ${mode(postures)}` : 'No data'
        };
    }

    // Call Gemini API
    async callGeminiAPI(prompt) {
        const url = `${this.apiUrl}/${this.model}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 200,
                    topP: 0.9
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_ONLY_HIGH'
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }

        throw new Error('Invalid response from Gemini API');
    }

    // Load last analysis from storage
    async loadLastAnalysis() {
        if (!window.storageManager || !window.storageManager.db) {
            return null;
        }

        const saved = await window.storageManager.getSetting('lastAnalysis');
        if (saved) {
            this.lastAnalysis = saved.text;
            this.lastAnalysisTime = saved.timestamp;
            return saved;
        }

        return null;
    }
}

// Create global instance
window.geminiManager = new GeminiManager();
