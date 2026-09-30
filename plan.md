# Plano — Gerador de Aulas

## Objetivo

Criar uma aplicação local separada do `aula-studio` para planejar cursos e gerar uma aula editável por semana. A saída principal será um arquivo `.aula.json` por semana, compatível com o botão **Abrir** do Aula Studio, além de um ZIP consolidado.

## Decisões confirmadas

- Repositório separado: `rgbittencourt/aula-generator`.
- Aplicação local/GitHub privado; sem serviços Manus gerenciados.
- Geração assistida por IA por meio de backend server-side.
- Chave de API somente em `.env`, nunca no navegador ou no Git.
- Calendário com duas modalidades selecionáveis ao iniciar o projeto:
  - numeração de semanas;
  - calendário real com data inicial.
- Saída: um `.aula.json` por semana e ZIP com os JSONs semanais.
- A futura planilha fornecerá as fórmulas oficiais de carga horária e distribuição; a camada de cálculo será substituível e testável.

## Arquitetura

### Servidor

Node.js 22 + Express, servindo o frontend estático e os endpoints:

- `GET /api/health` — verificação local;
- `POST /api/generate` — recebe o briefing e chama um endpoint OpenAI-compatible usando `OPENAI_API_KEY`, `OPENAI_BASE_URL` e `OPENAI_MODEL` do ambiente;
- `POST /api/zip` — valida e empacota as semanas em ZIP.

O servidor usa o mesmo origin do frontend para evitar CORS no uso local. Nenhum segredo é enviado para o cliente.

### Frontend

HTML/CSS/JavaScript modular, sem build obrigatório para facilitar uso local:

- formulário de briefing do curso;
- escolha de calendário por semana ou data;
- entrada de horas de estudo por semana;
- configuração de webpráticas e momentos de aplicação;
- conteúdos, objetivos, referências e links de vídeos;
- escolha do número de semanas;
- prévia das semanas geradas;
- download individual dos JSONs e ZIP consolidado.

### Contrato de dados

O gerador produz:

```json
{
  "meta": {
    "title": "Título da semana",
    "courseTitle": "Curso",
    "weekNumber": 1,
    "weekLabel": "Semana 1",
    "studyHours": 4,
    "author": "",
    "role": "",
    "institution": "",
    "year": "2026",
    "aiTool": "",
    "aiUse": "",
    "license": "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br"
  },
  "blocks": []
}
```

Cada bloco seguirá o contrato atual do editor: `id`, `type`, `bg`, `pad` e `props`. O gerador só aceitará tipos conhecidos pelo catálogo do Aula Studio e preservará propriedades aninhadas necessárias para tópicos, accordions, colunas e linhas do tempo.

## IA

A IA recebe um briefing estruturado e deve retornar JSON com a lista de semanas e blocos. O servidor:

1. normaliza e limita entradas;
2. envia instruções pedagógicas e o catálogo de tipos;
3. interpreta JSON mesmo quando o provedor não oferece schema estrito;
4. valida semanas e blocos;
5. corrige IDs, datas e metadados;
6. rejeita resposta sem `blocks` ou com erro estrutural.

O primeiro adaptador será OpenAI-compatible. Para outro provedor, basta alterar `OPENAI_BASE_URL`, `OPENAI_MODEL` e, se necessário, o adaptador server-side.

## Cálculos

A primeira versão calcula apenas o total semanal e a agenda base, mantendo a distribuição interna explicitamente como perfil provisório. O módulo `src/calculations.js` terá uma função pura e uma configuração de fórmulas, para que a planilha futura seja integrada sem alterar a UI ou o formato de saída.

Quando a planilha for recebida, serão extraídos:

- fórmulas;
- unidades e conversões;
- arredondamentos;
- regras para webpráticas;
- distribuição de minutos por conteúdo, prática, avaliação e revisão;
- casos-limite e semanas incompletas.

## Exportação

- cada semana será baixável individualmente como `semana-01-slug.aula.json`;
- o ZIP conterá os JSONs semanais em `semanas/`;
- o JSON pode ser aberto diretamente pelo Aula Studio;
- o SCORM/Moodle continuará sendo gerado no Aula Studio depois da revisão do JSON, preservando a separação entre planejamento e edição/publicação.

## Desenvolvimento e validação

- `npm install` seguido de `npm run dev`;
- `npm test` para validação de schema, cálculo, normalização e ZIP;
- `GET /api/health` para confirmar o servidor;
- teste sem chave deve retornar erro claro, sem expor configuração;
- teste com resposta fixture deve gerar JSONs e ZIP determinísticos;
- nenhum `.env` real será commitado.

## Escopo fora desta primeira etapa

- login multiusuário;
- banco de dados ou persistência remota;
- publicação pública;
- exportação SCORM diretamente no gerador;
- sincronização automática com Moodle;
- fórmulas finais antes do recebimento da planilha.
