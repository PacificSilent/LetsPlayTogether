const videoSenders = {};
const peerConnections = {};
const joystickDataByPeer = {};
const peerLatencies = {};

const videoElement = document.querySelector("video");
const toggleBtn = document.getElementById("toggleBroadcast");
const changeBtn = document.getElementById("changeSource");

const config = {
  iceServers: [
    // { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:pacificsilent.localto.net:3857" },
    {
      urls: "turn:pacificsilent.localto.net:3857",
      username: "test",
      credential: "test",
    },
  ],
};

const resolutionConfig = {
  frameRate: { ideal: 30, max: 30 },
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
};

const socket = io();

socket.emit("broadcasterJoin");

// Declara la variable global para el sonido de notificación:
const connectionSound = new Audio("/sounds/notify.mp3");

socket.on("newPeerRequest", (data) => {
  // Reproduce el sonido cada vez que llegue una nueva solicitud
  connectionSound
    .play()
    .catch((err) => console.error("Error playing sound:", err));

  const peerList = document.getElementById("peerList");

  // Remove placeholder if it exists
  const placeholder = peerList.querySelector(".text-gray-500");
  if (placeholder) {
    placeholder.remove();
  }

  const li = document.createElement("li");
  li.id = data.peerId;
  li.innerHTML = `
    <div class="bg-gray-800 border-2 border-purple-700 rounded-lg p-4 mb-3 shadow-lg transform transition-all duration-200 hover:scale-102">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-purple-500 mr-2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span class="font-bold text-purple-400 text-lg">${data.nick}</span>
        </div>
        <span class="bg-purple-900 text-purple-300 text-xs px-2 py-1 rounded-full">New Request</span>
      </div>
      <p class="text-gray-400 text-sm mb-3">Player wants to join your game session</p>
      <div class="flex space-x-2">
        <button onclick="handlePeer('${data.peerId}', true)" class="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Approve
        </button>
        <button onclick="handlePeer('${data.peerId}', false)" class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Reject
        </button>
      </div>
    </div>
  `;
  peerList.appendChild(li);

  // Add a subtle animation effect
  setTimeout(() => {
    li.querySelector("div").classList.add("shadow-purple-900/20");
  }, 100);
});

// Also update the handlePeer function to maintain the placeholder
window.handlePeer = function (peerId, approved) {
  socket.emit("handlePeerRequest", { peerId, approved });
  const li = document.getElementById(peerId);
  if (li) li.remove();

  // Check if peerList is empty and add placeholder if needed
  const peerList = document.getElementById("peerList");
  if (peerList.children.length === 0) {
    peerList.innerHTML =
      '<li class="text-gray-500 text-center py-4">No pending requests</li>';
  }
};

socket.on("answer", (id, description) => {
  peerConnections[id].setRemoteDescription(description);
});

socket.on("watcher", (id) => {
  const peerConnection = new RTCPeerConnection(config);
  peerConnections[id] = peerConnection;

  let stream = videoElement.srcObject;
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  const videoSender = peerConnection
    .getSenders()
    .find((sender) => sender.track && sender.track.kind === "video");
  if (videoSender) {
    videoSenders[id] = videoSender;
    const params = videoSender.getParameters();
    if (!params.encodings) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 12000000; // 50 Mbps
    params.degradationPreference = "balanced";
    params.encodings[0].maxFramerate = 60;
    videoSender
      .setParameters(params)
      .then(() => {
        console.log("Encoding parameters updated for peer", id);
      })
      .catch((err) => {
        console.error("Error updating parameters:", err);
      });
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };

  peerConnection
    .createOffer()
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("offer", id, peerConnection.localDescription);
    });
});

socket.on("candidate", (id, candidate) => {
  peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("disconnectPeer", (id) => {
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
  }
  delete joystickDataByPeer[id];
});

socket.on("joystick-data", (data) => {
  const parts = data.id.split("-");
  const peerId = parts[0];
  joystickDataByPeer[peerId] = data;
});

socket.on("admin-pong", (data) => {
  const latency = Date.now() - data.pingStart;
  peerLatencies[data.peerId] = latency;
});

function sendAdminPing(peerId) {
  const pingStart = Date.now();
  socket.emit("admin-ping", { target: peerId, pingStart });
}

function disconnectPeer(peerId) {
  socket.emit("admin-disconnect", peerId);
  if (peerConnections[peerId]) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }
  delete joystickDataByPeer[peerId];
  delete peerLatencies[peerId];
  updatePeerList();
}

