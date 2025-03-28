const voiceSocket = io();
let localVoiceStream = null;
const voicePeerConnections = {};
const voiceConfig = {
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

let isVoiceJoined = false;
let localNick = ""; // Variable para almacenar el nickname

// Función para unirse al canal de voz
async function joinVoiceChat(nick) {
  if (isVoiceJoined) return;
  localNick = nick; // Almacenar el nickname
  try {
    localVoiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
      },
    });
    // Enviar el evento de unión con el nickname
    voiceSocket.emit("voice-join", { nick });
    isVoiceJoined = true;
    document.getElementById("voiceToggleBtn").textContent =
      "Salir del Chat de Voz";
    // (Opcional) reproducir localmente el audio en modo mudo
    let localAudio = document.createElement("audio");
    localAudio.srcObject = localVoiceStream;
    localAudio.muted = true;
    localAudio.play();
  } catch (err) {
    console.error("Error al obtener audio:", err);
  }
}

// Función para salir del canal de voz
function leaveVoiceChat() {
  if (!isVoiceJoined) return;
  if (localVoiceStream) {
    localVoiceStream.getTracks().forEach((track) => track.stop());
    localVoiceStream = null;
  }
  voiceSocket.emit("voice-leave");
  // Cerrar conexiones peer de voz
  Object.keys(voicePeerConnections).forEach((peerId) => {
    voicePeerConnections[peerId].close();
    delete voicePeerConnections[peerId];
  });
  isVoiceJoined = false;
  document.getElementById("voiceToggleBtn").textContent =
    "Unirse al Chat de Voz";
  updateVoiceUserList([]);
}

// Manejo del clic para unirse/salir
document.getElementById("voiceToggleBtn")?.addEventListener("click", () => {
  if (isVoiceJoined) {
    leaveVoiceChat();
  } else {
    // Se asume que el nickname ya está almacenado en localStorage (por ejemplo, tras el login)
    const nick = localStorage.getItem("userNick") || "Admin";
    joinVoiceChat(nick);
  }
});

// Actualiza el contenedor de lista de usuarios conectados
function updateVoiceUserList(users) {
  const listContainer = document.getElementById("voiceUserList");
  if (!listContainer) return;
  listContainer.innerHTML = "";
  users.forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user.nick;
    listContainer.appendChild(li);
  });
}

// Señalización para conexiones de voz

// Cuando se recibe una oferta de voz
voiceSocket.on("voice-offer", async (peerId, offer) => {
  const pc = new RTCPeerConnection(voiceConfig);
  voicePeerConnections[peerId] = pc;
  if (localVoiceStream) {
    localVoiceStream
      .getTracks()
      .forEach((track) => pc.addTrack(track, localVoiceStream));
  }
  pc.ontrack = (event) => {
    // Si el peerId coincide con nuestro id, no se crea el audio (evita el eco)
    if (peerId === voiceSocket.id) return;
    let audioElem = document.getElementById("audio_" + peerId);
    if (!audioElem) {
      audioElem = document.createElement("audio");
      audioElem.id = "audio_" + peerId;
      audioElem.autoplay = true;
      document.body.appendChild(audioElem);
    }
    audioElem.srcObject = event.streams[0];
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      voiceSocket.emit("voice-candidate", peerId, event.candidate);
    }
  };
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  voiceSocket.emit("voice-answer", peerId, pc.localDescription);
});

// Cuando se recibe la respuesta a la oferta
voiceSocket.on("voice-answer", async (peerId, answer) => {
  const pc = voicePeerConnections[peerId];
  if (pc) {
    await pc.setRemoteDescription(answer);
  }
});

// Cuando se recibe un candidato ICE
voiceSocket.on("voice-candidate", async (peerId, candidate) => {
  const pc = voicePeerConnections[peerId];
  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error al añadir candidato de voz:", err);
    }
  }
});

// Actualizar la lista de usuarios conectados
voiceSocket.on("voice-user-list", (users) => {
  updateVoiceUserList(users);
  // Si ya se unió y aún no figura en la lista, reemitir "voice-join"
  if (isVoiceJoined && !users.some((user) => user.id === voiceSocket.id)) {
    voiceSocket.emit("voice-join", { nick: localNick });
  }
  // Conectarse a cada nuevo usuario (excepto a uno mismo)
  users.forEach((user) => {
    if (user.id === voiceSocket.id) return;
    if (voicePeerConnections[user.id]) return;
    const pc = new RTCPeerConnection(voiceConfig);
    voicePeerConnections[user.id] = pc;
    if (localVoiceStream) {
      localVoiceStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localVoiceStream));
    }
    pc.ontrack = (event) => {
      // Si el peerId coincide con nuestro id, no se crea el audio (evita el eco)
      if (user.id === voiceSocket.id) return;
      let audioElem = document.getElementById("audio_" + user.id);
      if (!audioElem) {
        audioElem = document.createElement("audio");
        audioElem.id = "audio_" + user.id;
        audioElem.autoplay = true;
        document.body.appendChild(audioElem);
      }
      audioElem.srcObject = event.streams[0];
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        voiceSocket.emit("voice-candidate", user.id, event.candidate);
      }
    };
    (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      voiceSocket.emit("voice-offer", user.id, pc.localDescription);
    })();
  });
});
