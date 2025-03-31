const videoSenders = {};
const peerConnections = {};
const joystickDataByPeer = {}; // Información de joysticks por peer
const peerLatencies = {}; // Latencias de cada peer

// Obtener el elemento de video desde el DOM
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

// Identificarse como broadcaster para recibir solicitudes
socket.emit("broadcasterJoin");

// Escuchar las solicitudes de conexión entrantes
socket.on("newPeerRequest", (data) => {
  const peerList = document.getElementById("peerList");
  const li = document.createElement("li");
  li.id = data.peerId;
  li.innerHTML = `
    <div class="flex items-center justify-between bg-gray-800 rounded-lg p-4 mb-2">
      <span class="font-bold text-primary text-lg">${data.nick}</span>
      <div>
        <button onclick="handlePeer('${data.peerId}', true)" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded mr-2">
          Aprobar
        </button>
        <button onclick="handlePeer('${data.peerId}', false)" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded">
          Rechazar
        </button>
      </div>
    </div>
  `;
  peerList.appendChild(li);
});

window.handlePeer = function (peerId, approved) {
  socket.emit("handlePeerRequest", { peerId, approved });
  // Eliminar la solicitud procesada de la lista
  const li = document.getElementById(peerId);
  if (li) li.remove();
};

// Manejo de mensajes de socket
socket.on("answer", (id, description) => {
  peerConnections[id].setRemoteDescription(description);
});

socket.on("watcher", (id) => {
  const peerConnection = new RTCPeerConnection(config);
  peerConnections[id] = peerConnection;

  let stream = videoElement.srcObject;
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  // Configuración de parámetros de codificación para la pista de video
  const videoSender = peerConnection
    .getSenders()
    .find((sender) => sender.track && sender.track.kind === "video");
  if (videoSender) {
    videoSenders[id] = videoSender;
    const params = videoSender.getParameters();
    if (!params.encodings) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 150000000; // 150 Mbps
    params.encodings[0].maxFramerate = 60;
    params.encodings[0].networkPriority = "high";
    params.encodings[0].priority = "high";
    params.degradationPreference = "maintain-framerate";
    videoSender
      .setParameters(params)
      .then(() => {
        console.log("Parámetros de codificación actualizados para peer", id);
      })
      .catch((err) => {
        console.error("Error al actualizar los parámetros:", err);
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
  // Almacena la información del joystick para este peer.
  // Esto indicará que el peer tiene al menos un joystick conectado.
  joystickDataByPeer[peerId] = data;
});

// Administración de peers: ping/pong y desconexión
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
    li.innerHTML = `<span>${peerId} - Latencia: ${latency}</span>
            <button onclick="disconnectPeer('${peerId}')" class="bg-red-500 text-white px-2 ml-2 rounded">Desconectar</button>`;
    peersUl.appendChild(li);
  });
}

setInterval(() => {
  Object.keys(peerConnections).forEach((peerId) => {
    sendAdminPing(peerId);
  });
  updatePeerList();
}, 5000);

// Manejo del streaming y obtención de dispositivos
window.onunload = window.onbeforeunload = () => {
  // Al cerrar la ventana, si hay transmisión activa se cierra la misma
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
  // Agregar manejadores de error a los tracks
  attachTrackErrorHandlers(stream);
  startTime = Date.now(); // Marcar inicio del streaming
  socket.emit("broadcaster");
  return stream;
}

function handleError(error) {
  console.error("Error: ", error);
}

// Función para adjuntar manejadores de error a cada video track
function attachTrackErrorHandlers(stream) {
  stream.getVideoTracks().forEach((track) => {
    track.onended = () => {
      console.error("El track de video finalizó. Reiniciando transmisión...");
      fallbackBroadcast();
    };
    track.onerror = (err) => {
      console.error("Error en el track de video:", err);
      fallbackBroadcast();
    };
  });
}

