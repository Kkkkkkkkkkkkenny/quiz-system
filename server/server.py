#!/usr/bin/env python3
"""
simple-server — 把任意文件/目录变成局域网可访问的网页服务。

用法:
  ./server.py                # 当前目录，端口 8080
  ./server.py index.html     # 直接指定文件
  ./server.py ./dist/        # 指定目录
  ./server.py -p 3000        # 指定端口
"""

import argparse
import http.server
import json
import os
import re
import socket
import subprocess
import sys


DATA_DIR = '.server-data'


def get_lan_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        s.connect(("192.168.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def get_tailscale_ip() -> str | None:
    try:
        result = subprocess.run(
            ["tailscale", "ip", "-4"],
            capture_output=True, text=True, timeout=3
        )
        ip = result.stdout.strip()
        return ip if ip else None
    except Exception:
        return None


def print_banner(port: int, serve_dir: str, quiet: bool):
    if quiet:
        return

    lan_ip = get_lan_ip()
    ts_ip = get_tailscale_ip()

    print()
    print("  ╔══════════════════════════════════════════╗")
    print("  ║         simple-server 已启动             ║")
    print("  ╚══════════════════════════════════════════╝")
    print()
    print(f"  本机:      http://localhost:{port}")
    if lan_ip:
        print(f"  局域网:    http://{lan_ip}:{port}")
    if ts_ip:
        print(f"  Tailscale: http://{ts_ip}:{port}")
    print()
    print(f"  目录:      {serve_dir}")
    print(f"  PID:       {os.getpid()}")
    print()
    print("  Ctrl+C 停止服务")
    print()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class DataHandler(http.server.SimpleHTTPRequestHandler):
    """支持通用 JSON 数据存储 API 的静态文件服务器。

    API:
      GET  /api/data/<key>   ->  {"data": <value>}
      POST /api/data/<key>   <-  {"data": <value>}  ->  {"ok": true}

    数据存储在服务目录的 .server-data/<key>.json 文件中。
    可用于单用户场景下的跨设备同步（如收藏、设置等）。
    """

    _KEY_PATTERN = re.compile(r'^[a-zA-Z0-9._-]+$')

    def _data_path(self, key):
        return os.path.join(os.getcwd(), DATA_DIR, '%s.json' % key)

    def _read_data(self, key):
        path = self._data_path(key)
        try:
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return json.load(f)
        except Exception:
            pass
        return None

    def _write_data(self, key, data):
        try:
            dirpath = os.path.join(os.getcwd(), DATA_DIR)
            os.makedirs(dirpath, exist_ok=True)
            path = self._data_path(key)
            with open(path, 'w') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception:
            return False

    def _send_json(self, code, obj):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode('utf-8'))

    def _match_api(self, path):
        if not path.startswith('/api/data/'):
            return None
        key = path[len('/api/data/'):]
        if not key or not self._KEY_PATTERN.match(key):
            return None
        return key

    def do_GET(self):
        api_key = self._match_api(self.path)
        if api_key is not None:
            data = self._read_data(api_key)
            self._send_json(200, {'data': data})
            return
        super().do_GET()

    def do_POST(self):
        api_key = self._match_api(self.path)
        if api_key is not None:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b'{}'
            try:
                payload = json.loads(body)
                value = payload.get('data')
                ok = self._write_data(api_key, value)
                self._send_json(200 if ok else 500, {'ok': ok})
            except Exception as e:
                self._send_json(400, {'error': str(e)})
            return
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(
        description="即插即用的静态文件服务器"
    )
    parser.add_argument(
        "target", nargs="?", default=".",
        help="要服务的文件或目录（默认当前目录）"
    )
    parser.add_argument(
        "--port", "-p", type=int, default=8080,
        help="监听端口（默认 8080）"
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true",
        help="安静模式"
    )
    args = parser.parse_args()

    # 解析目标：文件 → 切到所在目录；目录 → 直接进入
    target = args.target
    index = ""

    if os.path.isfile(target):
        serve_dir = os.path.dirname(os.path.abspath(target)) or os.getcwd()
        index = os.path.basename(target)
    elif os.path.isdir(target):
        serve_dir = os.path.abspath(target)
    else:
        print(f"错误: 找不到 \"{target}\"", file=sys.stderr)
        sys.exit(1)

    os.chdir(serve_dir)

    base = QuietHandler if args.quiet else http.server.SimpleHTTPRequestHandler

    class Handler(DataHandler, base):
        pass

    if index:
        class RedirectHandler(Handler):  # type: ignore
            def do_GET(self):
                if self.path == "/":
                    self.send_response(302)
                    self.send_header("Location", f"/{index}")
                    self.end_headers()
                    return
                super().do_GET()

            def do_HEAD(self):
                if self.path == "/":
                    self.send_response(302)
                    self.send_header("Location", f"/{index}")
                    self.end_headers()
                    return
                super().do_HEAD()

        Handler = RedirectHandler  # type: ignore

    http.server.HTTPServer.allow_reuse_address = True
    server = http.server.HTTPServer(("0.0.0.0", args.port), Handler)

    print_banner(args.port, serve_dir, args.quiet)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
