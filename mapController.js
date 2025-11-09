// Map Controller - Manages map interactions

const MapController = {
    map: null,
    rectangle: null,
    uploadedLayer: null,
    drawHistory: [],
    currentHistoryIndex: -1,
    osmLayerGroup: null,

    // Initialize map
    init() {
        this.map = L.map('map', {
            zoomControl: true
        }).setView([0, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.osmLayerGroup = L.layerGroup().addTo(this.map);

        this.bindMapEvents();
    },

    // Bind map events
    bindMapEvents() {
        this.map.on('mousedown', (e) => this.startDrawing(e));
        this.map.on('mousemove', (e) => this.updateAreaDuringDraw(e));
    },

    // Start drawing rectangle
    startDrawing(e) {
        if (this.uploadedLayer) {
            UIController.showStatus('Clear the uploaded boundary before drawing a new area.', 'warning');
            return;
        }

        if (!e.originalEvent.target.className.includes('leaflet-')) {
            return;
        }

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
            const bounds = L.latLngBounds(start, ev.latlng);
            tempRect.setBounds(bounds);
            this.updateLiveArea(bounds);
        };

        const onUp = () => {
            this.map.off('mousemove', onMove);
            this.map.off('mouseup', onUp);
            
            this.rectangle = tempRect;
            const bounds = this.rectangle.getBounds();
            
            // Add to history
            this.addToDrawHistory(bounds);
            
            const area = Utils.calculateArea(bounds);
            const status = Utils.getAreaStatus(area);
            UIController.updateAreaDisplay(area, status);
            UIController.showStatus(`Area selected: ${Utils.formatArea(area)}`, 'success');
        };

        this.map.on('mousemove', onMove);
        this.map.on('mouseup', onUp);
    },

    // Update live area display during drawing
    updateLiveArea(bounds) {
        const area = Utils.calculateArea(bounds);
        const status = Utils.getAreaStatus(area);
        UIController.updateAreaDisplay(area, status);
    },

    // Update area during draw
    updateAreaDuringDraw(e) {
        // This is called during drawing to show live area
    },

    // Add uploaded layer
    addUploadedLayer(geojson) {
        if (this.uploadedLayer) {
            this.map.removeLayer(this.uploadedLayer);
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

        const bounds = this.uploadedLayer.getBounds();
        if (bounds.isValid()) {
            this.map.fitBounds(bounds);
            const area = Utils.calculateArea(bounds);
            const status = Utils.getAreaStatus(area);
            UIController.updateAreaDisplay(area, status);
            return bounds;
        }

        return null;
    },

    // Get current bounds
    getBounds() {
        if (this.rectangle) {
            return this.rectangle.getBounds();
        } else if (this.uploadedLayer) {
            return this.uploadedLayer.getBounds();
        }
        return null;
    },

    // Clear selection
    clearSelection() {
        if (this.rectangle) {
            this.map.removeLayer(this.rectangle);
            this.rectangle = null;
        }

        if (this.uploadedLayer) {
            this.map.removeLayer(this.uploadedLayer);
            this.uploadedLayer = null;
        }

        this.osmLayerGroup.clearLayers();
        this.drawHistory = [];
        this.currentHistoryIndex = -1;

        UIController.updateAreaDisplay(null, 'success');
        UIController.updateInstruction('Click and drag on the map to select an area or upload a boundary file');
    },

    // Add to draw history
    addToDrawHistory(bounds) {
        // Remove any future history if we're not at the end
        if (this.currentHistoryIndex < this.drawHistory.length - 1) {
            this.drawHistory = this.drawHistory.slice(0, this.currentHistoryIndex + 1);
        }

        this.drawHistory.push({
            bounds: {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            }
        });

        this.currentHistoryIndex++;

        // Keep only last 10 drawings
        if (this.drawHistory.length > 10) {
            this.drawHistory.shift();
            this.currentHistoryIndex--;
        }
    },

    // Undo drawing
    undoDrawing() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            const prevDrawing = this.drawHistory[this.currentHistoryIndex];
            
            if (this.rectangle) {
                this.map.removeLayer(this.rectangle);
            }

            const bounds = L.latLngBounds(
                L.latLng(prevDrawing.bounds.south, prevDrawing.bounds.west),
                L.latLng(prevDrawing.bounds.north, prevDrawing.bounds.east)
            );

            this.rectangle = L.rectangle(bounds, {
                color: "#4caf50",
                weight: 2,
                fillOpacity: 0.2
            }).addTo(this.map);

            const area = Utils.calculateArea(bounds);
            const status = Utils.getAreaStatus(area);
            UIController.updateAreaDisplay(area, status);
            UIController.showStatus('Undo applied', 'info');
        } else {
            UIController.showStatus('Nothing to undo', 'warning');
        }
    },

    // Zoom to location
    zoomToLocation(lat, lon, zoom = 13) {
        this.map.setView([lat, lon], zoom);
    },

    // Add preview layer
    addPreviewLayer(geojson) {
        this.osmLayerGroup.clearLayers();

        // Sample features for preview (don't show all)
        const maxFeatures = 100;
        const features = geojson.features.slice(0, maxFeatures);

        const previewGeoJSON = {
            type: 'FeatureCollection',
            features: features
        };

        L.geoJSON(previewGeoJSON, {
            style: (feature) => {
                const type = feature.geometry.type;
                if (type === 'Point' || type === 'MultiPoint') {
                    return null; // Points will use pointToLayer
                }
                return {
                    color: this.getFeatureColor(feature),
                    weight: 2,
                    opacity: 0.6,
                    fillOpacity: 0.3
                };
            },
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 5,
                    fillColor: this.getFeatureColor(feature),
                    color: '#fff',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.6
                });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    const props = Object.entries(feature.properties)
                        .filter(([key]) => key !== 'osm_id' && key !== 'osm_type')
                        .slice(0, 5)
                        .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
                        .join('<br>');
                    
                    if (props) {
                        layer.bindPopup(props);
                    }
                }
            }
        }).addTo(this.osmLayerGroup);

        UIController.showStatus(`Showing ${features.length} features (sample)`, 'info');
    },

    // Get feature color based on type
    getFeatureColor(feature) {
        const props = feature.properties || {};
        
        if (props.highway) return '#FF6B6B';
        if (props.building) return '#4ECDC4';
        if (props.water || props.waterway) return '#45B7D1';
        if (props.landuse) return '#96CEB4';
        if (props.amenity || props.shop) return '#FFEAA7';
        if (props.natural) return '#6C5CE7';
        
        return '#95A5A6';
    },

    // Clear preview layer
    clearPreviewLayer() {
        this.osmLayerGroup.clearLayers();
    },

    // Get map instance
    getMap() {
        return this.map;
    },

    // Get current area
    getCurrentArea() {
        const bounds = this.getBounds();
        return bounds ? Utils.calculateArea(bounds) : 0;
    }
};