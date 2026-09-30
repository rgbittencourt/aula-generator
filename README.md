# Gerador de Aulas

Aplicação para transformar um briefing de curso em uma trilha semanal de aulas compatível com o **Aula Studio**.

## Situação atual

- **GitHub Pages:** versão pública estática em <https://rgbittencourt.github.io/aula-generator/>. Gera exemplos e ZIP diretamente no navegador, sem IA.
- **Vercel:** implantação recomendada para ativar a IA. O mesmo repositório executa o frontend e as funções serverless `/api/health`, `/api/generate` e `/api/zip`.
- **Segurança:** a chave da OpenAI deve ser cadastrada somente como variável secreta da Vercel. Ela nunca deve entrar no GitHub, no arquivo `.env` versionado ou nesta conversa.

## Passo a passo: criar a chave da API OpenAI

A assinatura do ChatGPT e o uso da API são gerenciados em áreas diferentes da OpenAI. Para o gerador, é necessária uma **API key** da plataforma de desenvolvedores.

1. Abra <https://platform.openai.com/> e entre na sua conta.
2. No painel, selecione o projeto que usará o gerador. Se a OpenAI solicitar, crie um projeto separado, por exemplo `Aula Generator`.
3. Abra a área **API keys**. O endereço direto costuma ser <https://platform.openai.com/api-keys>.
4. Clique em **Create new secret key**.
5. Dê um nome identificável, como `aula-generator-vercel`.
6. Crie a chave e copie-a imediatamente. A chave completa normalmente só é exibida nessa criação.
7. Guarde-a temporariamente em um gerenciador de senhas. **Não cole a chave no GitHub, no README, no navegador público ou no chat.**

Se a plataforma solicitar configuração de cobrança ou limites de uso, faça essa configuração diretamente no painel da OpenAI, nunca no código do projeto.

## Passo a passo: publicar a versão com IA na Vercel

1. Abra <https://vercel.com/>.
2. Clique em **Sign Up** ou **Log In**.
3. Escolha **Continue with GitHub** e autorize a Vercel a acessar o repositório `rgbittencourt/aula-generator`.
4. No painel da Vercel, clique em **Add New… → Project**.
5. Em **Import Git Repository**, localize `rgbittencourt/aula-generator` e clique em **Import**.
6. Na configuração do projeto, mantenha:
   - **Framework Preset:** `Other` ou detecção automática;
   - **Root Directory:** raiz do repositório;
   - **Build Command:** vazio;
   - **Output Directory:** vazio;
   - **Install Command:** `npm install` ou detecção automática.
7. Antes de publicar, abra a seção **Environment Variables** e adicione estas variáveis:

   | Nome | Valor | Ambientes |
   |---|---|---|
   | `OPENAI_API_KEY` | cole a chave criada na etapa anterior | Production, Preview e Development |
   | `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Production, Preview e Development |
   | `OPENAI_MODEL` | `gpt-4o-mini` | Production, Preview e Development |
   | `AULA_ACCESS_CODE` | crie uma frase/código privado seu | Production, Preview e Development |

8. Clique em **Deploy**.
9. Aguarde a conclusão. A Vercel fornecerá uma URL parecida com `https://aula-generator-xxxx.vercel.app`.
10. Abra essa URL e confira o indicador no cabeçalho. Ele deve informar **IA configurada · código necessário**.
11. Informe no campo **Código de acesso da IA publicada** exatamente o valor colocado em `AULA_ACCESS_CODE`.
12. Preencha o briefing e clique em **Gerar com IA**.

O `AULA_ACCESS_CODE` não é a chave da OpenAI. Ele é uma proteção adicional para evitar que qualquer visitante da URL consuma a sua API. Não use a mesma senha da OpenAI ou da sua conta GitHub.

## Se você alterar uma variável na Vercel

Depois de alterar `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` ou `AULA_ACCESS_CODE`:

1. Abra o projeto na Vercel.
2. Acesse **Deployments**.
3. Abra o menu da implantação mais recente.
4. Escolha **Redeploy**.
5. Confirme o redeploy sem usar o cache, se essa opção aparecer.

## O que a IA gera

O fluxo tem duas etapas:

1. **Preencher vazios com IA:** usa o tema, calendário, carga horária e informações já fornecidas para completar apenas os campos vazios do briefing. Sugere público, objetivos observáveis, conteúdos, referências para conferir e termos de busca de vídeos sem inventar URLs.
2. **Gerar com IA:** transforma o briefing revisado em uma semana por objeto, com blocos compatíveis com o Aula Studio. Cada semana pode ser baixada como `.aula.json` e todas podem ser empacotadas em um ZIP.

Webpráticas são cadastradas como uma lista independente. Quando ativadas, o briefing deve ter no mínimo uma prática; a IA pode propor várias, cada uma com tipo, momento, objetivo específico, instruções, produto/evidência, avaliação e duração. A interface preserva práticas já preenchidas e só completa o conjunto quando ele estiver vazio.

Materiais de apoio também são itens independentes. Cada material pode indicar tipo, título, momento de uso, link real, objetivo, alinhamento com o conteúdo e como o estudante deverá utilizá-lo. A IA deve relacionar os materiais aos objetivos, textos, conceitos e webpráticas, mas não deve inventar links, DOI ou fontes verificadas. Todo material sugerido precisa ser conferido pelo professor antes da publicação.

A distribuição detalhada de horas está preparada para receber as fórmulas da planilha. Até lá, o sistema registra a carga semanal e informa que a alocação interna está pendente.

## Uso local com IA

Para usar o backend localmente:

```bash
cp .env.example .env
# edite .env e preencha OPENAI_API_KEY e AULA_ACCESS_CODE, se desejar proteção
npm install
npm run dev
```

Abra <http://127.0.0.1:4310>.

### Variáveis de ambiente

```text
OPENAI_API_KEY=chave-local-nunca-commitada
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
AULA_ACCESS_CODE=um-codigo-privado-opcional
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
