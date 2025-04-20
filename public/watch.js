/**
 * Let's Play Together - Client Viewer Module
 * File structure:
 * 1. Configuration and globals
 * 2. WebRTC connection module
 * 3. Socket.IO event handlers
 * 4. UI management module
 * 5. Statistics module
 * 6. Gamepad control module
 * 7. Chat module
 * 8. Quality selection module
 * 9. Initialization and event listeners
 */

// ========================
// 1. CONFIGURATION AND GLOBALS
// ========================
let peerConnection;
const config = {
  iceServers: [
    { urls: "stun:pacificsilent.localto.net:3857" },
    {
      urls: "turn:pacificsilent.localto.net:3857",
      username: "test",
      credential: "test",
    },
  ],
};

// DOM element references
const video = document.getElementById("video");
const modal = document.getElementById("modal");

// Socket connection with reconnection capability
const socket = io.connect(window.location.origin, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 3000,
});

// ========================
// 2. WEBRTC CONNECTION MODULE
// ========================
const webRTCModule = {
  /**
   * Setup WebRTC connection with the broadcaster
   * @param {string} id - Broadcaster ID
   * @param {RTCSessionDescription} description - SDP description
   */
  setupConnection: function (id, description) {
    // Close existing connection if any
    if (peerConnection) {
      peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(config);

    // Monitor connection lifecycle
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
          `WebRTC connection ${peerConnection.connectionState}. Connection failure detected. Attempting to reconnect...`
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

    // Set up SDP and send answer
    peerConnection
      .setRemoteDescription(description)
      .then(() => peerConnection.createAnswer())
      .then((sdp) => peerConnection.setLocalDescription(sdp))
      .then(() => {
        socket.emit("answer", id, peerConnection.localDescription);
      });

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
      video.srcObject = event.streams[0];
      uiModule.hideModal();
    };

    // Send ICE candidates to broadcaster
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", id, event.candidate);
      }
    };
  },

  /**
   * Add ICE candidate received from broadcaster
   * @param {string} id - Broadcaster ID
   * @param {RTCIceCandidate} candidate - ICE candidate
   */
  addCandidate: function (id, candidate) {
    if (peerConnection) {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e) => console.error("Error adding ICE candidate:", e));
    }
  },
};

// ========================
// 3. SOCKET.IO EVENT HANDLERS
// ========================
const socketModule = {
  /**
   * Initialize socket event listeners
   */
  init: function () {
    socket.on("reconnect_attempt", (attempt) => {
      console.log(`Reconnection attempt #${attempt}`);
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
    });

    socket.on("connect", () => {
      socket.emit("watcher");
    });

    socket.on("broadcaster", () => {
      socket.emit("watcher");
    });

    socket.on("offer", (id, description) => {
      webRTCModule.setupConnection(id, description);
    });

    socket.on("candidate", (id, candidate) => {
      webRTCModule.addCandidate(id, candidate);
    });

    socket.on("admin-ping", (data) => {
      const userNick = localStorage.getItem("userNick") || "Anonymous";

      const peerId = data.peerId || socket.id;

      socket.emit("admin-pong", {
        timestamp: data.timestamp,
        peerId: peerId,
        nick: userNick,
      });
    });

    socket.on("disconnectPeer", (peerId) => {
      uiModule.showDisconnectModal();
      sessionManagementModule.clearApprovalAndClose();
    });

    socket.on("chatMessage", (data) => {
      chatModule.displayMessage(data);
    });
  },
};

