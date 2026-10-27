#!/usr/bin/env python3
"""Gera src/reference-weeks.js a partir das semanas aprovadas da TGE (Markdown).

Uso: python3 scripts/build-reference-weeks.py <pasta-com-semanaN_*.md>
A Semana 1 (referência validada) entra inteira; as demais, em trechos curados.
Os callouts são convertidos para a sintaxe do gerador (sem URLs: o recurso é
localizado depois pela busca) e SVG/figuras são removidos.
"""
import glob, json, re, sys, os

src = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs"
KIND = {"🎧": "vídeo", "📺": "vídeo", "📖": "artigo", "📄": "documento", "🌐": "artigo", "📊": "dados"}

def load(n):
    path = glob.glob(os.path.join(src, f"semana{n}_*.md"))[0]
    text = open(path, encoding="utf-8").read()
    text = re.split(r"\n## Atividade avaliativa", text)[0]
    text = re.sub(r"<div[^>]*>.*?</div>", "", text, flags=re.S)
    text = re.sub(r"<svg.*?</svg>", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"^\*Disciplina:.*\n\*Carga hor.*\n", "", text, flags=re.M)
    text = re.sub(r"^\s*---\s*$", "", text, flags=re.M)
    text = re.sub(r"^\*?\(?Figura \d+.*$", "", text, flags=re.M)
    return text

def convert_callouts(text):
    out, lines, i = [], text.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^>\s*\*\*🔎 Veja mais aqui:?\*\*:?\s*(.*)$", line)
        if m:
            body = m.group(1).strip()
            kind, title = "artigo", ""
            j = i + 1
            while j < len(lines) and lines[j].startswith(">"):
                rest = lines[j][1:].strip()
                link = re.match(r"^(\S+)\s*\[([^\]]+)\]\([^)]*\)\s*$", rest)
                if link and not title:
                    emoji = link.group(1)
                    kind = next((v for k, v in KIND.items() if k in emoji), "artigo")
                    title = link.group(2)
                elif link:
                    pass
                elif rest:
                    out.append("")
                    out.append(rest)
                j += 1
            # ordem: callout primeiro, parágrafos soltos depois
            callout = f'> 🔎 **Veja mais aqui** [{kind} | busca: "{title}"]: {body}' if title else f"> 🔎 **Veja mais aqui**: {body}"
            # insere o callout antes dos parágrafos soltos já adicionados
            tail = []
            while out and out[-1] != "" or (out and len(tail) == 0 and out[-1] == ""):
                if out[-1] == "" and not tail:
                    tail.append(out.pop()); continue
                if out[-1] == "":
                    break
                tail.append(out.pop())
            out.extend(reversed(tail[:0]))
            out.append(callout)
            out.extend(reversed(tail))
            i = j
            continue
        m = re.match(r"^>\s*\*\*(💭|💡|⚠️)\s*([^*]*?):?\*\*:?\s*(.*)$", line)
        if m:
            out.append(f"> {m.group(1)} **{m.group(2).strip()}**: {m.group(3).strip()}")
        else:
            out.append(line)
        i += 1
    joined = "\n".join(out)
    joined = re.sub(r"(^> .*)\n(?=[^>\n])", r"\1\n\n", joined, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", joined).strip()

def drop_section(text, heading_re):
    lines, out, skip = text.split("\n"), [], False
    for line in lines:
        m = re.match(r"^(#{2,4})\s", line)
        if m and skip and len(m.group(1)) <= skip:
            skip = False
        if m and re.match(heading_re, line):
            skip = len(m.group(1)); continue
        if not skip: out.append(line)
    return "\n".join(out)

def between(text, start_re, end_re=None):
    lines = text.split("\n")
    a = next(i for i, l in enumerate(lines) if re.match(start_re, l))
    b = next((i for i in range(a + 1, len(lines)) if end_re and re.match(end_re, lines[i])), len(lines))
    return "\n".join(lines[a:b]).strip()

def words(t): return len(re.findall(r"\S+", t))

w1 = convert_callouts(drop_section(load(1), r"^###\s+3\.4\b"))
w1 = re.sub(r"\n\*\(\*\*\*?Sugestão.*?\)\*\n?", "\n", w1, flags=re.S)
w1 = re.sub(r"\*\(\*\*\*Sugestão.*", "", w1)

w1 = re.sub(r"^## \d+\.\s+(Síntese conceitual.*)$", r"## \1", w1, flags=re.M)
w1 = re.sub(r"^## \d+\.\s+(O que vem por aí)[ \t]*$", r"## \1", w1, flags=re.M)
w1 = re.sub(r"(## O que vem por aí\n\n)(?:\|.*\n)+", r"\1Na Semana 2 vamos subir um degrau: do conceito para a política pública. Vamos ver como o Brasil organizou o Governo Digital, o que dizem a Lei 14.129/2021 e a Estratégia Nacional, e onde o IFSC aparece nesse desenho. Cada semana constrói sobre a anterior, até a prática final.\n", w1)
w1 = re.sub(r"\n+\*\(\*\*\*?Sugest[^\n]*(?:\n[^\n#][^\n]*)*", "", w1)
w1 = re.sub(r"\n+\*\(.*?Sugestão[^\n]*", "", w1)
w1 = re.sub(r"^\*?📷[^\n]*\n?", "", w1, flags=re.M)
w1 = re.sub(r"^\*?🖼[^\n]*\n?", "", w1, flags=re.M)

w1 = re.sub(r"\s*Disponível em:\s*<?https?://\S+", "", w1)
w1 = re.sub(r"https?://\S+", "", w1)

picks = [
    (2, "Estudo de caso encadeado a uma fonte oficial, com contraponto acadêmico", lambda t: between(t, r"^## 7\. Estudo de caso", r"^### 7\.2")),
    (2, "Contraponto crítico ao fechar a semana", lambda t: between(t, r"^## 10\.", r"^## Síntese")),
    (4, "Risco teórico que precede o algoritmo", lambda t: between(t, r"^### 3\.1 Um risco teórico", r"^## 4\.")),
    (5, "Caso positivo sob pressão real", lambda t: between(t, r"^### 1\.3 Um caso positivo", r"^## 2\.")),
    (6, "Caso real do setor, com lição e reflexão", lambda t: between(t, r"^## 4\. Um caso real", r"^## 5\.")),
]
excerpts = []
for week, note, fn in picks:
    body = convert_callouts(fn(load(week)))
    excerpts.append({"week": week, "note": note, "text": body})

for e in excerpts: print("week", e["week"], words(e["text"]), "palavras:", e["note"], file=sys.stderr)
print("week 1 inteira:", words(w1), "palavras", file=sys.stderr)

js = "// GERADO por scripts/build-reference-weeks.py a partir das semanas aprovadas da TGE.\n// Não edite à mão; rode o script de novo.\n\n"
js += "export const REFERENCE_WEEK_ONE = " + json.dumps(w1, ensure_ascii=False) + ";\n\n"
js += "export const REFERENCE_EXCERPTS = " + json.dumps(excerpts, ensure_ascii=False, indent=2) + ";\n"
open(os.path.join(os.path.dirname(__file__), "..", "src", "reference-weeks.js"), "w", encoding="utf-8").write(js)
