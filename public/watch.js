let peerConnection;
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

const socket = io.connect(window.location.origin);
const video = document.getElementById("video");
const modal = document.getElementById("modal");

socket.on("offer", (id, description) => {
  peerConnection = new RTCPeerConnection(config);
  peerConnection
    .setRemoteDescription(description)
    .then(() => peerConnection.createAnswer())
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("answer", id, peerConnection.localDescription);
    });
  peerConnection.ontrack = (event) => {
    video.srcObject = event.streams[0];
    modal.style.display = "none";
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };
});

socket.on("candidate", (id, candidate) => {
  peerConnection
    .addIceCandidate(new RTCIceCandidate(candidate))
    .catch((e) => console.error(e));
});

socket.on("connect", () => {
  socket.emit("watcher");
});

socket.on("broadcaster", () => {
  socket.emit("watcher");
});

socket.on("admin-ping", (data) => {
  // Responder solo si el target coincide con nuestro socket.id
  if (data.target === socket.id) {
    socket.emit("admin-pong", { peerId: socket.id, pingStart: data.pingStart });
  }
});

socket.on("disconnectPeer", (peerId) => {
  modal.style.display = "flex";
  modal.textContent = "Has sido desconectado de la sesión";
  clearApprovalAndClose();
});

function clearApprovalAndClose() {
  document.cookie = "approved=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  if (socket && socket.connected) {
    socket.close();
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  setTimeout(() => {
    window.location.href = "/";
  }, 1500);
}

window.addEventListener("beforeunload", clearApprovalAndClose);
window.addEventListener("unload", clearApprovalAndClose);
window.addEventListener("pagehide", clearApprovalAndClose);

