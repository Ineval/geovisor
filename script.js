
    const SUPABASE_URL = "https://apiqfherndzzulzwrryq.supabase.co";    
    const SUPABASE_KEY = "sb_publishable_IpXqAN6KNfqjuo6VNwrv3A_VIKMu_TS";
    
    let currentPeriod = document.getElementById('periodFilter').value;

    const map = L.map('map', { zoomControl: false }).setView([-1.8312, -78.1834], 4);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    map.createPane('polygonsPane'); map.getPane('polygonsPane').style.zIndex = 400;
    map.createPane('linesPane'); map.getPane('linesPane').style.zIndex = 430;
    map.createPane('pointsPane'); map.getPane('pointsPane').style.zIndex = 460;

    const baseMaps = {
      positron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }),
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 })
    };
    let currentBaseMap = baseMaps.positron; currentBaseMap.addTo(map);
    document.getElementById('baseMapSelect').addEventListener('change', e => { map.removeLayer(currentBaseMap); currentBaseMap = baseMaps[e.target.value]; currentBaseMap.addTo(map); });

    const sidebar = document.getElementById('sidebar'), toggleBtn = document.getElementById('toggle-btn');
    toggleBtn.addEventListener('click', () => { sidebar.classList.toggle('collapsed'); toggleBtn.innerHTML = sidebar.classList.contains('collapsed') ? '❯' : '❮'; setTimeout(() => map.invalidateSize(), 300); });

    const statusDiv = document.getElementById('status'), statsBox = document.getElementById('stats-box'), statsContent = document.getElementById('stats-content');
    const filters = { province: document.getElementById('provinceFilter'), area: document.getElementById('areaFilter'), regime: document.getElementById('regimeFilter'), sustain: document.getElementById('sustainFilter') };

    const variables = {
      general: { label: 'Promedio general', field: 'inev', suffix: '' },
      mt: { label: 'Matemática', field: 'inev_mt', suffix: '_mt' },
      lyl: { label: 'Lengua y Literatura', field: 'inev_lyl', suffix: '_lyl' },
      cn: { label: 'Ciencias Naturales', field: 'inev_cn', suffix: '_cn' },
      cs: { label: 'Ciencias Sociales', field: 'inev_cs', suffix: '_cs' },
      fis: { label: 'Física', field: 'inev_fis', suffix: '_fis' },
      qui: { label: 'Química', field: 'inev_qui', suffix: '_qui' },
      his: { label: 'Historia', field: 'inev_his', suffix: '_his' },
      bio: { label: 'Biología', field: 'inev_bio', suffix: '_bio' },
      ed: { label: 'Educación Ciudadana', field: 'inev_ed', suffix: '_ed' },
      fil: { label: 'Filosofía', field: 'inev_fil', suffix: '_fil' }
    };

    const levels = {
      elemental: { label: 'Subnivel Básica Elemental', pointPrefix: '4_elemental', base: 'elemental', shape: 'circle', color: '#000000', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      medio: { label: 'Subnivel Básica Media', pointPrefix: '7_medio', base: 'medio', shape: 'triangle', color: '#000000', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      superior: { label: 'Subnivel Básica Superior', pointPrefix: '10_superior', base: 'superior', shape: 'square', color: '#000000', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      bachillerato: { label: 'Nivel Bachillerato', pointPrefix: '3_bachillerato', base: 'bachillerato', shape: 'rhombus', color: '#000000', subjects: ['general', 'mt', 'lyl', 'fis', 'qui', 'his', 'bio', 'ed', 'fil'] }
    };

    const polygonColors = { 1: 'var(--color-dn1)', 2: 'var(--color-dn2)', 3: 'var(--color-dn3)', 4: 'var(--color-dn4)' };
    const logroMeta = {
      1: { label: 'Insuficiente', range: '400 - 599', color: 'var(--color-dn1)' },
      2: { label: 'Elemental', range: '600 - 699', color: 'var(--color-dn2)' },
      3: { label: 'Satisfactorio', range: '700 - 799', color: 'var(--color-dn3)' },
      4: { label: 'Excelente', range: '800 - 1000', color: 'var(--color-dn4)' }
    };
    
    let rawPoints = {}, pointLayers = {}, polygonLayers = {}, polygonPromises = {}, limitLayer = null, selectedProvinceCode = '', ecuadorBounds = null;

    function normalizeText(value) { return (value ?? '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }

    function getPropFlexible(props, candidates) {
      for (const c of candidates) { if (props[c] !== undefined && props[c] !== null && props[c] !== '') return props[c]; }
      const keys = Object.keys(props || {});
      for (const c of candidates) {
        const found = keys.find(k => normalizeText(k) === normalizeText(c));
        if (found && props[found] !== undefined && props[found] !== null && props[found] !== '') return props[found];
      }
      return '';
    }

    function getAnyProp(props, names) {
      for (const n of names) { if (props && props[n] !== undefined && props[n] !== null && props[n] !== '') return props[n]; }
      return null;
    }

    function showStatus(m, t = 'ok') { statusDiv.textContent = m; statusDiv.className = t; statusDiv.style.display = (m ? 'block' : 'none'); }
    
    // Función Maestra y Universal de Extracción (Sirve para todos los años, puntos y polígonos)
    async function fetchTableData(tableName) {
      // Intento 1: Función RPC `get_table_geojson` que creaste en SQL Editor (Funciona para TODO)
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_table_geojson`, { 
            method: 'POST', 
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ table_name: tableName }) 
        });
        if (r.ok) {
            const data = await r.json();
            if (data && data.features && data.features.length > 0) return data;
        }
      } catch (e) { }

      // Intento 2: Si el RPC falla (ej. años 2024, 2023), consulta REST pura y ensambla Lat/Lon manualmente
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&limit=10000`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        if (r.ok) {
            const rows = await r.json();
            if (rows && rows.length > 0) {
                return {
                    type: 'FeatureCollection',
                    features: rows.map(row => ({
                        type: 'Feature', 
                        properties: row,
                        geometry: (row.long && row.lat) ? { type: 'Point', coordinates: [parseFloat(row.long), parseFloat(row.lat)] } : null
                    })).filter(f => f.geometry !== null) // Solo conserva los que tienen coordenadas
                };
            }
        }
      } catch (e) { }
      return null;
    }

    function getSelectedLevels() { const active = document.querySelector('.level-check:checked'); return active ? [active.value] : []; }
    function getSelectedVariables() { return [...document.querySelectorAll('.sub-check:checked')].map(cb => cb.value); }
    function getSelectedLogros() { return [...document.querySelectorAll('.logro-filter:checked')].map(cb => Number(cb.value)); }

    function refreshLogroVisibility() {
      Object.values(polygonLayers).forEach(layer => { if (layer && typeof layer.setStyle === 'function') layer.setStyle(polygonStyle); });
      updateStats();
    }

    function refreshVariableCheckboxes() {
      const container = document.getElementById('subject-grid-container');
      let checkedCurrent = getSelectedVariables()[0]; 
      const allowed = new Set();
      
      getSelectedLevels().forEach(l => levels[l].subjects.forEach(s => allowed.add(s)));
      container.innerHTML = '';
      
      if (allowed.size === 0) { container.innerHTML = '<span style="font-size:12px; color:#94a3b8;">Selecciona al menos un nivel educativo primero.</span>'; return; }
      if (!checkedCurrent || !allowed.has(checkedCurrent)) { checkedCurrent = 'general'; }

      const orderedSubjects = [...allowed];
      const addSubjectRadio = (k) => {
        const isChecked = (checkedCurrent === k);
        container.insertAdjacentHTML('beforeend', `<label class="level-item"><input type="radio" name="subject-activo" class="sub-check" value="${k}" ${isChecked ? 'checked' : ''}><span>${variables[k].label}</span></label>`);
      };

      if (allowed.has('general')) addSubjectRadio('general');
      const subjectItems = orderedSubjects.filter(k => k !== 'general');
      if (subjectItems.length) {
        container.insertAdjacentHTML('beforeend', `<h2 class="tool-title" style="margin-top:8px;"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>Asignaturas</h2>`);
        subjectItems.forEach(addSubjectRadio);
      }
      document.querySelectorAll('.sub-check').forEach(chk => chk.addEventListener('change', async () => {
        await updatePolygons();
        updateStats();
      }));
    }
    
    function getDNColor(dn) { return polygonColors[Number(dn)] || '#e5e7eb'; }
    
    function polygonStyle(f) {
      const p = f.properties || {};
      const dn = Number(getAnyProp(p, ['DN','dn','Dn']));
      const logrosActivos = getSelectedLogros();

      if (!logrosActivos.includes(dn)) {
        return { pane: 'polygonsPane', fillColor: getDNColor(dn), color: '#263746', weight: 0, opacity: 0, fillOpacity: 0 };
      }
      return { pane: 'polygonsPane', fillColor: getDNColor(dn), color: '#263746', weight: .75, opacity: .1, fillOpacity: .70 };
    }
    
    function getShapeIcon(shape) {
      let svg = ''; const size = 6.5; 
      if (shape === 'circle') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>`;
      else if (shape === 'triangle') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14"><polygon points="7,1 13,13 1,13" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>`;
      else if (shape === 'square') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>`;
      else if (shape === 'rhombus') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 14 14"><polygon points="7,1 13,7 7,13 1,7" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>`;
      
      return L.divIcon({ className: 'custom-shape-icon', html: svg, iconSize: [size, size], iconAnchor: [size/2, size/2] });
    }

    function pointToLayer(l) { return (f, latlng) => L.marker(latlng, { pane: 'pointsPane', icon: getShapeIcon(levels[l].shape) }); }

    function bindPointPopup(l) {
      return (f, layer) => {
        const p = f.properties || {};
        let html = `<div class="point-popup-header">${p.nm_inst || 'Institución Educativa'}</div>`;
        html += `<div class="point-popup-body"><table class="point-popup-table">`;
        html += `<tr><td class="field-label">AMIE</td><td class="field-value"><b>${p.amie || 'N/A'}</b></td></tr>`;
        html += `<tr><td class="field-label">Sostenimiento</td><td class="field-value">${getPropFlexible(p, ['tp_sost','TP_SOST','sostenimiento','SOSTENIMIENTO']) || 'N/A'}</td></tr>`;
        html += `<tr><td class="field-label">Régimen</td><td class="field-value">${getPropFlexible(p, ['es_regeva','ES_REGEVA','regimen','REGIMEN','régimen']) || 'N/A'}</td></tr>`;
        html += `<tr><td class="field-label">Área</td><td class="field-value">${getPropFlexible(p, ['tp_area','TP_AREA','area','AREA']) || 'N/A'}</td></tr>`;
        html += `<tr><td colspan="2" class="row-break">Calificaciones (INEV)</td></tr>`;
        
        levels[l].subjects.forEach(k => {
          const val = p[variables[k].field];
          const notaFormateada = (val !== undefined && val !== null) ? parseFloat(val).toFixed(2) : 'N/A';
          const destacado = k === 'general' ? 'font-weight:bold; color:var(--azul-institucional);' : '';
          html += `<tr><td class="field-label" style="${destacado}">${variables[k].label}</td><td class="field-value" style="${destacado}">${notaFormateada}</td></tr>`;
        });
        html += `</table></div>`;
        layer.bindPopup(html, { className: 'custom-point-popup' });
      };
    }

    function bindPolygonPopup(f, layer, levelKey = null, varKey = null) {
      const p = f.properties || {};
      const dn = getAnyProp(p, ['DN','dn','Dn']);
      let rango = getAnyProp(p, ['rango','Rango','RANGO']);
      let logro = getAnyProp(p, ['n_logro','N_LOGRO','logro','LOGRO']);
      let descripcion = getAnyProp(p, ['desc','DESC','descripcion','DESCRIPCION','descripción']);

      if (dn && (!logro || !rango)) {
        const numDn = Number(dn);
        if (numDn === 4) { logro = 'Excelente'; rango = '800 - 1000'; descripcion = descripcion || 'El estudiante demuestra un desempeño sobresaliente.'; }
        else if (numDn === 3) { logro = 'Satisfactorio'; rango = '700 - 799'; descripcion = descripcion || 'El estudiante alcanza los aprendizajes requeridos.'; }
        else if (numDn === 2) { logro = 'Elemental'; rango = '600 - 699'; descripcion = descripcion || 'El estudiante está próximo a alcanzar los aprendizajes requeridos.'; }
        else if (numDn === 1) { logro = 'Insuficiente'; rango = '400 - 599'; descripcion = descripcion || 'El estudiante no alcanza los aprendizajes requeridos.'; }
      }

      layer.on('click', function (e) {
        L.popup().setLatLng(e.latlng).setContent(`
            <div style="min-width:250px; font-family:Arial, Helvetica, sans-serif;">
              <div style="font-size:14px; font-weight:800; color:#07306f; margin-bottom:4px; text-transform:uppercase;">${levels[levelKey].label} (${currentPeriod})</div>
              <div style="font-size:12px; margin-bottom:6px; color:#475569;"><b>Asignatura:</b> ${variables[varKey].label}</div>
              <hr style="border:none; border-top:1px solid #cbd5e1; margin:6px 0;">
              <table style="width:100%; font-size:11.5px; border-collapse:collapse;">
                <tr><td style="padding:3px 0; color:#64748b; font-weight:700;">RANGO:</td><td style="text-align:right; font-weight:700;">${rango || 'N/A'}</td></tr>
                <tr><td style="padding:3px 0; color:#64748b; font-weight:700;">LOGRO:</td><td style="text-align:right; font-weight:700; color:var(--azul-barra);">${logro || 'N/A'}</td></tr>
                <tr><td style="padding:3px 0; color:#64748b; font-weight:700;">VALOR DN:</td><td style="text-align:right;">${dn ?? 'N/A'}</td></tr>
              </table>
              <div style="margin-top:8px; padding:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:11.5px; line-height:1.35; color:#334155;">
                <b>Descripción:</b><br>${descripcion || 'Sin descripción disponible.'}
              </div>
            </div>
          `).openOn(map);
      });
    }

    // FILTRO ESTRICTO DE PROVINCIA POR 2 DÍGITOS AMIE
    function matchesFilters(f) {
      const p = f.properties || {};
      const amie = getPropFlexible(p, ['amie', 'AMIE']);
      const amieStr = amie ? amie.toString().trim() : '';
      
      const selectedProv = filters.province.value;
      if (selectedProv && !amieStr.startsWith(selectedProv)) return false;

      const areaValue = getPropFlexible(p, ['tp_area', 'TP_AREA', 'area', 'AREA']);
      const regimeValue = getPropFlexible(p, ['es_regeva', 'ES_REGEVA', 'regimen', 'REGIMEN', 'régimen']);
      const sustainValue = getPropFlexible(p, ['tp_sost', 'TP_SOST', 'sostenimiento', 'SOSTENIMIENTO']);

      if (filters.area.value && normalizeText(areaValue) !== normalizeText(filters.area.value)) return false;
      if (filters.regime.value && normalizeText(regimeValue) !== normalizeText(filters.regime.value)) return false;
      if (filters.sustain.value && normalizeText(sustainValue) !== normalizeText(filters.sustain.value)) return false;
      return true;
    }

    function filteredFeatures(l) {
      const d = rawPoints[l];
      return (!d || !d.features) ? [] : d.features.filter(matchesFilters);
    }

    function setLayer(layer, add) { if (!layer) return; if (add && !map.hasLayer(layer)) layer.addTo(map); if (!add && map.hasLayer(layer)) map.removeLayer(layer); }

    // SOLUCIÓN AL PARPADEO: SOLO DIBUJAR LO NECESARIO
    async function ensurePolygonLayer(l, v) {
      const key = `${l}_${v}_${currentPeriod}`;
      if (polygonLayers[key]) return polygonLayers[key];
      if (polygonPromises[key]) return polygonPromises[key];

      const rawTableName = `${levels[l].base}${variables[v].suffix}_sest${currentPeriod}`;

      polygonPromises[key] = (async () => {
        const data = await fetchTableData(rawTableName);

        if (data && data.features && data.features.length > 0) {
          polygonLayers[key] = L.geoJSON(data, {
            pane: 'polygonsPane',
            style: polygonStyle,
            onEachFeature: (feature, layer) => bindPolygonPopup(feature, layer, l, v)
          });
        } else {
          polygonLayers[key] = L.layerGroup();
        }
        return polygonLayers[key];
      })();
      return polygonPromises[key];
    }

    // Actualiza SOLAMENTE los puntos (escuelas)
    function rebuildPointLayers() {
      Object.values(pointLayers).forEach(x => setLayer(x, false));
      pointLayers = {};
      getSelectedLevels().forEach(l => {
        pointLayers[l] = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures(l) }, { pointToLayer: pointToLayer(l), onEachFeature: bindPointPopup(l) });
        pointLayers[l].addTo(map);
      });
    }
	
	map.on('zoomend', () => { const z = map.getZoom(), pane = map.getPane('pointsPane'); if (pane) pane.style.display = z < 8 ? 'none' : 'block'; document.querySelectorAll('.province-label').forEach(label => { if (z < 7) { label.style.opacity = '0'; label.style.fontSize = '7px'; } else if (z === 7) { label.style.opacity = '.85'; label.style.fontSize = '9px'; } else { label.style.opacity = '1'; label.style.fontSize = '11px'; } }); });

    // Actualiza SOLAMENTE los polígonos
    async function updatePolygons() {
      const activeVars = getSelectedVariables();
      const activeLevels = getSelectedLevels();
      
      const activeKeys = new Set();
      for (const l of activeLevels) {
        for (const v of activeVars) {
          if (levels[l].subjects.includes(v)) activeKeys.add(`${l}_${v}_${currentPeriod}`);
        }
      }

      // Remover del mapa ÚNICAMENTE los polígonos que ya no están marcados en el panel
      Object.keys(polygonLayers).forEach(key => {
        if (!activeKeys.has(key)) {
          if (map.hasLayer(polygonLayers[key])) map.removeLayer(polygonLayers[key]);
        }
      });

      // Asegurar que los seleccionados estén cargados y visibles
      const pending = [];
      for (const l of activeLevels) {
        for (const v of activeVars) {
          if (!levels[l].subjects.includes(v)) continue;
          pending.push( ensurePolygonLayer(l, v).then(layer => { 
            if (!map.hasLayer(layer)) layer.addTo(map); 
          }));
        }
      }

      if (pending.length) {
        try { await Promise.all(pending); } 
        catch (error) { console.warn('Carga parcial de modelos:', error); }
      }
    }

    function fillSelect(s, vals, ph) { const cur = s.value; s.innerHTML = `<option value="">${ph}</option>`; [...vals].filter(Boolean).sort().forEach(v => s.insertAdjacentHTML('beforeend', `<option value="${v}">${v}</option>`)); if ([...s.options].some(o => o.value === cur)) s.value = cur; }
    
    function populateAttributeFilters() {
      const areas = new Set(); const regimes = new Set(); const sustains = new Set();
      Object.values(rawPoints).forEach(data => {
        (data.features || []).forEach(f => {
          const p = f.properties || {};
          const area = getPropFlexible(p, ['tp_area', 'TP_AREA', 'area', 'AREA']);
          const regime = getPropFlexible(p, ['es_regeva', 'ES_REGEVA', 'regimen', 'REGIMEN', 'régimen']);
          const sustain = getPropFlexible(p, ['tp_sost', 'TP_SOST', 'sostenimiento', 'SOSTENIMIENTO']);
          if (area) areas.add(area.toString().trim());
          if (regime) regimes.add(regime.toString().trim());
          if (sustain) sustains.add(sustain.toString().trim());
        });
      });
      fillSelect(filters.area, areas, '-- Todas --');
      fillSelect(filters.regime, regimes, '-- Todos --');
      fillSelect(filters.sustain, sustains, '-- Todos --');
    }

    function highlightProvince(code) {
      selectedProvinceCode = code || '';
      if (!limitLayer) return;
      let target = null;
      limitLayer.eachLayer(layer => {
        limitLayer.resetStyle(layer);
        const p = layer.feature ? layer.feature.properties : {};
        if (selectedProvinceCode && (p.CODPRO === selectedProvinceCode || p.DPA_PROVIN === selectedProvinceCode)) {
          layer.setStyle({ color: 'var(--arcmap-sel)', weight: 3.2, fillColor: 'var(--arcmap-sel)', fillOpacity: 0, opacity: 1 });
          target = layer.getBounds();
        }
      });
      if (target && target.isValid()) map.fitBounds(target, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 60 });
      else if (ecuadorBounds && ecuadorBounds.isValid()) map.fitBounds(ecuadorBounds, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 7 });
    }

    function calcStats(vals) {
      const nums = vals.map(Number).filter(v => !Number.isNaN(v));
      if (!nums.length) return null;
      const sum = nums.reduce((a, b) => a + b, 0), avg = sum / nums.length, min = Math.min(...nums), max = Math.max(...nums);
      return { count: nums.length, avg: Math.round(avg), min: Math.round(min), max: Math.round(max) };
    }

    function getLogroFromScore(score) {
      const n = Number(score);
      if (Number.isNaN(n)) return null;
      if (n >= 800) return 4;
      if (n >= 700) return 3;
      if (n >= 600) return 2;
      if (n >= 400) return 1;
      return null;
    }

    function calcLogroDistribution(features, field, activeLogros = [1, 2, 3, 4]) {
      const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      features.forEach(f => {
        const value = f.properties ? f.properties[field] : null;
        const logro = getLogroFromScore(value);
        if (logro && activeLogros.includes(logro)) counts[logro] += 1;
      });
      return counts;
    }

    function buildLogroDistributionHtml(counts) {
      const activeLogros = getSelectedLogros();
      const ordered = [4, 3, 2, 1].filter(k => activeLogros.includes(k));
      if (!ordered.length) return '<div class="empty-state" style="margin-top:8px; padding:10px;">Activa al menos un nivel de logro en la simbología para ver la distribución.</div>';

      const total = ordered.reduce((acc, k) => acc + (counts[k] || 0), 0);
      let html = `<div style="margin-top:8px; padding:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
        <div style="font-size:10px; font-weight:900; color:#475569; text-transform:uppercase; margin-bottom:6px;">Distribución por nivel de logro</div>`;

      ordered.forEach(k => {
        const item = logroMeta[k]; const value = counts[k] || 0; const pct = total ? Math.round((value / total) * 100) : 0;
        html += `<div style="display:grid; grid-template-columns:14px 1fr auto; gap:6px; align-items:center; font-size:11px; padding:3px 0;">
          <span style="width:11px; height:11px; border-radius:3px; background:${item.color}; border:1px solid #94a3b8;"></span>
          <span><b>${item.label}</b> <span style="color:#64748b;">(${item.range})</span></span>
          <span style="font-weight:800;">${value} I.E. <span style="color:#64748b; font-weight:700;">${pct}%</span></span>
        </div>`;
      });
      html += `<div style="margin-top:5px; padding-top:5px; border-top:1px solid #e2e8f0; text-align:right; font-size:10.5px; font-weight:800; color:#334155;">Total visible: ${total} I.E.</div></div>`;
      return html;
    }

    function updateStats() {
      const selectedLvl = getSelectedLevels();
      const selectedVars = getSelectedVariables();
      const activeLogros = getSelectedLogros();
      const provinciaTxt = filters.province.options[filters.province.selectedIndex]?.text || 'Todo el Ecuador';
      const areaTxt = filters.area.value || 'Todas';
      const regimenTxt = filters.regime.value || 'Todos';
      const sostenimientoTxt = filters.sustain.value || 'Todos';
      const nivelesTxt = selectedLvl.map(l => levels[l].label).join(', ') || 'Ninguno';
      const varsTxt = selectedVars.map(v => variables[v].label).join(', ') || 'Ninguna';
      const logrosTxt = activeLogros.length ? activeLogros.map(k => logroMeta[k].label).join(', ') : 'Ninguno';

      let html = `<div class="stat-card" style="margin-bottom:12px;"><div class="label">Filtros Activos</div><div style="font-size:11.5px; line-height:1.4; color:#4b5563;"><b>Provincia:</b> ${provinciaTxt}<br><b>Área:</b> ${areaTxt}<br><b>Régimen:</b> ${regimenTxt}<br><b>Sostenimiento:</b> ${sostenimientoTxt}<br><b>Niveles:</b> ${nivelesTxt}<br><b>Materias:</b> ${varsTxt}<br><b>Logros visibles:</b> ${logrosTxt}</div></div>`;

      let hasData = false;
      let levelBlocksHtml = '';

      selectedLvl.forEach(l => {
        let levelHtml = '';
        selectedVars.forEach(v => {
          if (!levels[l].subjects.includes(v)) return;
          const field = variables[v].field;
          const features = filteredFeatures(l);
          const levelScores = features.map(f => f.properties ? f.properties[field] : null).filter(x => x !== null && x !== undefined && x !== '').map(Number).filter(n => !isNaN(n) && activeLogros.includes(getLogroFromScore(n)));
          const st = calcStats(levelScores);
          if (!st) return;

          hasData = true;
          if (!levelHtml) levelHtml += `<div class="level-stat"><h3 style="color:${levels[l].color}; font-weight:800; font-size:13px; margin-bottom:6px;">${levels[l].label.toUpperCase()}</h3><div class="subject-row header"><span>Materia</span><span>Prom.</span><span>Mín.</span><span>Máx.</span></div>`;
          const counts = calcLogroDistribution(features, field, activeLogros);
          levelHtml += `<div class="subject-row"><span>${variables[v].label}</span><b>${st.avg}</b><span>${st.min}</span><span>${st.max}</span></div><!--<div class="stat-count">${st.count} I.E. visibles</div>-->${buildLogroDistributionHtml(counts)}`;
        });
        if (levelHtml) levelBlocksHtml += levelHtml + '</div>';
      });

      if (!hasData || selectedVars.length === 0) { statsContent.innerHTML = html + '<div class="empty-state">Selecciona al menos un nivel y una asignatura para procesar estadísticas.</div>'; return; }
      html += levelBlocksHtml;
      statsContent.innerHTML = html;
    }

    // CARGADORES PRINCIPALES DE EVENTOS
    
    // 1. Eventos que SOLO cambian las escuelas (No afectan polígonos)
    document.getElementById('provinceFilter').addEventListener('change', (e) => { highlightProvince(e.target.value); rebuildPointLayers(); updateStats(); });
    document.querySelectorAll('#areaFilter, #regimeFilter, #sustainFilter').forEach(el => el.addEventListener('change', () => { rebuildPointLayers(); updateStats(); }));

    // 2. Eventos que cambian el nivel educativo (Recrea TODO para el nivel)
    document.querySelectorAll('.level-check').forEach(el => el.addEventListener('change', async () => {
      refreshVariableCheckboxes();
      rebuildPointLayers();
      await updatePolygons();
      updateStats();
    }));

    // 3. Eventos cuando cambia el Período Evaluado (Borra memoria y recarga BD)
    document.getElementById('periodFilter').addEventListener('change', async (e) => {
      currentPeriod = e.target.value;
      
      // Limpiar capas de polígonos del año anterior
      Object.values(polygonLayers).forEach(x => { if(map.hasLayer(x)) map.removeLayer(x); });
      polygonLayers = {};
      polygonPromises = {};
      
      showStatus(`Cargando datos institucionales (${currentPeriod})...`, 'warning');
      const loads = [];
      Object.keys(levels).forEach(l => {
        loads.push(fetchTableData(`${levels[l].pointPrefix}_sest${currentPeriod}`).then(data => {
            rawPoints[l] = data || { type: 'FeatureCollection', features: [] };
        }));
      });
      await Promise.all(loads);
      showStatus('');

      populateAttributeFilters(); 
      rebuildPointLayers();
      await updatePolygons();
      updateStats();
    });

    // Controles de interfaz y simbología
    document.querySelectorAll('.logro-filter').forEach(chk => chk.addEventListener('change', refreshLogroVisibility));
    document.getElementById('selectAllLogrosBtn').addEventListener('click', () => { document.querySelectorAll('.logro-filter').forEach(chk => chk.checked = true); refreshLogroVisibility(); });
    document.getElementById('clearLogrosBtn').addEventListener('click', () => { document.querySelectorAll('.logro-filter').forEach(chk => chk.checked = false); refreshLogroVisibility(); });
    document.getElementById('limitCheck').addEventListener('change', e => { if (limitLayer) { e.target.checked ? limitLayer.addTo(map) : map.removeLayer(limitLayer); } });
    document.getElementById('toggleStatsBtn').addEventListener('click', () => { statsBox.classList.toggle('stats-collapsed'); document.getElementById('toggleStatsBtn').innerText = statsBox.classList.contains('stats-collapsed') ? '+' : '−'; });
    document.getElementById('toggleLegendBtn').addEventListener('click', () => { document.getElementById('legendBox').classList.toggle('legend-collapsed'); document.getElementById('toggleLegendBtn').innerText = document.getElementById('legendBox').classList.contains('legend-collapsed') ? '+' : '−'; });

    // CARGA INICIAL
    async function loadGeoportal() {
      try {
        showStatus('Cargando información...', 'warning');
        
        // 1. Cargar Límite Provincial Base usando la vista optimizada
        const dataLimit = await fetchTableData('limite_provincial_view');
        limitLayer = L.geoJSON(dataLimit || { type: 'FeatureCollection', features: [] }, { 
          pane: 'linesPane', 
          style: () => ({ color: '#263746', weight: 0.8, opacity: .80, fillOpacity: 0 }),
          onEachFeature: (f, layer) => { 
            if (f.properties && f.properties.PROVINCIA) {
              layer.bindTooltip(f.properties.PROVINCIA, { permanent: true, direction: 'center', className: 'province-label', interactive: false });
            }
          }
        });

        // 2. Cargar puntos del año por defecto
        const loads = [];
        Object.keys(levels).forEach(l => {
            loads.push(fetchTableData(`${levels[l].pointPrefix}_sest${currentPeriod}`).then(data => {
                rawPoints[l] = data || { type: 'FeatureCollection', features: [] };
            }));
        });
        await Promise.all(loads);
        
        populateAttributeFilters();
        refreshVariableCheckboxes();
        
        if (limitLayer) {
          limitLayer.addTo(map);
          ecuadorBounds = limitLayer.getBounds();
          if (ecuadorBounds && ecuadorBounds.isValid()) map.fitBounds(ecuadorBounds, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 7 });
        }
        
        showStatus('');
        rebuildPointLayers();
        await updatePolygons();
        updateStats();

      } catch (error) {
        console.error(error);
        showStatus('Error de conectividad espacial: ' + error.message, 'err');
      }
    }

    loadGeoportal();
  