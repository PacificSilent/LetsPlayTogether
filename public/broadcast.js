const MAX_RESOLUTION = { width: 1920, height: 1080 };

const peerConnections = {};
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
  peerConnections[id].close();
  delete peerConnections[id];
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
};

// Get camera and microphone
const videoElement = document.querySelector("video");

getStream()
  .then(getDevices)
  .then(gotDevices);

function getDevices() {
  return navigator.mediaDevices.enumerateDevices();
}

function gotDevices(deviceInfos) {
  window.deviceInfos = deviceInfos;
  for (const deviceInfo of deviceInfos) {
    const option = document.createElement("option");
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === "audioinput") {
      option.text = deviceInfo.label || `Microphone ${audioSelect.length + 1}`;
      audioSelect.appendChild(option);
    } else if (deviceInfo.kind === "videoinput") {
      option.text = deviceInfo.label || `Camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    }
  }
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
  socket.emit("broadcaster");
}

function handleError(error) {
  console.error("Error: ", error);
}