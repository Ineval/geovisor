const SUPABASE_URL = "https://apiqfherndzzulzwrryq.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwaXFmaGVybmR6enVsendycnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjE0ODQsImV4cCI6MjA5NDkzNzQ4NH0.1BhGyVtbECE9YFm7_SrjDmR7UjYQKRyj7T3eTpWO-AE";
    const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const map = L.map('map', { zoomControl: false }).setView([-1.8312, -78.1834], 6);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Creación de Panes Cartográficos para control de profundidad
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

    // Estructura Unificada de Variables e Historia cargada
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
      elemental: { label: 'Elemental', pointRpc: 'get_4_elemental_sest25_geojson', base: 'elemental', color: '#00a65a', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      medio: { label: 'Medio', pointRpc: 'get_7_medio_sest25_geojson', base: 'medio', color: '#0078d4', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      superior: { label: 'Superior', pointRpc: 'get_10_superior_sest25_geojson', base: 'superior', color: '#6a1b9a', subjects: ['general', 'mt', 'lyl', 'cn', 'cs'] },
      bachillerato: { label: 'Bachillerato', pointRpc: 'get_3_bachillerato_ses25_geojson', base: 'bachillerato', color: '#ff8c00', subjects: ['general', 'mt', 'lyl', 'fis', 'qui', 'his', 'bio', 'ed', 'fil'] }
    };

    const polygonColors = { 1: 'var(--color-dn1)', 2: 'var(--color-dn2)', 3: 'var(--color-dn3)', 4: 'var(--color-dn4)' };
    let rawPoints = {}, pointLayers = {}, polygonLayers = {}, polygonPromises = {}, limitLayer = null, selectedProvinceCode = '', ecuadorBounds = null;


    function normalizeText(value) {
      return (value ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
    }

    function getPropFlexible(props, candidates) {
      for (const c of candidates) {
        if (props[c] !== undefined && props[c] !== null && props[c] !== '') return props[c];
      }
      const keys = Object.keys(props || {});
      for (const c of candidates) {
        const found = keys.find(k => normalizeText(k) === normalizeText(c));
        if (found && props[found] !== undefined && props[found] !== null && props[found] !== '') return props[found];
      }
      return '';
    }


    function getAnyProp(props, names) {
      for (const n of names) {
        if (props && props[n] !== undefined && props[n] !== null && props[n] !== '') return props[n];
      }
      return null;
    }

    function showStatus(m, t = 'ok') { statusDiv.textContent = m; statusDiv.className = t; statusDiv.style.display = (m ? 'block' : 'none'); }
    async function callRpc(name, params = {}) { const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(params) }); if (!r.ok) { const txt = await r.text(); throw new Error(`${name}: HTTP ${r.status} - ${txt}`); } return r.json(); }

    function getSelectedLevels() {
      const active = document.querySelector('.level-check:checked');
      return active ? [active.value] : [];
    }

    function getSelectedVariables() { return [...document.querySelectorAll('.sub-check:checked')].map(cb => cb.value); }

    function refreshVariableCheckboxes() {
      const container = document.getElementById('subject-grid-container');
      const checkedCurrent = getSelectedVariables();
      const allowed = new Set();
      
      getSelectedLevels().forEach(l => levels[l].subjects.forEach(s => allowed.add(s)));
      container.innerHTML = '';
      
      if (allowed.size === 0) {
        container.innerHTML = '<span style="font-size:12px; color:#94a3b8;">Selecciona al menos un nivel educativo primero.</span>';
        return;
      }
      
      [...allowed].forEach(k => {
        const isChecked = checkedCurrent.includes(k);
        container.insertAdjacentHTML('beforeend', `
          <label class="level-item">
            <input type="checkbox" class="sub-check" value="${k}" ${isChecked ? 'checked' : ''}>
            <span>${variables[k].label}</span>
          </label>
        `);
      });
      
      document.querySelectorAll('.sub-check').forEach(chk => chk.addEventListener('change', updateOnlySubjects));
    }

    function getPolygonRpc(levelKey, varKey) { 
      return `get_${levels[levelKey].base}${variables[varKey].suffix}_sest25_geojson`; 
    }

    function getPolygonRpcAlternatives(levelKey, varKey) {
      const baseName = levels[levelKey].base;
      const suffix = variables[varKey].suffix;
      const primary = `get_${baseName}${suffix}_sest25_geojson`;
      const alternatives = [primary];

      // Historia en bachillerato puede estar creada con distintos nombres según la carga/RPC.
      if (levelKey === 'bachillerato' && varKey === 'his') {
        alternatives.push(
          'get_bachillerato_his_sest25_geojson',
          'get_bachillerato_hist_sest25_geojson',
          'get_bachillerato_historia_sest25_geojson'
        );
      }

      return [...new Set(alternatives)];
    }
    function getDNColor(dn) { return polygonColors[Number(dn)] || '#e5e7eb'; }
    function polygonStyle(f) { const p=f.properties||{}; const dn=getAnyProp(p,['DN','dn','Dn']); return { pane: 'polygonsPane', fillColor: getDNColor(dn), color: '#263746', weight: .75, opacity: .70, fillOpacity: .68 }; }
    function pointToLayer(l) { return (f, latlng) => L.circleMarker(latlng, { pane: 'pointsPane', radius: 5.5, fillColor: levels[l].color, color: '#fff', weight: 1, fillOpacity: .95 }); }

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
      const rango = getAnyProp(p, ['rango','Rango','RANGO']);
      const logro = getAnyProp(p, ['n_logro','N_LOGRO','logro','LOGRO']);
      const descripcion = getAnyProp(p, ['desc','DESC','descripcion','DESCRIPCION','descripción']);

      layer.on('click', function (e) {
        L.popup().setLatLng(e.latlng).setContent(`
            <div style="min-width:250px; font-family:Arial, Helvetica, sans-serif;">
              <div style="font-size:14px; font-weight:800; color:#07306f; margin-bottom:4px; text-transform:uppercase;">${levels[levelKey].label}</div>
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

    function matchesFilters(f) {
      const p = f.properties || {};
      const amie = getPropFlexible(p, ['amie', 'AMIE']).toString();

      const areaValue = getPropFlexible(p, ['tp_area', 'TP_AREA', 'area', 'AREA']);
      const regimeValue = getPropFlexible(p, ['es_regeva', 'ES_REGEVA', 'regimen', 'REGIMEN', 'régimen']);
      const sustainValue = getPropFlexible(p, ['tp_sost', 'TP_SOST', 'sostenimiento', 'SOSTENIMIENTO']);

      if (selectedProvinceCode && !amie.startsWith(selectedProvinceCode)) return false;
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

    async function ensurePolygonLayer(l, v) {
      const key = `${l}_${v}`;
      if (polygonLayers[key]) return polygonLayers[key];
      if (polygonPromises && polygonPromises[key]) return polygonPromises[key];

      if (typeof polygonPromises === 'undefined') window.polygonPromises = {};

      const alternatives = typeof getPolygonRpcAlternatives === 'function'
        ? getPolygonRpcAlternatives(l, v)
        : [getPolygonRpc(l, v)];

      polygonPromises[key] = (async () => {
        let lastError = null;

        for (const rpcName of alternatives) {
          try {
            const data = await callRpc(rpcName);

            polygonLayers[key] = L.geoJSON(data, {
              pane: 'polygonsPane',
              style: polygonStyle,
              onEachFeature: (feature, layer) => bindPolygonPopup(feature, layer, l, v)
            });

            return polygonLayers[key];
          } catch (error) {
            lastError = error;
            console.warn('No se pudo cargar RPC de polígono:', rpcName, error);
          }
        }

        console.error('No se pudo cargar ningún modelo para', l, v, lastError);
        polygonLayers[key] = L.layerGroup();
        return polygonLayers[key];
      })();

      return polygonPromises[key];
    }

    function rebuildPointLayers() {
      Object.values(pointLayers).forEach(x => setLayer(x, false));
      pointLayers = {};
      getSelectedLevels().forEach(l => {
        pointLayers[l] = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures(l) }, { pointToLayer: pointToLayer(l), onEachFeature: bindPointPopup(l) });
        pointLayers[l].addTo(map);
      });
      if (limitLayer && document.getElementById('limitCheck').checked) limitLayer.bringToFront();
    }

    async function updatePolygons() {
      const activeVars = getSelectedVariables();
      Object.values(polygonLayers).forEach(x => setLayer(x, false));

      const pending = [];
      for (const l of getSelectedLevels()) {
        for (const v of activeVars) {
          if (!levels[l].subjects.includes(v)) continue;
          pending.push(
            ensurePolygonLayer(l, v).then(layer => {
              layer.addTo(map);
            })
          );
        }
      }

      if (pending.length) {
        try {
          await Promise.all(pending);
        } catch (error) {
          console.warn('Carga parcial de modelos:', error);
        }
      }

      if (limitLayer && document.getElementById('limitCheck').checked) { 
        limitLayer.addTo(map); 
        limitLayer.bringToFront(); 
      }
    }

    function fillSelect(s, vals, ph) { const cur = s.value; s.innerHTML = `<option value="">${ph}</option>`; [...vals].filter(Boolean).sort().forEach(v => s.insertAdjacentHTML('beforeend', `<option value="${v}">${v}</option>`)); if ([...s.options].some(o => o.value === cur)) s.value = cur; }

    
    function populateAttributeFilters() {
      console.log('Generando filtros dinámicos desde atributos reales...');
      const areas = new Set();
      const regimes = new Set();
      const sustains = new Set();

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

    function populateProvinceFilter() {
      filters.province.innerHTML = '<option value="">-- Todo el Ecuador --</option>';
      if (!limitLayer) return;
      const items = [];
      limitLayer.eachLayer(layer => { const p = layer.feature ? layer.feature.properties : {}; if (p.PROVINCIA && p.CODPRO) items.push({ name: p.PROVINCIA, code: p.CODPRO }); });
      items.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => filters.province.insertAdjacentHTML('beforeend', `<option value="${p.code}">${p.name}</option>`));
    }

    function highlightProvince(code) {
      selectedProvinceCode = code || '';
      if (!limitLayer) return;
      let target = null;
      limitLayer.eachLayer(layer => {
        limitLayer.resetStyle(layer);
        const p = layer.feature ? layer.feature.properties : {};
        if (selectedProvinceCode && p.CODPRO === selectedProvinceCode) {
          layer.setStyle({ color: 'var(--arcmap-sel)', weight: 3.2, fillColor: 'var(--arcmap-sel)', fillOpacity: .25, opacity: 1 });
          target = layer.getBounds();
        }
      });
      if (target && target.isValid()) map.fitBounds(target, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 8 });
      else if (ecuadorBounds && ecuadorBounds.isValid()) map.fitBounds(ecuadorBounds, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 7 });
      if (limitLayer) limitLayer.bringToFront();
    }

    function calcStats(vals) {
      const nums = vals.map(Number).filter(v => !Number.isNaN(v));
      if (!nums.length) return null;
      const sum = nums.reduce((a, b) => a + b, 0), avg = sum / nums.length, min = Math.min(...nums), max = Math.max(...nums);
      return { count: nums.length, avg: Math.round(avg), min: Math.round(min), max: Math.round(max) };
    }

    function updateStats() {
      const selectedLvl = getSelectedLevels();
      const selectedVars = getSelectedVariables();

      const provinciaTxt = filters.province.options[filters.province.selectedIndex]?.text || 'Todo el Ecuador';
      const areaTxt = filters.area.value || 'Todas';
      const regimenTxt = filters.regime.value || 'Todos';
      const sostenimientoTxt = filters.sustain.value || 'Todos';
      const nivelesTxt = selectedLvl.map(l => levels[l].label).join(', ') || 'Ninguno';
      const varsTxt = selectedVars.map(v => variables[v].label).join(', ') || 'Ninguna';

      let html = `<div class="stat-card" style="margin-bottom:12px;"><div class="label">Filtros Activos</div><div style="font-size:11.5px; line-height:1.4; color:#4b5563;"><b>Provincia:</b> ${provinciaTxt}<br><b>Área:</b> ${areaTxt}<br><b>Régimen:</b> ${regimenTxt}<br><b>Sostenimiento:</b> ${sostenimientoTxt}<br><b>Niveles:</b> ${nivelesTxt}<br><b>Materias:</b> ${varsTxt}</div></div>`;

      let hasData = false;
      let levelBlocksHtml = '';

      selectedLvl.forEach(l => {
        let levelHtml = '';
        selectedVars.forEach(v => {
          if (!levels[l].subjects.includes(v)) return;
          const field = variables[v].field;

          const levelScores = filteredFeatures(l)
            .map(f => f.properties ? f.properties[field] : null)
            .filter(x => x !== null && x !== undefined && x !== '')
            .map(Number)
            .filter(n => !isNaN(n));

          const st = calcStats(levelScores);
          if (!st) return;

          hasData = true;
          if (!levelHtml) {
            levelHtml += `<div class="level-stat"><h3 style="color:${levels[l].color}; font-weight:800; font-size:13px; margin-bottom:6px;">${levels[l].label.toUpperCase()}</h3><div class="subject-row header"><span>Materia</span><span>Prom.</span><span>Mín.</span><span>Máx.</span></div>`;
          }
          levelHtml += `<div class="subject-row"><span>${variables[v].label}</span><b>${st.avg}</b><span>${st.min}</span><span>${st.max}</span></div><div class="stat-count">${st.count} UE</div>`;
        });
        if (levelHtml) levelBlocksHtml += levelHtml + '</div>';
      });

      if (!hasData || selectedVars.length === 0) {
        statsContent.innerHTML = html + '<div class="empty-state">Selecciona al menos un nivel y una asignatura para procesar estadísticas.</div>';
        return;
      }

      html += levelBlocksHtml;
      statsContent.innerHTML = html;
    }

    async function updateAll() {
      rebuildPointLayers();
      await updatePolygons();
      updateStats();
    }

    async function updateOnlySubjects() {
      await updatePolygons();
      updateStats();
    }

    async function loadGeoportal() {
      try {
        showStatus('Cargando base de datos de Supabase...', 'warning');
        const loads = [];
        Object.keys(levels).forEach(l => loads.push(callRpc(levels[l].pointRpc).then(data => rawPoints[l] = data)));
        loads.push(callRpc('get_limite_provincial_geojson').then(data => {
          limitLayer = L.geoJSON(data, { pane: 'linesPane', style: () => ({ pane: 'linesPane', fillColor: 'transparent', color: '#263746', weight: 1.3, opacity: .85, fillOpacity: 0 }), onEachFeature: (f, layer) => { const p = f.properties || {}; if (p.PROVINCIA) layer.bindTooltip(p.PROVINCIA, { permanent: true, direction: 'center', className: 'province-label', interactive: false }); } });
        }));
        await Promise.all(loads);
        populateAttributeFilters();
        populateProvinceFilter();
        refreshVariableCheckboxes();
        
        if (limitLayer) {
          limitLayer.addTo(map);
          ecuadorBounds = limitLayer.getBounds();
          if (ecuadorBounds && ecuadorBounds.isValid()) map.fitBounds(ecuadorBounds, { paddingTopLeft: [90, 35], paddingBottomRight: [350, 60], maxZoom: 7 });
        }
        
        await updateAll();
        showStatus('');
      } catch (error) {
        console.error(error);
        showStatus('Error al conectar con la base de datos: ' + error.message, 'err');
      }
    }

    filters.province.addEventListener('change', async () => { highlightProvince(filters.province.value); await updateAll(); });
    filters.area.addEventListener('change', updateAll);
    filters.regime.addEventListener('change', updateAll);
    filters.sustain.addEventListener('change', updateAll);

    document.querySelectorAll('.level-check').forEach(chk => chk.addEventListener('change', () => {
      refreshVariableCheckboxes();
      updateAll();
    }));

    document.getElementById('limitCheck').addEventListener('change', e => { if (!limitLayer) return; if (e.target.checked) { limitLayer.addTo(map); limitLayer.bringToFront(); } else map.removeLayer(limitLayer); });
    map.on('zoomend', () => { const z = map.getZoom(), pane = map.getPane('pointsPane'); if (pane) pane.style.display = z < 8 ? 'none' : 'block'; document.querySelectorAll('.province-label').forEach(label => { if (z < 7) { label.style.opacity = '0'; label.style.fontSize = '7px'; } else if (z === 7) { label.style.opacity = '.85'; label.style.fontSize = '9px'; } else { label.style.opacity = '1'; label.style.fontSize = '11px'; } }); });


    const toggleStatsBtn = document.getElementById('toggleStatsBtn');
    const toggleLegendBtn = document.getElementById('toggleLegendBtn');
    const legendBox = document.getElementById('legendBox');

    if (toggleStatsBtn) {
      toggleStatsBtn.addEventListener('click', () => {
        statsBox.classList.toggle('stats-collapsed');
        const isCollapsed = statsBox.classList.contains('stats-collapsed');
        toggleStatsBtn.textContent = isCollapsed ? '+' : '−';
        toggleStatsBtn.title = isCollapsed ? 'Expandir estadísticas' : 'Minimizar estadísticas';
      });
    }

    if (toggleLegendBtn && legendBox) {
      toggleLegendBtn.addEventListener('click', () => {
        legendBox.classList.toggle('legend-collapsed');
        const isCollapsed = legendBox.classList.contains('legend-collapsed');
        toggleLegendBtn.textContent = isCollapsed ? '+' : '−';
        toggleLegendBtn.title = isCollapsed ? 'Expandir simbología' : 'Minimizar simbología';
      });
    }

    loadGeoportal();
