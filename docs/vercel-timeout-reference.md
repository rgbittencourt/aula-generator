# Referência externa: timeout de Vercel Functions

Fonte oficial consultada em 5 de outubro de 2026:

- https://vercel.com/docs/functions/limitations

Pontos usados no diagnóstico:

- Uma Vercel Function que não termina dentro da duração configurada retorna HTTP 504 `FUNCTION_INVOCATION_TIMEOUT`.
- Com Fluid Compute e runtime Node.js, o plano Hobby tem duração máxima de 300 segundos (5 minutos).
- Pro e Enterprise têm 800 segundos como máximo geral e uma extensão beta de 1800 segundos, conforme elegibilidade/configuração.
- `maxDuration` controla o limite da função, mas não resolve uma cadeia de chamadas pesadas dentro da mesma invocação; para a geração semanal, a solução aplicada foi salvar a redação inicial antes de qualquer reparo longo e separar a curadoria em outra rota.
- A própria documentação recomenda Workflows para trabalhos que precisam pausar, retomar e manter estado por períodos longos; o projeto atual usa geração distribuída por semanas e autosave local, sem depender de uma única invocação longa.
