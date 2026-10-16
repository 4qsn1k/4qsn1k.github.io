#!/usr/bin/env python3
"""Loopback-only CONNECT proxy. Only Telegram API over the SSH tunnel is allowed."""
import logging
import select
import socket
import socketserver

LISTEN = ("127.0.0.1", 18888)
FORWARD = ("127.0.0.1", 18443)
ALLOWED = b"api.telegram.org:443"

class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(15)
        try:
            first = self.rfile.readline(4096).strip().split()
            if len(first) != 3 or first[0] != b"CONNECT" or first[1].lower() != ALLOWED:
                self.wfile.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                self.wfile.flush()
                return
            for _ in range(64):
                line = self.rfile.readline(4096)
                if line in (b"\r\n", b"\n", b""):
                    break
            else:
                return
            with socket.create_connection(FORWARD, timeout=10) as upstream:
                self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                self.wfile.flush()
                self.connection.settimeout(None)
                upstream.settimeout(None)
                peers = (self.connection, upstream)
                while True:
                    ready, _, _ = select.select(peers, [], [], 120)
                    if not ready:
                        return
                    for sock in ready:
                        chunk = sock.recv(65536)
                        if not chunk:
                            return
                        (upstream if sock is self.connection else self.connection).sendall(chunk)
        except (OSError, ValueError) as exc:
            logging.warning("Telegram tunnel proxy: %s", type(exc).__name__)

class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 32

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with Server(LISTEN, Handler) as srv:
        logging.info("Telegram-only HTTP CONNECT proxy listening on %s:%d", *LISTEN)
        srv.serve_forever()