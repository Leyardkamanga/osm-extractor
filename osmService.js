// OSM Service - Handles all OSM API interactions

const OSMService = {
    // Overpass API endpoints (with fallbacks)
    overpassEndpoints: [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.openstreetmap.ru/api/interpreter'
    ],

    currentEndpointIndex: 0,
    cachedData: null,
    cachedQuery: null,

    // Search location using Nominatim
    async searchLocation(query) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'OSM-Data-Extractor/1.0'
                }
            });

            if (!response.ok) {
                throw new Error('Search request failed');
            }

            const results = await response.json();
            return results;
        } catch (error) {
            throw new Error('Location search failed: ' + error.message);
        }
    },

    // Build Overpass query
    buildOverpassQuery(bounds, selectedFeatures, osmTypes, allData = false) {
        const bbox = `(${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()})`;
        
        // Use shorter timeout for smaller areas
        const area = Math.abs((bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest()));
        const timeout = area > 0.1 ? 90 : 60; // 90s for large areas, 60s for small
        
        if (allData) {
            return `[out:json][timeout:${timeout}];(node${bbox};way${bbox};relation${bbox};);out body;>;out skel qt;`;
        }
        
        if (selectedFeatures.length === 0) {
            throw new Error('Please select at least one feature type');
        }
        
        const featureMap = {
            'roads': 'way["highway"]',
            'buildings': 'way["building"]|relation["building"]',
            'water': 'way["water"]|way["waterway"]|way["natural"="water"]|relation["water"]|relation["waterway"]',
            'landuse': 'way["landuse"]|relation["landuse"]',
            'amenities': 'node["amenity"]|way["amenity"]|node["shop"]|way["shop"]',
            'natural': 'way["natural"]|relation["natural"]'
        };
        
        let queries = [];
        selectedFeatures.forEach(type => {
            const filter = featureMap[type];
            if (filter) {
                filter.split('|').forEach(q => {
                    const isNode = q.startsWith('node');
                    const isWay = q.startsWith('way');
                    const isRelation = q.startsWith('relation');

                    if (isNode && osmTypes.includes('node')) {
                        queries.push(q.replace(/:/g, '') + bbox + ';');
                    } else if (isWay && osmTypes.includes('way')) {
                        queries.push(q.replace(/:/g, '') + bbox + ';');
                    } else if (isRelation && osmTypes.includes('relation')) {
                        queries.push(q.replace(/:/g, '') + bbox + ';');
                    }
                });
            }
        });
        
        if (queries.length === 0) {
            throw new Error('No valid queries generated from selected features');
        }

        return `[out:json][timeout:${timeout}];(${queries.join('')});out body;>;out skel qt;`;
    },

    // Fetch data from Overpass API with retry logic
    async fetchOverpassData(query, onProgress = null) {
        const queryHash = this.hashQuery(query);
        
        // Return cached data if query matches
        if (this.cachedQuery === queryHash && this.cachedData) {
            if (onProgress) onProgress({ stage: 'cache', message: 'Using cached data' });
            return this.cachedData;
        }

        // Reset endpoint index before trying
        this.currentEndpointIndex = 0;

        // Try with retry logic across multiple endpoints
        let lastError;
        for (let attempt = 0; attempt < this.overpassEndpoints.length * 2; attempt++) {
            try {
                const data = await this.fetchFromEndpoint(query, onProgress);
                
                // Cache the result
                this.cachedData = data;
                this.cachedQuery = queryHash;

                return data;
            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt + 1} failed:`, error.message);
                
                // If it's not a "try next endpoint" error, wait before retry
                if (!error.message.includes('trying next') && !error.message.includes('trying alternate')) {
                    // Wait with exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed
        throw new Error('Unable to fetch data from any Overpass API server. ' + (lastError?.message || 'Unknown error'));
    },

    // Fetch from specific endpoint
    async fetchFromEndpoint(query, onProgress = null) {
        const endpoint = this.overpassEndpoints[this.currentEndpointIndex];
        
        if (onProgress) {
            onProgress({ 
                stage: 'fetch', 
                message: `Fetching from Overpass API...`,
                endpoint: endpoint
            });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: 'data=' + encodeURIComponent(query),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                
                // Check for rate limiting
                if (response.status === 429 || response.status === 504) {
                    throw new Error('Server is busy. Please wait a moment and try again.');
                }
                
                // Try next endpoint on error
                if (this.currentEndpointIndex < this.overpassEndpoints.length - 1) {
                    this.currentEndpointIndex++;
                    throw new Error('Endpoint failed, trying next...');
                }
                
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
            }

            const data = await response.json();

            // Validate response
            if (!data.elements) {
                throw new Error('Invalid response format from Overpass API');
            }

            // Check if query returned an error
            if (data.remark) {
                throw new Error('Overpass API error: ' + data.remark);
            }

            return data;
        } catch (error) {
            // Handle abort/timeout
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. The area might be too large or the server is busy. Try a smaller area.');
            }

            // Handle network errors
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                // Try next endpoint
                if (this.currentEndpointIndex < this.overpassEndpoints.length - 1) {
                    this.currentEndpointIndex++;
                    throw new Error('Network error, trying alternate server...');
                }
                throw new Error('Unable to connect to Overpass API. Please check your internet connection and try again.');
            }

            throw error;
        }
    },

    // Get quick count of features (for preview)
    async getFeatureCount(bounds, selectedFeatures, osmTypes, allData = false) {
        const query = this.buildOverpassQuery(bounds, selectedFeatures, osmTypes, allData);
        
        // Modify query to only count
        const countQuery = query.replace('out body;>;out skel qt;', 'out count;');
        
        try {
            const response = await fetch(this.overpassEndpoints[this.currentEndpointIndex], {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(countQuery)
            });

            if (!response.ok) {
                throw new Error('Count request failed');
            }

            const data = await response.json();
            return data.elements && data.elements[0] ? data.elements[0].tags.total : 0;
        } catch (error) {
            // If count fails, return estimate based on area
            console.warn('Feature count failed, using estimate');
            return null;
        }
    },

    // Hash query for caching
    hashQuery(query) {
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    // Clear cache
    clearCache() {
        this.cachedData = null;
        this.cachedQuery = null;
    },

    // Get API status
    async checkAPIStatus() {
        try {
            const response = await fetch(this.overpassEndpoints[0] + '/status', {
                method: 'GET'
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
};