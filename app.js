const map = L.map('map', {zoomControl: false}).setView([-1.8312, -78.1834], 6);
    
    L.control.zoom({ position: 'topleft' }).addTo(map);

    const baseMaps = {
      positron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }),
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 })
    };

    let currentBaseMap = baseMaps.positron;
    currentBaseMap.addTo(map);

    document.getElementById('baseMapSelect').addEventListener('change', function(e) {
        map.removeLayer(currentBaseMap);
        currentBaseMap = baseMaps[e.target.value];
        currentBaseMap.addTo(map);
    });

    map.createPane('polygonsPane'); map.getPane('polygonsPane').style.zIndex = 400;
    map.createPane('linesPane'); map.getPane('linesPane').style.zIndex = 410;
    map.createPane('pointsPane'); map.getPane('pointsPane').style.zIndex = 420;

    map.on('zoomend', function() {
        const currentZoom = map.getZoom();
        map.getPane('pointsPane').style.display = (currentZoom < 8) ? 'none' : 'block';

        const labels = document.querySelectorAll('.province-label');
        labels.forEach(label => {
            if (currentZoom < 7) {
                label.style.opacity = '0'; label.style.fontSize = '6px';
            } else if (currentZoom === 7) {
                label.style.opacity = '0.8'; label.style.fontSize = '8px';  
            } else if (currentZoom === 8) {
                label.style.opacity = '1'; label.style.fontSize = '10px'; 
            } else {
                label.style.opacity = '1'; label.style.fontSize = '12px'; 
            }
        });
    });
    map.fire('zoomend');

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-btn');
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      toggleBtn.innerHTML = sidebar.classList.contains('collapsed') ? '&#x276F;' : '&#x276E;';
      setTimeout(() => { map.invalidateSize(); }, 300);
    });

    let legendControl = null;
    let storedLayers = {}; 
    let rawGeoJSONData = {}; 
    let limiteProvincialLayer = null; 
    let ecuadorBounds = null;

    function getColor(d) {
        return d >= 400 && d < 600  ? '#ffefe9' : 
               d >= 600 && d < 650  ? '#ffb5c6' : 
               d >= 650 && d < 700  ? '#fb6a9f' : 
               d >= 700 && d < 750  ? '#d22b83' : 
               d >= 750 && d <= 1000 ? '#9b0067' : '#b0bec5'; 
    }

    function stylePolygonLayer(feature) {
        return { fillColor: getColor(feature.properties.DN), stroke: false, fillOpacity: 0.75 };
    }

    function styleProvincial(feature) {
        return { fillColor: 'transparent', weight: 1.0, opacity: 0.8, color: '#2c3e50', fillOpacity: 0.0 };
    }

    function onEachFeaturePopup(feature, layer, type) {
        if (feature.properties) {
            let content = '';
            
            if (type === 'points') {
                content = `<b>AMIE:</b> ${feature.properties.amie || feature.properties.AMIE || 'N/A'}`;
                if (feature.properties.ind_seg) {
                    content += `<br><b>\u00CDndice Seg:</b> ${feature.properties.ind_seg}`;
                }
                if (feature.properties.inev_4) {
                    content += `<br><b>Promedio Elemental:</b> ${parseFloat(feature.properties.inev_4).toFixed(0)}`;
                }
                if (feature.properties.inev_7) {
                    content += `<br><b>Promedio Medio:</b> ${parseFloat(feature.properties.inev_7).toFixed(0)}`;
                }
                if (feature.properties.inev_10) {
                    content += `<br><b>Promedio Superior:</b> ${parseFloat(feature.properties.inev_10).toFixed(0)}`;
                }
                if (feature.properties.inev_3) {
                    content += `<br><b>Promedio Bachillerato:</b> ${parseFloat(feature.properties.inev_3).toFixed(0)}`;
                }
                if (feature.properties.origen_tabla) {
                    content += `<br><b>Tabla:</b> ${feature.properties.origen_tabla}`;
                }
            } else if (type === 'provincia' && feature.properties.PROVINCIA) {
                content = `<b>Provincia:</b> ${feature.properties.PROVINCIA || 'N/A'}<br><b>C\u00F3digo:</b> ${feature.properties.CODPRO || 'N/A'}`;
            } else {
                content = `<b>ID:</b> ${feature.properties.id || 'N/A'}<br><b>Valor (DN):</b> ${feature.properties.DN || 'N/A'}`;
                if (feature.properties.Rango) {
                    content += `<br><b>Rango Calificaci\u00F3n:</b> ${feature.properties.Rango}`;
                }
            }
            
            layer.bindPopup(content);

            if (type === 'provincia' && feature.properties.PROVINCIA) {
                layer.bindTooltip(feature.properties.PROVINCIA, {
                    permanent: true, direction: 'center', className: 'province-label', interactive: false 
                });
            }
        }
    }

    function addLegend() {
        if (legendControl) { map.removeControl(legendControl); }
        legendControl = L.control({position: 'bottomright'});
        legendControl.onAdd = function () {
            const div = L.DomUtil.create('div', 'info legend');
            const labels = ['<strong>Simbolog\u00EDa</strong><br>'];
            const ranges = [400, 600, 650, 700, 750];
            const text = ['< 600', '600 - 650', '650 - 700', '700 - 750', '> 750'];
            for (let i = 0; i < ranges.length; i++) {
                labels.push(`<div class="legend-item"><i class="legend-color" style="background:${getColor(ranges[i])}"></i>${text[i]}</div>`);
            }
            div.innerHTML = labels.join(''); return div;
        };
        legendControl.addTo(map);
    }

    // CORRECCIÓN: ID ajustado a minúsculas para coincidir exactamente con Postgres (PGRST202 Fix)
    const layersConfig = [
      { id: '4_elemental_sest25_', name: 'Elemental', type: 'points', pane: 'pointsPane', dot: '#00a65a', emoji: '&#x1F3EB;', hint: '(Puntos Promedios)', container: 'group-top', defaultOn: false },
      { id: '7_medio_sest25_', name: 'Medio', type: 'points', pane: 'pointsPane', dot: '#0078d4', emoji: '&#x1F3EB;', hint: '(Puntos Promedios)', container: 'group-top', defaultOn: false },
      { id: '10_superior_sest25_', rpcName: 'get_10_superior_sest25__geojson', name: 'Superior', type: 'points', pane: 'pointsPane', dot: '#6a1b9a', emoji: '&#x1F393;', hint: '(Puntos Promedios)', container: 'group-top', defaultOn: false },
      { id: '3_bachillerato_sest25_', rpcName: 'get_3_bachillerato_sest25__geojson', name: 'Bachillerato', type: 'points', pane: 'pointsPane', dot: '#ff8c00', emoji: '&#x1F3EB;', hint: '(Puntos Promedios)', container: 'group-top', defaultOn: false },
      { id: 'bachillerato_sest25', name: 'Bachillerato (SEST2025)', type: 'polygon', pane: 'polygonsPane', dot: '#d22b83', emoji: '&#x1F3EB;', container: 'group-sest', defaultOn: true },
      { id: 'superior_sest25', name: 'Superior (SEST2025)', type: 'polygon', pane: 'polygonsPane', dot: '#9b0067', emoji: '&#x1F393;', container: 'group-sest', defaultOn: false },
      { id: 'medio_sest25', name: 'Medio (SEST2025)', type: 'polygon', pane: 'polygonsPane', dot: '#fb6a9f', emoji: '&#x1F3EB;', container: 'group-sest', defaultOn: false },
      { id: 'elemental_sest25', name: 'Elemental (SEST2025)', type: 'polygon', pane: 'polygonsPane', dot: '#ffb5c6', emoji: '&#x1F4D8;', container: 'group-sest', defaultOn: false },
      { id: 'limite_provincial', name: 'Límites Prov.', type: 'line', pane: 'linesPane', dot: '#f6a3bd', emoji: '&#x1F5FA;', container: 'group-bottom', defaultOn: true }
    ];

    async function loadGeoportal() {
      const baseUrl = 'https://sbgpdfbjyosrbhejppam.supabase.co';
      const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZ3BkZmJqeW9zcmJoZWpwcGFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc3MjY1MCwiZXhwIjoyMDk0MzQ4NjUwfQ.6Fx-HuC7lPAa9WhLgQau0bCRdCL7kSOu95AWPoutoQA';
      const status = document.getElementById('status');
      const layerListDiv = document.getElementById('layerList');
      const btnLoad = { disabled: false };

      btnLoad.disabled = true;
      status.innerHTML = '\u23F3 Conectando...'; 
      status.className = 'status-alert warning'; status.style.display = 'none';
      
      Object.values(storedLayers).forEach(l => map.removeLayer(l));
      storedLayers = {}; rawGeoJSONData = {};
      
      layerListDiv.innerHTML = `
        <h3>&#x1F5C2; CAPAS</h3>

        <details class="sest-group" open>
            <summary>Período 2024-2025</summary>
            <div id="group-top" style="padding-left:0; border-left:none; margin-top:4px; margin-bottom:10px;"></div>
        </details>

        <details class="sest-group" open>
            <summary style='display:none;'>SEST2025</summary>
            <div id="group-sest" style="padding-left:0; border-left:none; margin-top:4px; margin-bottom:6px;"></div>
        </details>

        <div id="group-bottom"></div>
      `;
      
      document.getElementById('layersMenu').style.display = 'none';
      document.getElementById('spatial-nav-box').style.display = 'none';
      document.getElementById('stats-box').style.display = 'none'; 

      try {
        const fetchPromises = layersConfig.map(layer => 
          fetch(`${baseUrl}/rest/v1/rpc/${layer.rpcName || `get_${layer.id}_geojson`}`, {
            method: 'POST',
            headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
          }).then(async res => {
            if (!res.ok) {
              const errText = await res.text();
              console.error(`[${layer.id}] HTTP ${res.status}:`, errText);
              throw new Error(`HTTP ${res.status}: ${errText}`);
            }
            return { status: 'success', data: await res.json(), config: layer };
          }).catch(error => {
            console.error(`[${layer.id}] FAILED:`, error.message);
            return { status: 'failed', config: layer, error: error.message };
          })
        );

        const results = await Promise.all(fetchPromises);
        const boundsGroup = L.featureGroup();
        let totalElements = 0;
        let failedLayers = [];

        results.forEach(result => {
            if (result.status === 'failed') { failedLayers.push(`${result.config.name} (${result.error})`); return; }

            const { data, config } = result;
            if (!data || !data.features) return; 

            totalElements += data.features.length;
            let leafletLayer;

            rawGeoJSONData[config.id] = data;

            if (config.type === 'points') {
                leafletLayer = L.geoJSON(data, {
                    pointToLayer: (f, latlng) => L.circleMarker(latlng, { 
                        radius: 2.5, 
                        fillColor: config.id === '4_elemental_sest25_' ? '#00a65a' : config.id === '7_medio_sest25_' ? '#0078d4' : config.id === '10_superior_sest25_' ? '#6a1b9a' : config.id === '3_bachillerato_sest25_' ? '#ff8c00' : '#1a1a2e', 
                        color: "#ffffff", 
                        weight: 0.5, 
                        fillOpacity: 0.9, 
                        pane: config.pane 
                    }),
                    onEachFeature: (f, l) => onEachFeaturePopup(f, l, 'points')
                });
            } else if (config.id === 'limite_provincial') {
                leafletLayer = L.geoJSON(data, {
                    pane: config.pane, style: styleProvincial, onEachFeature: (f, l) => onEachFeaturePopup(f, l, 'provincia')
                });
                limiteProvincialLayer = leafletLayer; 
            } else {
                leafletLayer = L.geoJSON(data, {
                    pane: config.pane, style: stylePolygonLayer, onEachFeature: (f, l) => onEachFeaturePopup(f, l, 'polygon')
                });
            }

            storedLayers[config.id] = leafletLayer;
            
            if (config.defaultOn) { leafletLayer.addTo(map); }
            boundsGroup.addLayer(leafletLayer);

            const hintText = config.hint ? `<span class="zoom-hint">${config.hint}</span>` : '';
            const isChecked = config.defaultOn ? 'checked' : '';
            
            let sliderHTML = '';
            if (config.type === 'polygon') {
                sliderHTML = `
                <div class="slider-row">
                    <span>Opacidad:</span>
                    <input type="range" min="0" max="1" step="0.05" value="0.75" class="opacity-slider" data-id="${config.id}">
                </div>`;
            }

            const itemHTML = `
              <div class="layer-item-container">
                <div class="layer-row">
                    <div style="flex:1">
                        <label class="layer-label">
                        <input type="checkbox" ${isChecked} value="${config.id}">
                        <span class="layer-dot" style="background-color: ${config.dot}; border: 1px solid #777;"></span>
                        <span class="layer-emoji">${config.emoji}</span>
                        <span class="layer-name">${config.name}</span>
                        </label>
                        ${hintText}
                    </div>
                    <button class="download-btn" data-id="${config.id}" title="Descargar capa">&#x1F4BE;</button>
                </div>
                ${sliderHTML}
              </div>
            `;
            document.getElementById(config.container).insertAdjacentHTML('beforeend', itemHTML);
        });

        layerListDiv.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const layerId = e.target.value;

                if (
                    exclusiveRasterIds.includes(layerId) ||
                    exclusiveLevelIds.includes(layerId)
                ) {
                    if (e.target.checked) {
                        activateExclusivePair(layerId);
                    } else {
                        deactivateExclusivePair(layerId);
                    }
                    return;
                }

                if (e.target.checked) map.addLayer(storedLayers[layerId]); 
                else map.removeLayer(storedLayers[layerId]);
            });
        });

        layerListDiv.querySelectorAll('.opacity-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const layerId = e.target.getAttribute('data-id');
                const val = parseFloat(e.target.value);
                if (storedLayers[layerId]) { storedLayers[layerId].setStyle({ fillOpacity: val }); }
            });
        });

        layerListDiv.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layerId = e.currentTarget.getAttribute('data-id');
                const geojson = rawGeoJSONData[layerId];
                const blob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `${layerId}.geojson`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            });
        });


        
        // --- Sincronización unificada Período 2024-2025 + SEST2025 ---
        const levelToRaster = {
            '4_elemental_sest25_': 'elemental_sest25',
            '7_medio_sest25_': 'medio_sest25',
            '10_superior_sest25_': 'superior_sest25',
            '3_bachillerato_sest25_': 'bachillerato_sest25'
        };

        const rasterToLevel = {
            'elemental_sest25': '4_elemental_sest25_',
            'medio_sest25': '7_medio_sest25_',
            'superior_sest25': '10_superior_sest25_',
            'bachillerato_sest25': '3_bachillerato_sest25_'
        };

        const exclusiveRasterIds = Object.keys(rasterToLevel);
        const exclusiveLevelIds = Object.keys(levelToRaster);

        function setLayerChecked(layerId, checked) {
            const input = layerListDiv.querySelector(`input[type="checkbox"][value="${layerId}"]`);
            if (input) input.checked = checked;
        }

        function showLayer(layerId) {
            if (storedLayers[layerId] && !map.hasLayer(storedLayers[layerId])) {
                map.addLayer(storedLayers[layerId]);
            }
            setLayerChecked(layerId, true);
        }

        function hideLayer(layerId) {
            if (storedLayers[layerId] && map.hasLayer(storedLayers[layerId])) {
                map.removeLayer(storedLayers[layerId]);
            }
            setLayerChecked(layerId, false);
        }

        function activateExclusivePair(sourceId) {

            const rasterId = levelToRaster[sourceId] || sourceId;
            const levelId = rasterToLevel[sourceId] || sourceId;

            exclusiveRasterIds.forEach(id => hideLayer(id));
            exclusiveLevelIds.forEach(id => hideLayer(id));

            showLayer(rasterId);
            showLayer(levelId);
        }

        function deactivateExclusivePair(sourceId) {

            const rasterId = levelToRaster[sourceId] || sourceId;
            const levelId = rasterToLevel[sourceId] || sourceId;

            hideLayer(rasterId);
            hideLayer(levelId);
        }


        if (Object.keys(storedLayers).length > 0) {
            document.getElementById('layersMenu').style.display = 'block';
            addLegend();
        }

        if (boundsGroup.getLayers().length > 0) {
            // Enfoque profesional: usar Ecuador continental para evitar que Galápagos aleje demasiado el mapa.
            ecuadorBounds = boundsGroup.getBounds();

            if (limiteProvincialLayer) {
                const mainlandBoundsGroup = L.featureGroup();
                limiteProvincialLayer.eachLayer(layer => {
                    const props = layer.feature ? layer.feature.properties : {};
                    const prov = (props.PROVINCIA || '').toString().toUpperCase();
                    const cod = (props.CODPRO || '').toString();

                    // Excluir Galápagos del encuadre inicial, pero la capa sigue disponible en el mapa.
                    if (!prov.includes('GAL') && cod !== '20') {
                        mainlandBoundsGroup.addLayer(layer);
                    }
                });

                if (mainlandBoundsGroup.getLayers().length > 0) {
                    ecuadorBounds = mainlandBoundsGroup.getBounds();
                }
            }

            map.fitBounds(ecuadorBounds, {
                paddingTopLeft: [95, 35],
                paddingBottomRight: [320, 60],
                maxZoom: 7
            });

            // Pequeño reajuste después de que Leaflet termine de calcular tamaños.
            setTimeout(() => {
                map.invalidateSize();
                map.fitBounds(ecuadorBounds, {
                    paddingTopLeft: [80, 30],
                    paddingBottomRight: [240, 40],
                    maxZoom: 7
                });
            }, 250);
        }

        if (limiteProvincialLayer && rawGeoJSONData['limite_provincial']) {
            const selectProv = document.getElementById('provinceFilter');
            const features = rawGeoJSONData['limite_provincial'].features;
            
            const provinces = [...new Set(features.map(f => f.properties.PROVINCIA))].filter(Boolean).sort();
            
            selectProv.innerHTML = '<option value="">-- Todo el Ecuador --</option>';
            provinces.forEach(prov => {
                selectProv.insertAdjacentHTML('beforeend', `<option value="${prov}">${prov}</option>`);
            });
            
            document.getElementById('spatial-nav-box').style.display = 'block';

            selectProv.addEventListener('change', (e) => {
                const selectedProv = e.target.value;
                const statsBox = document.getElementById('stats-box');
                const statsContent = document.getElementById('prov-stats-content');
                
                limiteProvincialLayer.eachLayer(layer => {
                    limiteProvincialLayer.resetStyle(layer);
                });

                if (!selectedProv) {
                    map.fitBounds(ecuadorBounds, { paddingTopLeft: [80, 30], paddingBottomRight: [240, 40], maxZoom: 7 });
                    statsBox.style.display = 'none'; 
                    return;
                }

                let targetBounds = null;
                let currentCodpro = null;

                limiteProvincialLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties.PROVINCIA === selectedProv) {
                        currentCodpro = layer.feature.properties.CODPRO; 
                        
                        layer.setStyle({ weight: 3.5, color: '#b8bec6', opacity: 1, fillColor: '#b8bec6', fillOpacity: 0.25 });
                        targetBounds = layer.getBounds();
                    }
                });

                if (targetBounds) { map.fitBounds(targetBounds, { paddingTopLeft: [90, 35], paddingBottomRight: [310, 60], maxZoom: 8 }); }

                if (currentCodpro) {
                    let statsHTML = '';
                    let hasAnyData = false;

                    // --- Elemental ---
                    if (rawGeoJSONData['4_elemental_sest25_']) {
                        let sumE = 0, countE = 0;
                        rawGeoJSONData['4_elemental_sest25_'].features.forEach(f => {
                            const amie = f.properties.amie || f.properties.AMIE;
                            const score = f.properties.inev_4;
                            if (amie && amie.toString().startsWith(currentCodpro) && score) {
                                sumE += parseFloat(score); countE++;
                            }
                        });
                        if (countE > 0) {
                            hasAnyData = true;
                            statsHTML += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #f0d0e8;">` +
                                `<span style="font-size:11px; color:#555;">Promedio Elemental</span><br>` +
                                `<span style="font-size:20px; font-weight:bold; color:#d22b83;">${(sumE/countE).toFixed(0)}</span>` +
                                ` <span style="font-size:11px; color:#666;">(${countE} Inst. Educativas)</span></div>`;
                        }
                    }

                    // --- Medio ---
                    if (rawGeoJSONData['7_medio_sest25_']) {
                        let sumM = 0, countM = 0;
                        rawGeoJSONData['7_medio_sest25_'].features.forEach(f => {
                            const amie = f.properties.amie || f.properties.AMIE;
                            const score = f.properties.inev_7;
                            if (amie && amie.toString().startsWith(currentCodpro) && score) {
                                sumM += parseFloat(score); countM++;
                            }
                        });
                        if (countM > 0) {
                            hasAnyData = true;
                            statsHTML += `<div>` +
                                `<span style="font-size:11px; color:#555;">Promedio Medio</span><br>` +
                                `<span style="font-size:20px; font-weight:bold; color:#0078d4;">${(sumM/countM).toFixed(0)}</span>` +
                                ` <span style="font-size:11px; color:#666;">(${countM} Inst. Educativas)</span></div>`;
                        }
                    }

                    // --- Superior: tabla 10_superior_SEST25__ campo inev_10 ---
                    if (rawGeoJSONData['10_superior_sest25_']) {
                        let sumS = 0, countS = 0;
                        rawGeoJSONData['10_superior_sest25_'].features.forEach(f => {
                            const amie = f.properties.amie || f.properties.AMIE;
                            const score = f.properties.inev_10;
                            if (amie && amie.toString().startsWith(currentCodpro) && score !== null && score !== undefined && score !== '') {
                                sumS += parseFloat(score);
                                countS++;
                            }
                        });
                        if (countS > 0) {
                            hasAnyData = true;
                            statsHTML += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #f0d0e8;">` +
                                `<span style="font-size:11px; color:#555;">Promedio Superior</span><br>` +
                                `<span style="font-size:20px; font-weight:bold; color:#6a1b9a;">${(sumS/countS).toFixed(0)}</span>` +
                                ` <span style="font-size:11px; color:#666;">(${countS} Inst. Educativas)</span></div>`;
                        }
                    }

                    // --- Bachillerato: tabla 3_bachillerato_SEST25_ ---
                    if (rawGeoJSONData['3_bachillerato_sest25_']) {
                        let sumB = 0, countB = 0;
                        rawGeoJSONData['3_bachillerato_sest25_'].features.forEach(f => {
                            const amie = f.properties.amie || f.properties.AMIE;
                            const score = f.properties.inev_3;
                            if (amie && amie.toString().startsWith(currentCodpro) && score !== null && score !== undefined && score !== '') {
                                sumB += parseFloat(score);
                                countB++;
                            }
                        });
                        if (countB > 0) {
                            hasAnyData = true;
                            statsHTML += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #f0d0e8;">` +
                                `<span style="font-size:11px; color:#555;">Promedio Bachillerato</span><br>` +
                                `<span style="font-size:20px; font-weight:bold; color:#ef6c00;">${(sumB/countB).toFixed(0)}</span>` +
                                ` <span style="font-size:11px; color:#666;">(${countB} Inst. Educativas)</span></div>`;
                        }
                    }

                    statsContent.innerHTML = hasAnyData ? statsHTML : `Sin datos procesados para ${selectedProv}`;
                    statsBox.style.display = 'block';
                }
            });
        }

        if (failedLayers.length > 0) {
            status.innerHTML = `\u26A0\uFE0F Falt\u00F3: ${failedLayers.join(', ')}`;
            status.className = 'status-alert warning';
        } else {
            status.innerHTML = `\u2611\uFE0F Conectado (${totalElements} elementos)`;
            status.className = 'status-alert ok'; status.style.display = 'none';
        }

        map.fire('zoomend'); 

      } catch (error) {
        status.textContent = `Error: ${error.message}`; status.className = 'status-alert err';
      } finally {
        btnLoad.disabled = false;
      }
    }

    loadGeoportal();
