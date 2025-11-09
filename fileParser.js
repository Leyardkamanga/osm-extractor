// File Parser Service - Handles parsing of uploaded files

const FileParser = {
    // Parse uploaded file
    async parse(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const extension = file.name.split('.').pop().toLowerCase();

            reader.onload = async (event) => {
                try {
                    const content = event.target.result;
                    let geojson;

                    if (['kml', 'gpx', 'xml'].includes(extension)) {
                        geojson = this.parseXMLFile(content, extension);
                    } else if (['geojson', 'json'].includes(extension)) {
                        geojson = this.parseGeoJSON(content);
                    } else {
                        throw new Error('Unsupported file format. Please use GeoJSON, KML, or GPX.');
                    }

                    // Validate parsed GeoJSON
                    if (!Utils.isValidGeoJSON(geojson)) {
                        throw new Error('Invalid geometry in file.');
                    }

                    // Validate that we have features
                    if (geojson.type === 'FeatureCollection' && geojson.features.length === 0) {
                        throw new Error('No features found in file.');
                    }

                    // Validate coordinates are within valid ranges
                    this.validateCoordinates(geojson);

                    resolve(geojson);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file.'));
            };

            reader.readAsText(file);
        });
    },

    // Parse XML-based files (KML, GPX)
    parseXMLFile(content, extension) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');

        // Check for XML parsing errors
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            throw new Error('Invalid XML file format.');
        }

        let geojson;

        if (extension === 'kml' || doc.documentElement.tagName.toLowerCase() === 'kml') {
            if (typeof togeojson === 'undefined' || !togeojson.kml) {
                throw new Error('KML parser not loaded.');
            }
            geojson = togeojson.kml(doc);
        } else if (extension === 'gpx' || doc.documentElement.tagName.toLowerCase() === 'gpx') {
            if (typeof togeojson === 'undefined' || !togeojson.gpx) {
                throw new Error('GPX parser not loaded.');
            }
            geojson = togeojson.gpx(doc);
        } else {
            throw new Error('Unrecognized XML file format. Please ensure it is a valid KML or GPX file.');
        }

        return geojson;
    },

    // Parse GeoJSON
    parseGeoJSON(content) {
        try {
            const geojson = JSON.parse(content);
            
            // Ensure it's a proper GeoJSON structure
            if (!geojson.type) {
                throw new Error('Invalid GeoJSON: missing type property.');
            }

            // Convert single Feature to FeatureCollection
            if (geojson.type === 'Feature') {
                return {
                    type: 'FeatureCollection',
                    features: [geojson]
                };
            }

            return geojson;
        } catch (error) {
            throw new Error('Invalid JSON format: ' + error.message);
        }
    },

    // Validate coordinates are within valid ranges
    validateCoordinates(geojson) {
        const validateCoord = (coords) => {
            if (Array.isArray(coords[0])) {
                coords.forEach(validateCoord);
            } else {
                const [lng, lat] = coords;
                if (!Utils.isValidCoordinate(lat, lng)) {
                    throw new Error(`Invalid coordinates: [${lng}, ${lat}]`);
                }
            }
        };

        const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
        
        features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                try {
                    validateCoord(feature.geometry.coordinates);
                } catch (error) {
                    throw new Error('Invalid coordinates in geometry: ' + error.message);
                }
            }
        });
    },

    // Get file info
    getFileInfo(file) {
        return {
            name: file.name,
            size: file.size,
            type: file.type,
            extension: file.name.split('.').pop().toLowerCase(),
            sizeFormatted: this.formatFileSize(file.size)
        };
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    // Validate file before parsing
    validateFile(file) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedExtensions = ['geojson', 'json', 'kml', 'gpx', 'xml'];
        const extension = file.name.split('.').pop().toLowerCase();

        if (file.size > maxSize) {
            throw new Error(`File too large. Maximum size is ${this.formatFileSize(maxSize)}.`);
        }

        if (!allowedExtensions.includes(extension)) {
            throw new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`);
        }

        return true;
    }
};