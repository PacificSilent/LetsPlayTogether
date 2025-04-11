let peerConnection;
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

// Se añaden opciones para reconexión automática
const socket = io.connect(window.location.origin, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 3000,
});

socket.on("reconnect_attempt", (attempt) => {
  console.log(`Reconnection attempt #${attempt}`);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
});

const video = document.getElementById("video");
const modal = document.getElementById("modal");

socket.on("offer", (id, description) => {
  peerConnection = new RTCPeerConnection(config);

  // Log adicional para el ciclo de vida de la conexión WebRTC
  peerConnection.onconnectionstatechange = () => {
    console.log(
      "WebRTC connection state changed to:",
      peerConnection.connectionState
    );
    if (
      peerConnection.connectionState === "disconnected" ||
      peerConnection.connectionState === "failed"
    ) {
      console.warn(
        `WebRTC connection ${peerConnection.connectionState}. Se ha detectado fallo en la sesión. Reintentando conexión...`
      );
      // Se pueden agregar logs adicionales aquí, por ejemplo, capturar el estado ICE
      console.log("ICE connection state:", peerConnection.iceConnectionState);
      peerConnection.close();
      peerConnection = null;
      socket.emit("watcher");
    }
  };

  // Además, agrega un listener para cambios en el estado ICE que puede ofrecer más detalles:
  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      "ICE connection state changed to:",
      peerConnection.iceConnectionState
    );
  };

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
  if (data.target === socket.id) {
    socket.emit("admin-pong", { peerId: socket.id, pingStart: data.pingStart });
  }
});

socket.on("disconnectPeer", (peerId) => {
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="bg-gray-900 border-2 border-purple-700 text-white rounded-lg shadow-xl p-8 text-center max-w-md mx-auto">
      <div class="mb-4 flex justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="text-red-500">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path>
        </svg>
      </div>
      <h2 class="text-2xl font-bold text-purple-400 mb-4">Disconnected</h2>
      <p class="text-gray-300 mb-4">You have been disconnected from the session</p>
      <div class="mt-6">
        <a href="/" class="bg-primary hover:bg-accent text-white px-4 py-2 rounded-lg font-medium transition-colors inline-block">
          Return to Home
        </a>
      </div>
    </div>
  `;
  clearApprovalAndClose();
});

function clearApprovalAndClose() {
  document.cookie = "approved=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";

  const gamepadContainer = document.getElementById("virtual-gamepad-container");
  if (gamepadContainer) {
    gamepadContainer.style.display = "none";
  }

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
  const optionsPanel = document.getElementById("options-panel");
  const videoElem = document.getElementById("video");
  const unmuteBtn = document.getElementById("unmute-video");
  const toggleStatsButton = document.getElementById("toggle-stats");

  let statsOverlay = document.getElementById("client-stats");
  if (!statsOverlay) {
    statsOverlay = document.createElement("div");
    statsOverlay.id = "client-stats";
    statsOverlay.style.position = "fixed";
    statsOverlay.style.top = "80px";
    statsOverlay.style.left = "10px";
    statsOverlay.style.background = "rgba(17, 24, 39, 0.9)";
    statsOverlay.style.color = "#fff";
    statsOverlay.style.padding = "15px";
    statsOverlay.style.borderRadius = "8px";
    statsOverlay.style.zIndex = "50";
    statsOverlay.style.fontSize = "12px";
    statsOverlay.style.display = "none";
    statsOverlay.style.border = "1px solid rgb(147, 51, 234)";
    statsOverlay.style.backdropFilter = "blur(5px)";
    statsOverlay.style.boxShadow =
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
    document.body.appendChild(statsOverlay);
  }

  document.addEventListener("click", (e) => {
    if (!optionsPanel.contains(e.target)) {
      const gamepadContainer = document.getElementById(
        "virtual-gamepad-container"
      );
      const isGamepadHidden =
        !gamepadContainer ||
        gamepadContainer.style.display === "none" ||
        gamepadContainer.style.display === "";
      if (isGamepadHidden && video.srcObject) {
        optionsPanel.classList.toggle("hidden");
      }
    }
  });

  if (unmuteBtn) {
    unmuteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      videoElem.muted = !videoElem.muted;
      const spanText = unmuteBtn.querySelector("span");
      const iconElem = unmuteBtn.querySelector("i");
      if (spanText) {
        spanText.textContent = videoElem.muted ? "Unmute" : "Mute";
        // Cambiar el icono también
        if (iconElem) {
          iconElem.className = videoElem.muted
            ? "fa-solid fa-volume-high"
            : "fa-solid fa-volume-xmark";
        }
      }
    });
  }

  if (toggleStatsButton) {
    toggleStatsButton.addEventListener("click", () => {
      const spanText = toggleStatsButton.querySelector("span");
      if (statsOverlay.style.display === "none") {
        statsOverlay.style.display = "block";
        if (spanText) spanText.textContent = "Hide Stats";
      } else {
        statsOverlay.style.display = "none";
        if (spanText) spanText.textContent = "Show Stats";
      }
    });
  }

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

      // Calcular decodeTime antes de usarlo en el template
      const decodeTime = performance.now() - decodeStart;

      statsOverlay.innerHTML = `
        <div class="space-y-2">
          <h3 class="font-bold text-purple-400 border-b border-purple-700 pb-1 mb-2">Stream Statistics</h3>
          <p class="flex justify-between"><span class="text-gray-400">FPS:</span> <span class="font-medium">${
            framesPerSecond || 0
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Packet Loss:</span> <span class="font-medium">${
            packetsLost || 0
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Jitter:</span> <span class="font-medium">${
            jitter || 0
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Resolution:</span> <span class="font-medium">${
            width || 0
          } x ${height || 0}</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Latency (RTT):</span> <span class="font-medium">${
            rtt || 0
          } ms</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Bytes Received:</span> <span class="font-medium">${
            (totalInboundBytes / (1024 * 1024)).toFixed(2) || 0
          } MB</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Video Codec:</span> <span class="font-medium">${
            videoCodec || "N/A"
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Audio Codec:</span> <span class="font-medium">${
            audioCodec || "N/A"
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Audio Sample Rate:</span> <span class="font-medium">${
            audioSampleRate || 0
          }</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Bitrate:</span> <span class="font-medium">${
            (currentBitrate / 1000).toFixed(2) || 0
          } kbps</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Streaming:</span> <span class="font-medium">${formatTime(
            elapsedStreamSec
          )}</span></p>
          <p class="flex justify-between"><span class="text-gray-400">Decode Time:</span> <span class="font-medium">${decodeTime.toFixed(
            2
          )} ms</span></p>
        </div>
      `;
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }

  setInterval(updateClientStats, 300);

  const maxJoysticks = 4;
  const joystickMapping = {};
  const prevValues = {};
  function pollGamepads() {
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
            console.log("Joystick data:", data);

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
          console.error(`Error enabling fullscreen: ${err.message}`);
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
      document.cookie =
        "streamingEntry=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          console.error(`Error exiting fullscreen: ${err.message}`);
        }
      }
      window.history.back();
    });
  }
});

document.getElementById("show-gamepad").addEventListener("click", () => {
  const gamepadContainer = document.getElementById("virtual-gamepad-container");
  if (
    gamepadContainer &&
    (gamepadContainer.style.display === "none" ||
      gamepadContainer.style.display === "")
  ) {
    gamepadContainer.style.display = "block";
    gamepadContainer.style.pointerEvents = "auto";
    document.getElementById("options-panel").classList.add("hidden");
  }
});
