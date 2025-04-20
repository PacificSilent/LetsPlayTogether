const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const https = require("https");
const app = express();
app.use(cookieParser());

require("dotenv").config();
const { sendToVigembus, disconnectJoysticks } = require("./vigembus");

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Enter username and password"'
    );
    return res.status(401).send("Acceso denegado: se requiere autenticación.");
  }
  const encoded = authHeader.split(" ")[1] || "";
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const [username, password] = decoded.split(":");
  if (
    username === process.env.BROADCAST_USER &&
    password === process.env.BROADCAST_PASS
  ) {
    return next();
  }
  res.setHeader(
    "WWW-Authenticate",
    'Basic realm="Enter username and password"'
  );
  return res.status(401).send("Credenciales inválidas.");
}

app.get("/broadcast.html", auth, (req, res) => {
  res.sendFile(__dirname + "/public/broadcast.html");
});

app.get("/watch.html", (req, res) => {
  if (req.cookies && req.cookies.approved === "1") {
    return res.sendFile(__dirname + "/public/watch.html");
  }
  return res.redirect("/access-denied.html");
});

// Agregar un objeto para cachear las imágenes de los juegos
const imageCache = {};

// Endpoint para obtener la lista de juegos
app.get("/games", async (req, res) => {
  const gamesData = JSON.parse(fs.readFileSync("./games/games.json", "utf8"));
  const games = await Promise.all(
    gamesData.map(async (game, index) => {
      async function getGameCover(title) {
        // Si la imagen ya está en cache, la retornamos
        if (imageCache[title]) {
          return imageCache[title];
        }
        const response = await fetch(
          `https://api.rawg.io/api/games?key=${
            process.env.RAWG_API_KEY
          }&search=${encodeURIComponent(title)}`
        );
        const data = await response.json();
        const foundGame = data.results?.[0];
        const imageUrl = foundGame?.background_image || "";
        // Guardar en cache para no volver a llamar a la API para este juego
        imageCache[title] = imageUrl;
        return imageUrl;
      }
      return {
        id: index + 1,
        title: game.Name,
        image: await getGameCover(game.Name),
      };
    })
  );
  res.json(games);
});

let broadcaster;
const port = 4000;

const sslOptions = {
  key: fs.readFileSync("./private.key"), // Reemplaza con la ruta a tu clave privada
  cert: fs.readFileSync("./certificate.crt"), // Reemplaza con la ruta a tu certificado
  // ca: fs.readFileSync("path/to/ca_bundle.crt"), // Opcional, si necesitas una cadena de autoridad de certificación
};

const server = https.createServer(sslOptions, app);

server.listen(port, () => {
  console.log(`Server is running on port ${port} with HTTPS`);

  const url = `https://localhost:${port}/broadcast.html`;
  const startCommand =
    process.platform === "win32"
      ? "start"
      : process.platform === "darwin"
      ? "open"
      : "xdg-open";
  require("child_process").exec(`${startCommand} ${url}`, (error) => {
    if (error) {
      console.error("Error al abrir el navegador:", error);
    }
  });
});

const io = require("socket.io")(server);

app.use(express.static(__dirname + "/public"));

io.sockets.on("error", (e) => console.log(e));

const voiceUsers = {};

io.sockets.on("connection", (socket) => {
  socket.on("broadcaster", () => {
    broadcaster = socket.id;
    socket.broadcast.emit("broadcaster");
  });
  socket.on("watcher", () => {
    socket.to(broadcaster).emit("watcher", socket.id);
  });
  socket.on("offer", (id, message) => {
    socket.to(id).emit("offer", socket.id, message);
  });
  socket.on("answer", (id, message) => {
    socket.to(id).emit("answer", socket.id, message);
  });
  socket.on("candidate", (id, message) => {
    socket.to(id).emit("candidate", socket.id, message);
  });
  socket.on("joystick-data", (data) => {
    sendToVigembus(data);
  });
  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
    disconnectJoysticks(socket.id);
  });
  socket.on("admin-ping", (data) => {
    io.to(data.target).emit("admin-ping", data);
  });
  socket.on("admin-pong", (data) => {
    io.to(broadcaster).emit("admin-pong", data);
  });
  socket.on("admin-disconnect", (targetId) => {
    io.to(targetId).emit("disconnectPeer", targetId);
    disconnectJoysticks(targetId);
  });

  socket.on("broadcasterJoin", () => {
    socket.join("broadcaster");
  });

  socket.on("peerRequest", (data) => {
    io.to("broadcaster").emit("newPeerRequest", {
      peerId: socket.id,
      nick: data.nick,
    });
  });

  socket.on("handlePeerRequest", (data) => {
    io.to(data.peerId).emit("peerApproval", { approved: data.approved });
  });

  // Manejo del chat de voz
  socket.on("voice-join", (data) => {
    // data contiene { nick }
    voiceUsers[socket.id] = { nick: data.nick };
    socket.join("voiceChat");
    // Notificar a todos los conectados en voz la lista actualizada
    io.to("voiceChat").emit(
      "voice-user-list",
      Object.keys(voiceUsers).map((id) => ({
        id,
        nick: voiceUsers[id].nick,
      }))
    );
  });

  socket.on("voice-leave", () => {
    delete voiceUsers[socket.id];
    socket.leave("voiceChat");
    io.to("voiceChat").emit(
      "voice-user-list",
      Object.keys(voiceUsers).map((id) => ({
        id,
        nick: voiceUsers[id].nick,
      }))
    );
  });

  socket.on("voice-offer", (targetId, offer) => {
    socket.to(targetId).emit("voice-offer", socket.id, offer);
  });

  socket.on("voice-answer", (targetId, answer) => {
    socket.to(targetId).emit("voice-answer", socket.id, answer);
  });

  socket.on("voice-candidate", (targetId, candidate) => {
    socket.to(targetId).emit("voice-candidate", socket.id, candidate);
  });

  socket.on("selectQuality", (data) => {
    // Reenviar la selección de calidad desde el cliente al broadcaster
    io.to(broadcaster).emit("selectQuality", data);
  });

  socket.on("gameVote", (gameTitle) => {
    if (broadcaster) {
      io.to(broadcaster).emit("gameVote", gameTitle);
    }
  });

  // Manejo del chat de mensajería
  socket.on("chatMessage", (data) => {
    const payload = {
      id: socket.id,
      nick: data.nick,
      message: data.message,
      timestamp: Date.now(),
    };
    io.emit("chatMessage", payload);
  });

  // Al desconectar, removemos de la lista de voz si aplica.
  socket.on("disconnect", () => {
    if (voiceUsers[socket.id]) {
      delete voiceUsers[socket.id];
      io.to("voiceChat").emit(
        "voice-user-list",
        Object.keys(voiceUsers).map((id) => ({
          id,
          nick: voiceUsers[id].nick,
        }))
      );
    }
  });
});
