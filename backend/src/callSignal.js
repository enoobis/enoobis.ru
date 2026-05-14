import { WebSocketServer } from "ws";
import { get } from "./db.js";

function iceServers() {
  const raw = process.env.WEBRTC_ICE_SERVERS_JSON?.trim();
  if (raw) {
    try {
      const x = JSON.parse(raw);
      if (Array.isArray(x) && x.length > 0) return x;
    } catch {
      /* дефолт ниже */
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

/** @typedef {{ ws: import("ws").WebSocket; slug: string }} Peer */

/** @type {Map<string, Peer[]>} */
const rooms = new Map();

function getPeers(slug) {
  let list = rooms.get(slug);
  if (!list) {
    list = [];
    rooms.set(slug, list);
  }
  return list;
}

function removePeer(peer) {
  const list = rooms.get(peer.slug);
  if (!list) return;
  const idx = list.findIndex((p) => p.ws === peer.ws);
  if (idx < 0) return;
  list.splice(idx, 1);
  const others = [...list];
  for (const o of others) {
    if (o.ws.readyState === 1) {
      o.ws.send(JSON.stringify({ t: "peer-left" }));
    }
  }
  if (list.length === 0) rooms.delete(peer.slug);
}

/**
 * @param {import("http").Server} server
 */
export function attachCallSignaling(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const host = req.headers.host ?? "localhost";
    let u;
    try {
      u = new URL(req.url ?? "", `http://${host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (u.pathname !== "/ws/call") {
      socket.destroy();
      return;
    }
    const slug = u.searchParams.get("slug") ?? "";
    if (!slug) {
      socket.destroy();
      return;
    }
    const row = get("SELECT active FROM call_sessions WHERE slug = ?", slug);
    if (!row?.active) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const peers = getPeers(slug);
      if (peers.length >= 2) {
        ws.close(4001, "room full");
        return;
      }

      /** @type {Peer} */
      const peer = { ws, slug };
      peers.push(peer);

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ t: "config", iceServers: iceServers() }));
      }

      if (peers.length === 1) {
        ws.send(JSON.stringify({ t: "wait" }));
      } else {
        const [a, b] = peers;
        if (a.ws.readyState === 1) a.ws.send(JSON.stringify({ t: "create-offer" }));
        if (b.ws.readyState === 1) b.ws.send(JSON.stringify({ t: "wait-offer" }));
      }

      ws.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const t = msg?.t;
        if (t !== "offer" && t !== "answer" && t !== "ice") return;
        for (const o of getPeers(slug)) {
          if (o.ws !== ws && o.ws.readyState === 1) {
            o.ws.send(JSON.stringify(msg));
          }
        }
      });
      ws.on("close", () => removePeer(peer));
    });
  });
}
