// Export Service - Handles data export in various formats

const ExportService = {
    // Export to GeoJSON
    async exportGeoJSON(geojson, filename) {
        const blob = new Blob([JSON.stringify(geojson, null, 2)], {
            type: 'application/json'
        });
        Utils.downloadBlob(blob, filename + '.geojson');
        return { filename: filename + '.geojson', size: blob.size };
    },

    // Export to Shapefile (as ZIP with separated geometry types)
    async exportShapefile(geojson, filename) {
        const zip = new JSZip();
        const separated = GeometryProcessor.splitByGeometryType(geojson);
        const targetCRS = geojson.crs?.properties?.name || 'EPSG:4326';

        // Add README
        const readme = `OpenStreetMap Data Export
Generated: ${new Date().toISOString()}
Coordinate Reference System: ${targetCRS}

This ZIP contains GeoJSON files separated by geometry type for easier import into GIS software.

Files:
- points.geojson: Point features
- lines.geojson: Line features  
- polygons.geojson: Polygon features

All files use ${targetCRS} coordinate system.
`;
        zip.file('README.txt', readme);

        // Add metadata
        const metadata = {
            exportDate: new Date().toISOString(),
            crs: targetCRS,
            source: 'OpenStreetMap',
            totalFeatures: geojson.features.length,
            pointCount: separated.points.features.length,
            lineCount: separated.lines.features.length,
            polygonCount: separated.polygons.features.length
        };
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));

        // Add GeoJSON files by type
        if (separated.points.features.length > 0) {
            zip.file('points.geojson', JSON.stringify(separated.points, null, 2));
        }
        if (separated.lines.features.length > 0) {
            zip.file('lines.geojson', JSON.stringify(separated.lines, null, 2));
        }
        if (separated.polygons.features.length > 0) {
            zip.file('polygons.geojson', JSON.stringify(separated.polygons, null, 2));
        }
        if (separated.other.features.length > 0) {
            zip.file('other.geojson', JSON.stringify(separated.other, null, 2));
        }

        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });
        
        Utils.downloadBlob(blob, filename + '_shapefile.zip');
        return { filename: filename + '_shapefile.zip', size: blob.size };
    },

    // Export to KML
    async exportKML(geojson, filename) {
        if (typeof tokml === 'undefined') {
            throw new Error('KML export library not loaded');
        }

        const kml = tokml(geojson, {
            documentName: filename,
            documentDescription: 'Exported from OpenStreetMap',
            simplestyle: true
        });

        const blob = new Blob([kml], {
            type: 'application/vnd.google-earth.kml+xml'
        });
        
        Utils.downloadBlob(blob, filename + '.kml');
        return { filename: filename + '.kml', size: blob.size };
    },

    // Export to GPX
    async exportGPX(geojson, filename) {
        if (typeof togpx === 'undefined') {
            throw new Error('GPX export library not loaded');
        }

        const gpx = togpx(geojson, {
            creator: 'OSM Data Extractor',
            metadata: {
                name: filename,
                desc: 'Exported from OpenStreetMap',
                time: new Date().toISOString()
            }
        });

        const blob = new Blob([gpx], {
            type: 'application/gpx+xml'
        });
        
        Utils.downloadBlob(blob, filename + '.gpx');
        return { filename: filename + '.gpx', size: blob.size };
    },

    // Export to OSM XML
    async exportOSM(osmData, filename) {
        const xml = this.osmToXML(osmData);
        const blob = new Blob([xml], {
            type: 'application/xml'
        });
        
        Utils.downloadBlob(blob, filename + '.osm');
        return { filename: filename + '.osm', size: blob.size };
    },

    // Convert OSM data to XML
    osmToXML(osmData) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<osm version="0.6" generator="OSM Data Extractor">\n';
        xml += `  <note>Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright</note>\n`;
        xml += `  <meta osm_base="${new Date().toISOString()}"/>\n`;

        if (!osmData.elements) {
            xml += '</osm>';
            return xml;
        }

        // Sort elements: nodes first, then ways, then relations
        const nodes = osmData.elements.filter(el => el.type === 'node');
        const ways = osmData.elements.filter(el => el.type === 'way');
        const relations = osmData.elements.filter(el => el.type === 'relation');

        // Export nodes
        nodes.forEach(el => {
            xml += `  <node id="${el.id}" lat="${el.lat}" lon="${el.lon}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;

            if (el.tags && Object.keys(el.tags).length > 0) {
                xml += '>\n';
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
                xml += '  </node>\n';
            } else {
                xml += '/>\n';
            }
        });

        // Export ways
        ways.forEach(el => {
            xml += `  <way id="${el.id}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;
            xml += '>\n';

            if (el.nodes) {
                el.nodes.forEach(n => xml += `    <nd ref="${n}"/>\n`);
            }

            if (el.tags) {
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
            }
            xml += '  </way>\n';
        });

        // Export relations
        relations.forEach(el => {
            xml += `  <relation id="${el.id}"`;
            if (el.version) xml += ` version="${el.version}"`;
            if (el.timestamp) xml += ` timestamp="${el.timestamp}"`;
            if (el.changeset) xml += ` changeset="${el.changeset}"`;
            if (el.user) xml += ` user="${this.escapeXML(el.user)}"`;
            if (el.uid) xml += ` uid="${el.uid}"`;
            xml += '>\n';

            if (el.members) {
                el.members.forEach(m => {
                    xml += `    <member type="${m.type}" ref="${m.ref}" role="${this.escapeXML(m.role || '')}"/>\n`;
                });
            }

            if (el.tags) {
                for (const [k, v] of Object.entries(el.tags)) {
                    xml += `    <tag k="${this.escapeXML(k)}" v="${this.escapeXML(v)}"/>\n`;
                }
            }
            xml += '  </relation>\n';
        });

        xml += '</osm>';
        return xml;
    },

    // Escape XML special characters
    escapeXML(str) {
        if (typeof str !== 'string') str = String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    // Main export function
    async export(format, geojson, osmData, filename, geometryFilter = null) {
        try {
            // Apply geometry filter if specified
            let filteredGeoJSON = geojson;
            if (geometryFilter && geometryFilter.length > 0) {
                filteredGeoJSON = this.filterByGeometry(geojson, geometryFilter);
                
                if (filteredGeoJSON.features.length === 0) {
                    throw new Error('No features match the selected geometry types');
                }
            }

            let result;

            switch (format) {
                case 'geojson':
                    result = await this.exportGeoJSON(filteredGeoJSON, filename);
                    break;
                case 'shapefile':
                    result = await this.exportShapefile(filteredGeoJSON, filename);
                    break;
                case 'kml':
                    result = await this.exportKML(filteredGeoJSON, filename);
                    break;
                case 'gpx':
                    result = await this.exportGPX(filteredGeoJSON, filename);
                    break;
                case 'osm':
                    result = await this.exportOSM(osmData, filename);
                    break;
                default:
                    throw new Error('Unsupported export format');
            }

            return result;
        } catch (error) {
            throw new Error('Export failed: ' + error.message);
        }
    },

    // Filter GeoJSON by geometry type
    filterByGeometry(geojson, allowedTypes) {
        const filtered = {
            type: 'FeatureCollection',
            features: [],
            crs: geojson.crs
        };

        const typeMap = {
            'Point': ['Point', 'MultiPoint'],
            'LineString': ['LineString', 'MultiLineString'],
            'Polygon': ['Polygon', 'MultiPolygon']
        };

        // Build list of allowed geometry types
        const allowed = new Set();
        allowedTypes.forEach(type => {
            if (typeMap[type]) {
                typeMap[type].forEach(t => allowed.add(t));
            }
        });

        // Filter features
        geojson.features.forEach(feature => {
            if (allowed.has(feature.geometry.type)) {
                filtered.features.push(feature);
            }
        });

        return filtered;
    }
};