// ========================
// 4. UI MANAGEMENT MODULE
// ========================
const uiModule = {
  /**
   * Hide the welcome/status modal
   */
  hideModal: function () {
    if (modal) {
      modal.style.display = "none";
    }
  },

  /**
   * Show disconnection modal with message
   */
  showDisconnectModal: function () {
    if (modal) {
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
    }
  },

  /**
   * Toggle visibility of the options panel
   * @param {boolean} show - Whether to show or hide
   */
  toggleOptionsPanel: function (show) {
    const optionsPanel = document.getElementById("options-panel");
    const qualitySelectorContainer = document.getElementById(
      "qualitySelectorContainer"
    );

    if (optionsPanel) {
      if (show) {
        optionsPanel.classList.remove("hidden");
        if (qualitySelectorContainer) {
          qualitySelectorContainer.style.display = "block";
        }
      } else {
        optionsPanel.classList.add("hidden");
        if (qualitySelectorContainer) {
          qualitySelectorContainer.style.display = "none";
        }
      }
    }
  },

  /**
   * Update options button visibility based on video playback
   */
  updateOptionsButtonVisibility: function () {
    const btnOptions = document.getElementById("btn-options");

    // Show only if video is playing
    if (video && !video.paused) {
      btnOptions.classList.remove("hidden");
    } else {
      btnOptions.classList.add("hidden");
    }
  },

  /**
   * Setup UI event handlers
   */
  setupEventHandlers: function () {
    // Options button
    const btnOptions = document.getElementById("btn-options");
    if (btnOptions) {
      btnOptions.addEventListener("click", (e) => {
        const optionsPanel = document.getElementById("options-panel");
        const panelIsHidden = optionsPanel.classList.contains("hidden");
        uiModule.toggleOptionsPanel(panelIsHidden);
        e.stopPropagation();
      });
    }

    // Fullscreen toggle
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

    // Video mute/unmute
    const unmuteBtn = document.getElementById("unmute-video");
    if (unmuteBtn) {
      unmuteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        const spanText = unmuteBtn.querySelector("span");
        const iconElem = unmuteBtn.querySelector("i");
        if (spanText) {
          spanText.textContent = video.muted ? "Unmute" : "Mute";
          if (iconElem) {
            iconElem.className = video.muted
              ? "fa-solid fa-volume-high"
              : "fa-solid fa-volume-xmark";
          }
        }
      });
    }

    // Exit streaming
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

    // Gamepad toggle
    const showGamepadBtn = document.getElementById("show-gamepad");
    if (showGamepadBtn) {
      showGamepadBtn.addEventListener("click", () => {
        const gamepadContainer = document.getElementById(
          "virtual-gamepad-container"
        );

        if (gamepadContainer) {
          const isHidden =
            gamepadContainer.style.display === "none" ||
            gamepadContainer.style.display === "";

          if (isHidden) {
            gamepadContainer.style.display = "block";
            gamepadContainer.style.pointerEvents = "auto";
            uiModule.toggleOptionsPanel(false);
          } else {
            gamepadContainer.style.display = "none";
            gamepadContainer.style.pointerEvents = "none";
            uiModule.toggleOptionsPanel(false);
          }
        }
      });
    }

    // Handle video play/pause events
    video.addEventListener("play", uiModule.updateOptionsButtonVisibility);
    video.addEventListener("pause", uiModule.updateOptionsButtonVisibility);
  },
};

