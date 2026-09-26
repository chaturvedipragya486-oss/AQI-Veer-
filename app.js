const app = {
    map: null,
    currentRouteControl: null,
    currentRouteLayer: null, 
    routesData: [], 
    selectedRouteIndex: 0,
    userRole: 'Citizen', 
    aqiZones: [],    
    zoneMarkers: [], 

    login(role) {
        const username = document.getElementById('username').value.trim();
        if (!username) return alert("Please enter your name or ID to proceed.");
        
        this.userRole = role;
        document.getElementById('user-role-display').innerText = `Role: ${role} (${username})`;
        
        const adminPanel = document.getElementById('official-panel');
        if (role === 'Official') {
            adminPanel.classList.remove('hidden');
        } else {
            adminPanel.classList.add('hidden');
        }

        document.getElementById('shutter').classList.remove('active');
        document.getElementById('dashboard').classList.add('active');
        
        this.initMap();
    },

    logout() {
        document.getElementById('dashboard').classList.remove('active');
        document.getElementById('shutter').classList.add('active');
    },

    initMap() {
        if (this.map) {
            this.map.invalidateSize();
            return;
        }

        // Pan-India default center and zoom view
        this.map = L.map('map', { zoomControl: false }).setView([22.5937, 78.9629], 5);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.map.on('click', (e) => {
            if (this.userRole === 'Official') {
                this.createNewAqiZone(e.latlng);
            }
        });
    },

    createNewAqiZone(latlng) {
        const selectedLevel = document.getElementById('aqi-level-select').value;
        
        let config = { color: '#10b981', fill: '#a7f3d0', label: 'Low/Safe AQI' }; 
        if (selectedLevel === 'high') {
            config = { color: '#ef4444', fill: '#fca5a5', label: 'High AQI Hazard Zone' };
        } else if (selectedLevel === 'moderate') {
            config = { color: '#f59e0b', fill: '#fde68a', label: 'Moderate AQI Warning Zone' };
        }

        const activeCircle = L.circle(latlng, {
            color: config.color,
            fillColor: config.fill,
            fillOpacity: 0.45,
            radius: 20000 // 20km radius for pan-India scale visibility
        }).addTo(this.map);

        activeCircle.bindPopup(`<b>🌱 Sensor Report: ${config.label}</b><br>Logged successfully into navigation network.`).openPopup();
        
        this.aqiZones.push({ latlng: latlng, level: selectedLevel });
        this.zoneMarkers.push(activeCircle);
        
        if (this.routesData.length > 0) {
            this.calculatePreciseRoute(true);
        }
    },

    clearHighAQIZones() {
        this.zoneMarkers.forEach(layer => this.map.removeLayer(layer));
        this.zoneMarkers = [];
        this.aqiZones = [];
        document.getElementById('route-options-container').classList.add('hidden');
        document.getElementById('aqi-report').classList.add('hidden');
        this.clearMapRoutes();
    },

    clearMapRoutes() {
        if (this.currentRouteControl) {
            this.map.removeControl(this.currentRouteControl);
            this.currentRouteControl = null;
        }
        if (this.currentRouteLayer) {
            this.map.removeLayer(this.currentRouteLayer);
            this.currentRouteLayer = null;
        }
    },

    async geocode(address) {
        try {
            // Searches globally across India without pinning exclusively to Jaipur
            const queryAddr = address.toLowerCase().includes('india') ? address : `${address}, India`;
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryAddr)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                return L.latLng(data[0].lat, data[0].lon);
            }
            return null;
        } catch (err) {
            return null;
        }
    },

    async calculatePreciseRoute(quietMode = false) {
        const startInput = document.getElementById('start').value;
        const endInput = document.getElementById('end').value;

        if (!startInput || !endInput) {
            if (!quietMode) alert("Source and Destination inputs must be specified.");
            return;
        }

        const searchBtn = document.querySelector('.btn-search');
        searchBtn.innerHTML = "<span>Analyzing Pan-India Path...</span>";
        searchBtn.disabled = true;

        const startLatLng = await this.geocode(startInput);
        const endLatLng = await this.geocode(endInput);

        if (!startLatLng || !endLatLng) {
            searchBtn.innerHTML = "<span>🔍 Compare & Find Cleanest Routes</span>";
            searchBtn.disabled = false;
            if (!quietMode) alert("Could not resolve location points anywhere in India. Please check spelling.");
            return;
        }

        this.clearMapRoutes();

        // Try standard OSRM routing across India
        this.currentRouteControl = L.Routing.control({
            waypoints: [startLatLng, endLatLng],
            routeWhileDragging: false,
            show: false,
            addWaypoints: false,
            createMarker: () => null
        }).addTo(this.map);

        this.currentRouteControl.on('routesfound', (e) => {
            const route = e.routes[0];
            this.processRouteCoordinates(route.coordinates, (route.summary.totalDistance / 1000).toFixed(1), Math.round(route.summary.totalTime / 60));
            searchBtn.innerHTML = "<span>🔍 Compare & Find Cleanest Routes</span>";
            searchBtn.disabled = false;
        });

        this.currentRouteControl.on('routingerror', () => {
            this.map.removeControl(this.currentRouteControl);
            this.currentRouteControl = null;
            this.triggerFallbackDirectRoute(startLatLng, endLatLng, searchBtn);
        });

        setTimeout(() => {
            if (!this.routesData.length && searchBtn.disabled) {
                if (this.currentRouteControl) {
                    this.map.removeControl(this.currentRouteControl);
                    this.currentRouteControl = null;
                }
                this.triggerFallbackDirectRoute(startLatLng, endLatLng, searchBtn);
            }
        }, 4000);
    },

    triggerFallbackDirectRoute(startLatLng, endLatLng, searchBtn) {
        const coordinates = [];
        const steps = 60;
        let totalDist = startLatLng.distanceTo(endLatLng);

        for (let i = 0; i <= steps; i++) {
            let lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * (i / steps);
            let lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * (i / steps);
            coordinates.push(L.latLng(lat, lng));
        }

        const distanceKm = (totalDist / 1000).toFixed(1);
        const timeMins = Math.round((totalDist / 1000) * 1.2); 

        this.processRouteCoordinates(coordinates, distanceKm, timeMins);

        searchBtn.innerHTML = "<span>🔍 Compare & Find Cleanest Routes</span>";
        searchBtn.disabled = false;
    },

    processRouteCoordinates(coordinates, distanceKm, timeMins) {
        this.routesData = [];
        let routeStatus = 'safe';
        let highZonesCount = 0;
        let moderateZonesCount = 0;

        for (let point of coordinates) {
            const ptLatLng = L.latLng(point.lat, point.lng);
            for (let zone of this.aqiZones) {
                if (ptLatLng.distanceTo(zone.latlng) <= 20000) { // Matches 20km zone footprint
                    if (zone.level === 'high') {
                        highZonesCount++;
                    } else if (zone.level === 'moderate') {
                        moderateZonesCount++;
                    }
                }
            }
        }

        if (highZonesCount > 0) {
            routeStatus = 'danger';
        } else if (moderateZonesCount > 0) {
            routeStatus = 'warn';
        }

        this.routesData.push({
            index: 0,
            status: routeStatus,
            distance: distanceKm,
            time: timeMins,
            coordinates: coordinates,
            name: 'Primary Path'
        });

        this.selectedRouteIndex = 0;
        this.renderRouteCards();
        this.drawOfficialDottedArrowPolyline(coordinates, routeStatus);
    },

    drawOfficialDottedArrowPolyline(coordinates, status) {
        if (this.currentRouteLayer) {
            this.map.removeLayer(this.currentRouteLayer);
        }

        let routeColor = '#10b981'; // Safe green
        if (status === 'danger') routeColor = '#ef4444'; // Red
        else if (status === 'warn') routeColor = '#f59e0b'; // Yellow

        // Creates an official looking high-tech dotted path using Leaflet dashed lines
        this.currentRouteLayer = L.polyline(coordinates, {
            color: routeColor,
            weight: 5,
            opacity: 0.9,
            dashArray: '1, 12', // Creates distinct clean dot gaps
            dashOffset: '0',
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);

        this.map.fitBounds(this.currentRouteLayer.getBounds(), { padding: [60, 60] });
        this.updateReportBox(status);
    },

    renderRouteCards() {
        const container = document.getElementById('route-options-container');
        const listDiv = document.getElementById('route-cards-list');
        listDiv.innerHTML = '';
        container.classList.remove('hidden');

        const route = this.routesData[0];
        let badgeText = '🌱 Clean Air Corridor';
        let badgeClass = 'safe';
        if (route.status === 'danger') {
            badgeText = '🔴 High Pollution Risk';
            badgeClass = 'danger';
        } else if (route.status === 'warn') {
            badgeText = '🟡 Moderate Air Warning';
            badgeClass = 'warn';
        }

        const card = document.createElement('div');
        card.className = `route-card active-card`;

        card.innerHTML = `
            <div class="route-card-header">
                <span>Selected Route Path</span>
                <span style="font-size:0.75rem; padding:2px 6px; border-radius:4px;" class="${badgeClass}">${badgeText.split(' ')[1]}</span>
            </div>
            <div class="route-card-details">
                <span>📏 ${route.distance} km</span>
                <span>⏱️ ${route.time} mins</span>
                <span style="font-weight:600; color:var(--text-main);">${badgeText}</span>
            </div>
        `;
        listDiv.appendChild(card);
    },

    updateReportBox(status) {
        const reportBox = document.getElementById('aqi-report');
        const reportTitle = document.getElementById('report-title');
        const statusText = document.getElementById('aqi-status-text');

        reportBox.classList.remove('hidden', 'safe', 'warn', 'danger');
        reportBox.classList.add(status);

        if (status === 'danger') {
            reportTitle.innerText = "⚠️ High Risk Pathway Selected";
            statusText.innerHTML = "<b>Warning:</b> This route crosses an active high-pollution hazard zone.";
        } else if (status === 'warn') {
            reportTitle.innerText = "⚠️ Moderate Air Quality Notice";
            statusText.innerHTML = "<b>Caution:</b> This route passes through a moderate warning zone. Sensitive groups should wear masks.";
        } else {
            reportTitle.innerText = "🌱 Clean Air Corridor Verified";
            statusText.innerHTML = "<b>Optimal Path:</b> This route successfully avoids pollution hotspots and runs through clean-air grids.";
        }
    }
};
