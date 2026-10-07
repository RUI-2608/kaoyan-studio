#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
打一个「发给同学 / 拷到平板」的 zip。

为什么要单独写这个脚本，而不用 Windows 自带的 Compress-Archive：
PowerShell 5.1 的 Compress-Archive 把目录分隔符写成反斜杠「web\\index.html」，
Windows 资源管理器认，但 macOS / 安卓的解压工具会在当前目录铺出一堆带反斜杠的扁文件，
同学拿到的就是一个碎掉的包。这里用 python 的 zipfile，路径一律走正斜杠，
非 ASCII 文件名会正确置上 UTF-8 标记位（general purpose flag bit 11）。

用法：
    python scripts/pack_share.py 1.3            # 全量包（含 408 原卷 PDF）
    python scripts/pack_share.py 1.3 --lite     # 轻量包（不含原卷与运行时用不到的文件）

lite 版剔除的都是**运行时代码不读**的东西：
    web/papers/**        34 份原卷与答案 PDF —— 60 MB，占全量包的 78%
    web/data/**/*.md     数学原文的 markdown 副本（站点读的是同名 .js）
    web/data/p408/*.txt  408 抽出来的文字层（构建时用的中间件）
剔掉之后往包里现造一个 web/no-papers.js（window.NO_PAPERS = true），并在副本 index.html 的
app.js 之前引它 —— 408 页面上「原卷 PDF / 答案 PDF」两个按钮会换成「原卷未随本包」，
而不是点出一个 404。仓库里不放这个标记文件，只在 lite 包里生成。

产物：dist/考研备考台-v<版本>.zip 或 dist/考研备考台-lite-v<版本>.zip
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGV = [a for a in sys.argv[1:]]
LITE = "--lite" in ARGV
VERSION = next((a for a in ARGV if not a.startswith("--")), "1.3")
TOP = "考研备考台"                                      # 解压出来的顶层文件夹名
INCLUDE_DIRS = ["web", "pdf"]                           # 整目录进包
INCLUDE_FILES = ["share/使用说明.txt"]                   # 放在解出来的顶层，别藏进 share/
OUT = os.path.join(ROOT, "dist", "考研备考台%s-v%s.zip" % ("-lite" if LITE else "", VERSION))
EXTRA_DIR = os.path.join(ROOT, ".tmp", "lite-extra")     # lite 版现造的文件放这里


def rel_posix(p):
    """相对仓库根的路径，一律正斜杠；zip 规范只认这个。"""
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def skip(rel):
    """lite 版不收的：原卷 PDF 目录，以及运行时没人读的 .md / .txt 副本。"""
    if not LITE:
        return False
    if rel.startswith("web/papers/"):
        return True
    return rel.startswith("web/data/") and rel.endswith((".md", ".txt"))


def make_extras():
    """lite 包要现造的两个文件：标记脚本 + 引了它的 index.html。"""
    if not LITE:
        return []
    os.makedirs(EXTRA_DIR, exist_ok=True)
    flag = os.path.join(EXTRA_DIR, "no-papers.js")
    with open(flag, "w", encoding="utf-8") as f:
        f.write("/* lite 包标记：本包不含 408 原卷 PDF；views2.js 靠它把「原卷 PDF」按钮降级 */\n"
                "window.NO_PAPERS = true;\n")
    html = open(os.path.join(ROOT, "web", "index.html"), encoding="utf-8").read()
    anchor = '<script src="app.js"></script>'
    if anchor not in html:
        sys.exit("index.html 里找不到 %s，不敢乱插标记脚本" % anchor)
    if "no-papers.js" not in html:
        html = html.replace(anchor, '<script src="no-papers.js"></script>\n' + anchor)
    idx = os.path.join(EXTRA_DIR, "index.html")
    with open(idx, "w", encoding="utf-8", newline="") as f:
        f.write(html)
    return [(flag, "web/no-papers.js"), (idx, "web/index.html")]