// ========================
// 5. STATISTICS MODULE
// ========================
const statsModule = {
  prevBytes: 0,
  prevTime: Date.now(),
  joinStats: { bytesReceived: 0, start: Date.now() },
  statsOverlay: null,

  /**
   * Initialize statistics module
   */
  init: function () {
    const toggleStatsButton = document.getElementById("toggle-stats");

    // Create stats overlay if it doesn't exist
    this.statsOverlay = document.getElementById("client-stats");
    if (!this.statsOverlay) {
      this.statsOverlay = document.createElement("div");
      this.statsOverlay.id = "client-stats";
      this.statsOverlay.style.position = "fixed";
      this.statsOverlay.style.top = "80px";
      this.statsOverlay.style.left = "10px";
      this.statsOverlay.style.background = "rgba(17, 24, 39, 0.9)";
      this.statsOverlay.style.color = "#fff";
      this.statsOverlay.style.padding = "15px";
      this.statsOverlay.style.borderRadius = "8px";
      this.statsOverlay.style.zIndex = "50";
      this.statsOverlay.style.fontSize = "12px";
      this.statsOverlay.style.display = "none";
      this.statsOverlay.style.border = "1px solid rgb(147, 51, 234)";
      this.statsOverlay.style.backdropFilter = "blur(5px)";
      this.statsOverlay.style.boxShadow =
        "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
      document.body.appendChild(this.statsOverlay);
    }

    // Toggle stats button
    if (toggleStatsButton) {
      toggleStatsButton.addEventListener("click", () => {
        const spanText = toggleStatsButton.querySelector("span");
        if (this.statsOverlay.style.display === "none") {
          this.statsOverlay.style.display = "block";
          if (spanText) spanText.textContent = "Hide Stats";
        } else {
          this.statsOverlay.style.display = "none";
          if (spanText) spanText.textContent = "Show Stats";
        }
      });
    }

    // Start stats update interval
    setInterval(() => this.updateStats(), 300);
  },

  /**
   * Format seconds into HH:MM:SS
   * @param {number} sec - Seconds to format
   * @returns {string} Formatted time string
   */
  formatTime: function (sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  },

  /**
   * Update statistics display
   */
  updateStats: async function () {
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
      const elapsedSec = (now - this.prevTime) / 1000;
      let currentBitrate = 0;

      // Agregar verificación para evitar valores incorrectos
      if (elapsedSec > 0 && totalInboundBytes >= this.prevBytes) {
        currentBitrate =
          ((totalInboundBytes - this.prevBytes) * 8) / elapsedSec;
      } else {
        console.warn("Invalid bitrate calculation data", {
          elapsed: elapsedSec,
          total: totalInboundBytes,
          prev: this.prevBytes,
        });
      }

      this.prevBytes = totalInboundBytes;
      this.prevTime = now;

      this.joinStats.bytesReceived += totalInboundBytes;
      const elapsedStreamSec = this.joinStats.start
        ? Math.floor((Date.now() - this.joinStats.start) / 1000)
        : 0;
      const decodeTime = performance.now() - decodeStart;

      this.statsOverlay.innerHTML = `
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
          <p class="flex justify-between">
            <span class="text-gray-400">Bitrate:</span> 
            <span class="font-medium">${
              currentBitrate === 0
                ? "0.00 kbps"
                : currentBitrate > 1000000
                ? (currentBitrate / 1000000).toFixed(2) + " Mbps"
                : (currentBitrate / 1000).toFixed(2) + " kbps"
            }</span>
          </p>
          <p class="flex justify-between"><span class="text-gray-400">Streaming:</span> <span class="font-medium">${this.formatTime(
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
  },
};

// ========================
// 6. GAMEPAD CONTROL MODULE
// ========================
const gamepadModule = {
  maxJoysticks: 4,
  joystickMapping: {},
  prevValues: {},

  /**
   * Initialize gamepad polling
   */
  init: function () {
    this.poll();
  },

  /**
   * Continuously poll for connected gamepads and send their data
   */
  poll: function () {
    if (!video.srcObject || !peerConnection) {
      requestAnimationFrame(() => this.poll());
      return;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let gp of gamepads) {
      if (gp && socket.id) {
        if (!(gp.index in this.joystickMapping)) {
          if (Object.keys(this.joystickMapping).length < this.maxJoysticks) {
            this.joystickMapping[gp.index] =
              Object.keys(this.joystickMapping).length + 1;
          }
        }

        if (gp.index in this.joystickMapping) {
          const joystickId = socket.id + "-" + this.joystickMapping[gp.index];
          const newData = {
            axes: gp.axes,
            buttons: gp.buttons.map((button) => button.value),
          };

          // Only send if values have changed
          if (
            !this.prevValues[joystickId] ||
            JSON.stringify(this.prevValues[joystickId]) !==
              JSON.stringify(newData)
          ) {
            this.prevValues[joystickId] = newData;
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
    requestAnimationFrame(() => this.poll());
  },
};

// ========================
// 7. CHAT MODULE
// ========================
const chatModule = {
  /**
   * Initialize chat functionality
   */
  init: function () {
    const chatInput = document.getElementById("chatInput");

    // Handle chat input
    if (chatInput) {
      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && chatInput.value.trim() !== "") {
          const msgData = {
            nick: localStorage.getItem("userNick") || "Anonymous",
            message: chatInput.value.trim(),
          };
          socket.emit("chatMessage", msgData);
          chatInput.value = "";
        }
      });
    }

    // Add toggle chat button to options panel
    this.addToggleChatButton();
  },

  /**
   * Display a received message in the chat
   * @param {Object} data - Message data (nick, message)
   */
  displayMessage: function (data) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    const msgDiv = document.createElement("div");
    msgDiv.className =
      "p-2 rounded-lg bg-gray-700 shadow hover:bg-gray-600 transition-all duration-300";
    const nickColor =
      data.nick === "Admin/Host" ? "text-purple-300" : "text-green-300";
    msgDiv.innerHTML = `<strong class="${nickColor}">${data.nick}:</strong>
                        <span class="ml-1 text-gray-100">${data.message}</span>`;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Auto-remove old messages
    setTimeout(() => {
      msgDiv.classList.add("opacity-0", "transition-opacity", "duration-500");
      setTimeout(() => {
        msgDiv.remove();
      }, 500);
    }, 6000);
  },

  /**
   * Add toggle chat button to options panel
   */
  addToggleChatButton: function () {
    const optionsPanel = document.getElementById("options-panel");
    if (!optionsPanel) return;

    const toggleChatBtn = document.createElement("button");
    toggleChatBtn.innerHTML = `<i class="fa-solid fa-comments"></i><span> Hide/Show Chat</span>`;
    toggleChatBtn.className =
      "w-full bg-primary hover:bg-accent px-3 py-2 rounded-lg text-sm flex items-center space-x-2 transition-colors";
    toggleChatBtn.addEventListener("click", () => {
      const textChat = document.getElementById("textChat");
      if (!textChat) return;

      // Toggle visibility
      if (!textChat.style.display || textChat.style.display === "block") {
        textChat.style.display = "none";
      } else {
        textChat.style.display = "block";
      }
    });

    optionsPanel.appendChild(toggleChatBtn);
  },
};

// ========================
// 8. QUALITY SELECTION MODULE
// ========================
const qualityModule = {
  /**
   * Initialize quality selection panel
   */
  init: function () {
    this.createQualitySelector();
  },

  /**
   * Create quality selector panel
   */
  createQualitySelector: function () {
    // Create the quality selector container
    const qualitySelectorContainer = document.createElement("div");
    qualitySelectorContainer.id = "qualitySelectorContainer";
    qualitySelectorContainer.className =
      "fixed bottom-3 right-3 z-50 bg-gray-900 border border-purple-700 rounded-lg shadow-lg p-2 max-w-xs";

    // Header
    const header = document.createElement("div");
    header.className = "flex items-center gap-1.5 mb-2";
    header.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      <span class="text-sm font-bold text-primary">Stream Quality</span>
    `;
    qualitySelectorContainer.appendChild(header);

    // Select wrapper
    const selectWrapper = document.createElement("div");
    selectWrapper.className = "relative";

    // Quality options
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

    // Dropdown arrow
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
    document.body.appendChild(qualitySelectorContainer);
    qualitySelectorContainer.style.display = "none";

    // Change event
    qualitySelector.addEventListener("change", (e) => {
      const quality = e.target.value;
      this.showQualityToast(quality);
      socket.emit("selectQuality", { peerId: socket.id, quality });
      console.log("Quality selected:", quality);
      qualitySelectorContainer.style.display = "none";
      uiModule.toggleOptionsPanel(false);
    });
  },

  /**
   * Show toast notification for quality change
   * @param {string} quality - Selected quality ID
   */
  showQualityToast: function (quality) {
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
    };

    const toast = document.createElement("div");
    toast.className =
      "bg-gray-900 border border-purple-700 rounded-lg shadow-lg p-3 mb-3 flex items-center";
    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <div>
        <p class="text-white text-sm font-medium">Quality changed</p>
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
  },
};

