#!/usr/bin/env python3
"""Unify contest result-report fonts to Noto Sans CJK KR.

The official template mixes Gulim, HY Headline M, and Malgun Gothic. Those
faces substitute to Jua / Heiti / Liberation Serif on machines that lack them.
Rewrite every document font hint to one embeddable Korean gothic so the
matching PDF stays readable.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

FONT = "Noto Sans CJK KR"
UGLY = {
    "굴림",
    "Gulim",
    "HY헤드라인M",
    "함초롬바탕",
    "맑은 고딕",
    "Malgun Gothic",
}
HEADLINE = "HY헤드라인M"


def replace_font_attrs(xml: str) -> str:
    def swap(match: re.Match[str]) -> str:
        value = match.group(2)
        if value in UGLY:
            return f'{match.group(1)}="{FONT}"'
        return match.group(0)

    xml = re.sub(
        r'(w:(?:ascii|hAnsi|eastAsia|cs))="([^"]+)"',
        swap,
        xml,
    )
    xml = re.sub(
        r'(typeface=")(굴림|Gulim|HY헤드라인M|함초롬바탕|맑은 고딕|Malgun Gothic)(")',
        rf"\1{FONT}\3",
        xml,
    )
    return xml


def bold_former_headlines(xml: str) -> str:
    def decorate(run: str) -> str:
        if HEADLINE not in run:
            return run
        if re.search(r"<w:b\b", run):
            return run
        if "<w:rPr" in run:
            return re.sub(r"(<w:rPr[^>]*>)", r"\1<w:b/>", run, count=1)
        return re.sub(r"(<w:r\b[^>]*>)", r"\1<w:rPr><w:b/></w:rPr>", run, count=1)

    return re.sub(r"<w:r\b[^>]*>.*?</w:r>", lambda m: decorate(m.group(0)), xml, flags=re.S)


def rewrite_font_table(xml: str) -> str:
    if f'w:name="{FONT}"' in xml:
        return xml
    entry = (
        f'<w:font w:name="{FONT}">'
        '<w:charset w:val="80"/>'
        '<w:family w:val="swiss"/>'
        '<w:pitch w:val="variable"/>'
        "</w:font>"
    )
    return xml.replace("</w:fonts>", f"{entry}</w:fonts>")


def restyle(src: Path, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(src) as zf:
            zf.extractall(root)
        for rel in (
            "word/document.xml",
            "word/styles.xml",
            "word/theme/theme1.xml",
            "word/fontTable.xml",
            "word/numbering.xml",
            "word/footnotes.xml",
            "word/endnotes.xml",
        ):
            path = root / rel
            if not path.exists():
                continue
            xml = path.read_text(encoding="utf-8")
            if rel == "word/document.xml":
                xml = bold_former_headlines(xml)
            xml = replace_font_attrs(xml)
            if rel == "word/fontTable.xml":
                xml = rewrite_font_table(xml)
            path.write_text(xml, encoding="utf-8")
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest.unlink()
        with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as out:
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    out.write(path, path.relative_to(root).as_posix())


def export_pdf(docx: Path, pdf: Path) -> None:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise SystemExit("LibreOffice (soffice) is required to export a matching PDF")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [soffice, "--headless", "--nologo", "--nolockcheck", "--convert-to", "pdf", "--outdir", tmp, str(docx)],
            check=True,
        )
        produced = Path(tmp) / f"{docx.stem}.pdf"
        if not produced.exists():
            raise SystemExit(f"LibreOffice did not write {produced.name}")
        pdf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, pdf)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("dest")
    parser.add_argument(
        "--pdf",
        nargs="?",
        const="__auto__",
        default=None,
        help="also write a matching PDF (default path: dest with .pdf)",
    )
    args = parser.parse_args()
    src = Path(args.src)
    dest = Path(args.dest)
    if src.resolve() == dest.resolve():
        backup = src.with_suffix(".docx.bak")
        shutil.copy2(src, backup)
        restyle(backup, dest)
        backup.unlink()
    else:
        restyle(src, dest)
    if args.pdf is not None:
        pdf = dest.with_suffix(".pdf") if args.pdf == "__auto__" else Path(args.pdf)
        export_pdf(dest, pdf)


if __name__ == "__main__":
    main()
