// get_token.js  — run once with: node get_token.js
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = '778443696445-roq5mhv3ra5mrba62v60ph93e1631i5j.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive.readonly'],
});

console.log('Open this URL in your browser:\n', url);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\nPaste the code here: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('\n✅ Your refresh token:', tokens.refresh_token);
  console.log('✅ Your access token:', tokens.access_token);
  rl.close();
});