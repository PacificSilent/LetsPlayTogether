let peerConnection;
const config = {
  iceServers: [
    { "urls": "stun:stun.l.google.com:19302" },
    { urls: "stun:pacificsilent.localto.net:1546" },
    {
      urls: "turn:pacificsilent.localto.net:1546?transport=tcp",
      username: "test",
      credential: "test",
    },
  ]
};

const socket = io.connect(window.location.origin);
const video = document.querySelector("video");

socket.on("offer", (id, description) => {
  peerConnection = new RTCPeerConnection(config);
  peerConnection
    .setRemoteDescription(description)
    .then(() => peerConnection.createAnswer())
    .then(sdp => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("answer", id, peerConnection.localDescription);
    });
  peerConnection.ontrack = event => {
    video.srcObject = event.streams[0];
  };
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };
});

socket.on("candidate", (id, candidate) => {
  peerConnection
    .addIceCandidate(new RTCIceCandidate(candidate))
    .catch(e => console.error(e));
});

socket.on("connect", () => {
  socket.emit("watcher");
});

socket.on("broadcaster", () => {
  socket.emit("watcher");
});

socket.on("admin-ping", data => {
  // Responder solo si el target coincide con nuestro socket.id
  if (data.target === socket.id) {
    socket.emit("admin-pong", { peerId: socket.id, pingStart: data.pingStart });
  }
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
  if (peerConnection) peerConnection.close();
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(registration => {
        console.log("ServiceWorker registered: ", registration);
      })
      .catch(registrationError => {
        console.log("ServiceWorker registration failed: ", registrationError);
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Panel de opciones y control del video
  const optionsPanel = document.getElementById("options-panel");
  const videoElem = document.getElementById("video");
  const unmuteBtn = document.getElementById("unmute-video");

  // Toggle del panel de opciones al hacer click en la pantalla
  document.addEventListener("click", e => {
    if (!optionsPanel.contains(e.target)) {
      optionsPanel.classList.toggle("hidden");
    }
  });

  // Toggle de mute/desmute
  unmuteBtn.addEventListener("click", e => {
    e.stopPropagation();
    videoElem.muted = !videoElem.muted;
    unmuteBtn.textContent = videoElem.muted ? "Desmutear" : "Mutear";
  });

  // --- Estadísticas del Cliente ---
  // Crear e insertar el botón de toggle de estadísticas en el panel de opciones
  const toggleStatsButton = document.createElement("button");
  toggleStatsButton.id = "toggle-stats";
  toggleStatsButton.textContent = "Mostrar Estadísticas";
  toggleStatsButton.className = "bg-accent px-4 py-2 rounded";
  optionsPanel.appendChild(toggleStatsButton);

  // Crear contenedor flotante para estadísticas (ubicado en esquina superior izquierda)
  const statsOverlay = document.createElement("div");
  statsOverlay.id = "client-stats";
  statsOverlay.style.position = "fixed";
  statsOverlay.style.top = "50px";
  statsOverlay.style.left = "10px";
  statsOverlay.style.background = "rgba(0, 0, 0, 0.7)";
  statsOverlay.style.color = "#fff";
  statsOverlay.style.padding = "10px";
  statsOverlay.style.borderRadius = "5px";
  statsOverlay.style.zIndex = "50";
  statsOverlay.style.fontSize = "12px";
  statsOverlay.style.display = "none";
  document.body.appendChild(statsOverlay);

  // Toggle la visibilidad de la superposición de estadísticas
  toggleStatsButton.addEventListener("click", () => {
    if (statsOverlay.style.display === "none") {
      statsOverlay.style.display = "block";
      toggleStatsButton.textContent = "Ocultar Estadísticas";
    } else {
      statsOverlay.style.display = "none";
      toggleStatsButton.textContent = "Mostrar Estadísticas";
    }
  });

  // Variables para cálculo del bitrate y acumulación de bytes
  let prevBytes = 0;
  let prevTime = Date.now();
  const joinStats = { bytesReceived: 0, start: Date.now() };

  function formatTime(sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  async function updateClientStats() {
    if (!peerConnection) return;
    try {
      const statsReport = await peerConnection.getStats();
      let framesPerSecond = 0;
      let packetsLost = 0;
      let jitter = 0;
      let width = 0;
      let height = 0;
      let rtt = 0;
      let totalInboundBytes = 0;
      let videoCodec = "";
      let audioCodec = "";
      let audioSampleRate = 0;

      statsReport.forEach(report => {
        if (report.type === "inbound-rtp") {
          totalInboundBytes += report.bytesReceived || 0;
          if (report.kind === "video") {
            framesPerSecond = report.framesPerSecond || framesPerSecond;
            packetsLost = report.packetsLost || packetsLost;
            jitter = report.jitter || jitter;
            width = report.frameWidth || width;
            height = report.frameHeight || height;
          }
        }
        if (report.type === "candidate-pair") {
          if (report.currentRoundTripTime) {
            rtt = Math.round(report.currentRoundTripTime * 1000);
          }
        }
        if (report.type === "codec" && report.mimeType && report.mimeType.startsWith("video/")) {
          videoCodec = report.mimeType || videoCodec;
        }
        if (report.type === "codec" && report.mimeType && report.mimeType.startsWith("audio/")) {
          audioCodec = report.mimeType;
          audioSampleRate = report.clockRate;
        }
      });

      const now = Date.now();
      const elapsedSec = (now - prevTime) / 1000;
      const currentBitrate = elapsedSec > 0 ? ((totalInboundBytes - prevBytes) * 8) / elapsedSec : 0;
      prevBytes = totalInboundBytes;
      prevTime = now;

      joinStats.bytesReceived += totalInboundBytes;
      const elapsedStreamSec = joinStats.start ? Math.floor((Date.now() - joinStats.start) / 1000) : 0;

      statsOverlay.innerHTML = `
        <p><strong>FPS:</strong> ${framesPerSecond}</p>
        <p><strong>Pérdida de Paquetes:</strong> ${packetsLost}</p>
        <p><strong>Jitter:</strong> ${jitter}</p>
        <p><strong>Resolución:</strong> ${width} x ${height}</p>
        <p><strong>RTT:</strong> ${rtt} ms</p>
        <p><strong>Bytes Recibidos:</strong> ${(totalInboundBytes / (1024 * 1024)).toFixed(2)} MB</p>
        <p><strong>Video Codec:</strong> ${videoCodec}</p>
        <p><strong>Audio Codec:</strong> ${audioCodec}</p>
        <p><strong>Audio Sample Rate:</strong> ${audioSampleRate}</p>
        <p><strong>Bitrate:</strong> ${(currentBitrate / 1000).toFixed(2)} kbps</p>
        <p><strong>Streaming:</strong> ${formatTime(elapsedStreamSec)}</p>
      `;
    } catch (err) {
      console.error("Error al obtener estadísticas:", err);
    }
  }
  
  setInterval(updateClientStats, 1000);

  // Opcional: envío de datos de gamepad (si se utiliza)
  const maxJoysticks = 4;
  const joystickMapping = {};
  const prevValues = {};
  function pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let gp of gamepads) {
      if (gp) {
        if (!(gp.index in joystickMapping)) {
          if (Object.keys(joystickMapping).length < maxJoysticks) {
            joystickMapping[gp.index] = Object.keys(joystickMapping).length + 1;
          }
        }
        if (gp.index in joystickMapping) {
          const joystickId = socket.id + '-' + joystickMapping[gp.index];
          const newData = {
            axes: gp.axes,
            buttons: gp.buttons.map(button => button.value)
          };
          if (!prevValues[joystickId] || JSON.stringify(prevValues[joystickId]) !== JSON.stringify(newData)) {
            prevValues[joystickId] = newData;
            const data = {
              id: joystickId,
              axes: newData.axes,
              buttons: newData.buttons
            };
            socket.emit("joystick-data", data);
          }
        }
      }
    }
    requestAnimationFrame(pollGamepads);
  }
  pollGamepads();
});