document.addEventListener("DOMContentLoaded", () => {
  // Panel de opciones y control del video
  const optionsPanel = document.getElementById("options-panel");
  const videoElem = document.getElementById("video");
  const unmuteBtn = document.getElementById("unmute-video");
  const toggleStatsButton = document.getElementById("toggle-stats");

  // Creamos (o recuperamos) el contenedor global de estadísticas
  let statsOverlay = document.getElementById("client-stats");
  if (!statsOverlay) {
    statsOverlay = document.createElement("div");
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
  }

  // Toggle del panel de opciones al hacer click en la pantalla
  document.addEventListener("click", (e) => {
    if (!optionsPanel.contains(e.target)) {
      const gamepadContainer = document.getElementById(
        "virtual-gamepad-container"
      );
      // Solo quita el hidden si el gamepad está oculto
      const isGamepadHidden =
        !gamepadContainer ||
        gamepadContainer.style.display === "none" ||
        gamepadContainer.style.display === "";
      if (isGamepadHidden) {
        optionsPanel.classList.toggle("hidden");
      }
    }
  });

  // Toggle de mute/desmute
  if (unmuteBtn) {
    unmuteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      videoElem.muted = !videoElem.muted;
      const spanText = unmuteBtn.querySelector("span");
      // Solo actualizamos el texto del span para no afectar el icono
      if (spanText) {
        spanText.textContent = videoElem.muted ? "Desmutear" : "Mutear";
      }
    });
  }

  // Toggle de estadísticas (usando el botón definido en el HTML)
  if (toggleStatsButton) {
    toggleStatsButton.addEventListener("click", () => {
      const spanText = toggleStatsButton.querySelector("span");
      if (statsOverlay.style.display === "none") {
        statsOverlay.style.display = "block";
        if (spanText) spanText.textContent = "Ocultar Estadísticas";
      } else {
        statsOverlay.style.display = "none";
        if (spanText) spanText.textContent = "Estadísticas";
      }
    });
  }

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
    // Inicia la medición del tiempo de 'decode'
    let decodeStart = performance.now();
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

      statsReport.forEach((report) => {
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
        if (
          report.type === "codec" &&
          report.mimeType &&
          report.mimeType.startsWith("video/")
        ) {
          videoCodec = report.mimeType || videoCodec;
        }
        if (
          report.type === "codec" &&
          report.mimeType &&
          report.mimeType.startsWith("audio/")
        ) {
          audioCodec = report.mimeType;
          audioSampleRate = report.clockRate;
        }
      });

      const now = Date.now();
      const elapsedSec = (now - prevTime) / 1000;
      const currentBitrate =
        elapsedSec > 0 ? ((totalInboundBytes - prevBytes) * 8) / elapsedSec : 0;
      prevBytes = totalInboundBytes;
      prevTime = now;

      joinStats.bytesReceived += totalInboundBytes;
      const elapsedStreamSec = joinStats.start
        ? Math.floor((Date.now() - joinStats.start) / 1000)
        : 0;

      statsOverlay.innerHTML = `
        <p><strong>FPS:</strong> ${framesPerSecond}</p>
        <p><strong>Pérdida de Paquetes:</strong> ${packetsLost}</p>
        <p><strong>Jitter:</strong> ${jitter}</p>
        <p><strong>Resolución:</strong> ${width} x ${height}</p>
        <p><strong>RTT:</strong> ${rtt} ms</p>
        <p><strong>Bytes Recibidos:</strong> ${(
          totalInboundBytes /
          (1024 * 1024)
        ).toFixed(2)} MB</p>
        <p><strong>Video Codec:</strong> ${videoCodec}</p>
        <p><strong>Audio Codec:</strong> ${audioCodec}</p>
        <p><strong>Audio Sample Rate:</strong> ${audioSampleRate}</p>
        <p><strong>Bitrate:</strong> ${(currentBitrate / 1000).toFixed(
          2
        )} kbps</p>
        <p><strong>Streaming:</strong> ${formatTime(elapsedStreamSec)}</p>
      `;

      // Calcula el tiempo de decode y lo agrega a la interfaz
      const decodeTime = performance.now() - decodeStart;
      statsOverlay.innerHTML += `<p><strong>Decode Time:</strong> ${decodeTime.toFixed(
        2
      )} ms</p>`;
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
    // Sólo enviar datos de joystick si el streaming está activo
    if (!video.srcObject || !peerConnection) {
      requestAnimationFrame(pollGamepads);
      return;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let gp of gamepads) {
      if (gp && socket.id) {
        if (!(gp.index in joystickMapping)) {
          if (Object.keys(joystickMapping).length < maxJoysticks) {
            joystickMapping[gp.index] = Object.keys(joystickMapping).length + 1;
          }
        }
        if (gp.index in joystickMapping) {
          const joystickId = socket.id + "-" + joystickMapping[gp.index];
          const newData = {
            axes: gp.axes,
            buttons: gp.buttons.map((button) => button.value),
          };
          if (
            !prevValues[joystickId] ||
            JSON.stringify(prevValues[joystickId]) !== JSON.stringify(newData)
          ) {
            prevValues[joystickId] = newData;
            const data = {
              id: joystickId,
              axes: newData.axes,
              buttons: newData.buttons,
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

document.addEventListener("DOMContentLoaded", () => {
  const fullscreenBtn = document.getElementById("toggle-fullscreen");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.error(`Error al activar pantalla completa: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const exitBtn = document.getElementById("exit-streaming");
  if (exitBtn) {
    exitBtn.addEventListener("click", async () => {
      // Eliminar la cookie (ajusta el nombre si es necesario)
      document.cookie =
        "streamingEntry=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      // Salir de pantalla completa si está activa
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          console.error(`Error al salir de pantalla completa: ${err.message}`);
        }
      }

      // Volver atrás en el historial (o redirigir a otra página)
      window.history.back();
    });
  }
});

document.getElementById("show-gamepad").addEventListener("click", () => {
  const gamepadContainer = document.getElementById("virtual-gamepad-container");
  // Verifica si el gamepad está oculto (display === "none" o sin asignar)
  if (
    gamepadContainer &&
    (gamepadContainer.style.display === "none" ||
      gamepadContainer.style.display === "")
  ) {
    gamepadContainer.style.display = "block";
    gamepadContainer.style.pointerEvents = "auto";
    // Ocultar el panel de opciones
    document.getElementById("options-panel").classList.add("hidden");
  }
});
