// Google's free STUN server — no cost, highly reliable
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

let peerConnection = null;
let dataChannel = null;
let onMessageCallback = null;
let onConnectedCallback = null;

function initPeer(isInitiator, onMessage, onConnected) {
  onMessageCallback = onMessage;
  onConnectedCallback = onConnected;

  peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  if (isInitiator) {
    dataChannel = peerConnection.createDataChannel('chat');
    setupDataChannel(dataChannel);
  } else {
    peerConnection.ondatachannel = (e) => {
      dataChannel = e.channel;
      setupDataChannel(dataChannel);
    };
  }

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      // Send ICE candidate via Nostr relay
      window._sendIceCandidate && window._sendIceCandidate(e.candidate);
    }
  };

  return peerConnection;
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log('P2P connected!');
    onConnectedCallback && onConnectedCallback();
  };
  channel.onmessage = (e) => {
    onMessageCallback && onMessageCallback(e.data);
  };
  channel.onclose = () => {
    window._onPeerDisconnect && window._onPeerDisconnect();
  };
}

async function createOffer() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}

async function handleOffer(offer) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

async function handleAnswer(answer) {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function addIceCandidate(candidate) {
  await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

function sendMessage(text) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(text);
    return true;
  }
  return false;
}

function closePeer() {
  dataChannel && dataChannel.close();
  peerConnection && peerConnection.close();
}
