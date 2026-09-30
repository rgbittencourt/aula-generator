# Perfil interno de dimensionamento

Este documento registra as regras usadas diretamente pela aplicação. Ele é apenas documentação do código e não é carregado de nenhuma fonte externa durante a execução.

## Regras

- Conteúdo digital: `palavras / 273 × 5` minutos.
- Leitura acadêmica: `páginas × 5` minutos.
- Leitura indicada/popular: `páginas × 3` minutos.
- Leitura sem páginas: `palavras / 273 × fator da categoria`.
- Vídeos e áudios: duração informada ou localizada pelo provedor; sem duração, ficam pendentes.
- Fórum: `posts × 120` minutos.
- Imagens e diagramas: `quantidade × 4` minutos de observação orientada.
- Bases de dados: `quantidade × 20` minutos de exploração inicial.
- Quiz: `questões × 3` minutos quando não houver duração explícita.
- Atividade instrucional equivalente: `0,5 × atividade de aprendizagem`.

## Versionamento

O identificador atual é `aula-generator-internal-v1`, versão `2026-09-30`. Mudanças futuras devem alterar a versão, atualizar os testes e registrar a justificativa no código.