// ========================
// 9. VOLUME CONTROL MODULE
// ========================
const volumeModule = {
  /**
   * Initialize volume control
   */
  init: function () {
    // Skip on iOS devices (they handle audio differently)
    if (this.isIOS()) return;

    const videoElem = document.getElementById("video");
    const optionsPanel = document.getElementById("options-panel");
    if (!videoElem || !optionsPanel) return;

    // Create volume control elements
    const volumeContainer = this.createVolumeContainer(videoElem);
    this.addSliderStyles();

    // Add to options panel
    if (optionsPanel) {
      optionsPanel.appendChild(volumeContainer);
    }
  },

  /**
   * Check if device is iOS
   * @returns {boolean} True if iOS device
   */
  isIOS: function () {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  },

  /**
   * Create volume container with slider
   * @param {HTMLVideoElement} videoElem - Video element to control
   * @returns {HTMLElement} Volume container
   */
  createVolumeContainer: function (videoElem) {
    const volumeContainer = document.createElement("div");
    volumeContainer.className =
      "w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md transition-colors mt-3";

    // Header
    const volumeHeader = document.createElement("div");
    volumeHeader.className = "flex items-center justify-between mb-2";

    // Label with icon
    const volumeLabel = document.createElement("label");
    volumeLabel.setAttribute("for", "volume-slider");
    volumeLabel.className = "text-sm font-medium flex items-center";
    volumeLabel.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072m2.828-9.9a9 9 0 0 1 0 12.728M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
      Volume
    `;

    // Percentage display
    const volumePercentage = document.createElement("span");
    volumePercentage.id = "volume-percentage";
    volumePercentage.className = "text-xs font-medium text-primary";
    volumePercentage.textContent = `${Math.round(videoElem.volume * 100)}%`;

    volumeHeader.appendChild(volumeLabel);
    volumeHeader.appendChild(volumePercentage);

    // Slider container
    const sliderContainer = document.createElement("div");
    sliderContainer.className = "relative h-6 flex items-center";

    // Background track
    const sliderBackground = document.createElement("div");
    sliderBackground.className =
      "absolute w-full h-1.5 bg-gray-800 rounded-full";

    // Progress indicator
    const sliderProgress = document.createElement("div");
    sliderProgress.id = "volume-progress";
    sliderProgress.className =
      "absolute h-1.5 bg-gradient-to-r from-purple-700 to-primary rounded-full";
    sliderProgress.style.width = `${videoElem.volume * 100}%`;

    // Range input
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.id = "volume-slider";
    volumeSlider.min = "0";
    volumeSlider.max = "1";
    volumeSlider.step = "0.01";
    volumeSlider.value = videoElem.volume;
    volumeSlider.className =
      "absolute w-full appearance-none bg-transparent cursor-pointer z-10";

    sliderContainer.appendChild(sliderBackground);
    sliderContainer.appendChild(sliderProgress);
    sliderContainer.appendChild(volumeSlider);

    // Volume indicators
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072" />
        </svg>
      </span>
      <span>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 0 1 0 7.072m2.828-9.9a9 9 0 0 1 0 12.728M5.586 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      </span>
    `;

    // Input event handler
    volumeSlider.addEventListener("input", (e) => {
      const value = e.target.value;
      videoElem.volume = value;
      sliderProgress.style.width = `${value * 100}%`;
      volumePercentage.textContent = `${Math.round(value * 100)}%`;
      this.updateVolumeIcon(volumeLabel, value);
    });

    // Add all elements to container
    volumeContainer.appendChild(volumeHeader);
    volumeContainer.appendChild(sliderContainer);
    volumeContainer.appendChild(volumeIndicators);

    return volumeContainer;
  },

  /**
   * Update volume icon based on level
   * @param {HTMLElement} volumeLabel - Element containing the volume icon
   * @param {string|number} value - Volume value
   */
  updateVolumeIcon: function (volumeLabel, value) {
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
  },

  /**
   * Add slider styles to document
   */
  addSliderStyles: function () {
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
  },
};

