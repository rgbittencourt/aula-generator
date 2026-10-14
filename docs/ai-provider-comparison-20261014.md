# Comparação de provedores de IA — 14/10/2026

## OpenAI

- Documentação oficial de limites: https://developers.openai.com/api/docs/guides/rate-limits
- Os limites são medidos por RPM, TPM, TPD e outros indicadores; variam por organização, projeto e modelo.
- A OpenAI informa cabeçalhos como `Retry-After`, `x-ratelimit-reset-tokens` e `x-ratelimit-reset-project-tokens`.
- A documentação recomenda aguardar `Retry-After`, aplicar backoff exponencial com jitter e não repetir erros de quota, cobrança ou ação necessária.
- A mensagem vista no Gerador (`Limit 30000 ... Requested 44732`) é compatível com excesso de tokens solicitados no bucket da organização/modelo, não com senha incorreta.

## Anthropic Claude

- Limites oficiais: https://platform.claude.com/docs/en/api/rate-limits
- Modelos e capacidades: https://platform.claude.com/docs/en/models/overview
- Saída estruturada: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- A API Messages mede RPM, ITPM (input tokens per minute) e OTPM (output tokens per minute) por classe de modelo.
- A Anthropic recomenda aguardar `retry-after` quando presente e também aplica limites de aceleração quando há aumento brusco de tráfego.
- Para a maioria dos modelos, tokens de entrada lidos do cache não contam para ITPM; tokens gerados contam para OTPM. Portanto, Claude não elimina limites, mas pode ter comportamento mais favorável para prompts repetidos com cache.
- A documentação atual descreve `output_config.format` com `json_schema` para respostas estruturadas, sujeito às limitações e à habilitação do modelo/conta.
- A API usa `POST /v1/messages`, `x-api-key` e `anthropic-version`, enquanto o código existente usava exclusivamente `POST /v1/chat/completions` com `Authorization: Bearer`.

## Decisão técnica

O Gerador passa a ter uma camada de provedor configurável. OpenAI continua sendo o padrão e Claude pode ser ativado por variáveis de ambiente, sem alterar o JSON de aula, a pesquisa de recursos, a separação aluno/professor ou a retomada semanal. A troca deve ser validada com uma chave Anthropic real e um teste de geração antes de ser considerada superior para este projeto.
