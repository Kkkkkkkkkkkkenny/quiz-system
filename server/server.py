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

    Handler = QuietHandler if args.quiet else http.server.SimpleHTTPRequestHandler

    # 如果有 index 文件，访问根路径时自动跳转
    if index:
        original = Handler

        class RedirectHandler(original):  # type: ignore
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

        Handler = RedirectHandler

    server = http.server.HTTPServer(("0.0.0.0", args.port), Handler)

    print_banner(args.port, serve_dir, args.quiet)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