// ========================
// 10. GAME VOTE MODULE
// ========================
const gameVoteModule = {
  /**
   * Initialize game voting functionality
   */
  init: function () {
    const optionsPanel = document.getElementById("options-panel");
    if (!optionsPanel) return;

    // Create vote button
    const voteButton = document.createElement("button");
    voteButton.innerHTML = `<i class="fa-solid fa-vote-yea"></i><span> Vote for a Game</span>`;
    voteButton.className =
      "w-full bg-primary hover:bg-accent px-3 py-2 rounded-lg text-sm flex items-center space-x-2 transition-colors";
    voteButton.addEventListener("click", () => this.showVoteModal());

    optionsPanel.appendChild(voteButton);
  },

  /**
   * Show toast notification for vote
   * @param {string} gameTitle - Game title voted for
   */
  showVoteToast: function (gameTitle) {
    let toastContainer = document.getElementById("vote-toast");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "vote-toast";
      // Position at top center
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

    // Show toast with animation
    setTimeout(() => {
      toast.style.opacity = "1";
    }, 10);

    // Auto-hide
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 3000);
  },

  /**
   * Show modal for game voting
   */
  showVoteModal: function () {
    // Modal overlay
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

    // Modal content
    const modalContent = document.createElement("div");
    modalContent.style.backgroundColor = "#1f2937";
    modalContent.style.padding = "20px";
    modalContent.style.border = "2px solid #9333ea";
    modalContent.style.borderRadius = "8px";
    modalContent.style.width = "600px";
    modalContent.style.maxHeight = "80%";
    modalContent.style.overflowY = "auto";

    // Title
    const title = document.createElement("h2");
    title.textContent = "Vote for a Game";
    title.style.color = "#9333ea";
    title.style.textAlign = "center";
    title.style.marginBottom = "10px";
    modalContent.appendChild(title);

    // Games list
    const gamesList = document.createElement("ul");
    gamesList.style.listStyle = "none";
    gamesList.style.padding = "0";
    gamesList.innerHTML =
      "<li style='color:#fff; text-align:center;'>Loading games, please wait...</li>";
    modalContent.appendChild(gamesList);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Close on outside click
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });

    // Fetch games
    fetch("/games")
      .then((response) => response.json())
      .then((games) => {
        gamesList.innerHTML = "";
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

          // Hover effect
          li.addEventListener("mouseover", () => {
            li.style.background = "#4b5563";
          });
          li.addEventListener("mouseout", () => {
            li.style.background = "#374151";
          });

          // Game image
          const img = document.createElement("img");
          img.src = game.image;
          img.alt = game.title;
          img.style.width = "80px";
          img.style.height = "80px";
          img.style.objectFit = "cover";
          img.style.borderRadius = "8px";
          img.style.marginBottom = "8px";
          li.appendChild(img);

          // Game title
          const span = document.createElement("span");
          span.textContent = game.title;
          span.style.color = "#fff";
          span.style.fontWeight = "bold";
          span.style.textAlign = "center";
          li.appendChild(span);

          // Vote action
          li.addEventListener("click", () => {
            socket.emit("gameVote", game.title);
            modalOverlay.remove();
            this.showVoteToast(game.title);
          });

          gamesList.appendChild(li);
        });
      })
      .catch((error) => {
        gamesList.innerHTML = "<li style='color:red'>Error loading games</li>";
        console.error("Error fetching games:", error);
      });
  },
};

