// WebRTC helper for HEADSHOTS! — player POV streaming (mesh)
// Exports functions for initializing local camera, creating peers for spectating,
// handling incoming signaling messages, and cleanup.

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
    // Add TURN servers here if needed for NAT traversal in real deployments.
  ]
};

// Map of RTCPeerConnection objects keyed by remote peer id
// For spectators: key = playerId (we receive tracks from playerId)
// For players:    key = spectatorId (we will send tracks to spectatorId)
const pcs = new Map();

// Map for queuing ICE candidates that arrive before a PC exists OR before
// the remoteDescription is set on that PC.
const pendingIce = new Map();

// Local media stream for player publishing
let localStream = null;

// Callback when a remote stream arrives (spectator side)
let onRemoteStreamCb = null;

/**
 * Initialize and return a local video stream (camera).
 * Safe to call multiple times — reuses existing stream.
 */
export async function initLocalStream({ video = true, audio = false } = {}) {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    // attach to #video if exists (player preview)
    const localVideo = document.getElementById("video");
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.muted = true;
      try { await localVideo.play(); } catch (e) { /* ignore autoplay errors */ }
    }
    return localStream;
  } catch (err) {
    console.error("initLocalStream: getUserMedia failed:", err);
    throw err;
  }
}

/**
 * Allows cameraDetection and other modules to set / reuse a provided stream
 */
export function setLocalStream(stream) {
  localStream = stream;
  const localVideo = document.getElementById("video");
  if (localVideo) {
    localVideo.srcObject = stream;
    localVideo.muted = true;
    try { localVideo.play().catch(() => {}); } catch (_) {}
  }
}

/**
 * Register a callback for when a remote track (player POV) arrives.
 * callback signature: (remoteId, MediaStream) => void
 */
export function onRemoteStream(callback) {
  onRemoteStreamCb = callback;
}

/**
 * Flush pending ICE candidates for a given remoteId if possible.
 * Ensures remoteDescription exists before trying to add.
 */
async function flushPendingIce(remoteId) {
  const pc = pcs.get(remoteId);
  if (!pc) return;
  // Only add candidates when remoteDescription is set (safe)
  if (!pc.remoteDescription) return;

  const queued = pendingIce.get(remoteId);
  if (!queued || queued.length === 0) {
    pendingIce.delete(remoteId);
    return;
  }

  for (const cand of queued) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch (e) {
      console.warn("Flushing ICE failed for", remoteId, e);
    }
  }
  pendingIce.delete(remoteId);
}

/**
 * Internal helper: ensure a PC object exists for a remote id.
 */
function ensurePC(remoteId) {
  if (pcs.has(remoteId)) return pcs.get(remoteId);

  const pc = new RTCPeerConnection(ICE_CONFIG);

  // When remote tracks arrive, forward to callback for rendering
  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    if (onRemoteStreamCb) onRemoteStreamCb(remoteId, stream);
  };

  pc.oniceconnectionstatechange = () => {
    // Clean-up closed/failed
    if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
      try { pc.close(); } catch (_) {}
      pcs.delete(remoteId);
      pendingIce.delete(remoteId);
    }
  };

  pcs.set(remoteId, pc);

  // If there were any queued ICE candidates for this remote, we *do not* try
  // to add them here unless the remoteDescription is already present.
  // flushPendingIce(remoteId) will be called after setRemoteDescription.
  return pc;
}

/**
 * Create a peer connection _on the SPECTATOR side_ to receive a player's tracks.
 * Spectator creates the offer and sends it to the player via signaling (server).
 * Returns the RTCPeerConnection instance.
 *
 * localId: the spectator's socket id (from client perspective)
 * playerId: the target player's socket id
 * socket: WebSocket instance used for signalling
 */
export async function createPeerForSpectator(localId, playerId, socket) {
  // If already have a pc for this player, reuse (avoid duplicates)
  if (pcs.has(playerId)) {
    const existing = pcs.get(playerId);
    // If existing pc is closed, remove and recreate
    if (existing.connectionState === "closed" || existing.iceConnectionState === "closed") {
      try { existing.close(); } catch (_) {}
      pcs.delete(playerId);
    } else {
      return existing;
    }
  }

  const pc = ensurePC(playerId);

  // Spectator receives video, ensure a transceiver for video (recvonly)
  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
  } catch (e) {
    // Some browsers will create implicit transceivers — it's fine
  }

  // On ICE candidate, forward to remote via signalling server
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.send(JSON.stringify({
        type: "webrtc-ice",
        fromId: localId,
        toId: playerId,
        candidate: ev.candidate
      }));
    }
  };

  // Create offer and send to player
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // send the whole desc object (browser will serialize it)
    socket.send(JSON.stringify({
      type: "webrtc-offer",
      fromId: localId,
      toId: playerId,
      sdp: pc.localDescription
    }));
  } catch (err) {
    console.error("createPeerForSpectator: failed to create/send offer", err);
    throw err;
  }

  return pc;
}

