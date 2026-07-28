(function () {
  const config = window.LUMICON_FIRMWARE || {};
  const select = document.getElementById('version-select');
  const help = document.getElementById('version-help');
  const installerZone = document.getElementById('installer-zone');
  const statusBox = document.getElementById('status-box');
  const controllerList = document.getElementById('controller-file-list');
  const keypadZone = document.getElementById('keypad-download-zone');
  let currentManifestUrl = null;

  if (!select || !installerZone || !config.repo) {
    return;
  }

  const ext = (path) => (path.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  const basename = (path) => path.split('/').pop() || path;
  const cleanVersion = (value) => value.replace(/_/g, '.').replace(/^v/i, '');
  const isControllerFile = (path) => ext(path) === '.bin' && startsWithAny(path, config.controllerPrefixes || []);
  const isKeypadFile = (path) => ext(path) === '.uf2' && startsWithAny(path, config.keypadPrefixes || []);

  function startsWithAny(path, prefixes) {
    return prefixes.some((prefix) => path.startsWith(prefix));
  }

  function repoRootUrl(path) {
    return new URL('../' + path.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
  }

  function formatBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function versionFromPath(path) {
    const file = basename(path);
    const folder = path.split('/').slice(-2, -1)[0] || '';
    const fromFile = file.match(/(\d+[._-]\d+[._-]\d+(?:[._-][a-z0-9]+)?)/i);
    const fromFolder = folder.match(/(\d+[._-]\d+[._-]\d+(?:[._-][a-z0-9]+)?)/i);
    if (fromFile) return cleanVersion(fromFile[1]);
    if (fromFolder) return cleanVersion(fromFolder[1]);
    if (/experimental/i.test(path)) return 'Experimental';
    if (/latest/i.test(path)) return 'Latest';
    return file.replace(/\.(bin|uf2)$/i, '').replace(/[_-]+/g, ' ');
  }

  function versionScore(label) {
    const match = label.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return -1;
    return Number(match[1]) * 1000000 + Number(match[2]) * 1000 + Number(match[3]);
  }

  function fileEntry(path, size) {
    const version = versionFromPath(path);
    return {
      path,
      url: repoRootUrl(path),
      file: basename(path),
      version,
      label: labelForPath(path, version),
      size: size || 0,
      source: sourceLabel(path),
      score: versionScore(version)
    };
  }

  function labelForPath(path, version) {
    if (/experimental/i.test(path)) return version === 'Experimental' ? 'Experimental build' : version + ' experimental';
    if (path.includes('/latest/')) return version + ' recommended';
    if (path.includes('/recent/')) return version + ' recent';
    return version;
  }

  function sourceLabel(path) {
    if (path.includes('/latest/')) return 'latest folder';
    if (path.includes('/recent/')) return 'recent folder';
    if (path.includes('/versions/')) return 'versions folder';
    return 'firmware folder';
  }

  function sortEntries(entries) {
    return entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.file.localeCompare(b.file);
    });
  }

  function uniqueEntries(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });
  }

  async function fetchGitHubTree() {
    const branch = config.branch || 'main';
    const endpoint = `https://api.github.com/repos/${config.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetch(endpoint, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) {
      throw new Error('GitHub tree request failed');
    }
    const payload = await response.json();
    if (!Array.isArray(payload.tree)) {
      return [];
    }
    return payload.tree
      .filter((item) => item.type === 'blob')
      .map((item) => fileEntry(item.path, item.size));
  }

  function fallbackEntries() {
    return (config.fallbackFiles || []).map((path) => fileEntry(path, 0));
  }

  async function discoverEntries() {
    try {
      const treeEntries = await fetchGitHubTree();
      const filtered = treeEntries.filter((entry) => isControllerFile(entry.path) || isKeypadFile(entry.path));
      if (filtered.length) return filtered;
    } catch (error) {
      console.info('Using bundled firmware list:', error.message);
    }
    return fallbackEntries();
  }

  function createOption(entry, index) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = entry.label;
    return option;
  }

  function setStatus(message, kind) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = 'status-box ' + (kind || '');
  }

  function describeEntry(entry) {
    const parts = [entry.file, entry.source];
    if (entry.size) parts.push(formatBytes(entry.size));
    return parts.join(' - ');
  }

  function renderFileList(entries) {
    if (!controllerList) return;
    controllerList.innerHTML = '';
    if (!entries.length) {
      controllerList.innerHTML = '<div class="empty-state">No controller firmware files were found in the configured folders.</div>';
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'file-card';
      const title = document.createElement('strong');
      const meta = document.createElement('span');
      const path = document.createElement('small');
      title.textContent = entry.label;
      meta.textContent = entry.source + (entry.size ? ' - ' + formatBytes(entry.size) : '');
      path.textContent = entry.path;
      card.append(title, meta, path);
      controllerList.appendChild(card);
    });
  }

  function generatedManifest(entry) {
    return {
      name: config.deviceName || 'LumiCon',
      version: entry.version,
      new_install_prompt_erase: true,
      builds: [
        {
          chipFamily: config.chipFamily || 'ESP8266',
          parts: [
            {
              path: entry.url,
              offset: 0
            }
          ]
        }
      ]
    };
  }

  function manifestUrlFor(entry) {
    if (currentManifestUrl) {
      URL.revokeObjectURL(currentManifestUrl);
    }
    const blob = new Blob([JSON.stringify(generatedManifest(entry), null, 2)], { type: 'application/json' });
    currentManifestUrl = URL.createObjectURL(blob);
    return currentManifestUrl;
  }

  function renderInstaller(entry) {
    const manifestUrl = manifestUrlFor(entry);
    installerZone.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'install-wrap';
    const installElement = document.createElement('esp-web-install-button');
    const installButton = document.createElement('button');
    const unsupported = document.createElement('span');
    const download = document.createElement('a');

    installElement.setAttribute('manifest', manifestUrl);
    installButton.className = 'install-button';
    installButton.slot = 'activate';
    installButton.type = 'button';
    installButton.textContent = `Install ${entry.version}`;
    unsupported.className = 'empty-state';
    unsupported.slot = 'unsupported';
    unsupported.textContent = 'Use desktop Chrome or Edge. This installer needs HTTPS or localhost.';
    download.className = 'download-button';
    download.href = entry.url;
    download.download = '';
    download.textContent = 'Download BIN';

    installElement.append(installButton, unsupported);
    wrap.append(installElement, download);
    installerZone.appendChild(wrap);
    if (help) help.textContent = describeEntry(entry);
    setStatus(`Selected ${entry.label}. Ready to flash the main controller.`, 'good');
  }

  function renderController(entries) {
    select.innerHTML = '';
    renderFileList(entries);

    if (!entries.length) {
      select.disabled = true;
      installerZone.innerHTML = '<div class="empty-state">No installer-ready .bin files were found.</div>';
      if (help) help.textContent = 'Add a .bin file to the configured firmware folder and publish the site.';
      setStatus('No firmware builds are available for this device page.', 'warn');
      return;
    }

    entries.forEach((entry, index) => select.appendChild(createOption(entry, index)));
    select.disabled = false;
    select.value = '0';
    renderInstaller(entries[0]);

    select.addEventListener('change', () => {
      const entry = entries[Number(select.value)] || entries[0];
      renderInstaller(entry);
    });
  }

  function renderKeypad(entries) {
    if (!keypadZone) return;
    keypadZone.innerHTML = '';

    if (!entries.length) {
      keypadZone.innerHTML = '<div class="empty-state">No keypad UF2 files were found in the configured folder.</div>';
      return;
    }

    const latest = entries[0];
    const link = document.createElement('a');
    link.className = 'download-button';
    link.href = latest.url;
    link.download = '';
    link.textContent = `Download ${latest.version} UF2`;
    keypadZone.appendChild(link);

    const list = document.createElement('div');
    list.className = 'file-list';
    entries.forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'file-card';
      const title = document.createElement('strong');
      const meta = document.createElement('span');
      const path = document.createElement('small');
      title.textContent = entry.label;
      meta.textContent = entry.size ? formatBytes(entry.size) : 'UF2 file';
      path.textContent = entry.path;
      item.append(title, meta, path);
      list.appendChild(item);
    });
    keypadZone.appendChild(list);
  }

  discoverEntries().then((entries) => {
    const controllerEntries = sortEntries(uniqueEntries(entries.filter((entry) => isControllerFile(entry.path))));
    const keypadEntries = sortEntries(uniqueEntries(entries.filter((entry) => isKeypadFile(entry.path))));
    renderController(controllerEntries);
    renderKeypad(keypadEntries);
  });
})();
