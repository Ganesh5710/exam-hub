const { Server } = require("socket.io");
const io = new Server(5173, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  socket.on("join-room", (room) => {
    socket.join(room);
    socket.room = room;
  });

  socket.on("offer", (offer, fromId) => {
    // Broadcast offer to all admins
    socket.broadcast.emit("offer", offer, fromId);
  });

  socket.on("answer", (answer, toId) => {
    // Only send answer to the intended student
    for (const [id, s] of io.sockets.sockets) {
      if (s.room === toId) {
        s.emit("answer", answer, socket.room); // socket.room is admin id
      }
    }
  });

  socket.on("ice-candidate", (candidate, fromId, toId) => {
    // Only send ICE candidate to the intended peer
    for (const [id, s] of io.sockets.sockets) {
      if (s.room === toId) {
        s.emit("ice-candidate", candidate, fromId);
      }
    }
  });
});

console.log("Signaling server running on ws://localhost:5173");
