async function boot() {
  if (!profile.age) { window.location.href = 'index.html'; return; }
  setStatus('Connecting to network...');
  myPrivKey = await generateKey();

  // Pass onReady callback — fires when FIRST relay connects
  connectRelays(handleRelayMessage, onRelaysReady);
}

async function onRelaysReady() {
  setStatus('Looking for a match...');

  myEvent = await postWaiting(profile, myPrivKey);

  // Subscribe broadly — last 60 seconds to catch already-waiting users
  subscribeToRelays({
    kinds: [30078],
    '#t': [APP_TAG],
    since: Math.floor(Date.now() / 1000) - 60
  });

  // Random fallback message after 15 seconds
  setTimeout(() => {
    if (document.getElementById('connectingScreen').style.display !== 'none') {
      setStatus('No preference match yet... trying anyone nearby 🌍');
    }
  }, 15000);

  // Hard timeout — show error after 60 seconds
  setTimeout(() => {
    if (document.getElementById('connectingScreen').style.display !== 'none') {
      setStatus('⚠️ Relays seem slow. Try refreshing or check your internet.');
    }
  }, 60000);
}

function handleRelayMessage(data, ws) {
  if (!Array.isArray(data)) return;
  if (data[0] !== 'EVENT') return;
  const event = data[2];
  if (!event || !event.tags) return;

  // Build tag map properly — tags is array of arrays
  const tagMap = {};
  event.tags.forEach(t => { if (t[0]) tagMap[t[0]] = t[1]; });

  // Ignore own events
  if (event.pubkey === myPrivKey.slice(0, 64)) return;

  console.log('📨 Relay event:', tagMap);

  // Someone waiting — try to match
  if (tagMap.t === 'waiting' && !matchedPubKey) {
    if (isGoodMatch(tagMap)) {
      matchedPubKey = event.pubkey;
      try { strangerProfile = JSON.parse(event.content || '{}'); } catch(e) {}
      isInitiator = true;
      setStatus('Match found! Connecting P2P...');
      startWebRTC(ws);
    }
    return;
  }

  // Signaling messages — only from our matched peer
  if (matchedPubKey && event.pubkey === matchedPubKey) {
    try {
      const msg = JSON.parse(event.content);
      if (msg.type === 'offer') handleIncomingOffer(msg.sdp, ws);
      else if (msg.type === 'answer') handleAnswer(msg.sdp);
      else if (msg.type === 'ice') addIceCandidate(msg.candidate);
      else if (msg.type === 'social') showReceivedSocialIds(msg);
    } catch(e) { console.warn('Signal parse error', e); }
  }
}
