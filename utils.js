// Utility Functions

const Utils = {
    // Debounce function for search input
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Calculate area of bounding box in square kilometers
    calculateArea(bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = ne.lat - sw.lat;
        const lngDiff = ne.lng - sw.lng;
        const kmLat = latDiff * 111;
        const kmLng = lngDiff * 111 * Math.cos((ne.lat + sw.lat) / 2 * Math.PI / 180);
        return Math.abs(kmLat * kmLng);
    },

    // Format area for display
    formatArea(area) {
        if (area < 0.01) {
            return `${(area * 1000000).toFixed(0)} m²`;
        } else if (area < 1) {
            return `${(area * 100).toFixed(2)} hectares`;
        } else {
            return `${area.toFixed(2)} km²`;
        }
    },

    // Sanitize filename
    sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    },

    // Format number with commas
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    // Get area status color
    getAreaStatus(area) {
        if (area < 25) return 'success';
        if (area < 75) return 'warning';
        return 'danger';
    },

    // Validate coordinates
    isValidCoordinate(lat, lon) {
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    },

    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // Download blob as file
    downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    },

    // Show/hide element with animation
    toggleElement(element, show) {
        if (show) {
            element.style.display = 'block';
            setTimeout(() => element.classList.add('active'), 10);
        } else {
            element.classList.remove('active');
            setTimeout(() => element.style.display = 'none', 300);
        }
    },

    // Local storage helpers
    storage: {
        get(key) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (e) {
                console.error('Storage get error:', e);
                return null;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('Storage set error:', e);
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                console.error('Storage remove error:', e);
                return false;
            }
        }
    },

    // Theme management
    theme: {
        get() {
            return Utils.storage.get('theme') || 'light';
        },

        set(theme) {
            Utils.storage.set('theme', theme);
            document.body.classList.toggle('dark-mode', theme === 'dark');
            
            // Update theme toggle icon
            const icon = document.querySelector('#theme-toggle i');
            if (icon) {
                icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        },

        toggle() {
            const current = this.get();
            const newTheme = current === 'dark' ? 'light' : 'dark';
            this.set(newTheme);
            return newTheme;
        },

        init() {
            this.set(this.get());
        }
    },

    // Retry logic for API calls
    async retry(fn, maxRetries = 3, delay = 1000) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                }
            }
        }
        throw lastError;
    },

    // Validate GeoJSON
    isValidGeoJSON(geojson) {
        if (!geojson || typeof geojson !== 'object') return false;
        if (geojson.type === 'FeatureCollection') {
            return Array.isArray(geojson.features);
        }
        if (geojson.type === 'Feature') {
            return geojson.geometry && geojson.geometry.type && geojson.geometry.coordinates;
        }
        return false;
    },

    // Get bounds from GeoJSON
    getBoundsFromGeoJSON(geojson) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        const processCoordinates = (coords) => {
            if (Array.isArray(coords[0])) {
                coords.forEach(processCoordinates);
            } else {
                const [lng, lat] = coords;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            }
        };

        if (geojson.type === 'FeatureCollection') {
            geojson.features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    processCoordinates(feature.geometry.coordinates);
                }
            });
        } else if (geojson.type === 'Feature') {
            if (geojson.geometry && geojson.geometry.coordinates) {
                processCoordinates(geojson.geometry.coordinates);
            }
        }

        if (minLat === Infinity) return null;

        return L.latLngBounds(
            L.latLng(minLat, minLng),
            L.latLng(maxLat, maxLng)
        );
    },

    // Error messages
    getErrorMessage(error) {
        const errorMessages = {
            'NetworkError': 'Network error. Please check your connection.',
            'TimeoutError': 'Request timed out. Please try again.',
            'ParseError': 'Failed to parse data. The file may be corrupted.',
            'ValidationError': 'Invalid data format.',
            'QuotaExceededError': 'Storage quota exceeded. Please clear some space.',
        };

        if (error.name && errorMessages[error.name]) {
            return errorMessages[error.name];
        }

        return error.message || 'An unexpected error occurred.';
    },

    // Format date for display
    formatDate(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString();
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }
};