// Función de fallback que intenta obtener una transmisión de menor calidad
function fallbackBroadcast() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => track.stop());
  }
  // Puedes notificar al usuario que se está intentando un fallback.
  console.log("Intentando transmisión de baja calidad como fallback...");
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
      // Actualizar la pista en cada conexión existente
      const newVideoTrack = fallbackStream.getVideoTracks()[0];
      Object.keys(peerConnections).forEach((id) => {
        const sender = videoSenders[id];
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      });
      // Agregar los manejadores de error al nuevo stream
      attachTrackErrorHandlers(fallbackStream);
      console.log("Fallback de baja calidad iniciado.");
    })
    .catch((err) => {
      console.error("Error al iniciar el fallback:", err);
    });
}

// Estadísticas Globales (globalStats)
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
  // Acumulación de métricas globales
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
      console.error("Error en getStats para peer", id, e);
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

  // Tiempo de streaming
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
    <p class="font-bold text-lg mb-4 text-center">Estadísticas Globales</p>
    <div class="grid grid-cols-1 gap-2 text-sm">
      <p class="border-b border-gray-600 pb-1">Peering Activo: ${
        globalStats.connectedPeers
      }</p>
      <p class="border-b border-gray-600 pb-1">Candidate Pair Enviado: ${(
        globalStats.candidatePairBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Outbound RTP Enviado: ${(
        globalStats.outboundRtpBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Bytes Enviados (Transport): ${(
        globalStats.transportSentBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Bytes Recibidos (Transport): ${(
        globalStats.transportReceivedBytes /
        (1024 * 1024)
      ).toFixed(2)} MB</p>
      <p class="border-b border-gray-600 pb-1">Cantidad de Reportes: ${
        globalStats.reportCount
      }</p>
      <p class="border-b border-gray-600 pb-1">Paquetes Enviados: ${
        globalStats.packages
      }</p>
      <p class="border-b border-gray-600 pb-1">Promedio de Pérdida de Paquetes: ${
        globalStats.avgPacketLoss
      }</p>
      <p class="border-b border-gray-600 pb-1">Promedio de RTT: ${
        globalStats.avgRtt
      }</p>
      <p class="mt-2">Tiempo de Streaming: ${globalStats.streamingTime}</p>
    </div>
  </div>
`;
  }
}, 1000);

// Manejo de transmisión

let broadcastStream = null;

async function startBroadcast() {
  try {
    await getStream();
    broadcastStream = window.stream;

    // Reemplazar la pista de video en cada conexión existente
    const newVideoTrack = broadcastStream.getVideoTracks()[0];
    Object.keys(peerConnections).forEach((id) => {
      const sender = videoSenders[id];
      if (sender) {
        sender.replaceTrack(newVideoTrack);
      }
    });
    videoElement.classList.remove("hidden");
    changeBtn.classList.remove("hidden");

    toggleBtn.textContent = "Terminar Transmisión";
  } catch (err) {
    toggleBtn.textContent = "Iniciar Transmisión";
    changeBtn.classList.add("hidden");
    videoElement.classList.add("hidden");
    console.error("Error al iniciar la transmisión:", err);
  }
}

function stopBroadcast() {
  if (broadcastStream) {
    broadcastStream.getTracks().forEach((track) => track.stop());
    broadcastStream = null;
    videoElement.srcObject = null;

    // Ocultar el video y el botón de cambiar origen
    videoElement.classList.add("hidden");
    changeBtn.classList.add("hidden");
    toggleBtn.textContent = "Iniciar Transmisión";

    // Cerrar todas las conexiones peer y notificar al servidor para desconectar joysticks
    Object.keys(peerConnections).forEach((peerId) => {
      if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        socket.emit("admin-disconnect", peerId);
        delete peerConnections[peerId];
      }
    });
    // Reiniciar el tiempo de streaming
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
      console.log("Origen de video cambiado.");
    } catch (err) {
      console.error("Error al cambiar el origen de video:", err);
    }
  }
});
