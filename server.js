const express = require("express");
const app = express();
require("dotenv").config();

const { sendToVigembus, disconnectJoysticks } = require('./vigembus');

function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Enter username and password"');
        return res.status(401).send("Authentication required.");
    }
    const encoded = authHeader.split(' ')[1] || '';
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    if (username === process.env.BROADCAST_USER && password === process.env.BROADCAST_PASS) {
        return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Enter username and password"');
    return res.status(401).send("Authentication required.");
}

app.get('/broadcast.html', auth, (req, res) => {
    res.sendFile(__dirname + "/public/broadcast.html");
});

let broadcaster;
const port = 4000;

const http = require("http");
const server = http.createServer(app);

const io = require("socket.io")(server);

app.use(express.static(__dirname + "/public"));

io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => {
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
  socket.on("joystick-data", data => {
    sendToVigembus(data);
  });
  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });
  // Dentro de io.sockets.on("connection", socket => { ... });
  socket.on("admin-ping", data => {
    // Reenvía el admin-ping al socket cuyo id coincide con el target
    io.to(data.target).emit("admin-ping", data);
  });
  socket.on("admin-pong", data => {
    // Reenvía el admin-pong al broadcaster
    // Se asume que "broadcaster" contiene el socket.id del broadcaster
    io.to(broadcaster).emit("admin-pong", data);
  });
});
server.listen(port, () => console.log(`Server is running on port ${port}`));