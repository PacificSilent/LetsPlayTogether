let peerConnection;
const config = {
  iceServers: [
      { 
        "urls": "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:pacificsilent.localto.net:1546",
      },
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

window.onunload = window.onbeforeunload = () => {
  socket.close();
  peerConnection.close();
};

// Registra el Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("ServiceWorker registered: ", registration);
      })
      .catch((registrationError) => {
        console.log("ServiceWorker registration failed: ", registrationError);
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const optionsPanel = document.getElementById("options-panel");
  const videoElem = document.getElementById("video");
  const unmuteBtn = document.getElementById("unmute-video");

  // Toggle del panel de opciones al hacer click en la pantalla
  document.addEventListener("click", (e) => {
    if (!optionsPanel.contains(e.target)) {
      optionsPanel.classList.toggle("hidden");
    }
  });

  // Toggle del mute/desmute al hacer click en el botón
  unmuteBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Evita que el click cierre el panel
    videoElem.muted = !videoElem.muted;
    unmuteBtn.textContent = videoElem.muted ? "Desmutear" : "Mutear";
  });
});