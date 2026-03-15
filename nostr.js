// Public free Nostr relays — community maintained, not yours
const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

const APP_TAG = 'strangers-chat-v1'; // unique tag so only your app's events are picked up
let sockets = [];
let myPubKey = null;

// Generate a throwaway keypair per session (no identity, fully anonymous)
async function generateKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function connectRelays(onMessage) {
  sockets = [];
  RELAYS.forEach(url => {
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => console.log('Relay connected:', url);
      ws.onmessage = (e) => onMessage(JSON.parse(e.data), ws);
      ws.onerror = () => console.warn('Relay error:', url);
      sockets.push(ws);
    } catch(e) {}
  });
}

function broadcastToRelays(event) {
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['EVENT', event]));
    }
  });
}

function subscribeToRelays(filter, onMessage) {
  const subId = 'sub_' + Math.random().toString(36).slice(2);
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['REQ', subId, filter]));
    }
  });
}

// Post "I am waiting" event to Nostr
async function postWaiting(profile, privKey) {
  const event = {
    kind: 30078, // app-specific data kind
    pubkey: privKey.slice(0, 64),
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', APP_TAG],
      ['t', 'waiting'],
      ['gender', profile.gender],
      ['country', profile.country.toLowerCase()],
      ['prefGender', profile.prefGender],
      ['prefCountry', profile.prefCountry.toLowerCase()],
      ['age', String(profile.age)],
    ],
    content: JSON.stringify({ nickname: profile.nickname, age: profile.age })
  };
  event.id = await hashEvent(event);
  broadcastToRelays(event);
  return event;
}

async function hashEvent(event) {
  const str = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
