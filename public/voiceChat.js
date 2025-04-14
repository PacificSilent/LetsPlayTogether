const voiceSocket = io();
let localVoiceStream = null;
const voicePeerConnections = {};
const voiceConfig = {
  iceServers: [
    { urls: "stun:pacificsilent.localto.net:3857" },
    {
      urls: "turn:pacificsilent.localto.net:3857",
      username: "test",
      credential: "test",
    },
  ],
};

let isVoiceJoined = false;
let localNick = ""; // Variable para almacenar el nickname

// Nueva función para poblar los dispositivos de audio para el chat de voz
async function populateVoiceAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(
      (device) => device.kind === "audioinput"
    );
    const micSelect = document.getElementById("voiceMic");
    if (!micSelect) return; // Si no se encuentra el selector, no se hace nada

    micSelect.innerHTML = "<option value=''>Default Microphone</option>";
    audioInputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Microphone ${index + 1}`;
      micSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error populating voice audio devices:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  populateVoiceAudioDevices();

  // Inicializar elementos UI
  const emptyVoiceState = document.getElementById("empty-voice-state");
  const voiceUserList = document.getElementById("voiceUserList");

  // Si existe el elemento empty-voice-state, mostrarlo inicialmente
  if (emptyVoiceState && voiceUserList) {
    emptyVoiceState.classList.remove("hidden");
    voiceUserList.classList.add("hidden");
  }
});

// Función para unirse al canal de voz
async function joinVoiceChat(nick) {
  if (isVoiceJoined) return;
  localNick = nick; // Almacenar el nickname

  try {
    const micSelect = document.getElementById("voiceMic");
    const audioConstraints = {
      noiseSuppression: true,
      echoCancellation: true,
      ...(micSelect && micSelect.value
        ? { deviceId: { exact: micSelect.value } }
        : {}),
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      localVoiceStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
    } else {
      throw new Error("getUserMedia is not supported in this browser");
    }

    const voiceChatPanel = document.getElementById("voiceChatPanel");
    if (voiceChatPanel) {
      voiceChatPanel.classList.remove("hidden");
    }

    const voiceUserListContainer = document.getElementById(
      "voiceUserListContainer"
    );
    if (voiceUserListContainer) {
      voiceUserListContainer.classList.remove("hidden");
    }
    // Enviar el evento de unión con el nickname
    voiceSocket.emit("voice-join", { nick });
    isVoiceJoined = true;

    // Actualizar UI
    const voiceToggleBtn = document.getElementById("voiceToggleBtn");
    if (voiceToggleBtn) {
      voiceToggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Leave Voice Chat
      `;
      voiceToggleBtn.classList.remove("bg-primary", "hover:bg-accent");
      voiceToggleBtn.classList.add("bg-red-600", "hover:bg-red-700");
    }

    // Actualizar indicador de estado
    const voiceStatus = document.getElementById("voice-status");
    if (voiceStatus) {
      voiceStatus.textContent = "Conectado";
      voiceStatus.classList.remove("bg-gray-700", "text-gray-400");
      voiceStatus.classList.add("bg-green-700", "text-green-100");
    }

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

  const voiceChatPanel = document.getElementById("voiceChatPanel");
  if (voiceChatPanel) {
    voiceChatPanel.classList.add("hidden");
  }

  const voiceUserListContainer = document.getElementById(
    "voiceUserListContainer"
  );
  if (voiceUserListContainer) {
    voiceUserListContainer.classList.add("hidden");
  }
  voiceSocket.emit("voice-leave");

  // Cerrar conexiones peer de voz
  Object.keys(voicePeerConnections).forEach((peerId) => {
    voicePeerConnections[peerId].close();
    delete voicePeerConnections[peerId];
  });

  isVoiceJoined = false;

  // Actualizar UI
  const voiceToggleBtn = document.getElementById("voiceToggleBtn");
  if (voiceToggleBtn) {
    voiceToggleBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
      </svg>
      Join Voice Chat
    `;
    voiceToggleBtn.classList.remove("bg-red-600", "hover:bg-red-700");
    voiceToggleBtn.classList.add("bg-primary", "hover:bg-accent");
  }

  // Mostrar estado vacío
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

  if (users.length === 0) {
    listContainer.classList.add("hidden");
    listContainer.innerHTML = "";
    return;
  }

  listContainer.classList.remove("hidden");

  // Limpiar y actualizar lista
  listContainer.innerHTML = "";

  users.forEach((user) => {
    const li = document.createElement("li");
    li.className =
      "flex items-center justify-between bg-gray-700 p-2 rounded-lg border-l-4 border-primary";

    // Crear avatar e información del usuario
    const userInfo = document.createElement("div");
    userInfo.className = "flex items-center";

    const avatar = document.createElement("div");
    avatar.className =
      "w-8 h-8 rounded-full bg-purple-800 flex items-center justify-center text-white font-bold mr-2";
    avatar.textContent = user.nick.charAt(0).toUpperCase();

    const userName = document.createElement("span");
    userName.textContent = user.nick;

    userInfo.appendChild(avatar);
    userInfo.appendChild(userName);

    // Si es el usuario local, añadir indicador "Tú"
    if (user.id === voiceSocket.id) {
      const youBadge = document.createElement("span");
      youBadge.className =
        "ml-2 text-xs bg-purple-700 text-white px-1 py-0.5 rounded";
      youBadge.textContent = "You";
      userName.appendChild(youBadge);
    }

    li.appendChild(userInfo);

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
