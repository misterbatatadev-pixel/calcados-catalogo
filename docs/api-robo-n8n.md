# API do robo para n8n

Base URL:

```text
https://catalogo.eliteagents.com.br
```

Todas as chamadas do robo precisam enviar este header:

```text
X-Bot-Token: SEU_TOKEN
```

## Buscar produtos

Endpoint:

```text
POST /api/bot/search
```

Body:

```json
{
  "message": "quero tenis preto tamanho 39",
  "limit": 5
}
```

Resposta:

```json
{
  "intent": {
    "message": "quero tenis preto tamanho 39",
    "size": "39",
    "colors": ["preto"],
    "code": ""
  },
  "count": 1,
  "products": [
    {
      "productKey": "1|4440|B2/4",
      "code": "4440",
      "priceText": "R$60,00",
      "boxLocation": "B2/4",
      "colors": ["preto", "cinza", "branco"],
      "sizes": [{"size": "39", "quantity": 1}],
      "imageUrl": "/images/4440-0001.jpg",
      "absoluteImageUrl": "https://catalogo.eliteagents.com.br/images/4440-0001.jpg"
    }
  ],
  "reply": "Texto pronto para responder ao cliente"
}
```

Use `absoluteImageUrl` para enviar a foto pela Evolution API.

## Criar pedido

Endpoint:

```text
POST /api/bot/orders
```

Body:

```json
{
  "productKey": "1|4440|B2/4",
  "size": "39",
  "customerName": "Mayara",
  "customerPhone": "5599999999999",
  "deliveryMode": "Retirada",
  "paymentMode": "Pagar na entrega/retirada",
  "note": "Pedido vindo do WhatsApp"
}
```

Resposta:

```json
{
  "order": {
    "id": "pedido-...",
    "code": "4440",
    "size": "39",
    "status": "pagamento_entrega"
  },
  "reply": "Pedido registrado: COD 4440, tamanho 39."
}
```
