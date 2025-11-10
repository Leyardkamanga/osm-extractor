// Geometry Processor - Converts OSM data to GeoJSON with boundary clipping

const GeometryProcessor = {
    // Store boundary for clipping
    clipBoundary: null,

    // Set clipping boundary
    setClipBoundary(bounds) {
        if (!bounds) {
            this.clipBoundary = null;
            return;
        }

        // Convert Leaflet bounds to polygon coordinates
        this.clipBoundary = {
            type: 'Polygon',
            coordinates: [[
                [bounds.getWest(), bounds.getNorth()],
                [bounds.getEast(), bounds.getNorth()],
                [bounds.getEast(), bounds.getSouth()],
                [bounds.getWest(), bounds.getSouth()],
                [bounds.getWest(), bounds.getNorth()]
            ]]
        };
    },

    // Convert OSM data to GeoJSON with clipping
    osmToGeoJSON(osmData, onProgress = null) {
        const geojson = {
            type: 'FeatureCollection',
            features: [],
            crs: {
                type: "name",
                properties: { name: "EPSG:4326" }
            }
        };

        if (!osmData.elements || osmData.elements.length === 0) {
            return geojson;
        }

        if (onProgress) {
            onProgress({ stage: 'process', message: 'Processing nodes...', progress: 0 });
        }

        // Build node lookup
        const nodes = {};
        const ways = [];
        const relations = [];

        osmData.elements.forEach(el => {
            if (el.type === 'node') {
                nodes[el.id] = el;
            } else if (el.type === 'way') {
                ways.push(el);
            } else if (el.type === 'relation') {
                relations.push(el);
            }
        });

        const totalElements = osmData.elements.length;
        let processed = 0;

        // Process nodes
        osmData.elements.forEach(el => {
            if (el.type === 'node' && el.lat && el.lon && el.tags && Object.keys(el.tags).length > 0) {
                const point = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [el.lon, el.lat]
                    },
                    properties: this.cleanProperties(el.tags)
                };

                // Clip point to boundary
                if (this.isPointInBoundary(el.lon, el.lat)) {
                    geojson.features.push(point);
                }
            }
            
            processed++;
            if (onProgress && processed % 100 === 0) {
                onProgress({
                    stage: 'process',
                    message: 'Processing geometries...',
                    progress: Math.floor((processed / totalElements) * 50)
                });
            }
        });

        // Process ways
        ways.forEach(way => {
            if (!way.nodes || way.nodes.length === 0) return;

            const coords = way.nodes
                .map(id => nodes[id] ? [nodes[id].lon, nodes[id].lat] : null)
                .filter(c => c !== null);

            if (coords.length === 0) return;

            const isClosed = way.nodes[0] === way.nodes[way.nodes.length - 1];
            const isArea = this.isAreaFeature(way.tags, isClosed, coords.length);

            let feature = {
                type: 'Feature',
                geometry: {
                    type: isArea ? 'Polygon' : 'LineString',
                    coordinates: isArea ? [coords] : coords
                },
                properties: this.cleanProperties(way.tags)
            };

            // Clip geometry to boundary
            feature = this.clipFeatureToBoundary(feature);
            
            if (feature && feature.geometry && feature.geometry.coordinates.length > 0) {
                geojson.features.push(feature);
            }

            processed++;
            if (onProgress && processed % 50 === 0) {
                onProgress({
                    stage: 'process',
                    message: 'Processing ways...',
                    progress: 50 + Math.floor(((processed - Object.keys(nodes).length) / ways.length) * 40)
                });
            }
        });

        // Process relations (simplified)
        relations.forEach(relation => {
            if (relation.members && relation.members.length > 0) {
                const memberCoords = [];
                
                relation.members.forEach(member => {
                    if (member.type === 'way' && member.ref) {
                        const way = ways.find(w => w.id === member.ref);
                        if (way && way.nodes) {
                            const coords = way.nodes
                                .map(id => nodes[id] ? [nodes[id].lon, nodes[id].lat] : null)
                                .filter(c => c !== null);
                            if (coords.length > 0) {
                                memberCoords.push(coords);
                            }
                        }
                    }
                });

                if (memberCoords.length > 0) {
                    let feature = {
                        type: 'Feature',
                        geometry: {
                            type: 'MultiLineString',
                            coordinates: memberCoords
                        },
                        properties: this.cleanProperties(relation.tags)
                    };

                    // Clip geometry to boundary
                    feature = this.clipFeatureToBoundary(feature);
                    
                    if (feature && feature.geometry && feature.geometry.coordinates.length > 0) {
                        geojson.features.push(feature);
                    }
                }
            }

            processed++;
        });

        if (onProgress) {
            onProgress({ stage: 'complete', message: 'Processing complete', progress: 100 });
        }

        return geojson;
    },

    // Check if point is within boundary
    isPointInBoundary(lon, lat) {
        if (!this.clipBoundary) return true;

        const bounds = this.clipBoundary.coordinates[0];
        const minLon = bounds[3][0];
        const maxLon = bounds[1][0];
        const minLat = bounds[2][1];
        const maxLat = bounds[0][1];

        return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
    },

    // Clip feature to boundary
    clipFeatureToBoundary(feature) {
        if (!this.clipBoundary || !feature.geometry) return feature;

        const geomType = feature.geometry.type;

        try {
            if (geomType === 'Point') {
                const [lon, lat] = feature.geometry.coordinates;
                if (!this.isPointInBoundary(lon, lat)) {
                    return null;
                }
            } else if (geomType === 'LineString') {
                feature.geometry.coordinates = this.clipLineString(feature.geometry.coordinates);
                if (feature.geometry.coordinates.length < 2) return null;
            } else if (geomType === 'Polygon') {
                feature.geometry.coordinates = this.clipPolygon(feature.geometry.coordinates);
                if (feature.geometry.coordinates.length === 0 || feature.geometry.coordinates[0].length < 4) return null;
            } else if (geomType === 'MultiLineString') {
                feature.geometry.coordinates = feature.geometry.coordinates
                    .map(line => this.clipLineString(line))
                    .filter(line => line && line.length >= 2);
                if (feature.geometry.coordinates.length === 0) return null;
            }
        } catch (e) {
            console.warn('Clipping error:', e);
            return null;
        }

        return feature;
    },

    // Clip LineString to boundary (simplified Cohen-Sutherland)
    clipLineString(coords) {
        if (!this.clipBoundary) return coords;

        const bounds = this.clipBoundary.coordinates[0];
        const minLon = bounds[3][0];
        const maxLon = bounds[1][0];
        const minLat = bounds[2][1];
        const maxLat = bounds[0][1];

        const clipped = [];
        
        for (let i = 0; i < coords.length; i++) {
            const [lon, lat] = coords[i];
            
            // Keep points inside boundary
            if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                clipped.push([lon, lat]);
            } else if (clipped.length > 0 && i < coords.length - 1) {
                // If we were inside and now outside, try to clip to edge
                const next = coords[i + 1];
                if (next) {
                    const [nextLon, nextLat] = next;
                    if (nextLon >= minLon && nextLon <= maxLon && nextLat >= minLat && nextLat <= maxLat) {
                        // Next point is inside, clip current to boundary
                        clipped.push(this.clipPointToBoundary(lon, lat, minLon, maxLon, minLat, maxLat));
                    }
                }
            }
        }

        return clipped;
    },

    // Clip point to nearest boundary edge
    clipPointToBoundary(lon, lat, minLon, maxLon, minLat, maxLat) {
        return [
            Math.max(minLon, Math.min(maxLon, lon)),
            Math.max(minLat, Math.min(maxLat, lat))
        ];
    },

    // Clip Polygon to boundary (simplified)
    clipPolygon(rings) {
        if (!this.clipBoundary) return rings;

        const bounds = this.clipBoundary.coordinates[0];
        const minLon = bounds[3][0];
        const maxLon = bounds[1][0];
        const minLat = bounds[2][1];
        const maxLat = bounds[0][1];

        return rings.map(ring => {
            const clipped = ring.filter(([lon, lat]) => 
                lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
            );
            
            // Ensure ring is closed
            if (clipped.length >= 3) {
                if (clipped[0][0] !== clipped[clipped.length - 1][0] || 
                    clipped[0][1] !== clipped[clipped.length - 1][1]) {
                    clipped.push([...clipped[0]]);
                }
            }
            
            return clipped;
        }).filter(ring => ring.length >= 4);
    },

    // Determine if a way should be treated as an area/polygon
    isAreaFeature(tags, isClosed, nodeCount) {
        if (!isClosed || nodeCount < 4) return false;
        if (!tags) return false;

        // Explicit area tags
        if (tags.area === 'yes') return true;
        if (tags.area === 'no') return false;

        // Tags that make polygons
        const polygonTags = [
            'building', 'landuse', 'amenity', 'leisure', 'tourism',
            'aeroway', 'natural', 'place', 'shop', 'office',
            'craft', 'military', 'public_transport'
        ];

        // Check if any polygon tag exists
        for (const tag of polygonTags) {
            if (tags[tag]) return true;
        }

        // Special cases for natural and waterway
        if (tags.natural === 'water' || tags.natural === 'wood' || 
            tags.natural === 'scrub' || tags.natural === 'wetland') return true;
        
        if (tags.waterway === 'riverbank' || tags.waterway === 'dock') return true;

        // Default: treat as line
        return false;
    },

    // Clean properties - remove internal OSM metadata and empty values
    cleanProperties(tags) {
        if (!tags) return {};

        const cleaned = {};
        const skipFields = ['created_by', 'source', 'source:ref', 'attribution'];

        for (const [key, value] of Object.entries(tags)) {
            // Skip empty values
            if (value === null || value === undefined || value === '') continue;
            
            // Skip internal metadata fields
            if (skipFields.includes(key)) continue;
            
            // Keep useful tags
            cleaned[key] = value;
        }

        return cleaned;
    },

    // Split GeoJSON by geometry type
    splitByGeometryType(geojson) {
        const points = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        const lines = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        const polygons = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        const other = { type: 'FeatureCollection', features: [], crs: geojson.crs };

        geojson.features.forEach(feature => {
            const type = feature.geometry.type;
            
            if (type === 'Point' || type === 'MultiPoint') {
                points.features.push(feature);
            } else if (type === 'LineString' || type === 'MultiLineString') {
                lines.features.push(feature);
            } else if (type === 'Polygon' || type === 'MultiPolygon') {
                polygons.features.push(feature);
            } else {
                other.features.push(feature);
            }
        });

        return { points, lines, polygons, other };
    },

    // Get statistics about GeoJSON with enhanced metadata
    getStatistics(geojson) {
        const stats = {
            totalFeatures: 0,
            points: 0,
            lines: 0,
            polygons: 0,
            other: 0,
            tags: new Set(),
            bounds: null,
            featureTypes: {},
            tagDistribution: {},
            uniqueValues: {}
        };

        if (!geojson.features) return stats;

        stats.totalFeatures = geojson.features.length;

        geojson.features.forEach(feature => {
            const type = feature.geometry.type;
            
            if (type === 'Point' || type === 'MultiPoint') {
                stats.points++;
            } else if (type === 'LineString' || type === 'MultiLineString') {
                stats.lines++;
            } else if (type === 'Polygon' || type === 'MultiPolygon') {
                stats.polygons++;
            } else {
                stats.other++;
            }

            // Collect feature type statistics
            if (feature.properties) {
                // Count by main feature types
                ['highway', 'building', 'amenity', 'natural', 'landuse', 'waterway', 'shop', 'leisure'].forEach(key => {
                    if (feature.properties[key]) {
                        const featureType = `${key}:${feature.properties[key]}`;
                        stats.featureTypes[featureType] = (stats.featureTypes[featureType] || 0) + 1;
                    }
                });

                // Collect unique tag keys and their distributions
                Object.keys(feature.properties).forEach(key => {
                    if (key !== 'osm_id' && key !== 'osm_type') {
                        stats.tags.add(key);
                        
                        // Count tag occurrences
                        stats.tagDistribution[key] = (stats.tagDistribution[key] || 0) + 1;
                        
                        // Track unique values for important tags
                        if (['highway', 'building', 'amenity', 'natural', 'landuse'].includes(key)) {
                            if (!stats.uniqueValues[key]) {
                                stats.uniqueValues[key] = new Set();
                            }
                            stats.uniqueValues[key].add(feature.properties[key]);
                        }
                    }
                });
            }
        });

        // Convert Sets to Arrays for JSON serialization
        stats.uniqueValues = Object.fromEntries(
            Object.entries(stats.uniqueValues).map(([key, set]) => [key, Array.from(set)])
        );

        stats.bounds = Utils.getBoundsFromGeoJSON(geojson);
        stats.tagCount = stats.tags.size;
        stats.tags = Array.from(stats.tags).sort();

        // Sort feature types by count
        stats.topFeatureTypes = Object.entries(stats.featureTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }));

        return stats;
    },

    // Get sample features for preview
    getSampleFeatures(geojson, limit = 10) {
        if (!geojson.features || geojson.features.length === 0) {
            return [];
        }

        // Get diverse sample (different types if possible)
        const samples = [];
        const types = ['Point', 'LineString', 'Polygon'];
        
        types.forEach(type => {
            const featuresOfType = geojson.features.filter(f => f.geometry.type === type);
            if (featuresOfType.length > 0) {
                samples.push(...featuresOfType.slice(0, Math.ceil(limit / types.length)));
            }
        });

        return samples.slice(0, limit);
    },

    // Simplify geometry (reduce coordinate precision)
    simplifyGeometry(geojson, precision = 6) {
        const simplifyCoords = (coords) => {
            if (Array.isArray(coords[0])) {
                return coords.map(simplifyCoords);
            } else {
                return coords.map(c => Number(c.toFixed(precision)));
            }
        };

        const simplified = Utils.deepClone(geojson);
        
        simplified.features = simplified.features.map(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates = simplifyCoords(feature.geometry.coordinates);
            }
            return feature;
        });

        return simplified;
    },

    // Validate and clean GeoJSON
    cleanGeoJSON(geojson) {
        const cleaned = {
            type: 'FeatureCollection',
            features: [],
            crs: geojson.crs
        };

        if (!geojson.features) return cleaned;

        geojson.features.forEach(feature => {
            // Skip invalid features
            if (!feature.geometry || !feature.geometry.coordinates) return;
            
            // Validate coordinates
            try {
                const coords = feature.geometry.coordinates;
                if (this.hasValidCoordinates(coords)) {
                    cleaned.features.push(feature);
                }
            } catch (e) {
                console.warn('Skipping invalid feature:', e);
            }
        });

        return cleaned;
    },

    // Check if coordinates are valid
    hasValidCoordinates(coords) {
        if (Array.isArray(coords[0])) {
            return coords.every(c => this.hasValidCoordinates(c));
        } else {
            const [lng, lat] = coords;
            return Utils.isValidCoordinate(lat, lng);
        }
    }
};