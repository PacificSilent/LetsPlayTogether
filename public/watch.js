// -------------------------
// Configuración y variables globales
// -------------------------
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

const video = document.getElementById("video");
const modal = document.getElementById("modal");

// -------------------------
// Conexión de Socket.IO y manejo de eventos
// -------------------------
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

socket.on("offer", (id, description) => {
  peerConnection = new RTCPeerConnection(config);

  // Monitorizamos el ciclo de vida de la conexión
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
      console.log("ICE connection state:", peerConnection.iceConnectionState);
      peerConnection.close();
      peerConnection = null;
      socket.emit("watcher");
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      "ICE connection state changed to:",
      peerConnection.iceConnectionState
    );
  };

  // Configuración de SDP y envío de respuesta
  peerConnection
    .setRemoteDescription(description)
    .then(() => peerConnection.createAnswer())
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("answer", id, peerConnection.localDescription);
    });

  // Manejo del stream
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

// -------------------------
// Estadísticas del cliente y Gamepad (Código de ejemplo)
// -------------------------
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

  if (unmuteBtn) {
    unmuteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      videoElem.muted = !videoElem.muted;
      const spanText = unmuteBtn.querySelector("span");
      const iconElem = unmuteBtn.querySelector("i");
      if (spanText) {
        spanText.textContent = videoElem.muted ? "Unmute" : "Mute";
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
      const decodeTime = performance.now() - decodeStart;

      statsOverlay.innerHTML = `
        <div class="space-y-2">
          <h3 class="font-bold text-purple-400 border-b border-purple-700 pb-1 mb-2">Stream Statistics</h3>
          <p class="flex justify-between"><span class="text-gray-400">WebRTC FPS:</span> <span class="font-medium">${
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

  // Gamepad polling (si aplica)
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
            socket.emit("joystick-data", data);
          }
        }
      }
    }
    requestAnimationFrame(pollGamepads);
  }
  pollGamepads();
});

// -------------------------
// Botones adicionales y Fullscreen/Exit Stream
// -------------------------
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

  document.getElementById("show-gamepad").addEventListener("click", () => {
    const gamepadContainer = document.getElementById(
      "virtual-gamepad-container"
    );
    const optionsPanel = document.getElementById("options-panel");
    const qualitySelectorContainer = document.getElementById(
      "qualitySelectorContainer"
    );

    if (gamepadContainer) {
      // Si el gamepad NO está visible, se muestra y se ocultan los paneles
      if (
        gamepadContainer.style.display === "none" ||
        gamepadContainer.style.display === ""
      ) {
        gamepadContainer.style.display = "block";
        gamepadContainer.style.pointerEvents = "auto";
        if (optionsPanel) {
          optionsPanel.classList.add("hidden");
        }
        if (qualitySelectorContainer) {
          qualitySelectorContainer.style.display = "none";
        }
      } else {
        // Si el gamepad está visible y se hace clic, se oculta y se asegura que
        // el panel de opciones no se muestre
        gamepadContainer.style.display = "none";
        gamepadContainer.style.pointerEvents = "none";
        if (optionsPanel) {
          optionsPanel.classList.add("hidden");
        }
      }
    }
  });
});

// -------------------------
// Panel de Calidad de Stream y Toggling con Botón de Opciones
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Crear el panel de Calidad de Stream
  const qualitySelectorContainer = document.createElement("div");
  qualitySelectorContainer.id = "qualitySelectorContainer";
  qualitySelectorContainer.className =
    "fixed bottom-3 right-3 z-50 bg-gray-900 border border-purple-700 rounded-lg shadow-lg p-2 max-w-xs";

  // Header del panel
  const header = document.createElement("div");
  header.className = "flex items-center gap-1.5 mb-2";
  header.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
    <span class="text-sm font-bold text-primary">Calidad de Stream</span>
  `;
  qualitySelectorContainer.appendChild(header);

  // Wrapper para el select
  const selectWrapper = document.createElement("div");
  selectWrapper.className = "relative";

  // Crear el select de calidad con los values compatibles con qualityConfig
  const qualitySelector = document.createElement("select");
  qualitySelector.id = "qualitySelector";
  qualitySelector.className =
    "w-full bg-gray-800 text-white border border-purple-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition appearance-none";
  qualitySelector.innerHTML = `
    <option value="72030">Min</option>
    <option value="72060">Low</option>
    <option value="108030">Medium</option>
    <option value="108060">High</option>
  `;

  // <option value="144060">1440p/60</option>
  // <option value="216060">2160p/60</option>

  // Flecha de dropdown
  const dropdownArrow = document.createElement("div");
  dropdownArrow.className =
    "pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-primary";
  dropdownArrow.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 111.414 1.414l-4 4a1 1 01-1.414 0l-4-4a1 1 010-1.414z" clip-rule="evenodd" />
    </svg>
  `;

  selectWrapper.appendChild(qualitySelector);
  selectWrapper.appendChild(dropdownArrow);
  qualitySelectorContainer.appendChild(selectWrapper);

  // Agregar el panel a la página y ocultarlo inicialmente
  document.body.appendChild(qualitySelectorContainer);
  qualitySelectorContainer.style.display = "none";

  // Evento "change" del select de calidad
  qualitySelector.addEventListener("change", (e) => {
    const quality = e.target.value;
    showQualityToast(quality);
    socket.emit("selectQuality", { peerId: socket.id, quality });
    console.log("Calidad seleccionada:", quality);
    qualitySelectorContainer.style.display = "none";
    const optionsPanel = document.getElementById("options-panel");
    if (optionsPanel) {
      optionsPanel.classList.add("hidden");
    }
  });

  // Función para mostrar el toast de calidad
  function showQualityToast(quality) {
    let toastContainer = document.getElementById("quality-toast");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "quality-toast";
      toastContainer.className =
        "fixed top-4 right-4 z-50 transform transition-all duration-500 translate-x-full";
      document.body.appendChild(toastContainer);
    }
    const qualityLabels = {
      72030: "Min",
      72060: "Low",
      108030: "Medium",
      108060: "High",
      // 144060: "1440p/60",
      // 216060: "2160p/60",
    };

    // const qualityLabels = {
    //   72030: "Mínima (720p/30)",
    //   72060: "Baja (720p/60)",
    //   108030: "Media (1080p/30)",
    //   108060: "Alta (1080p/60)",
    //   144060: "1440p/60",
    //   216060: "2160p/60",
    // };
    const toast = document.createElement("div");
    toast.className =
      "bg-gray-900 border border-purple-700 rounded-lg shadow-lg p-3 mb-3 flex items-center";
    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <div>
        <p class="text-white text-sm font-medium">Calidad cambiada</p>
        <p class="text-gray-300 text-xs">${qualityLabels[quality]}</p>
      </div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toastContainer.classList.remove("translate-x-full");
      toastContainer.classList.add("translate-x-0");
    }, 10);
    setTimeout(() => {
      toast.classList.add("opacity-0");
      setTimeout(() => {
        toast.remove();
        if (toastContainer.children.length === 0) {
          toastContainer.classList.add("translate-x-full");
          toastContainer.classList.remove("translate-x-0");
        }
      }, 300);
    }, 3000);
  }
});

// -------------------------
// Toggling de Panel de Opciones y de Calidad mediante Botón de Opciones
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  const optionsPanel = document.getElementById("options-panel");
  const btnOptions = document.getElementById("btn-options");
  const qualitySelectorContainer = document.getElementById(
    "qualitySelectorContainer"
  );

  // Asegurarse de que ambos paneles estén ocultos inicialmente
  if (optionsPanel) {
    optionsPanel.classList.add("hidden");
  }
  if (qualitySelectorContainer) {
    qualitySelectorContainer.style.display = "none";
  }

  btnOptions.addEventListener("click", (e) => {
    // Si el panel de opciones está oculto, lo mostramos y también el panel de calidad.
    // Si está visible, se ocultan ambos.
    if (optionsPanel.classList.contains("hidden")) {
      optionsPanel.classList.remove("hidden");
      qualitySelectorContainer.style.display = "block";
    } else {
      optionsPanel.classList.add("hidden");
      qualitySelectorContainer.style.display = "none";
    }
    e.stopPropagation();
  });
});

// -------------------------
// Agregar botón y modal para votación de juegos
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Obtener el panel de opciones existente (asegúrate de que tenga el id "options-panel")
  const optionsPanel = document.getElementById("options-panel");

  // Crear y agregar el botón "Start Vote" dentro del panel de opciones
  const voteButton = document.createElement("button");
  voteButton.innerHTML = `<i class="fa-solid fa-vote-yea"></i><span> Vote for a Game</span>`;
  voteButton.className =
    "w-full bg-primary hover:bg-accent px-3 py-2 rounded-lg text-sm flex items-center space-x-2 transition-colors";
  if (optionsPanel) {
    optionsPanel.appendChild(voteButton);
  } else {
    // En caso de que no exista el panel, agregamos al body (fallback)
    document.body.appendChild(voteButton);
  }

  voteButton.addEventListener("click", showVoteModal);

  function showVoteToast(gameTitle) {
    let toastContainer = document.getElementById("vote-toast");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "vote-toast";
      // Posicionar en la parte superior central
      toastContainer.style.position = "fixed";
      toastContainer.style.top = "20px";
      toastContainer.style.left = "50%";
      toastContainer.style.transform = "translateX(-50%)";
      toastContainer.style.zIndex = "1200";
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.style.background = "#1f2937";
    toast.style.border = "1px solid #9333ea";
    toast.style.borderRadius = "8px";
    toast.style.padding = "10px 15px";
    toast.style.color = "#fff";
    toast.style.marginTop = "10px";
    toast.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.5s ease";
    toast.innerText = `You voted for: ${gameTitle}`;

    toastContainer.appendChild(toast);

    // Forzar reflow y mostrar toast
    setTimeout(() => {
      toast.style.opacity = "1";
    }, 10);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 3000);
  }

  function showVoteModal() {
    // Crear el overlay del modal
    const modalOverlay = document.createElement("div");
    modalOverlay.id = "voteModalOverlay";
    modalOverlay.style.position = "fixed";
    modalOverlay.style.top = "0";
    modalOverlay.style.left = "0";
    modalOverlay.style.width = "100%";
    modalOverlay.style.height = "100%";
    modalOverlay.style.backgroundColor = "rgba(0,0,0,0.7)";
    modalOverlay.style.display = "flex";
    modalOverlay.style.justifyContent = "center";
    modalOverlay.style.alignItems = "center";
    modalOverlay.style.zIndex = "1100";

    // Crear el contenedor del modal (aumentar el ancho para 4 columnas)
    const modalContent = document.createElement("div");
    modalContent.style.backgroundColor = "#1f2937";
    modalContent.style.padding = "20px";
    modalContent.style.border = "2px solid #9333ea";
    modalContent.style.borderRadius = "8px";
    modalContent.style.width = "600px"; // ancho aumentado para 4 columnas
    modalContent.style.maxHeight = "80%";
    modalContent.style.overflowY = "auto";

    // Agregar título al modal
    const title = document.createElement("h2");
    title.textContent = "Vote for a Game";
    title.style.color = "#9333ea";
    title.style.textAlign = "center";
    title.style.marginBottom = "10px";
    modalContent.appendChild(title);

    // Contenedor para la lista de juegos
    const gamesList = document.createElement("ul");
    gamesList.style.listStyle = "none";
    gamesList.style.padding = "0";
    // Agregar mensaje de loading antes de cargar los datos
    gamesList.innerHTML =
      "<li style='color:#fff; text-align:center;'>Loading games, please wait...</li>";
    modalContent.appendChild(gamesList);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Cerrar modal al hacer clic fuera del contenedor
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });

    // Obtener juegos desde el endpoint /games
    fetch("/games")
      .then((response) => response.json())
      .then((games) => {
        gamesList.innerHTML = "";
        // Usar layout grid de 4 columnas con un espacio entre ítems
        gamesList.style.display = "grid";
        gamesList.style.gridTemplateColumns = "repeat(4, 1fr)";
        gamesList.style.gap = "10px";

        games.forEach((game) => {
          const li = document.createElement("li");
          li.style.display = "flex";
          li.style.flexDirection = "column";
          li.style.alignItems = "center";
          li.style.padding = "12px";
          li.style.background = "#374151";
          li.style.borderRadius = "8px";
          li.style.cursor = "pointer";
          li.style.transition = "background 0.2s ease";

          // Cambiar fondo al pasar el ratón
          li.addEventListener("mouseover", () => {
            li.style.background = "#4b5563";
          });
          li.addEventListener("mouseout", () => {
            li.style.background = "#374151";
          });

          // Crear imagen representativa del juego con mayor tamaño
          const img = document.createElement("img");
          img.src = game.image;
          img.alt = game.title;
          img.style.width = "80px";
          img.style.height = "80px";
          img.style.objectFit = "cover";
          img.style.borderRadius = "8px";
          img.style.marginBottom = "8px";
          li.appendChild(img);

          // Agregar título con mejor presentación
          const span = document.createElement("span");
          span.textContent = game.title;
          span.style.color = "#fff";
          span.style.fontWeight = "bold";
          span.style.textAlign = "center";
          li.appendChild(span);

          li.addEventListener("click", () => {
            // Emitir el voto y cerrar el modal
            socket.emit("gameVote", game.title);
            modalOverlay.remove();
            showVoteToast(game.title);
          });
          gamesList.appendChild(li);
        });
      })
      .catch((error) => {
        gamesList.innerHTML = "<li style='color:red'>Error loading games</li>";
        console.error("Error fetching games:", error);
      });
  }
});

// -------------------------
// Control de Volumen del Video
// -------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Detección mejorada para dispositivos iOS e iPadOS
  function isIOS() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  // Si es iOS o iPadOS, se salta la creación del control de volumen
  if (isIOS()) return;

  const videoElem = document.getElementById("video");
  const optionsPanel = document.getElementById("options-panel");

  // Crear el contenedor del control de volumen
  const volumeContainer = document.createElement("div");
  volumeContainer.className =
    "w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition-colors mt-3";

  // Crear el encabezado con icono y etiqueta
  const volumeHeader = document.createElement("div");
  volumeHeader.className = "flex items-center justify-between mb-2";

  // Etiqueta con icono para el control de volumen
  const volumeLabel = document.createElement("label");
  volumeLabel.setAttribute("for", "volume-slider");
  volumeLabel.className = "text-sm font-medium flex items-center";
  volumeLabel.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072m2.828-9.9a9 9 0 0 1 0 12.728M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
    Volume
  `;

  // Indicador de porcentaje
  const volumePercentage = document.createElement("span");
  volumePercentage.id = "volume-percentage";
  volumePercentage.className = "text-xs font-medium text-primary";
  volumePercentage.textContent = `${Math.round(videoElem.volume * 100)}%`;

  volumeHeader.appendChild(volumeLabel);
  volumeHeader.appendChild(volumePercentage);

  // Contenedor para el slider y la barra de progreso
  const sliderContainer = document.createElement("div");
  sliderContainer.className = "relative h-6 flex items-center";

  // Barra de fondo
  const sliderBackground = document.createElement("div");
  sliderBackground.className = "absolute w-full h-1.5 bg-gray-800 rounded-full";

  // Barra de progreso
  const sliderProgress = document.createElement("div");
  sliderProgress.id = "volume-progress";
  sliderProgress.className =
    "absolute h-1.5 bg-gradient-to-r from-purple-700 to-primary rounded-full";
  sliderProgress.style.width = `${videoElem.volume * 100}%`;

  // Crear el slider de volumen
  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.id = "volume-slider";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.01";
  volumeSlider.value = videoElem.volume;
  volumeSlider.className =
    "absolute w-full appearance-none bg-transparent cursor-pointer z-10";

  // Agregar elementos al contenedor del slider
  sliderContainer.appendChild(sliderBackground);
  sliderContainer.appendChild(sliderProgress);
  sliderContainer.appendChild(volumeSlider);

  // Indicadores de volumen bajo/alto
  const volumeIndicators = document.createElement("div");
  volumeIndicators.className =
    "flex justify-between text-xs text-gray-400 mt-1";
  volumeIndicators.innerHTML = `
    <span>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    </span>
    <span>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072m2.828-9.9a9 9 0 0 1 0 12.728M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    </span>
  `;

  // Al mover el slider se actualiza el volume del video
  volumeSlider.addEventListener("input", (e) => {
    const value = e.target.value;
    videoElem.volume = value;
    sliderProgress.style.width = `${value * 100}%`;
    volumePercentage.textContent = `${Math.round(value * 100)}%`;
    updateVolumeIcon(value);
    console.log("Volumen ajustado a:", value);
  });

  // Función para actualizar el icono según el nivel de volumen
  function updateVolumeIcon(value) {
    const iconContainer = volumeLabel.querySelector("svg");
    if (!iconContainer) return;

    let iconPath = "";

    if (value === "0" || parseFloat(value) === 0) {
      iconPath = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />`;
    } else if (parseFloat(value) < 0.5) {
      iconPath = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072" />`;
    } else {
      iconPath = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072m2.828-9.9a9 9 0 0 1 0 12.728M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />`;
    }

    iconContainer.innerHTML = iconPath;
  }

  // Agregar elementos al contenedor principal
  volumeContainer.appendChild(volumeHeader);
  volumeContainer.appendChild(sliderContainer);
  volumeContainer.appendChild(volumeIndicators);

  // Agregar estilos personalizados para el slider
  const sliderStyles = document.createElement("style");
  sliderStyles.textContent = `
    #volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #9333ea;
      cursor: pointer;
      border: 2px solid #d8b4fe;
      box-shadow: 0 0 5px rgba(147, 51, 234, 0.5);
      transition: all 0.2s ease;
    }
    #volume-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #9333ea;
      cursor: pointer;
      border: 2px solid #d8b4fe;
      box-shadow: 0 0 5px rgba(147, 51, 234, 0.5);
      transition: all 0.2s ease;
    }
    #volume-slider::-webkit-slider-thumb:hover {
      background: #7e22ce;
      transform: scale(1.1);
      box-shadow: 0 0 10px rgba(147, 51, 234, 0.7);
    }
    #volume-slider::-moz-range-thumb:hover {
      background: #7e22ce;
      transform: scale(1.1);
      box-shadow: 0 0 10px rgba(147, 51, 234, 0.7);
    }
    #volume-slider::-webkit-slider-runnable-track,
    #volume-slider::-moz-range-track {
      height: 0px;
      background: transparent;
    }
  `;
  document.head.appendChild(sliderStyles);

  // Agregar el control de volumen al panel de opciones
  if (optionsPanel) {
    optionsPanel.appendChild(volumeContainer);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  const btnOptions = document.getElementById("btn-options");

  function updateOptionsButtonVisibility() {
    // Se mostrará solo si hay video reproduciéndose
    if (video && !video.paused) {
      btnOptions.classList.remove("hidden");
    } else {
      btnOptions.classList.add("hidden");
    }
  }

  // Actualizar al iniciar y ante cambios en el estado del video
  video.addEventListener("play", updateOptionsButtonVisibility);
  video.addEventListener("pause", updateOptionsButtonVisibility);
  updateOptionsButtonVisibility();
});
