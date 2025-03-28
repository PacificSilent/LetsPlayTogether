const express = require("express");
const cookieParser = require("cookie-parser"); // Se importa cookie-parser
const app = express();
app.use(cookieParser()); // Se usa cookie-parser

require("dotenv").config();
const { sendToVigembus, disconnectJoysticks } = require("./vigembus");

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Enter username and password"'
    );
    return res.status(401).send("Authentication required.");
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
  return res.status(401).send("Authentication required.");
}

app.get("/broadcast.html", auth, (req, res) => {
  res.sendFile(__dirname + "/public/broadcast.html");
});

// Nueva ruta protegida para watch.html, debe estar antes del middleware de archivos estáticos.
app.get("/watch.html", (req, res) => {
  if (req.cookies && req.cookies.approved === "1") {
    return res.sendFile(__dirname + "/public/watch.html");
  }
  return res.status(403).send("Acceso denegado.");
});

let broadcaster;
const port = 4000;

const http = require("http");
const server = http.createServer(app);

const io = require("socket.io")(server);

// Se recomienda dejar la ruta de archivos estáticos después de las rutas protegidas
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

server.listen(port, () => console.log(`Server is running on port ${port}`));