/**
 * Handle an incoming offer on the PLAYER side.
 * playerId: the player's socket id (this client)
 * fromId: the spectator who created the offer (spectator id)
 * sdp: the remote offer object
 * socket: WebSocket signalling socket
 */
export async function handleOfferOnPlayer(playerId, fromId, sdp, socket) {
  // Create or reuse a pc keyed by spectator id
  let pc = pcs.get(fromId);
  if (!pc) {
    pc = ensurePC(fromId);
  }

  // Ensure local stream is available (player must publish camera)
  if (!localStream) {
    try {
      await initLocalStream();
    } catch (err) {
      console.error("handleOfferOnPlayer: cannot obtain local stream:", err);
      // still proceed; answer will contain no tracks
    }
  }

  // Add local tracks to the peer (publish)
  if (localStream) {
    // Avoid double-adding tracks. Check existing senders count.
    const existingSenders = pc.getSenders().filter(s => s && s.track);
    if (existingSenders.length === 0) {
      localStream.getTracks().forEach(track => {
        try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack failed:", e); }
      });
    }
  }

  // Wire ICE
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.send(JSON.stringify({
        type: "webrtc-ice",
        fromId: playerId,
        toId: fromId,
        candidate: ev.candidate
      }));
    }
  };

  // Set remote description (offer) and create+send answer
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (e) {
    console.error("handleOfferOnPlayer: setRemoteDescription failed", e);
    // still try to continue
  }

  // Flush any ICE candidates that arrived earlier and were queued
  try {
    await flushPendingIce(fromId);
  } catch (e) {
    console.warn("handleOfferOnPlayer: flushPendingIce failed", e);
  }

  try {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(JSON.stringify({
      type: "webrtc-answer",
      fromId: playerId,
      toId: fromId,
      sdp: pc.localDescription
    }));
  } catch (err) {
    console.error("handleOfferOnPlayer: failed to create/send answer", err);
  }

  return pc;
}

/**
 * Handle incoming answer (spectator side).
 * fromId: player id
 * sdp: remote answer object
 */
export async function handleAnswerOnSpectator(fromId, sdp) {
  const pc = pcs.get(fromId);
  if (!pc) {
    console.warn("handleAnswerOnSpectator: no pc for", fromId);
    return;
  }
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (err) {
    console.error("handleAnswerOnSpectator: setRemoteDescription failed", err);
    // still attempt to flush queued ICE safely below (remoteDescription may be partial)
  }

  // Now that remoteDescription is set (or attempted), flush queued ICE candidates
  try {
    await flushPendingIce(fromId);
  } catch (e) {
    console.warn("handleAnswerOnSpectator: flushPendingIce failed", e);
  }
}

/**
 * Handle incoming ICE candidate
 * fromId: remote peer id
 * candidate: candidate object
 */
export async function handleIce(fromId, candidate) {
  if (!candidate) return;
  const pc = pcs.get(fromId);
  if (!pc) {
    // queue candidate until pc exists
    if (!pendingIce.has(fromId)) pendingIce.set(fromId, []);
    pendingIce.get(fromId).push(candidate);
    console.debug("handleIce: queued candidate for (no pc yet) ", fromId);
    return;
  }

  // If remote description isn’t set yet, queue until it is safe to add
  if (!pc.remoteDescription) {
    if (!pendingIce.has(fromId)) pendingIce.set(fromId, []);
    pendingIce.get(fromId).push(candidate);
    console.debug("handleIce: queued candidate until remoteDescription for", fromId);
    return;
  }

  // Safe to add immediately
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("Error adding ICE candidate:", err);
    // As a fallback, queue it (rare) so it can be retried later
    if (!pendingIce.has(fromId)) pendingIce.set(fromId, []);
    pendingIce.get(fromId).push(candidate);
  }
}

/**
 * Tear down all peer connections and local stream (cleanup)
 */
export function closeAllPeers() {
  for (const [k, pc] of pcs.entries()) {
    try { pc.close(); } catch (e) {}
  }
  pcs.clear();
  pendingIce.clear();
  if (localStream) {
    localStream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) {}
    });
    localStream = null;
  }
}
