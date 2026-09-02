import WebSocket from "ws";
import { WS_PORT } from "./config";
import { logger } from "./logging";

const wss = new WebSocket.Server({ port: Number(WS_PORT) || Number(3001) });

wss.on("connection", (ws) => {
  console.log("Client connected via WebSocket");
});

wss.on("error", (err) => {
  logger.error("WebSocket error:", err);
});

export { wss };

export function getWebSocketStatus() {
  try {
    const isListening = wss.address() !== null;
    return {
      status: isListening ? "UP" : "DOWN",
      port: Number(WS_PORT) || 3001,
      connectedClients: wss.clients.size,
    };
  } catch (error: any) {
    return {
      status: "DOWN",
      port: Number(WS_PORT) || 3001,
      connectedClients: 0,
      error: error.message || "Unknown websocket error",
    };
  }
}

export function sendNotification(message: string) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      logger.info("Sending notification to client");
      client.send(message);
    }
  });
}