def main():
    files, dropped_n, dropped_mb = [], 0, 0.0
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            sys.exit("缺少目录：%s" % base)
        for dirpath, _dirs, names in os.walk(base):
            for n in sorted(names):
                if n.startswith("."):
                    continue
                full = os.path.join(dirpath, n)
                if skip(rel_posix(full)):
                    dropped_n += 1
                    dropped_mb += os.path.getsize(full) / 1048576.0
                    continue
                files.append(full)
    files.sort()

    extras = make_extras()
    forced = {arc for _p, arc in extras}            # 现造版 index.html 顶掉仓库里那份
    files = [p for p in files if rel_posix(p) not in forced]
    notes = []
    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if not os.path.isfile(p):
            sys.exit("缺少文件：%s" % p)
        notes.append((p, os.path.basename(p)))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        try:
            os.remove(OUT)
        except PermissionError:
            sys.exit("旧包 %s 正被别的程序占用（多半是资源管理器预览窗格或解压工具还开着），"
                     "关掉它再重跑；脚本不会去杀你的进程。" % OUT)

    # 说明文件排在最前面，同学用资源管理器打开压缩包第一眼就能看到它
    plan = notes + extras + [(p, rel_posix(p)) for p in files]

    written, raw_mb = 0, 0.0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for full, relname in plan:
            name = "%s/%s" % (TOP, relname)
            raw = os.path.getsize(full)
            if raw > 900 * 1024 * 1024:
                sys.exit("单文件超过 1 GB，别塞进来了：%s" % name)
            z.write(full, name)                     # z.write 保留 mtime
            written += 1
            raw_mb += raw / 1048576.0

    print("%s：打包 %d 个文件，解压后 %.1f MB，zip %.1f MB"
          % ("轻量版（不含原卷 PDF）" if LITE else "全量版", written, raw_mb,
             os.path.getsize(OUT) / 1048576.0))
    if LITE:
        print("剔除了 %d 个运行时用不到的文件，共 %.1f MB" % (dropped_n, dropped_mb))
    print("-> %s" % OUT)

    # 自证：换个句柄重开一次，确认包能读、条目数对得上、非 ASCII 名字都带 UTF-8 标记
    with zipfile.ZipFile(OUT) as z:
        bad = z.testzip()
        if bad:
            sys.exit("CRC 校验失败：%s" % bad)
        infos = z.infolist()
        names = {i.filename for i in infos}
        if len(infos) != written:
            sys.exit("条目数不符：%d vs %d" % (len(infos), written))
        nointl = [i.filename for i in infos
                  if any(ord(c) > 127 for c in i.filename) and not (i.flag_bits & 0x800)]
        if nointl:
            sys.exit("%d 个中文名条目没置 UTF-8 标记，例如 %s" % (len(nointl), nointl[0]))
        backslash = [n for n in names if "\\" in n]
        if backslash:
            sys.exit("%d 个条目用了反斜杠，例如 %s" % (len(backslash), backslash[0]))
        if LITE:
            if any("/web/papers/" in n for n in names):
                sys.exit("lite 包里还混着原卷 PDF")
            if "%s/web/no-papers.js" % TOP not in names:
                sys.exit("lite 包缺 no-papers.js 标记")
            idx = z.read("%s/web/index.html" % TOP).decode("utf-8")
            if "no-papers.js" not in idx:
                sys.exit("lite 包的 index.html 没引 no-papers.js，按钮会指向不存在的 PDF")
            if idx.index("no-papers.js") > idx.index("app.js"):
                sys.exit("no-papers.js 必须在 app.js 之前，否则首屏已经按全量渲染过了")
        elif not any("/web/papers/" in n for n in names):
            sys.exit("全量包里居然没有原卷 PDF")
        print("自检通过：条目 %d，CRC 全对，中文名带 UTF-8 标记，路径全用正斜杠%s"
              % (len(infos), "，原卷已剔除、降级标记就位" if LITE else ""))


if __name__ == "__main__":
    main()
