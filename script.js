class MapApp {
    constructor() {
        this.map = L.map('map', {
            zoomControl: true
        }).setView([0, 0], 2);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.bbox = null;
        this.rectangle = null;
        this.uploadedLayer = null; // NEW: To hold the uploaded boundary layer
        this.currentLocationName = '';
        this.osmLayerGroup = L.layerGroup().addTo(this.map);
        
        this.initControls();
        this.bindEvents();
    }

    initControls() {
        document.querySelectorAll('.control-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnId = e.currentTarget.id;
                
                if (btnId === 'download-control') {
                    this.handleDownload();
                } else if (btnId === 'clear-control') {
                    this.clearSelection();
                } else {
                    // This handles search, layers, format, and the new upload control
                    this.togglePanel(btnId.replace('-control', '-panel'));
                }
            });
        });

        document.querySelectorAll('.close-panel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.side-panel').classList.remove('active');
            });
        });

        document.getElementById('location-search').addEventListener('input', (e) => {
            if (e.target.value.length > 2) {
                this.searchLocation(e.target.value);
            }
        });
        
        // NEW: Event listener for file upload
        document.getElementById('boundary-upload').addEventListener('change', this.handleFileUpload.bind(this));
    }

    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        const allPanels = document.querySelectorAll('.side-panel');
        
        allPanels.forEach(p => {
            if (p.id !== panelId) p.classList.remove('active');
        });
        
        panel.classList.toggle('active');
    }

    async searchLocation(query) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const results = await response.json();
            
            const container = document.getElementById('search-results');
            container.innerHTML = '';
            
            if (results.length === 0) {
                container.innerHTML = '<div class="result-item">No results found</div>';
                return;
            }
            
            results.forEach(result => {
                const item = document.createElement('div');
                item.className = 'result-item';
                item.innerHTML = `
                    <div class="result-name">${result.display_name}</div>
                    <div class="result-type">${result.type}</div>
                `;
                item.addEventListener('click', () => {
                    this.currentLocationName = result.display_name.split(',')[0].trim();
                    this.map.setView([parseFloat(result.lat), parseFloat(result.lon)], 13);
                    this.togglePanel('search-panel');
                    this.showStatus(`Moved to: ${this.currentLocationName}`, 'success');
                });
                container.appendChild(item);
            });
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    bindEvents() {
        this.map.on('mousedown', this.startDrawing.bind(this));
        
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const allCheckbox = document.getElementById('all');
                const featureCheckboxes = document.querySelectorAll('input[name="featureType"]');
                
                if (cb.id === 'all') {
                    featureCheckboxes.forEach(fcb => {
                        fcb.checked = false;
                        fcb.disabled = cb.checked;
                    });
                }
            });
        });
    }
    
    // NEW: Handle file upload
    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.clearSelection(); // Clear existing selection before processing new file

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                this.processGeoFile(file.name, event.target.result);
                this.togglePanel('upload-panel'); // Close panel on success
            } catch (error) {
                this.showStatus('Error processing file: ' + error.message, 'error');
                console.error(error);
            }
        };

        // Read file based on type for parsing
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'kml' || extension === 'gpx' || extension === 'xml') {
            reader.readAsText(file);
        } else if (extension === 'geojson' || extension === 'json') {
            reader.readAsText(file);
        } else {
            this.showStatus('Unsupported file format. Use GeoJSON, KML, or GPX.', 'error');
        }
    }

    // NEW: Process file content into GeoJSON
    processGeoFile(filename, content) {
        let geojson;
        const extension = filename.split('.').pop().toLowerCase();

        if (extension === 'kml' || extension === 'gpx' || extension === 'xml') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/xml');
            
            if (extension === 'kml' || doc.documentElement.tagName === 'kml') {
                geojson = togeojson.kml(doc);
            } else if (extension === 'gpx' || doc.documentElement.tagName === 'gpx') {
                geojson = togeojson.gpx(doc);
            } else {
                throw new Error('Unrecognized XML file format. Please ensure it is a valid KML or GPX file.');
            }
            
        } else if (extension === 'geojson' || extension === 'json') {
            geojson = JSON.parse(content);
        }

        if (!geojson || geojson.features.length === 0) {
            throw new Error('Could not parse valid geometry from the file.');
        }

        this.uploadedLayer = L.geoJSON(geojson, {
            style: (feature) => ({
                color: "#ff7800",
                weight: 3,
                opacity: 0.8,
                fillColor: "#ff7800",
                fillOpacity: 0.1
            })
        }).addTo(this.map);

        // Get the bounding box of the uploaded features and zoom to it
        const bounds = this.uploadedLayer.getBounds();
        if (bounds.isValid()) {
             this.map.fitBounds(bounds);
             this.bbox = bounds;
             const area = this.calculateArea(this.bbox);
             this.showStatus(`Boundary uploaded! Area selected: ${area.toFixed(2)} km²`, 'success');
        } else {
            throw new Error('The uploaded geometry has no valid coordinates to display.');
        }
    }

    startDrawing(e) {
        // MODIFIED: Prevent drawing if a boundary file is already uploaded
        if (this.uploadedLayer) {
            this.showStatus('Clear the uploaded boundary before drawing a new area.', 'warning');
            return;
        }
        
        if (e.originalEvent.target.className.includes('leaflet-')) {
            const start = e.latlng;
            
            if (this.rectangle) {
                this.map.removeLayer(this.rectangle);
            }
            
            const tempRect = L.rectangle([start, start], {
                color: "#4caf50",
                weight: 2,
                fillOpacity: 0.2
            }).addTo(this.map);

            const onMove = (ev) => {
                tempRect.setBounds(L.latLngBounds(start, ev.latlng));
            };

            const onUp = () => {
                this.map.off('mousemove', onMove);
                this.map.off('mouseup', onUp);
                this.rectangle = tempRect;
                this.bbox = this.rectangle.getBounds();
                
                const area = this.calculateArea(this.bbox);
                this.showStatus(`Area selected: ${area.toFixed(2)} km²`, 'success');
            };

            this.map.on('mousemove', onMove);
            this.map.on('mouseup', onUp);
        }
    }

    clearSelection() {
        if (this.rectangle) {
            this.map.removeLayer(this.rectangle);
            this.rectangle = null;
        }
        
        // NEW: Clear uploaded layer
        if (this.uploadedLayer) {
            this.map.removeLayer(this.uploadedLayer);
            this.uploadedLayer = null;
            document.getElementById('boundary-upload').value = ''; // Reset file input
        }

        this.bbox = null; // Reset BBox regardless
        this.osmLayerGroup.clearLayers();
        this.showStatus('Selection cleared', 'info');
    }

    calculateArea(bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = ne.lat - sw.lat;
        const lngDiff = ne.lng - sw.lng;
        const kmLat = latDiff * 111;
        const kmLng = lngDiff * 111 * Math.cos((ne.lat + sw.lat) / 2 * Math.PI / 180);
        return Math.abs(kmLat * kmLng);
    }

    getSelectedFeatures() {
        const selected = Array.from(document.querySelectorAll('input[name="featureType"]:checked')).map(cb => cb.value);
        return selected.length === 0 || selected.length === 6 ? 'all' : selected.join('_');
    }

    buildOverpassQuery(south, west, north, east) {
        const bbox = `(${south},${west},${north},${east})`;
        
        if (document.getElementById('all').checked) {
            return `[out:json][timeout:60];(node${bbox};way${bbox};relation${bbox};);out body;>;out skel qt;`;
        }
        
        const selected = Array.from(document.querySelectorAll('input[name="featureType"]:checked')).map(cb => cb.value);
        const osmTypes = Array.from(document.querySelectorAll('input[name="osmType"]:checked')).map(cb => cb.value);
        
        if (selected.length === 0) return null;
        
        const featureMap = {
            'roads': 'way["highway"]',
            'buildings': 'way["building"]|relation["building"]',
            'water': 'way["water"]|way["waterway"]|way["natural"="water"]',
            'landuse': 'way["landuse"]|relation["landuse"]',
            'amenities': 'node["amenity"]|way["amenity"]|node["shop"]',
            'natural': 'way["natural"]|relation["natural"]'
        };
        
        let queries = [];
        selected.forEach(type => {
            const filter = featureMap[type];
            if (filter) {
                filter.split('|').forEach(q => {
                    const tag = q.match(/\["([^"]+)"/)?.[1] || '';
                    const isNode = q.startsWith('node');
                    const isWay = q.startsWith('way');
                    const isRelation = q.startsWith('relation');

                    if (isNode && osmTypes.includes('node')) queries.push(q.replace(/:/g, '') + bbox + ';');
                    else if (isWay && osmTypes.includes('way')) queries.push(q.replace(/:/g, '') + bbox + ';');
                    else if (isRelation && osmTypes.includes('relation')) queries.push(q.replace(/:/g, '') + bbox + ';');
                });
            }
        });
        
        if (queries.length === 0) return null;
        return `[out:json][timeout:60];(${queries.join('')});out body;>;out skel qt;`;
    }

    async handleDownload() {
        if (!this.bbox) {
            this.showStatus('Please select an area or upload a boundary file first', 'error');
            return;
        }
        
        const area = this.calculateArea(this.bbox);
        if (area > 100) {
            this.showStatus('Area too large (max 100 km²)', 'error');
            return;
        }
        
        this.showStatus('Downloading data...', 'info', 0);
        
        try {
            const bounds = this.bbox;
            // The bounds will be the BBox of the drawn rectangle OR the BBox of the uploaded layer.
            const query = this.buildOverpassQuery(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast());
            
            if (!query) {
                this.showStatus('Please select at least one feature type', 'error');
                return;
            }
            
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(query)
            });
            
            if (!response.ok) throw new Error('Download failed');
            
            const osmData = await response.json();
            
            if (!osmData.elements || osmData.elements.length === 0) {
                this.showStatus('No data found', 'warning');
                return;
            }
            
            let geojson = this.osmToGeoJSON(osmData);
            
            const format = document.querySelector('input[name="format"]:checked').value;
            const features = this.getSelectedFeatures();
            const location = this.currentLocationName || 'osm_data';
            const baseName = `${location}_${features}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            
            let blob, filename;
            
            if (format === 'geojson') {
                blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
                filename = `${baseName}.geojson`;
            } else if (format === 'shapefile') {
                // GeoJSON to Shapefile utility simplified to just zip the GeoJSON parts
                blob = await this.geojsonToShapefile(geojson); 
                filename = `${baseName}_shapefile.zip`;
            } else if (format === 'kml') {
                const kml = tokml(geojson);
                blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
                filename = `${baseName}.kml`;
            } else if (format === 'gpx') {
                const gpx = togpx(geojson);
                blob = new Blob([gpx], { type: 'application/gpx+xml' });
                filename = `${baseName}.gpx`;
            } else if (format === 'osm') {
                blob = new Blob([this.osmToXML(osmData)], { type: 'application/xml' });
                filename = `${baseName}.osm`;
            }
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            this.showStatus(`Downloaded: ${filename}`, 'success');
            
        } catch (error) {
            this.showStatus('Download failed: ' + error.message, 'error');
        }
    }

    osmToGeoJSON(osmData) {
        const geojson = { type: 'FeatureCollection', features: [], crs: { type: "name", properties: { name: "EPSG:4326" } } };
        if (!osmData.elements) return geojson;
        
        const nodes = {};
        osmData.elements.forEach(el => {
            if (el.type === 'node') nodes[el.id] = el;
        });
        
        osmData.elements.forEach(el => {
            if (el.type === 'node' && el.lat && el.lon) {
                geojson.features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
                    properties: { ...el.tags, osm_id: el.id }
                });
            } else if (el.type === 'way' && el.nodes && el.nodes.length > 0) {
                const coords = el.nodes.map(id => nodes[id] ? [nodes[id].lon, nodes[id].lat] : null).filter(c => c);
                
                if (coords.length > 0) {
                    const isClosed = el.nodes[0] === el.nodes[el.nodes.length - 1];
                    const isArea = isClosed && (el.tags?.building || el.tags?.landuse || el.tags?.natural === 'water');
                    
                    geojson.features.push({
                        type: 'Feature',
                        geometry: {
                            type: isArea && coords.length > 3 ? 'Polygon' : 'LineString',
                            coordinates: isArea && coords.length > 3 ? [coords] : coords
                        },
                        properties: { ...el.tags, osm_id: el.id }
                    });
                }
            }
        });
        return geojson;
    }

    osmToXML(osmData) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">\n';
        
        osmData.elements.forEach(el => {
            if (el.type === 'node') {
                xml += `  <node id="${el.id}" lat="${el.lat}" lon="${el.lon}">\n`;
                if (el.tags) {
                    for (const [k, v] of Object.entries(el.tags)) {
                        xml += `    <tag k="${k}" v="${v}"/>\n`;
                    }
                }
                xml += '  </node>\n';
            } else if (el.type === 'way') {
                xml += `  <way id="${el.id}">\n`;
                if (el.nodes) el.nodes.forEach(n => xml += `    <nd ref="${n}"/>\n`);
                if (el.tags) {
                    for (const [k, v] of Object.entries(el.tags)) {
                        xml += `    <tag k="${k}" v="${v}"/>\n`;
                    }
                }
                xml += '  </way>\n';
            }
        });
        
        xml += '</osm>';
        return xml;
    }

    async geojsonToShapefile(geojson) {
        const zip = new JSZip();
        const targetCRS = geojson.crs?.properties?.name || 'EPSG:4326';
        
        const points = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        const lines = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        const polygons = { type: 'FeatureCollection', features: [], crs: geojson.crs };
        
        geojson.features.forEach(f => {
            if (f.geometry.type === 'Point') points.features.push(f);
            else if (f.geometry.type === 'LineString') lines.features.push(f);
            else if (f.geometry.type === 'Polygon') polygons.features.push(f);
        });
        
        zip.file('README.txt', `CRS: ${targetCRS}\nThis ZIP contains GeoJSON files segmented by geometry type for easier import into GIS software. CRS is ${targetCRS}.`);
        
        if (points.features.length > 0) zip.file('points.geojson', JSON.stringify(points, null, 2));
        if (lines.features.length > 0) zip.file('lines.geojson', JSON.stringify(lines, null, 2));
        if (polygons.features.length > 0) zip.file('polygons.geojson', JSON.stringify(polygons, null, 2));
        
        return await zip.generateAsync({ type: 'blob' });
    }

    showStatus(message, type, duration = 3000) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = type;
        
        if (duration > 0) {
            setTimeout(() => {
                status.className = '';
            }, duration);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MapApp();
});