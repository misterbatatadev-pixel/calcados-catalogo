# Album do Google

Prototipo para transformar um album do Google Fotos em um catalogo organizado.

## O que ele faz

- Acessa um album compartilhado do Google Fotos.
- Coleta links das fotos.
- Abre cada foto e le o painel Atividade.
- Extrai preco, codigo, tamanhos e quantidades.
- Baixa a foto real do produto.
- Detecta cores aproximadas pela imagem.
- Gera `data/products.json`.
- Permite revisar produtos antes de publicar.
- Mostra o catalogo para clientes.
- Simula um vendedor robo que conversa, mostra fotos e registra pedido.
- Registra pedidos internos quando o cliente confirma pelo WhatsApp.

## Como rodar

Instale as dependencias:

```powershell
npm install
```

Importe o album:

```powershell
npm run import -- "https://photos.google.com/share/SEU_LINK_AQUI"
```

Abra o catalogo local:

```powershell
npm run serve
```

Depois acesse:

```text
http://localhost:4174
http://localhost:4174/seller.html
http://localhost:4174/review.html
http://localhost:4174/orders.html
```

## Cores com IA visual

Para analisar as cores considerando apenas o calcado e ignorando caixa/fundo, configure:

```powershell
$env:OPENAI_API_KEY="sua-chave"
npm run import -- "https://photos.google.com/share/SEU_LINK_AQUI"
```

O prompt usado fica em `config/color-analysis-prompt.md`.

## Observacoes

A cor detectada e apenas uma ajuda para filtro. A foto real continua sendo a confirmacao principal para o cliente.

## VPS

Arquivos iniciais para Docker Swarm/Traefik:

- `Dockerfile`
- `deploy/catalog-stack.yml`
- `deploy/.env.example`
- `docs/producao-vps.md`
