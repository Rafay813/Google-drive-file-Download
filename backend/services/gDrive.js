const axios = require('axios');
const { google } = require('googleapis');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { createError } = require('../utils/errorHandler');
const config = require('../config/env');

// ─── Google Workspace Export Map ──────────────────────────────────────────────
const GOOGLE_WORKSPACE_EXPORT_MAP = {
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: '.docx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: '.pptx',
  },
  'application/vnd.google-apps.drawing': {
    mimeType: 'image/png',
    ext: '.png',
  },
  'application/vnd.google-apps.script': {
    mimeType: 'application/vnd.google-apps.script+json',
    ext: '.json',
  },
  'application/vnd.google-apps.form': {
    mimeType: 'application/zip',
    ext: '.zip',
  },
};

const isGoogleWorkspaceFile = (mimeType = '') =>
  mimeType.startsWith('application/vnd.google-apps.');

// ─── Auth Clients ──────────────────────────────────────────────────────────────

const getOAuthClient = () => {
  if (!config.googleClientId || !config.googleClientSecret || !config.googleRefreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
  return oauth2Client;
};

const getServiceAccountClient = () => {
  if (!config.googleServiceAccountEmail || !config.googlePrivateKey) return null;
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: config.googleServiceAccountEmail,
      private_key: config.googlePrivateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const createClient = () => {
  const jar = new CookieJar();
  return wrapper(axios.create({ jar }));
};

const isHTML = (contentType = '') => contentType.includes('text/html');

const isLoginPage = (html = '') =>
  html.includes('ServiceLogin') ||
  html.includes('accounts.google.com/signin') ||
  html.includes('hiddenPassword') ||
  html.includes('Sign in - Google Accounts');

const extractAllFormInputs = (html = '') => {
  const params = {};
  const re = /<input[^>]+>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const nameM = tag.match(/name=["']([^"']+)["']/i);
    const valueM = tag.match(/value=["']([^"']*)["']/i);
    if (nameM?.[1]) params[nameM[1]] = valueM?.[1] ?? '';
  }
  return params;
};

const extractConfirmToken = (html = '') => {
  const patterns = [
    /[?&]confirm=([0-9A-Za-z_-]+)/,
    /name=["']confirm["']\s+value=["']([^"']+)["']/i,
    /value=["']([^"']+)["']\s+name=["']confirm["']/i,
    /&amp;confirm=([0-9A-Za-z_-]+)/,
    /"confirm"\s*:\s*"([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1] && m[1] !== 'undefined') return m[1];
  }
  return 't';
};

const extractUUID = (html = '') => {
  const patterns = [
    /[?&]uuid=([0-9A-Za-z_-]+)/,
    /"uuid"\s*:\s*"([^"]+)"/,
    /uuid=([^&"'\s<>]+)/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return '';
};

// ─── Method 0a: OAuth2 ────────────────────────────────────────────────────────

const tryOAuth2 = async (fileId, mimeType = '') => {
  const auth = getOAuthClient();
  if (!auth) { console.log('⏭️  Method 0a: OAuth2 skipped'); return null; }

  try {
    console.log('🔄 Method 0a: OAuth2 (personal account)...');
    const drive = google.drive({ version: 'v3', auth });

    if (isGoogleWorkspaceFile(mimeType)) {
      const exportInfo = GOOGLE_WORKSPACE_EXPORT_MAP[mimeType];
      if (!exportInfo) {
        console.log(`⚠️ No export format for ${mimeType}, skipping`);
        return null;
      }
      console.log(`📤 Exporting as ${exportInfo.ext}...`);
      const res = await drive.files.export(
        { fileId, mimeType: exportInfo.mimeType },
        { responseType: 'stream' }
      );
      console.log('✅ Method 0a OAuth2 export success!');
      return {
        stream: res.data,
        headers: res.headers,
        exportExt: exportInfo.ext,
        exportMime: exportInfo.mimeType,
      };
    }

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    console.log('✅ Method 0a OAuth2 success!');
    return { stream: res.data, headers: res.headers };
  } catch (err) {
    console.log(`❌ Method 0a OAuth2 error: ${err.message}`);
  }
  return null;
};

// ─── Method 0b: Service Account ───────────────────────────────────────────────

const tryServiceAccount = async (fileId, mimeType = '') => {
  const auth = getServiceAccountClient();
  if (!auth) { console.log('⏭️  Method 0b: Service Account skipped'); return null; }

  try {
    console.log('🔄 Method 0b: Service Account...');
    const drive = google.drive({ version: 'v3', auth });

    if (isGoogleWorkspaceFile(mimeType)) {
      const exportInfo = GOOGLE_WORKSPACE_EXPORT_MAP[mimeType];
      if (!exportInfo) {
        console.log(`⚠️ No export format for ${mimeType}, skipping`);
        return null;
      }
      console.log(`📤 Exporting as ${exportInfo.ext}...`);
      const res = await drive.files.export(
        { fileId, mimeType: exportInfo.mimeType },
        { responseType: 'stream' }
      );
      console.log('✅ Method 0b Service Account export success!');
      return {
        stream: res.data,
        headers: res.headers,
        exportExt: exportInfo.ext,
        exportMime: exportInfo.mimeType,
      };
    }

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    console.log('✅ Method 0b Service Account success!');
    return { stream: res.data, headers: res.headers };
  } catch (err) {
    console.log(`❌ Method 0b Service Account error: ${err.message}`);
  }
  return null;
};

// ─── Method 1: API Key ─────────────────────────────────────────────────────────

const tryApiKey = async (fileId) => {
  if (!config.googleApiKey) return null;
  try {
    console.log('🔄 Method 1: API key...');
    const res = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${config.googleApiKey}`,
      { maxRedirects: 10, timeout: 60000, responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } }
    );
    if (!isHTML(res.headers['content-type'])) {
      console.log('✅ Method 1 success!');
      return { stream: res.data, headers: res.headers };
    }
    res.data.destroy();
  } catch (err) {
    console.log(`❌ Method 1 error: ${err.message}`);
  }
  return null;
};

// ─── Method 2: usercontent confirmation flow ───────────────────────────────────

const tryUContentDownload = async (fileId) => {
  try {
    console.log('🔄 Method 2: usercontent flow...');
    const client = createClient();
    const BASE = 'https://drive.usercontent.google.com';
    const initUrl = `${BASE}/download?id=${fileId}&export=download&authuser=0`;

    const initRes = await client.get(initUrl, {
      maxRedirects: 5, timeout: 30000, responseType: 'text',
      validateStatus: (s) => s < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
    });

    const ct = initRes.headers['content-type'] || '';
    const html = typeof initRes.data === 'string' ? initRes.data : '';

    if (!isHTML(ct)) {
      const fileRes = await client.get(initUrl, { maxRedirects: 10, timeout: 0, responseType: 'stream' });
      console.log('✅ Method 2 direct!');
      return { stream: fileRes.data, headers: fileRes.headers };
    }

    if (isLoginPage(html)) { console.log('❌ Method 2: Login page'); return null; }

    const formInputs = extractAllFormInputs(html);
    const confirm = formInputs.confirm || extractConfirmToken(html);
    const uuid = formInputs.uuid || extractUUID(html);
    const id = formInputs.id || fileId;
    const exportType = formInputs.export || 'download';
    const authuser = formInputs.authuser || '0';

    let downloadUrl = `${BASE}/download?id=${id}&export=${exportType}&authuser=${authuser}&confirm=${confirm}`;
    if (uuid) downloadUrl += `&uuid=${uuid}`;

    const fileRes = await client.get(downloadUrl, {
      maxRedirects: 10, timeout: 0, responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Referer: initUrl, Accept: '*/*',
      },
    });

    const fileType = fileRes.headers['content-type'] || '';
    if (!isHTML(fileType)) { console.log('✅ Method 2 success!'); return { stream: fileRes.data, headers: fileRes.headers }; }
    fileRes.data.destroy();
    console.log('❌ Method 2: Still HTML');
  } catch (err) {
    console.log(`❌ Method 2 error: ${err.message}`);
  }
  return null;
};

// ─── Method 3: drive.google.com/uc ────────────────────────────────────────────

const tryUCEndpoint = async (fileId) => {
  try {
    console.log('🔄 Method 3: /uc endpoint...');
    const client = createClient();
    const initUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

    const initRes = await client.get(initUrl, {
      maxRedirects: 5, timeout: 30000, responseType: 'text',
      validateStatus: (s) => s < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
    });

    const ct = initRes.headers['content-type'] || '';
    const html = typeof initRes.data === 'string' ? initRes.data : '';

    if (!isHTML(ct)) {
      const fileRes = await client.get(initUrl, { maxRedirects: 10, timeout: 0, responseType: 'stream' });
      console.log('✅ Method 3 direct!');
      return { stream: fileRes.data, headers: fileRes.headers };
    }

    if (isLoginPage(html)) { console.log('❌ Method 3: Login page'); return null; }

    const confirm = extractConfirmToken(html);
    const uuid = extractUUID(html);
    let confirmedUrl = `https://drive.google.com/uc?id=${fileId}&export=download&confirm=${confirm}`;
    if (uuid) confirmedUrl += `&uuid=${uuid}`;

    const fileRes = await client.get(confirmedUrl, {
      maxRedirects: 10, timeout: 0, responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://drive.google.com/',
      },
    });

    const fileType = fileRes.headers['content-type'] || '';
    if (!isHTML(fileType)) { console.log('✅ Method 3 success!'); return { stream: fileRes.data, headers: fileRes.headers }; }
    fileRes.data.destroy();
    console.log('❌ Method 3: Still HTML');
  } catch (err) {
    console.log(`❌ Method 3 error: ${err.message}`);
  }
  return null;
};

// ─── Method 4: Direct URLs ─────────────────────────────────────────────────────

const tryDirectURLs = async (fileId) => {
  console.log('🔄 Method 4: Direct URLs...');
  const urls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    `https://drive.usercontent.google.com/u/0/uc?id=${fileId}&export=download&confirm=t`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
  ];

  for (const url of urls) {
    try {
      console.log(`🔄 Trying: ${url}`);
      const client = createClient();
      const fileRes = await client.get(url, {
        maxRedirects: 10, timeout: 60000, responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      });
      const fileType = fileRes.headers['content-type'] || '';
      if (!isHTML(fileType)) { console.log('✅ Method 4 success!'); return { stream: fileRes.data, headers: fileRes.headers }; }
      fileRes.data.destroy();
    } catch (err) {
      console.log(`❌ URL failed: ${err.message}`);
    }
  }
  return null;
};

// ─── Public API ────────────────────────────────────────────────────────────────

const getDriveFileStream = async (fileId, mimeType = '') => {
  console.log(`\n🔍 Getting stream for: ${fileId}`);

  const result =
    (await tryOAuth2(fileId, mimeType)) ||
    (await tryServiceAccount(fileId, mimeType)) ||
    (await tryApiKey(fileId)) ||
    (await tryUContentDownload(fileId)) ||
    (await tryUCEndpoint(fileId)) ||
    (await tryDirectURLs(fileId));

  if (result) return result;

  throw createError(
    'Google Drive blocked this download. The file must be shared with your Gmail or set to "Anyone with the link".',
    400
  );
};

const getDriveFileMetadata = async (fileId) => {
  try {
    // Try OAuth2 metadata
    const auth = getOAuthClient();
    if (auth) {
      try {
        const drive = google.drive({ version: 'v3', auth });
        const metaRes = await drive.files.get({ fileId, fields: 'name,size,mimeType' });
        if (metaRes.data) {
          console.log(`📁 OAuth2 metadata: ${metaRes.data.name}`);
          return {
            filename: metaRes.data.name || `file_${fileId}`,
            size: parseInt(metaRes.data.size || 0),
            mimeType: metaRes.data.mimeType || 'application/octet-stream',
          };
        }
      } catch (e) { console.log(`⚠️ OAuth2 metadata failed: ${e.message}`); }
    }

    // Try Service Account metadata
    const saAuth = getServiceAccountClient();
    if (saAuth) {
      try {
        const drive = google.drive({ version: 'v3', auth: saAuth });
        const metaRes = await drive.files.get({ fileId, fields: 'name,size,mimeType' });
        if (metaRes.data) {
          console.log(`📁 Service Account metadata: ${metaRes.data.name}`);
          return {
            filename: metaRes.data.name || `file_${fileId}`,
            size: parseInt(metaRes.data.size || 0),
            mimeType: metaRes.data.mimeType || 'application/octet-stream',
          };
        }
      } catch (e) { console.log(`⚠️ Service Account metadata failed: ${e.message}`); }
    }

    // Try API key metadata
    if (config.googleApiKey) {
      try {
        const metaRes = await axios.get(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType&key=${config.googleApiKey}`,
          { timeout: 15000 }
        );
        if (metaRes.data && !metaRes.data.error) {
          console.log(`📁 API key metadata: ${metaRes.data.name}`);
          return {
            filename: metaRes.data.name || `file_${fileId}`,
            size: parseInt(metaRes.data.size || 0),
            mimeType: metaRes.data.mimeType || 'application/octet-stream',
          };
        }
      } catch (e) { console.log(`⚠️ API metadata failed: ${e.message}`); }
    }

    // Fallback: stream headers
    const { stream, headers } = await getDriveFileStream(fileId);
    stream.destroy();
    const contentDisposition = headers['content-disposition'] || '';
    const contentLength = headers['content-length'] || 0;
    let contentType = headers['content-type'] || 'application/octet-stream';
    if (isHTML(contentType)) contentType = 'application/octet-stream';
    let filename = `file_${fileId}`;
    const nameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    if (nameMatch?.[1]) filename = decodeURIComponent(nameMatch[1].trim());
    return {
      filename,
      size: parseInt(contentLength, 10),
      mimeType: contentType.split(';')[0].trim(),
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw createError(`Failed to fetch metadata: ${err.message}`, 400);
  }
};

module.exports = { getDriveFileStream, getDriveFileMetadata };