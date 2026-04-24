import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { registerBattleSocket } from "./src/sockets/battle.socket.js";
import { registerClassroomSocket } from "./src/sockets/classroom.socket.js";
import { YSocketIO } from "y-socket.io/dist/server";

dotenv.config();
connectDB();

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});

// Register socket namespaces
registerBattleSocket(io);
registerClassroomSocket(io);

// Yjs CRDT sync over Socket.IO namespaces: /^\/yjs\|.*$/
const ysocketio = new YSocketIO(io);
ysocketio.initialize();

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
