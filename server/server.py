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
import socket
import subprocess
import sys


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


class ApiHandler(http.server.SimpleHTTPRequestHandler):
    """支持 /api/bookmarks 接口的静态文件服务器"""

    BOOKMARKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bookmarks.json')

    def _load_bookmarks(self):
        try:
            if os.path.exists(self.BOOKMARKS_FILE):
                with open(self.BOOKMARKS_FILE, 'r') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
            return []
        except Exception:
            return []

    def _save_bookmarks(self, ids):
        try:
            with open(self.BOOKMARKS_FILE, 'w') as f:
                json.dump(ids, f)
            return True
        except Exception:
            return False

    def do_GET(self):
        if self.path == '/api/bookmarks':
            ids = self._load_bookmarks()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(ids).encode('utf-8'))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/bookmarks':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                ids = data.get('ids', [])
                ok = self._save_bookmarks(ids)
                self.send_response(200 if ok else 500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': ok}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
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

    # 根据是否静默模式选择 handler 基类
    base = QuietHandler if args.quiet else http.server.SimpleHTTPRequestHandler

    # 动态创建 Handler，继承 ApiHandler 的 API 方法和 base 的静态文件服务
    class Handler(ApiHandler, base):
        pass

    # 如果有 index 文件，访问根路径时自动跳转
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

    server = http.server.HTTPServer(("0.0.0.0", args.port), Handler)

    print_banner(args.port, serve_dir, args.quiet)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
