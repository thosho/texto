// chat.js
const ADULT_WORDS = [
  'sex', 'masturbat', 'nude', 'naked', 'porn', 'dick', 'pussy',
  'boobs', 'xxx', 'horny', 'f**k', 'fuck', 'cock', 'vagina', 'penis'
];

const profile = JSON.parse(localStorage.getItem('profile') || '{}');
let strangerProfile = null;
let myPrivKey = null;
let myEvent = null;
let isInitiator = false;
let matchedPubKey = null;
let adultWarningShown = false;

// --- Boot ---
async function boot() {
  if (!profile.age) { window.location.href = 'index.html'; return; }
  setStatus('Connecting to network...');
  myPrivKey = await generateKey();

  connectRelays(handleRelayMessage);

  // Wait for relay connections then post waiting
  setTimeout(async () => {
    setStatus('Looking for a match...');
    myEvent = await postWaiting(profile, myPrivKey);

    // Subscribe to responses directed at us
    subscribeToRelays({
      kinds: [30078],
      '#t': [APP_TAG],
      since: Math.floor(Date.now() / 1000) - 5
    }, handleRelayMessage);

    // Timeout fallback
    setTimeout(() => {
      if (document.getElementById('connectingScreen').style.display !== 'none') {
        setStatus('No preference match found, trying random...');
      }
    }, 10000);
  }, 2000);
}

function setStatus(msg) {
  document.getElementById('matchStatus').textContent = msg;
}

// --- Relay Message Handler ---
function handleRelayMessage(data, ws) {
  if (data[0] !== 'EVENT') return;
  const event = data[2];
  if (!event || !event.tags) return;

  const tags = Object.fromEntries(event.tags);
  if (!tags.t || !tags.t.includes(APP_TAG)) return;
  if (event.pubkey === myPrivKey.slice(0, 64)) return; // ignore own events

  // Someone is waiting — check if they match our preferences
  if (tags.t === 'waiting' && !matchedPubKey) {
    if (isGoodMatch(tags)) {
      matchedPubKey = event.pubkey;
      strangerProfile = JSON.parse(event.content || '{}');
      isInitiator = true;
      startWebRTC(ws);
    }
  }

  // WebRTC signaling messages
  if (event.pubkey === matchedPubKey) {
    try {
      const msg = JSON.parse(event.content);
      if (msg.type === 'offer') handleIncomingOffer(msg.sdp, ws);
      if (msg.type === 'answer') handleAnswer(msg.sdp);
      if (msg.type === 'ice') addIceCandidate(msg.candidate);
      if (msg.type === 'social') showReceivedSocialIds(msg);
    } catch(e) {}
  }
}

function isGoodMatch(tags) {
  const theirGender = tags.gender || 'any';
  const theirCountry = (tags.country || 'any').toLowerCase();
  const myPrefGender = profile.prefGender || 'any';
  const myPrefCountry = (profile.prefCountry || 'any').toLowerCase();

  if (myPrefGender !== 'any' && theirGender !== 'any' && theirGender !== myPrefGender) return false;
  if (myPrefCountry !== 'any' && theirCountry !== 'any' && theirCountry !== myPrefCountry) return false;
  return true;
}

// --- WebRTC Flow ---
async function startWebRTC(ws) {
  window._sendIceCandidate = (candidate) => sendSignal({ type: 'ice', candidate }, ws);
  window._onPeerDisconnect = onPeerDisconnect;

  initPeer(true, onMessageReceived, onP2PConnected);
  const offer = await createOffer();
  sendSignal({ type: 'offer', sdp: offer }, ws);
}

async function handleIncomingOffer(sdp, ws) {
  window._sendIceCandidate = (candidate) => sendSignal({ type: 'ice', candidate }, ws);
  window._onPeerDisconnect = onPeerDisconnect;

  initPeer(false, onMessageReceived, onP2PConnected);
  const answer = await handleOffer(sdp);
  sendSignal({ type: 'answer', sdp: answer }, ws);
}

function sendSignal(data, ws) {
  const event = {
    kind: 30078,
    pubkey: myPrivKey.slice(0, 64),
    created_at: Math.floor(Date.now() / 1000),
    tags: [['t', APP_TAG], ['p', matchedPubKey]],
    content: JSON.stringify(data)
  };
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(['EVENT', event]));
  }
}

// --- Chat UI ---
function onP2PConnected() {
  document.getElementById('connectingScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display = 'flex';
  document.getElementById('strangerName').textContent =
    strangerProfile?.nickname || 'Stranger';
  addSystemMessage('Connected! Say hello 👋');
}

function onMessageReceived(text) {
  try {
    const data = JSON.parse(text);
    if (data._type === 'social') { showReceivedSocialIds(data); return; }
  } catch(e) {}
  addMessage(text, 'stranger');
  checkAdultContent(text);
}

function sendMsg() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;

  if (checkAdultContent(text)) {
    input.value = '';
    return;
  }

  if (sendMessage(text)) {
    addMessage(text, 'me');
    input.value = '';
  }
}

function addMessage(text, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = text;
  const msgs = document.getElementById('messages');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addSystemMessage(text) {
  addMessage(text, 'system');
}

function checkAdultContent(text) {
  const lower = text.toLowerCase();
  const isAdult = ADULT_WORDS.some(w => lower.includes(w));
  if (isAdult && !adultWarningShown) {
    adultWarningShown = true;
    document.getElementById('adultModal').classList.add('active');
    return true;
  }
  return false;
}

function closeAdultModal() {
  document.getElementById('adultModal').classList.remove('active');
  adultWarningShown = false;
}

function shareSocialIds() {
  const data = {
    _type: 'social',
    snapchat: document.getElementById('mySnapchat').value.trim(),
    telegram: document.getElementById('myTelegram').value.trim(),
    instagram: document.getElementById('myInsta').value.trim(),
    nickname: profile.nickname
  };
  sendMessage(JSON.stringify(data));
  closeAdultModal();
  addSystemMessage('Your social IDs were sent to the stranger.');
}

function showReceivedSocialIds(data) {
  let html = `<b>${data.nickname || 'Stranger'}</b> shared their IDs:<br/>`;
  if (data.snapchat) html += `📸 Snapchat: <b>${data.snapchat}</b><br/>`;
  if (data.telegram) html += `✈️ Telegram: <b>${data.telegram}</b><br/>`;
  if (data.instagram) html += `📷 Instagram: <b>${data.instagram}</b><br/>`;
  document.getElementById('receivedIds').innerHTML = html;
  document.getElementById('socialModalText').textContent = 'They want to connect on:';
  document.getElementById('socialModal').classList.add('active');
}

function closeSocialModal() {
  document.getElementById('socialModal').classList.remove('active');
}

function requestSocial() {
  document.getElementById('adultModal').classList.add('active');
}

function nextStranger() {
  closePeer();
  matchedPubKey = null;
  strangerProfile = null;
  adultWarningShown = false;
  document.getElementById('chatScreen').style.display = 'none';
  document.getElementById('connectingScreen').style.display = 'flex';
  document.getElementById('messages').innerHTML = '';
  boot();
}

function onPeerDisconnect() {
  addSystemMessage('Stranger disconnected.');
  document.getElementById('connectionStatus').textContent = 'Disconnected';
}

// Start
boot();
