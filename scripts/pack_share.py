#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打一个「发给同学用」的 zip。

为什么要单独写这个脚本，而不用 Windows 自带的 Compress-Archive：
PowerShell 5.1 的 Compress-Archive 把目录分隔符写成反斜杠「web\\index.html」，
Windows 资源管理器认，但 macOS / 安卓的解压工具会在当前目录铺出一堆带反斜杠的扁文件，
同学拿到的就是一个碎掉的包。这里用 python 的 zipfile，路径一律走正斜杠，
非 ASCII 文件名会正确置上 UTF-8 标记位（general purpose flag bit 11）。

打包内容：web/（站点，含 408 原卷 PDF）+ pdf/（A4 手写版）+ share/使用说明.txt
用法：  python scripts/pack_share.py [版本号]   # 默认 1.3
产物：  dist/考研备考台-v<版本号>.zip
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = sys.argv[1] if len(sys.argv) > 1 else "1.3"
TOP = "考研备考台"                      # 解压出来的顶层文件夹名
INCLUDE_DIRS = ["web", "pdf"]           # 整目录进包
INCLUDE_FILES = ["share/使用说明.txt"]  # 额外塞进去的说明文件（放在解出来的顶层，别藏进 share/）
OUT = os.path.join(ROOT, "dist", "考研备考台-v%s.zip" % VERSION)


def rel_posix(p):
    """相对仓库根的路径，一律正斜杠；zip 规范只认这个。"""
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def main():
    files = []
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            sys.exit("缺少目录：%s" % base)
        for dirpath, _dirs, names in os.walk(base):
            for n in sorted(names):
                if n.startswith("."):
                    continue
                files.append(os.path.join(dirpath, n))
    extras = []
    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if not os.path.isfile(p):
            sys.exit("缺少文件：%s" % p)
        extras.append(p)
    files.sort()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    # 说明文件排在最前面，同学用资源管理器打开压缩包第一眼就能看到它
    plan = [(p, os.path.basename(p)) for p in extras] + [(p, rel_posix(p)) for p in files]

    written, raw_bytes = 0, 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for full, relname in plan:
            name = "%s/%s" % (TOP, relname)
            raw = os.path.getsize(full)
            z.write(full, name)          # z.write 保留 mtime，且按扩展名不额外做手脚
            written += 1
            raw_bytes += raw
            if raw > 900 * 1024 * 1024:
                sys.exit("单文件超过 1 GB，别塞进来了：%s" % name)

    print("打包 %d 个文件，解压后 %.1f MB，zip %.1f MB"
          % (written, raw_bytes / 1048576.0, os.path.getsize(OUT) / 1048576.0))
    print("-> %s" % OUT)

    # 自证：换个句柄重开一次，确认包能读、条目数对得上、非 ASCII 名字都带 UTF-8 标记
    with zipfile.ZipFile(OUT) as z:
        bad = z.testzip()
        if bad:
            sys.exit("CRC 校验失败：%s" % bad)
        infos = z.infolist()
        if len(infos) != written:
            sys.exit("条目数不符：%d vs %d" % (len(infos), written))
        nointl = [i.filename for i in infos
                  if any(ord(c) > 127 for c in i.filename) and not (i.flag_bits & 0x800)]
        if nointl:
            sys.exit("%d 个中文名条目没置 UTF-8 标记，例如 %s" % (len(nointl), nointl[0]))
        backslash = [i.filename for i in infos if "\\" in i.filename]
        if backslash:
            sys.exit("%d 个条目用了反斜杠，例如 %s" % (len(backslash), backslash[0]))
        print("自检通过：条目 %d，CRC 全对，中文名带 UTF-8 标记，路径全用正斜杠" % len(infos))


if __name__ == "__main__":
    main()