function updatePeerList() {
  const peersUl = document.getElementById("peers");
  peersUl.innerHTML = "";

  const peerCount = Object.keys(peerConnections).length;

  // Add placeholder if no peers are connected
  if (peerCount === 0) {
    peersUl.innerHTML = `
      <li class="text-gray-500 text-center py-6">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-2 text-gray-600">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        No players connected
      </li>
    `;
    return;
  }

  Object.keys(peerConnections).forEach((peerId) => {
    const li = document.createElement("li");
    const latency =
      peerLatencies[peerId] !== undefined
        ? peerLatencies[peerId] + "ms"
        : "N/A";

    // Create a latency class based on the value
    let latencyClass = "text-gray-400";
    let latencyIcon = "";

    if (peerLatencies[peerId] !== undefined) {
      if (peerLatencies[peerId] < 50) {
        latencyClass = "text-green-500";
        latencyIcon = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        `;
      } else if (peerLatencies[peerId] < 100) {
        latencyClass = "text-yellow-500";
        latencyIcon = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        `;
      } else {
        latencyClass = "text-red-500";
        latencyIcon = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        `;
      }
    }

    // Create a shortened peer ID for display
    const shortPeerId =
      peerId.length > 10 ? peerId.substring(0, 8) + "..." : peerId;

    li.className = "mb-2 transition-all duration-200";
    li.innerHTML = `
      <div class="bg-gray-800 border-2 border-purple-700 rounded-lg p-3 flex items-center justify-between hover:bg-gray-750">
        <div class="flex items-center">
          <div class="bg-purple-900 p-2 rounded-full mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-purple-400">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div>
            <div class="font-medium text-white">${shortPeerId}</div>
            <div class="flex items-center ${latencyClass} text-xs mt-1">
              ${latencyIcon}
              Latency: ${latency}
            </div>
          </div>
        </div>
        <button 
          onclick="disconnectPeer('${peerId}')" 
          class="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors flex items-center"
          title="Disconnect player"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <span class="ml-1 hidden sm:inline">Disconnect</span>
        </button>
      </div>
    `;

    peersUl.appendChild(li);

    // Add a subtle animation effect
    setTimeout(() => {
      li.classList.add("opacity-100");
    }, 50 * Object.keys(peerConnections).indexOf(peerId));
  });
}

setInterval(() => {
  Object.keys(peerConnections).forEach((peerId) => {
    sendAdminPing(peerId);
  });
  updatePeerList();
}, 5000);

window.onunload = window.onbeforeunload = () => {
  if (broadcastStream) {
    stopBroadcast();
  }
  socket.close();
};

let startTime = null;

function getDevices() {
  return navigator.mediaDevices.enumerateDevices();
}

function getStream() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  return getScreen().then(gotStream).catch(handleError);
}

function getScreen() {
  const audioSource = document.getElementById("audioSource").value;
  return navigator.mediaDevices.getUserMedia({
    video: {
      ...resolutionConfig,
    },
    audio: {
      ...(audioSource ? { deviceId: { exact: audioSource } } : {}),
      noiseSuppression: false,
      autoGainControl: false,
      echoCancellation: false,
    },
  });
}

async function populateAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(
      (device) => device.kind === "audioinput"
    );
    const audioSelect = document.getElementById("audioSource");
    // Reinicia opciones
    audioSelect.innerHTML = '<option value="">Default</option>';
    audioInputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Micrófono ${index + 1}`;
      audioSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error populating audio devices:", error);
  }
}

// Llama a la función cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", populateAudioDevices);

function gotStream(stream) {
  window.stream = stream;
  videoElement.srcObject = stream;
  attachTrackErrorHandlers(stream);
  startTime = Date.now();
  socket.emit("broadcaster");
  return stream;
}

function handleError(error) {
  console.error("Error:", error);
}

function attachTrackErrorHandlers(stream) {
  stream.getVideoTracks().forEach((track) => {
    track.onended = () => {
      console.error("Video track ended. Restarting broadcast...");
      fallbackBroadcast(
        resolutionConfig.frameRate.ideal,
        resolutionConfig.width.ideal,
        resolutionConfig.height.ideal
      );
    };
    track.onerror = (err) => {
      console.error("Video track error:", err);
      fallbackBroadcast(
        resolutionConfig.frameRate.ideal,
        resolutionConfig.width.ideal,
        resolutionConfig.height.ideal
      );
    };
  });
}

function fallbackBroadcast(frameRate, width, height) {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => track.stop());
  }
  console.log("Attempting lower quality broadcast as fallback...");
  navigator.mediaDevices
    .getUserMedia({
      video: {
        frameRate: { ideal: frameRate, max: frameRate },
        width: { ideal: width, max: width },
        height: { ideal: height, max: height },
      },
      audio: {
        noiseSuppression: false,
        autoGainControl: false,
        echoCancellation: false,
      },
    })
    .then((fallbackStream) => {
      window.stream = fallbackStream;
      videoElement.srcObject = fallbackStream;
      const newVideoTrack = fallbackStream.getVideoTracks()[0];
      Object.keys(peerConnections).forEach((id) => {
        const sender = videoSenders[id];
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      });
      attachTrackErrorHandlers(fallbackStream);
      console.log("Lower quality fallback initiated.");
    })
    .catch((err) => {
      console.error("Error starting fallback:", err);
    });
}

const globalStats = {
  connectedPeers: 0,
  candidatePairBytes: 0,
  outboundRtpBytes: 0,
  transportSentBytes: 0,
  transportReceivedBytes: 0,
  reportCount: 0,
  packages: 0,
  mbSent: "0.00",
  avgPacketLoss: "N/A",
  avgRtt: "N/A",
  streamingTime: "00:00:00",
};

setInterval(async () => {
  globalStats.connectedPeers = Object.keys(peerConnections).length;

  let candidatePairBytes = 0;
  let outboundRtpBytes = 0;
  let transportSentBytes = 0;
  let transportReceivedBytes = 0;
  let reportCount = 0;
  let packages = 0;
  let totalPacketLoss = 0;
  let totalRoundTripTime = 0;
  let rttCount = 0;

  for (let id in peerConnections) {
    try {
      const pc = peerConnections[id];
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.transportId === "T01") {
          candidatePairBytes += report.bytesSent || 0;
          reportCount += 1;
          packages += report.packetsSent || 0;
        }
        if (report.type === "outbound-rtp" && !report.isRemote) {
          outboundRtpBytes += report.bytesSent || 0;
        }
        if (report.type === "transport" && report.transportId === "T01") {
          if (report.bytesSent) {
            transportSentBytes += report.bytesSent;
          }
          if (report.bytesReceived) {
            transportReceivedBytes += report.bytesReceived;
          }
        }
        if (report.type === "remote-inbound-rtp") {
          const fractionLostRaw = report.fractionLost || 0;
          const packetLoss = (fractionLostRaw / 256) * 100;
          totalPacketLoss += packetLoss;
          if (report.roundTripTime) {
            totalRoundTripTime += report.roundTripTime;
            rttCount++;
          }
        }
      });
    } catch (e) {
      console.error("Error in getStats for peer", id, e);
    }
  }

  globalStats.candidatePairBytes = candidatePairBytes;
  globalStats.outboundRtpBytes = outboundRtpBytes;
  globalStats.transportSentBytes = transportSentBytes;
  globalStats.transportReceivedBytes = transportReceivedBytes;
  globalStats.reportCount = reportCount;
  globalStats.packages = packages;
  globalStats.avgPacketLoss =
    rttCount > 0 ? (totalPacketLoss / rttCount).toFixed(2) + "%" : "N/A";
  globalStats.avgRtt =
    rttCount > 0 ? (totalRoundTripTime / rttCount).toFixed(2) + " sec" : "N/A";

  const elapsedMs = startTime ? Date.now() - startTime : 0;
  const seconds = Math.floor((elapsedMs / 1000) % 60);
  const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  globalStats.streamingTime = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  const statsDiv = document.getElementById("stats");
  if (statsDiv) {
    // If not broadcasting, show placeholder
    if (!startTime) {
      statsDiv.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600 mb-3">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
            <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
          </svg>
          <p class="text-gray-500 text-center">Statistics will appear when broadcasting</p>
        </div>
      `;
      return;
    }

    // Create color classes based on values
    const packetLossClass =
      globalStats.avgPacketLoss === "N/A"
        ? "text-gray-400"
        : parseFloat(globalStats.avgPacketLoss) < 1
        ? "text-green-500"
        : parseFloat(globalStats.avgPacketLoss) < 5
        ? "text-yellow-500"
        : "text-red-500";

    const rttClass =
      globalStats.avgRtt === "N/A"
        ? "text-gray-400"
        : parseFloat(globalStats.avgRtt) < 0.1
        ? "text-green-500"
        : parseFloat(globalStats.avgRtt) < 0.3
        ? "text-yellow-500"
        : "text-red-500";

    statsDiv.innerHTML = `
      <div class="p-4 text-white">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-purple-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
              <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
            </svg>
            Stream Statistics
          </h3>
          <div class="bg-purple-900 text-purple-300 text-xs px-3 py-1 rounded-full flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${globalStats.streamingTime}
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Connection Stats -->
          <div class="bg-gray-800 border border-purple-700 rounded-lg p-4">
            <h4 class="text-purple-400 font-medium mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Connection Metrics
            </h4>
            
            <div class="space-y-2">
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                  Active Players
                </span>
                <span class="font-bold text-white">${
                  globalStats.connectedPeers
                }</span>
              </div>
              
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                  Packet Loss
                </span>
                <span class="font-bold ${packetLossClass}">${
      globalStats.avgPacketLoss
    }</span>
              </div>
              
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Round Trip Time
                </span>
                <span class="font-bold ${rttClass}">${globalStats.avgRtt}</span>
              </div>
              
              <div class="flex justify-between items-center">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  Report Count
                </span>
                <span class="font-bold text-white">${
                  globalStats.reportCount
                }</span>
              </div>
            </div>
          </div>
          
          <!-- Data Transfer Stats -->
          <div class="bg-gray-800 border border-purple-700 rounded-lg p-4">
            <h4 class="text-purple-400 font-medium mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
              Data Transfer
            </h4>
            
            <div class="space-y-2">
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                  Candidate Pair Sent
                </span>
                <span class="font-bold text-white">${(
                  globalStats.candidatePairBytes /
                  (1024 * 1024)
                ).toFixed(2)} MB</span>
              </div>
              
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                  </svg>
                  Outbound RTP Sent
                </span>
                <span class="font-bold text-white">${(
                  globalStats.outboundRtpBytes /
                  (1024 * 1024)
                ).toFixed(2)} MB</span>
              </div>
              
              <div class="flex justify-between items-center border-b border-gray-700 pb-2">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                  </svg>
                  Transport Bytes
                </span>
                <span class="font-bold text-white">
                  <span class="text-green-400">${(
                    globalStats.transportSentBytes /
                    (1024 * 1024)
                  ).toFixed(2)} MB</span> / 
                  <span class="text-blue-400">${(
                    globalStats.transportReceivedBytes /
                    (1024 * 1024)
                  ).toFixed(2)} MB</span>
                </span>
              </div>
              
              <div class="flex justify-between items-center">
                <span class="text-gray-300 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-500">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                  Packets Sent
                </span>
                <span class="font-bold text-white">${globalStats.packages.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Performance Indicator -->
        <div class="mt-4 bg-gray-800 border border-purple-700 rounded-lg p-3 flex items-center justify-between">
          <div class="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2 text-purple-400">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            <span class="text-gray-300">Stream Performance</span>
          </div>
          
          <div class="flex items-center">
            ${getPerformanceIndicator(
              globalStats.avgPacketLoss,
              globalStats.avgRtt
            )}
          </div>
        </div>
      </div>
    `;
  }
}, 1000);

// Helper function to generate performance indicator
function getPerformanceIndicator(packetLoss, rtt) {
  // Default to unknown if values are N/A
  if (packetLoss === "N/A" || rtt === "N/A") {
    return `<span class="text-gray-400 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      Unknown
    </span>`;
  }

  // Parse values
  const packetLossValue = parseFloat(packetLoss);
  const rttValue = parseFloat(rtt);

  // Determine performance level
  if (packetLossValue < 1 && rttValue < 0.1) {
    return `<span class="text-green-500 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      Excellent
    </span>`;
  } else if (packetLossValue < 3 && rttValue < 0.2) {
    return `<span class="text-green-400 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Good
    </span>`;
  } else if (packetLossValue < 5 && rttValue < 0.3) {
    return `<span class="text-yellow-500 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      Fair
    </span>`;
  } else {
    return `<span class="text-red-500 flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      Poor
    </span>`;
  }
}

let broadcastStream = null;

async function startBroadcast() {
  try {
    await getStream();
    broadcastStream = window.stream;

    const newVideoTrack = broadcastStream.getVideoTracks()[0];
    Object.keys(peerConnections).forEach((id) => {
      const sender = videoSenders[id];
      if (sender) {
        sender.replaceTrack(newVideoTrack);
      }
    });
    videoElement.classList.remove("hidden");
    changeBtn.classList.remove("hidden");

    toggleBtn.textContent = "End Broadcast";
  } catch (err) {
    toggleBtn.textContent = "Start Broadcast";
    changeBtn.classList.add("hidden");
    videoElement.classList.add("hidden");
    console.error("Error starting broadcast:", err);
  }
}

function stopBroadcast() {
  if (broadcastStream) {
    broadcastStream.getTracks().forEach((track) => track.stop());
    broadcastStream = null;
    videoElement.srcObject = null;

    videoElement.classList.add("hidden");
    changeBtn.classList.add("hidden");
    toggleBtn.textContent = "Start Broadcast";

    Object.keys(peerConnections).forEach((peerId) => {
      if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        socket.emit("admin-disconnect", peerId);
        delete peerConnections[peerId];
      }
    });
    startTime = null;
  }
}

toggleBtn.addEventListener("click", async () => {
  if (!broadcastStream) {
    await startBroadcast();
  } else {
    stopBroadcast();
  }
});

changeBtn.addEventListener("click", async () => {
  if (broadcastStream) {
    try {
      await getStream();
      broadcastStream = window.stream;
      videoElement.srcObject = broadcastStream;
      const newVideoTrack = broadcastStream.getVideoTracks()[0];
      Object.keys(peerConnections).forEach((id) => {
        const sender = videoSenders[id];
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      });
      console.log("Video source changed.");
    } catch (err) {
      console.error("Error changing video source:", err);
    }
  }
});

socket.on("selectQuality", ({ peerId, quality }) => {
  const qualityConfig = {
    72030: {
      maxBitrate: 3000000,
      maxFramerate: 30,
      width: 1280,
      height: 720,
    },
    72060: {
      maxBitrate: 6000000,
      maxFramerate: 60,
      width: 1280,
      height: 720,
    },
    108030: {
      maxBitrate: 8000000,
      maxFramerate: 30,
      width: 1920,
      height: 1080,
    },
    108060: {
      maxBitrate: 12000000,
      maxFramerate: 60,
      width: 1920,
      height: 1080,
    },
    // 144060: {
    //   maxBitrate: 20000000,
    //   maxFramerate: 60,
    //   width: 2560,
    //   height: 1440,
    // },
    // 216060: {
    //   maxBitrate: 50000000,
    //   maxFramerate: 60,
    //   width: 3840,
    //   height: 2160,
    // },
  };

  // Actualizar parámetros de codificación del peer seleccionado
  const videoSender = videoSenders[peerId];
  if (videoSender) {
    const params = videoSender.getParameters();
    if (!params.encodings) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = qualityConfig[quality].maxBitrate;
    params.degradationPreference = "balanced";
    params.encodings[0].maxFramerate = qualityConfig[quality].maxFramerate;

    videoSender
      .setParameters(params)
      .then(() => {
        console.log("Encoding parameters updated for peer", peerId);

        // Actualizar la resolución solo para el peer seleccionado:
        if (broadcastStream) {
          const originalTrack = broadcastStream.getVideoTracks()[0];
          // Clonar el track para aplicar restricciones de forma individual
          const clonedTrack = originalTrack.clone();
          clonedTrack
            .applyConstraints({
              width: {
                ideal: qualityConfig[quality].width,
              },
              height: {
                ideal: qualityConfig[quality].height,
              },
              frameRate: {
                exact: qualityConfig[quality].maxFramerate,
                max: qualityConfig[quality].maxFramerate,
              },
            })
            .then(() => {
              videoSender.replaceTrack(clonedTrack);
              console.log(
                "Peer",
                peerId,
                "video track replaced with updated resolution"
              );
            })
            .catch((err) => {
              console.error("Error applying constraints to cloned track:", err);
            });
        }
      })
      .catch((err) => {
        console.error("Error updating encoding parameters:", err);
      });
  }
});

// ---------------------------
// Sección para mostrar votación de juegos (JUEGO SOLICITADO)
// ---------------------------
let gameVotes = {};

// Función para actualizar la visualización de la votación
function updateGameVoteDisplay() {
  let html = "";
  // Ordenar las votaciones de mayor a menor
  const sortedVotes = Object.keys(gameVotes).sort(
    (a, b) => gameVotes[b] - gameVotes[a]
  );
  if (sortedVotes.length === 0) {
    html += `<div class="text-gray-500 text-center">No votes received yet</div>`;
  } else {
    sortedVotes.forEach((game) => {
      html += `
        <div class="flex items-center justify-between bg-gray-800 border border-purple-700 rounded-md p-3 mb-2 shadow-md">
          <span class="text-white font-semibold">${game}</span>
          <span class="bg-purple-600 text-white font-bold px-3 py-1 rounded-full">${gameVotes[game]} vote(s)</span>
        </div>
      `;
    });
  }
  const container = document.getElementById("gameVoteCard");
  if (container) {
    container.innerHTML = html;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const clearVotesBtn = document.getElementById("clearVotesBtn");
  if (clearVotesBtn) {
    clearVotesBtn.addEventListener("click", () => {
      gameVotes = {}; // Limpiar las votaciones
      updateGameVoteDisplay();
    });
  }
});

// Escuchar el evento gameVote para recibir los votos del watch y actualizar el conteo
socket.on("gameVote", (gameTitle) => {
  gameVotes[gameTitle] = (gameVotes[gameTitle] || 0) + 1;
  updateGameVoteDisplay();
});

document.addEventListener("DOMContentLoaded", () => {
  const broadcastChatInput = document.getElementById("broadcastChatInput");
  const broadcastChatMessages = document.getElementById(
    "broadcastChatMessages"
  );

  // Enviar mensaje de chat al pulsar Enter
  broadcastChatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && broadcastChatInput.value.trim() !== "") {
      const msgData = {
        nick: "Admin/Host",
        message: broadcastChatInput.value.trim(),
      };
      socket.emit("chatMessage", msgData);
      broadcastChatInput.value = "";
    }
  });

  // Recibir y mostrar mensajes de chat
  socket.on("chatMessage", (data) => {
    const msgDiv = document.createElement("div");
    msgDiv.className =
      "p-2 rounded-lg bg-gray-800 shadow-sm mb-2 transition-colors duration-150 hover:bg-gray-700";
    const nickClass =
      data.nick === "Admin/Host" ? "text-purple-300" : "text-green-300";
    msgDiv.innerHTML = `<span class="font-semibold ${nickClass}">${data.nick}:</span> <span class="text-gray-200">${data.message}</span>`;
    broadcastChatMessages.appendChild(msgDiv);
    broadcastChatMessages.scrollTop = broadcastChatMessages.scrollHeight;
  });
});
