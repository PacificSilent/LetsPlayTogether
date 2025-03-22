const MAX_RESOLUTION = { width: 1920, height: 1080 };

const peerConnections = {};
const config = {
    iceServers: [
        { "urls": "stun:stun.l.google.com:19302" },
        { urls: "stun:pacificsilent.localto.net:1546" },
        { urls: "turn:pacificsilent.localto.net:1546?transport=tcp", username: "test", credential: "test" },
    ]
};

const socket = io.connect(window.location.origin);

socket.on("answer", (id, description) => {
    peerConnections[id].setRemoteDescription(description);
});

socket.on("watcher", id => {
    const peerConnection = new RTCPeerConnection(config);
    peerConnections[id] = peerConnection;

    let stream = videoElement.srcObject;
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("candidate", id, event.candidate);
        }
    };

    peerConnection
        .createOffer()
        .then(sdp => peerConnection.setLocalDescription(sdp))
        .then(() => {
            socket.emit("offer", id, peerConnection.localDescription);
        });
});

socket.on("candidate", (id, candidate) => {
    peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("disconnectPeer", id => {
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    delete joystickDataByPeer[id];
});

// -------------------------
// Recibe datos de joysticks y almacena los identificadores por peer
const joystickDataByPeer = {}; // { peerId: [joystickId, ...] }
socket.on("joystick-data", data => {
    // Se asume que data.id tiene el formato "peerId-<numero>"
    const parts = data.id.split('-');
    const peerId = parts[0];
    if (!joystickDataByPeer[peerId]) {
        joystickDataByPeer[peerId] = [];
    }
    if (!joystickDataByPeer[peerId].includes(data.id)) {
        joystickDataByPeer[peerId].push(data.id);
    }
});

// -------------------------
// Administración de Peers (ping/pong y desconexión)
const peerLatencies = {};

socket.on("admin-pong", data => {
    console.log("Broadcast: Recibido admin-pong:", data);
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
    Object.keys(peerConnections).forEach(peerId => {
        const li = document.createElement("li");
        const latency = peerLatencies[peerId] !== undefined ? peerLatencies[peerId] + "ms" : "N/A";
        li.innerHTML = `<span>${peerId} - Latencia: ${latency}</span>
            <button onclick="disconnectPeer('${peerId}')" class="bg-red-500 text-white px-2 ml-2 rounded">Desconectar</button>`;
        peersUl.appendChild(li);
    });
}

setInterval(() => {
    Object.keys(peerConnections).forEach(peerId => {
        console.log("Broadcast: Enviando ping a", peerId);
        sendAdminPing(peerId);
    });
    updatePeerList();
}, 5000);

// -------------------------
// Manejo del streaming
window.onunload = window.onbeforeunload = () => {
    socket.close();
};

const videoElement = document.querySelector("video");
let startTime = null;

getStream().then(getDevices);

function getDevices() {
    return navigator.mediaDevices.enumerateDevices();
}

function getStream() {
    if (window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    return getScreen()
        .then(gotStream)
        .catch(handleError);
}

function getScreen() {
    return navigator.mediaDevices.getDisplayMedia({
        video: {
            frameRate: { ideal: 60, max: 60 },
            width: { ideal: MAX_RESOLUTION.width, max: MAX_RESOLUTION.width },
            height: { ideal: MAX_RESOLUTION.height, max: MAX_RESOLUTION.height }
        },
        audio: {
            noiseSuppression: false,
            autoGainControl: false,
            echoCancellation: false
        }
    });
}

function gotStream(stream) {
    window.stream = stream;
    videoElement.srcObject = stream;
    startTime = Date.now(); // Marcar inicio del streaming
    socket.emit("broadcaster");
}

function handleError(error) {
    console.error("Error: ", error);
}

// -------------------------
// Estadísticas Globales (globalStats)
const globalStats = {
    connectedPeers: 0,
    totalJoysticks: 0,
    candidatePairBytes: 0,
    outboundRtpBytes: 0,
    transportSentBytes: 0,
    transportReceivedBytes: 0,
    reportCount: 0,
    packages: 0,
    mbSent: "0.00",
    avgPacketLoss: "N/A",
    avgRtt: "N/A",
    streamingTime: "00:00:00"
};

setInterval(async () => {
  // 1. Número de peers conectados
  globalStats.connectedPeers = Object.keys(peerConnections).length;

  // 2. Número total de joysticks conectados
  let totalJoysticks = 0;
  for (let peer in joystickDataByPeer) {
      totalJoysticks += joystickDataByPeer[peer].length;
  }
  globalStats.totalJoysticks = totalJoysticks;

  // 3. Acumulación de métricas de cada peerConnection
  let totalBytes = 0;
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
          stats.forEach(report => {
              if (report.type === "candidate-pair" && report.transportId === "T01") {
                  candidatePairBytes += report.bytesSent || 0;
                  reportCount += 1;
                  packages += report.packetsSent || 0;
              }
              if (report.type === "outbound-rtp" && !report.isRemote) {
                  outboundRtpBytes += report.bytesSent || 0;
                  totalBytes += report.bytesSent || 0;
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
          console.error("Error en getStats para peer ", id, e);
      }
  }

  globalStats.candidatePairBytes = candidatePairBytes;
  globalStats.outboundRtpBytes = outboundRtpBytes;
  globalStats.transportSentBytes = transportSentBytes;
  globalStats.transportReceivedBytes = transportReceivedBytes;
  globalStats.reportCount = reportCount;
  globalStats.packages = packages;
  globalStats.avgPacketLoss = rttCount > 0 ? (totalPacketLoss / rttCount).toFixed(2) + "%" : "N/A";
  globalStats.avgRtt = rttCount > 0 ? (totalRoundTripTime / rttCount).toFixed(2) + " sec" : "N/A";

  // 4. Tiempo de streaming
  const elapsedMs = startTime ? (Date.now() - startTime) : 0;
  const seconds = Math.floor((elapsedMs / 1000) % 60);
  const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
  globalStats.streamingTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Actualizar UI de estadísticas con títulos descriptivos y conversión de bytes a MB.
  const statsDiv = document.getElementById("stats");
  if (statsDiv) {
      statsDiv.innerHTML = `
      <p>Peering Activo: ${globalStats.connectedPeers}</p>
      <p>Joysticks Conectados: ${globalStats.totalJoysticks}</p>
      <p>Candidate Pair Enviado: ${(globalStats.candidatePairBytes/(1024*1024)).toFixed(2)} MB</p>
      <p>Outbound RTP Enviado: ${(globalStats.outboundRtpBytes/(1024*1024)).toFixed(2)} MB</p>
      <p>Bytes Enviados (Transport): ${(globalStats.transportSentBytes/(1024*1024)).toFixed(2)} MB</p>
      <p>Bytes Recibidos (Transport): ${(globalStats.transportReceivedBytes/(1024*1024)).toFixed(2)} MB</p>
      <p>Cantidad de Reportes: ${globalStats.reportCount}</p>
      <p>Paquetes Enviados: ${globalStats.packages}</p>
      <p>Promedio de Pérdida de Paquetes: ${globalStats.avgPacketLoss}</p>
      <p>Promedio de RTT: ${globalStats.avgRtt}</p>
      <p>Tiempo de Streaming: ${globalStats.streamingTime}</p>
    `;
  }
}, 1000);