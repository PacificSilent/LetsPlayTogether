const videoSenders = {};
const peerConnections = {};
const joystickDataByPeer = {};
const peerLatencies = {};

const videoElement = document.querySelector("video");
const toggleBtn = document.getElementById("toggleBroadcast");
const changeBtn = document.getElementById("changeSource");

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:pacificsilent.localto.net:1546" },
    {
      urls: "turn:pacificsilent.localto.net:1546?transport=tcp",
      username: "test",
      credential: "test",
    },
  ],
};

const socket = io();

socket.emit("broadcasterJoin");

socket.on("newPeerRequest", (data) => {
  const peerList = document.getElementById("peerList");
  const li = document.createElement("li");
  li.id = data.peerId;
  li.innerHTML = `
    <div class="flex items-center justify-between bg-gray-800 rounded-lg p-4 mb-2">
      <span class="font-bold text-primary text-lg">${data.nick}</span>
      <div>
        <button onclick="handlePeer('${data.peerId}', true)" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded mr-2">
          Approve
        </button>
        <button onclick="handlePeer('${data.peerId}', false)" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
          Reject
        </button>
      </div>
    </div>
  `;
  peerList.appendChild(li);
});

window.handlePeer = function (peerId, approved) {
  socket.emit("handlePeerRequest", { peerId, approved });
  const li = document.getElementById(peerId);
  if (li) li.remove();
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
    params.encodings[0].maxBitrate = 50000000;
    params.encodings[0].maxFramerate = 60;
    params.encodings[0].networkPriority = "high";
    params.encodings[0].priority = "high";
    params.degradationPreference = "maintain-framerate";
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
  Object.keys(peerConnections).forEach((peerId) => {
    const li = document.createElement("li");
    const latency =
      peerLatencies[peerId] !== undefined
        ? peerLatencies[peerId] + "ms"
        : "N/A";
    li.innerHTML = `<span>${peerId} - Latency: ${latency}</span>
            <button onclick="disconnectPeer('${peerId}')" class="bg-red-500 text-white px-2 ml-2 rounded">Disconnect</button>`;
    peersUl.appendChild(li);
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
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 60, max: 60 },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
    },
    audio: {
      noiseSuppression: false,
      autoGainControl: false,
      echoCancellation: false,
    },
  });
}

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
      fallbackBroadcast();
    };
    track.onerror = (err) => {
      console.error("Video track error:", err);
      fallbackBroadcast();
    };
  });
}

function fallbackBroadcast() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => track.stop());
  }
  console.log("Attempting lower quality broadcast as fallback...");
  navigator.mediaDevices
    .getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
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
    statsDiv.innerHTML = `
  <div class="bg-gray-800 bg-opacity-70 p-4 rounded-lg text-white w-full max-w-md mx-auto">
    <p class="font-bold text-lg mb-4 text-center">Global Statistics</p>
    <div class="grid grid-cols-1 gap-2 text-sm">
      <p class="border-b border-gray-600 pb-1">Active Peers: ${
        globalStats.connectedPeers
      }</p>
      <p class="border-b border-gray-600 pb-1">Candidate Pair Sent: ${(
        globalStats.candidatePairBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Outbound RTP Sent: ${(
        globalStats.outboundRtpBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Transport Bytes Sent: ${(
        globalStats.transportSentBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Transport Bytes Received: ${(
        globalStats.transportReceivedBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Report Count: ${
        globalStats.reportCount
      }</p>
      <p class="border-b border-gray-600 pb-1">Packets Sent: ${
        globalStats.packages
      }</p>
      <p class="border-b border-gray-600 pb-1">Average Packet Loss: ${
        globalStats.avgPacketLoss
      }</p>
      <p class="border-b border-gray-600 pb-1">Average RTT: ${
        globalStats.avgRtt
      }</p>
      <p class="mt-2">Streaming Time: ${globalStats.streamingTime}</p>
    </div>
  </div>
`;
  }
}, 1000);

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
