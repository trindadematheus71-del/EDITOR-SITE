LUXX STORE AD — pacote Cloudflare Pages

ESTRUTURA
- index.html: editor original com alteração apenas no mecanismo de salvamento/carregamento.
- functions/api/store.js: grava e lê o cadastro no D1.
- functions/api/upload.js: recebe imagens e grava no R2.
- functions/api/images/[key].js: entrega imagens do R2.
- schema/d1.sql: tabela necessária no D1.

ANTES DE PUBLICAR
1. No D1 editor-site, abra Console e execute o conteúdo de schema/d1.sql.
2. No Pages, confirme os bindings em Production: DB apontando para D1 editor-site; BUCKET apontando para R2 editor-site.
3. Envie TODO o conteúdo deste ZIP para a raiz do repositório GitHub, mantendo a pasta functions e o arquivo index.html na raiz. Faça commit/push e aguarde o deploy.
4. Teste o editor: cadastre um produto e uma imagem; recarregue a página para conferir se continuam lá.

IMPORTANTE
- O HTML e a lógica visual foram preservados; a alteração funcional é o armazenamento compartilhado na nuvem.
- O primeiro acesso importa os dados locais existentes apenas se não houver dados no D1. Se você já cadastrou produtos em outro navegador, eles não serão descobertos automaticamente.
- O endpoint usa a mesma proteção de login que já existia no HTML (login no navegador). Como esse login já era somente no lado do cliente, não é uma autenticação segura de API. Antes de expor o editor publicamente, proteja as rotas /api/* com Cloudflare Access ou autenticação de servidor.
- Cada alteração salva o estado inteiro da loja no D1. Imagens são armazenadas no R2.
