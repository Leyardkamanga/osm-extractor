// UI Controller - Manages all UI interactions

const UIController = {
    // Initialize UI
    init() {
        this.bindControlButtons();
        this.bindPanelControls();
        this.bindModals();
        this.bindThemeToggle();
        this.bindKeyboardShortcuts();
        this.initHistory();
        Utils.theme.init();
    },

    // Bind control buttons
    bindControlButtons() {
        const controls = {
            'search-control': () => this.togglePanel('search-panel'),
            'layers-control': () => this.togglePanel('layers-panel'),
            'format-control': () => this.togglePanel('format-panel'),
            'upload-control': () => this.togglePanel('upload-panel'),
            'history-control': () => this.togglePanel('history-panel'),
            'preview-control': () => window.app?.handlePreview(),
            'download-control': () => window.app?.handleDownload(),
            'clear-control': () => window.app?.clearSelection()
        };

        Object.entries(controls).forEach(([id, handler]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', handler);
            }
        });
    },

    // Bind panel controls
    bindPanelControls() {
        // Close buttons
        document.querySelectorAll('.close-panel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.side-panel').classList.remove('active');
            });
        });

        // Layer checkboxes
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
    },

    // Bind modal controls
    bindModals() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });

        // Close on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Help button
        const helpBtn = document.getElementById('help-button');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.showModal('help-modal');
            });
        }

        // Confirm download button
        const confirmBtn = document.getElementById('confirm-download');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.hideModal('preview-modal');
                window.app?.confirmDownload();
            });
        }
    },

    // Bind theme toggle
    bindThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                Utils.theme.toggle();
            });
        }
    },

    // Bind keyboard shortcuts
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Esc - close panels and modals
            if (e.key === 'Escape') {
                document.querySelectorAll('.side-panel.active').forEach(panel => {
                    panel.classList.remove('active');
                });
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
                return;
            }

            // C - clear selection
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
                if (!this.isInputFocused()) {
                    window.app?.clearSelection();
                    return;
                }
            }

            // Ctrl/Cmd + F - search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.togglePanel('search-panel');
                setTimeout(() => document.getElementById('location-search')?.focus(), 100);
                return;
            }

            // Ctrl/Cmd + L - layers
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.togglePanel('layers-panel');
                return;
            }

            // Ctrl/Cmd + U - upload
            if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                e.preventDefault();
                this.togglePanel('upload-panel');
                return;
            }

            // Ctrl/Cmd + D - download
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                window.app?.handleDownload();
                return;
            }

            // Ctrl/Cmd + Z - undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                window.app?.undoDrawing();
                return;
            }
        });
    },

    // Check if input is focused
    isInputFocused() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    },

    // Toggle panel
    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;

        const allPanels = document.querySelectorAll('.side-panel');
        allPanels.forEach(p => {
            if (p.id !== panelId) p.classList.remove('active');
        });

        panel.classList.toggle('active');
    },

    // Show modal
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    },

    // Hide modal
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    },

    // Show status message
    showStatus(message, type = 'info', duration = 3000) {
        const status = document.getElementById('status');
        if (!status) return;

        status.textContent = message;
        status.className = type;

        if (duration > 0) {
            setTimeout(() => {
                status.className = '';
            }, duration);
        }
    },

    // Update instruction text
    updateInstruction(text) {
        const instruction = document.getElementById('instruction-text');
        if (instruction) instruction.textContent = text;
    },

    // Update area display - now does nothing but kept for compatibility
    updateAreaDisplay(area, status) {
        // Function kept for compatibility with existing code
        // Area display has been removed from UI
    },

    // Show progress overlay
    showProgress(text, details = '') {
        const overlay = document.getElementById('progress-overlay');
        const textEl = document.getElementById('progress-text');
        const detailsEl = document.getElementById('progress-details');
        const fill = document.getElementById('progress-fill');

        if (overlay) overlay.classList.add('active');
        if (textEl) textEl.textContent = text;
        if (detailsEl) detailsEl.textContent = details;
        if (fill) fill.style.width = '0%';
    },

    // Update progress
    updateProgress(progress, details = '') {
        const fill = document.getElementById('progress-fill');
        const detailsEl = document.getElementById('progress-details');

        if (fill) fill.style.width = `${progress}%`;
        if (detailsEl && details) detailsEl.textContent = details;
    },

    // Hide progress overlay
    hideProgress() {
        const overlay = document.getElementById('progress-overlay');
        if (overlay) overlay.classList.remove('active');
    },

    // Display search results
    displaySearchResults(results) {
        const container = document.getElementById('search-results');
        if (!container) return;

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
                window.app?.selectSearchResult(result);
            });
            container.appendChild(item);
        });
    },

    // Display preview
    displayPreview(stats, samples) {
        const statsEl = document.getElementById('preview-stats');
        const sampleEl = document.getElementById('preview-sample');
        const loading = document.getElementById('preview-loading');
        const content = document.getElementById('preview-content');

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';

        if (statsEl) {
            statsEl.innerHTML = `
                <div class="stat-item">
                    <span class="stat-label">Total Features:</span>
                    <span class="stat-value">${Utils.formatNumber(stats.totalFeatures)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Points:</span>
                    <span class="stat-value">${Utils.formatNumber(stats.points)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Lines:</span>
                    <span class="stat-value">${Utils.formatNumber(stats.lines)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Polygons:</span>
                    <span class="stat-value">${Utils.formatNumber(stats.polygons)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Unique Tags:</span>
                    <span class="stat-value">${Utils.formatNumber(stats.tagCount)}</span>
                </div>
            `;
        }

        if (sampleEl) {
            const sampleText = JSON.stringify(samples, null, 2);
            sampleEl.textContent = sampleText.length > 500 
                ? sampleText.substring(0, 500) + '...' 
                : sampleText;
        }
    },

    // Initialize history
    initHistory() {
        this.updateHistoryDisplay();
    },

    // Update history display
    updateHistoryDisplay() {
        const container = document.getElementById('history-list');
        if (!container) return;

        const history = Utils.storage.get('downloadHistory') || [];

        if (history.length === 0) {
            container.innerHTML = '<div class="history-empty">No download history</div>';
            return;
        }

        container.innerHTML = '';

        history.slice(0, 10).forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-item-name">${item.filename}</div>
                <div class="history-item-meta">
                    <span>${item.format.toUpperCase()}</span>
                    <span>${Utils.formatDate(new Date(item.timestamp))}</span>
                </div>
            `;
            div.addEventListener('click', () => {
                window.app?.loadFromHistory(item);
            });
            container.appendChild(div);
        });
    },

    // Add to history
    addToHistory(item) {
        const history = Utils.storage.get('downloadHistory') || [];
        history.unshift({
            ...item,
            timestamp: Date.now()
        });

        // Keep only last 50 items
        Utils.storage.set('downloadHistory', history.slice(0, 50));
        this.updateHistoryDisplay();
    },

    // Get selected features
    getSelectedFeatures() {
        return Array.from(document.querySelectorAll('input[name="featureType"]:checked'))
            .map(cb => cb.value);
    },

    // Get selected OSM types
    getSelectedOSMTypes() {
        return Array.from(document.querySelectorAll('input[name="osmType"]:checked'))
            .map(cb => cb.value);
    },

    // Get selected format
    getSelectedFormat() {
        const radio = document.querySelector('input[name="format"]:checked');
        return radio ? radio.value : 'geojson';
    },

    // Get selected geometry types for export
    getSelectedGeometryTypes() {
        return Array.from(document.querySelectorAll('input[name="geometryType"]:checked'))
            .map(cb => cb.value);
    },

    // Is "all data" selected
    isAllDataSelected() {
        const checkbox = document.getElementById('all');
        return checkbox ? checkbox.checked : false;
    }
};