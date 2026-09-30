# Gerador de Aulas

Aplicação para transformar um briefing de curso em uma trilha semanal de aulas compatível com o **Aula Studio**.

## Abrir diretamente pelo navegador

O frontend público é publicado pelo GitHub Pages em:

<https://rgbittencourt.github.io/aula-generator/>

Na versão GitHub Pages, use **Gerar exemplo local**. Ela funciona sem terminal, backend ou chave de API e gera os arquivos `.aula.json` e o ZIP diretamente no navegador.

A geração por IA fica desativada nessa URL de propósito: GitHub Pages é hospedagem estática e não pode guardar uma `OPENAI_API_KEY` com segurança. Para ativar IA, será necessário publicar o backend em uma hospedagem com variáveis secretas protegidas.

## O que o gerador prepara

O formulário aceita tema geral, público, nível, número de semanas, horas de estudo por semana, calendário por numeração ou data de início, webpráticas, objetivos, conteúdos, referências e links de vídeos. Cada semana pode ser baixada como `.aula.json` e todas podem ser empacotadas em um ZIP.

A distribuição detalhada de horas está preparada para receber as fórmulas da planilha. Até lá, o sistema registra a carga semanal e informa que a alocação interna está pendente.

## Uso local com IA

Para usar a IA por um backend local protegido:

```bash
cp .env.example .env
# edite .env e preencha OPENAI_API_KEY
npm install
npm run dev
```

Abra <http://127.0.0.1:4310>.

### Variáveis de ambiente

```text
OPENAI_API_KEY=chave-local-nunca-commitada
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
HOST=127.0.0.1
PORT=4310
```

`OPENAI_BASE_URL` permite usar outro provedor compatível com Chat Completions. A chave é usada apenas pelo backend e não é enviada ao navegador.

## Saída

Os arquivos semanais seguem o contrato aceito pelo botão **Abrir** no Aula Studio:

```text
semana-01-titulo.aula.json
semana-02-titulo.aula.json
...
```

O ZIP contém os arquivos em `semanas/`. Depois da revisão no Aula Studio, use **Exportar → Pacote SCORM (.zip)** para enviar a aula ao Moodle.

## Próxima etapa

Ao receber a planilha, substitua o perfil provisório em `src/calculations.js` pelas fórmulas reais, incluindo conversões, arredondamentos e regras de webpráticas. O contrato da interface e dos JSONs não precisa mudar.
