# Producao na VPS

Este projeto pode rodar na sua VPS atual usando Docker Swarm e Traefik.

## Servicos

- `calcados_catalogo`: app Node que serve catalogo, revisao, vendedor robo e pedidos.
- Volume `calcados_catalogo_data`: guarda produtos importados, imagens, pedidos e publicacoes.
- Rede Docker externa: `managerNet`, a mesma usada pelo Traefik.

## Rotas publicas

Exemplo com `CATALOGO_HOST=catalogo.eliteagents.com.br`:

- `https://catalogo.eliteagents.com.br/`
- `https://catalogo.eliteagents.com.br/seller.html`
- `https://catalogo.eliteagents.com.br/review.html`
- `https://catalogo.eliteagents.com.br/orders.html`

Antes de usar com clientes, a tela de revisao, pedidos e vendedor interno deve ter protecao por login/senha.

## Deploy sugerido

1. Criar um subdominio, por exemplo `catalogo.seudominio.com.br`, apontando para a VPS.
2. Criar um repositorio no GitHub.
3. Enviar este projeto para o GitHub.
4. O GitHub Actions publica a imagem no GitHub Container Registry.
5. Ajustar `deploy/.env.example` para `.env`.
6. Subir com Docker Swarm/Portainer usando `deploy/catalog-stack.yml`.

## Proximo passo do robo vendedor real

A versao atual em `/seller.html` simula o atendimento dentro do navegador.

Para conversar pelo WhatsApp sem o cliente abrir o catalogo, o fluxo ideal usando sua stack e:

1. Cliente envia mensagem no WhatsApp.
2. Evolution API recebe a mensagem.
3. n8n recebe o webhook da Evolution.
4. n8n consulta o catalogo/API de produtos.
5. O robo responde com texto e imagens pelo WhatsApp.
6. Quando o cliente escolhe tamanho/pagamento/retirada, o n8n cria o pedido no catalogo.
7. Pedido aparece em `/orders.html`.

## O que falta para ligar WhatsApp

- Definir o subdominio do catalogo.
- Proteger telas internas com login.
- Criar endpoints de API para busca de produtos por cor/tamanho/codigo.
- Criar endpoint de pedido para o n8n chamar.
- Configurar webhook da Evolution API para o n8n.
- Criar workflow no n8n para atendimento, audio e envio de imagem.
