const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

app.use(cors());

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
    console.log("Registered:", uid);
  });

 socket.on("call-user",(data)=>{

   console.log("CALL RECEIVED");

   console.log(data);

   io.to(data.targetUid).emit("incoming-call",data);

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

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("Socket Server Running On Port 3001");
});