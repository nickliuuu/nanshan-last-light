"""Start a localhost-only, dependency-free game server and open the game."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import functools
import threading
import webbrowser

root=Path(__file__).resolve().parents[1]/'public'/'game'
handler=functools.partial(SimpleHTTPRequestHandler,directory=str(root))
try:server=ThreadingHTTPServer(('127.0.0.1',4173),handler)
except OSError:server=ThreadingHTTPServer(('127.0.0.1',0),handler)
url=f'http://127.0.0.1:{server.server_port}'
print(f'南山 · 最后防线\n游戏已启动：{url}\n关闭此终端，或按 Control+C 停止服务。',flush=True)
threading.Timer(.5,lambda:webbrowser.open(url)).start()
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
