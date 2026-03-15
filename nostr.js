const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net'
];

const APP_TAG = 'strangers-chat-v1';
let sockets = [];
let connectedRelays = 0;
let onReadyCallback = null;

function connectRelays(onMessage, onReady) {
  sockets = [];
  connectedRelays = 0;
  onReadyCallback = onReady;

  RELAYS.forEach(url => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        connectedRelays++;
        console.log('✅ Relay connected:', url, `(${connectedRelays} total)`);
        // Fire ready as soon as FIRST relay connects — don't wait for all
        if (connectedRelays === 1 && onReadyCallback) {
          onReadyCallback();
          onReadyCallback = null; // only fire once
        }
      };

      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data), ws); } catch(err) {}
      };

      ws.onerror = (e) => console.warn('⚠️ Relay error:', url);
      ws.onclose = () => console.warn('🔌 Relay closed:', url);

      sockets.push(ws);
    } catch(e) {
      console.warn('Failed to connect relay:', url);
    }
  });

  // Hard fallback — if no relay connects in 8 seconds, still proceed
  setTimeout(() => {
    if (onReadyCallback) {
      console.warn('No relay connected in 8s, trying anyway...');
      onReadyCallback();
      onReadyCallback = null;
    }
  }, 8000);
}

function broadcastToRelays(event) {
  let sent = 0;
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['EVENT', event]));
      sent++;
    }
  });
  console.log(`📤 Broadcast to ${sent} relays`);
  return sent;
}

function subscribeToRelays(filter) {
  const subId = 'sub_' + Math.random().toString(36).slice(2);
  let subscribed = 0;
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(['REQ', subId, filter]));
      subscribed++;
    }
  });
  console.log(`📡 Subscribed on ${subscribed} relays`);
  return subId;
}

async function postWaiting(profile, privKey) {
  const event = {
    kind: 30078,
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

async function generateKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashEvent(event) {
  const str = JSON.stringify([
    0, event.pubkey, event.created_at,
    event.kind, event.tags, event.content
  ]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
