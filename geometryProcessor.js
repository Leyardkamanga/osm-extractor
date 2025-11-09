// Geometry Processor - Converts OSM data to GeoJSON

const GeometryProcessor = {
    // Convert OSM data to GeoJSON
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
                geojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [el.lon, el.lat]
                    },
                    properties: this.cleanProperties(el.tags)
                });
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

            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: isArea ? 'Polygon' : 'LineString',
                    coordinates: isArea ? [coords] : coords
                },
                properties: this.cleanProperties(way.tags)
            });

            processed++;
            if (onProgress && processed % 50 === 0) {
                onProgress({
                    stage: 'process',
                    message: 'Processing ways...',
                    progress: 50 + Math.floor(((processed - Object.keys(nodes).length) / ways.length) * 40)
                });
            }
        });

        // Process relations (simplified - full multipolygon assembly is complex)
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
                    geojson.features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'MultiLineString',
                            coordinates: memberCoords
                        },
                        properties: this.cleanProperties(relation.tags)
                    });
                }
            }

            processed++;
        });

        if (onProgress) {
            onProgress({ stage: 'complete', message: 'Processing complete', progress: 100 });
        }

        return geojson;
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

    // Get statistics about GeoJSON
    getStatistics(geojson) {
        const stats = {
            totalFeatures: 0,
            points: 0,
            lines: 0,
            polygons: 0,
            other: 0,
            tags: new Set(),
            bounds: null
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

            // Collect unique tag keys
            if (feature.properties) {
                Object.keys(feature.properties).forEach(key => {
                    if (key !== 'osm_id' && key !== 'osm_type') {
                        stats.tags.add(key);
                    }
                });
            }
        });

        stats.bounds = Utils.getBoundsFromGeoJSON(geojson);
        stats.tagCount = stats.tags.size;
        stats.tags = Array.from(stats.tags).sort();

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