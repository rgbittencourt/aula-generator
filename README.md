# Gerador de Aulas

Aplicação local para transformar um briefing de curso em uma trilha semanal de aulas compatível com o **Aula Studio**.

## O que já faz

O formulário aceita tema geral, público, nível, número de semanas, horas de estudo por semana, calendário por numeração ou data de início, webpráticas, objetivos, conteúdos, referências e links de vídeos. O resultado pode ser gerado por IA ou por um exemplo local sem API. Cada semana é baixável como `.aula.json` e todas podem ser empacotadas em um ZIP.

A distribuição detalhada de horas está preparada para receber as fórmulas da planilha. Até lá, o sistema registra a carga semanal e informa que a alocação interna está pendente.

## Requisitos

- Node.js 22 ou superior;
- uma chave de API de um provedor OpenAI-compatible para geração com IA;
- acesso local ao repositório privado do Aula Studio apenas para abrir os arquivos gerados no editor.

## Executar

```bash
cp .env.example .env
# edite .env e preencha OPENAI_API_KEY
npm install
npm run dev
```

Abra <http://127.0.0.1:4310>.

Para validar o fluxo sem configurar uma chave, clique em **Gerar exemplo local**. O endpoint `GET /api/health` informa se a IA está configurada.

### Variáveis de ambiente

```text
OPENAI_API_KEY=chave-local-nunca-commitada
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
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
