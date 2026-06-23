const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("register", (uid) => {
    socket.join(uid);
  });

  socket.on("call-user", (data) => {
    io.to(data.targetUid).emit("incoming-call", data);
  });

  socket.on("answer-call", (data) => {
    io.to(data.callerUid).emit("call-accepted", data);
  });

  socket.on("reject-call", (data) => {
    io.to(data.callerUid).emit("call-rejected");
  });

  socket.on("offer", (data) => {
    io.to(data.targetUid).emit("offer", data);
  });

  socket.on("answer", (data) => {
    io.to(data.targetUid).emit("answer", data);
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.targetUid).emit("ice-candidate", data);
  });
});

// Serve React build
app.use(express.static(path.join(__dirname, "dist")));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});