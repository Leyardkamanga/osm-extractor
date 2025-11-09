// Main Application - Coordinates all modules

class OSMExtractorApp {
    constructor() {
        this.currentLocationName = '';
        this.currentOSMData = null;
        this.currentGeoJSON = null;
        this.searchDebounced = null;
        
        this.init();
    }

    // Initialize application
    init() {
        // Initialize all controllers
        MapController.init();
        UIController.init();

        // Bind app-specific events
        this.bindSearchInput();
        this.bindFileUpload();

        // Set global reference
        window.app = this;

        UIController.showStatus('Application loaded', 'success');
    }

    // Bind search input
    bindSearchInput() {
        const searchInput = document.getElementById('location-search');
        if (!searchInput) return;

        this.searchDebounced = Utils.debounce(async (query) => {
            try {
                const results = await OSMService.searchLocation(query);
                UIController.displaySearchResults(results);
            } catch (error) {
                UIController.showStatus('Search failed: ' + error.message, 'error');
            }
        }, 500);

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query.length > 2) {
                this.searchDebounced(query);
            }
        });
    }

    // Bind file upload
    bindFileUpload() {
        const fileInput = document.getElementById('boundary-upload');
        if (!fileInput) return;

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            await this.handleFileUpload(file);
        });
    }

    // Handle file upload
    async handleFileUpload(file) {
        const statusEl = document.getElementById('upload-status');
        
        try {
            // Validate file
            FileParser.validateFile(file);

            // Show loading
            if (statusEl) {
                statusEl.className = 'upload-status';
                statusEl.textContent = 'Processing file...';
                statusEl.style.display = 'block';
            }

            // Parse file
            const geojson = await FileParser.parse(file);

            // Clear existing selection
            MapController.clearSelection();

            // Add to map
            const bounds = MapController.addUploadedLayer(geojson);

            if (!bounds) {
                throw new Error('Invalid geometry bounds');
            }

            // Update status
            const area = Utils.calculateArea(bounds);
            if (statusEl) {
                statusEl.className = 'upload-status success';
                statusEl.textContent = `✓ Boundary uploaded! Area: ${Utils.formatArea(area)}`;
            }

            UIController.showStatus(`Boundary uploaded: ${Utils.formatArea(area)}`, 'success');
            UIController.togglePanel('upload-panel');

            // Reset file input
            document.getElementById('boundary-upload').value = '';

        } catch (error) {
            if (statusEl) {
                statusEl.className = 'upload-status error';
                statusEl.textContent = '✗ ' + error.message;
            }
            UIController.showStatus('Upload failed: ' + error.message, 'error');
        }
    }

    // Select search result
    selectSearchResult(result) {
        this.currentLocationName = result.display_name.split(',')[0].trim();
        MapController.zoomToLocation(
            parseFloat(result.lat),
            parseFloat(result.lon),
            13
        );
        UIController.togglePanel('search-panel');
        UIController.showStatus(`Moved to: ${this.currentLocationName}`, 'success');
    }

    // Handle preview
    async handlePreview() {
        const bounds = MapController.getBounds();
        
        if (!bounds) {
            UIController.showStatus('Please select an area first', 'error');
            return;
        }

        const area = Utils.calculateArea(bounds);
        if (area > 100000) {
            UIController.showStatus('Area too large (max 100000 km²). Please select a smaller area.', 'error');
            return;
        }

        UIController.showModal('preview-modal');
        document.getElementById('preview-loading').style.display = 'block';
        document.getElementById('preview-content').style.display = 'none';

        try {
            // Build query
            const selectedFeatures = UIController.getSelectedFeatures();
            const osmTypes = UIController.getSelectedOSMTypes();
            const allData = UIController.isAllDataSelected();

            if (selectedFeatures.length === 0 && !allData) {
                UIController.hideModal('preview-modal');
                UIController.showStatus('Please select at least one feature type in the Layers panel', 'error');
                return;
            }

            const query = OSMService.buildOverpassQuery(bounds, selectedFeatures, osmTypes, allData);

            // Update loading message
            const loadingEl = document.getElementById('preview-loading');
            if (loadingEl) {
                loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching data from OpenStreetMap...<br><small>This may take 30-60 seconds for larger areas</small>';
            }

            // Fetch data
            const osmData = await OSMService.fetchOverpassData(query, (progress) => {
                console.log('Preview progress:', progress);
                if (loadingEl && progress.message) {
                    loadingEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${progress.message}`;
                }
            });

            if (!osmData.elements || osmData.elements.length === 0) {
                UIController.hideModal('preview-modal');
                UIController.showStatus('No data found in this area. Try selecting different feature types or a different area.', 'warning');
                return;
            }

            // Update loading message
            if (loadingEl) {
                loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting to GeoJSON...';
            }

            // Convert to GeoJSON
            const geojson = GeometryProcessor.osmToGeoJSON(osmData);
            
            if (!geojson.features || geojson.features.length === 0) {
                UIController.hideModal('preview-modal');
                UIController.showStatus('No features found after processing. Try different feature types.', 'warning');
                return;
            }

            // Get statistics
            const stats = GeometryProcessor.getStatistics(geojson);
            const samples = GeometryProcessor.getSampleFeatures(geojson, 5);

            // Display preview
            UIController.displayPreview(stats, samples);

            // Add visual preview to map
            MapController.addPreviewLayer(geojson);

            // Store for download
            this.currentOSMData = osmData;
            this.currentGeoJSON = geojson;

        } catch (error) {
            UIController.hideModal('preview-modal');
            
            // Provide helpful error messages
            let errorMessage = error.message;
            if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
                errorMessage = 'Request timed out. The area might be too large or the server is busy. Try:\n• Selecting a smaller area\n• Selecting fewer feature types\n• Waiting a moment and trying again';
            } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
                errorMessage = 'Network error. Please check:\n• Your internet connection\n• That you\'re not behind a restrictive firewall\n• Try again in a moment as the server may be busy';
            } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
                errorMessage = 'Too many requests. Please wait 30-60 seconds before trying again.';
            }
            
            UIController.showStatus('Preview failed: ' + errorMessage, 'error', 8000);
            console.error('Preview error:', error);
        }
    }

    // Handle download
    async handleDownload() {
        const bounds = MapController.getBounds();
        
        if (!bounds) {
            UIController.showStatus('Please select an area first', 'error');
            return;
        }

        const area = Utils.calculateArea(bounds);
        if (area > 100000) {
            UIController.showStatus('Area too large (max 100000 km²). Please select a smaller area.', 'error');
            return;
        }

        // Show preview first
        await this.handlePreview();
    }

    // Confirm download (after preview)
    async confirmDownload() {
        UIController.showProgress('Downloading data...', 'Fetching from OpenStreetMap...');

        try {
            const bounds = MapController.getBounds();
            const selectedFeatures = UIController.getSelectedFeatures();
            const osmTypes = UIController.getSelectedOSMTypes();
            const allData = UIController.isAllDataSelected();
            const format = UIController.getSelectedFormat();
            const geometryTypes = UIController.getSelectedGeometryTypes();

            // Use cached data if available
            let osmData = this.currentOSMData;
            let geojson = this.currentGeoJSON;

            // If no cached data, fetch it
            if (!osmData) {
                const query = OSMService.buildOverpassQuery(bounds, selectedFeatures, osmTypes, allData);

                osmData = await OSMService.fetchOverpassData(query, (progress) => {
                    if (progress.stage === 'fetch') {
                        UIController.updateProgress(30, progress.message);
                    }
                });

                if (!osmData.elements || osmData.elements.length === 0) {
                    UIController.hideProgress();
                    UIController.showStatus('No data found', 'warning');
                    return;
                }

                UIController.updateProgress(60, 'Converting to GeoJSON...');

                geojson = GeometryProcessor.osmToGeoJSON(osmData, (progress) => {
                    UIController.updateProgress(60 + (progress.progress * 0.3), progress.message);
                });
            }

            UIController.updateProgress(90, 'Preparing export...');

            // Generate filename
            const featureStr = allData ? 'all' : selectedFeatures.join('_');
            const location = this.currentLocationName || 'osm_data';
            const geomStr = geometryTypes.length === 3 ? '' : '_' + geometryTypes.map(g => g.toLowerCase()).join('_');
            const baseName = Utils.sanitizeFilename(`${location}_${featureStr}${geomStr}`);

            // Export with geometry filter
            const result = await ExportService.export(format, geojson, osmData, baseName, geometryTypes);

            UIController.updateProgress(100, 'Complete!');

            // Add to history
            UIController.addToHistory({
                filename: result.filename,
                format: format,
                area: Utils.calculateArea(bounds),
                features: geojson.features.length,
                location: this.currentLocationName,
                geometryTypes: geometryTypes,
                bounds: {
                    north: bounds.getNorth(),
                    south: bounds.getSouth(),
                    east: bounds.getEast(),
                    west: bounds.getWest()
                }
            });

            setTimeout(() => {
                UIController.hideProgress();
                UIController.showStatus(`Downloaded: ${result.filename}`, 'success', 5000);
            }, 500);

        } catch (error) {
            UIController.hideProgress();
            UIController.showStatus('Download failed: ' + Utils.getErrorMessage(error), 'error');
            console.error('Download error:', error);
        }
    }

    // Clear selection
    clearSelection() {
        MapController.clearSelection();
        MapController.clearPreviewLayer();
        OSMService.clearCache();
        this.currentOSMData = null;
        this.currentGeoJSON = null;
        UIController.showStatus('Selection cleared', 'info');
    }

    // Undo drawing
    undoDrawing() {
        MapController.undoDrawing();
    }

    // Load from history
    loadFromHistory(item) {
        MapController.clearSelection();

        const bounds = L.latLngBounds(
            L.latLng(item.bounds.south, item.bounds.west),
            L.latLng(item.bounds.north, item.bounds.east)
        );

        MapController.map.fitBounds(bounds);

        // Create rectangle from history
        MapController.rectangle = L.rectangle(bounds, {
            color: "#4caf50",
            weight: 2,
            fillOpacity: 0.2
        }).addTo(MapController.map);

        this.currentLocationName = item.location || '';
        
        const area = Utils.calculateArea(bounds);
        const status = Utils.getAreaStatus(area);
        UIController.updateAreaDisplay(area, status);
        UIController.togglePanel('history-panel');
        UIController.showStatus('Loaded from history', 'success');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new OSMExtractorApp();
});