// ========================
// 11. SESSION MANAGEMENT MODULE
// ========================
const sessionManagementModule = {
  /**
   * Clear approval cookie and close connection
   */
  clearApprovalAndClose: function () {
    document.cookie =
      "approved=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";

    // Hide virtual gamepad if present
    const gamepadContainer = document.getElementById(
      "virtual-gamepad-container"
    );
    if (gamepadContainer) {
      gamepadContainer.style.display = "none";
    }

    // Close socket connection
    if (socket && socket.connected) {
      socket.close();
    }

    // Close WebRTC connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    // Redirect to home page after delay
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  },

  /**
   * Initialize session management event listeners
   */
  init: function () {
    // Handle page unload to clean up connections
    window.addEventListener("beforeunload", this.clearApprovalAndClose);
    window.addEventListener("unload", this.clearApprovalAndClose);
    window.addEventListener("pagehide", this.clearApprovalAndClose);
  },
};

// ========================
// INITIALIZATION
// ========================
document.addEventListener("DOMContentLoaded", () => {
  // Initialize modules in proper order
  socketModule.init();
  uiModule.setupEventHandlers();
  statsModule.init();
  gamepadModule.init();
  chatModule.init();
  qualityModule.init();
  volumeModule.init();
  gameVoteModule.init();
  sessionManagementModule.init();

  // Initial UI update
  uiModule.updateOptionsButtonVisibility();
});

// Ensure statistics module initialization
document.addEventListener("DOMContentLoaded", function () {
  // Asegurarnos que el módulo de estadísticas se inicialice correctamente
  if (typeof statsModule !== "undefined" && statsModule.init) {
    statsModule.init();
    console.log("Statistics module initialized");
  } else {
    console.warn("Statistics module not found or init method missing");
  }

  // Re-vincular el evento del botón de estadísticas
  const toggleStatsBtn = document.getElementById("toggle-stats");
  if (toggleStatsBtn) {
    toggleStatsBtn.addEventListener("click", function () {
      const statsElement = document.getElementById("client-stats");
      if (statsElement) {
        const isHidden = statsElement.classList.contains("hidden");
        if (isHidden) {
          statsElement.classList.remove("hidden");
          statsElement.classList.add(
            "fixed",
            "top-4",
            "left-4",
            "z-20",
            "bg-black",
            "bg-opacity-70",
            "p-3",
            "rounded",
            "text-xs",
            "text-white",
            "max-w-xs"
          );
          this.querySelector("span").textContent = "Hide Stats";
          // Iniciar actualización de estadísticas
          if (typeof statsModule !== "undefined" && statsModule.startUpdating) {
            statsModule.startUpdating();
          }
        } else {
          statsElement.classList.add("hidden");
          statsElement.classList.remove("fixed", "top-4", "left-4", "z-20");
          this.querySelector("span").textContent = "Show Stats";
          // Detener actualización de estadísticas
          if (typeof statsModule !== "undefined" && statsModule.stopUpdating) {
            statsModule.stopUpdating();
          }
        }
      }
    });
  }
});
