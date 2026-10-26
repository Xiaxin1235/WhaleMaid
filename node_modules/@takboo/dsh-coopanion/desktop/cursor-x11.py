# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read only the X11 pointer location; no keys, events, files or network."""
import ctypes
import json
import time

x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_uint)]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
display = x.XOpenDisplay(None)
if not display:
    raise RuntimeError('X11 pointer display unavailable')
try:
    root, child = ctypes.c_ulong(), ctypes.c_ulong()
    rx, ry, wx, wy, mask = ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_int(), ctypes.c_uint()
    while True:
        if not x.XQueryPointer(display, x.XDefaultRootWindow(display), ctypes.byref(root), ctypes.byref(child), ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(mask)):
            raise RuntimeError('X11 pointer query failed')
        print(json.dumps({'x': rx.value, 'y': ry.value}), flush=True)
        time.sleep(0.1)
finally:
    x.XCloseDisplay(display)
