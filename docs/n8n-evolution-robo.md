# Workflow n8n com Evolution API

Importe este arquivo no n8n:

```text
n8n/whatsapp-robo-vendedor-basico.json
```

## O que ele faz

1. Recebe mensagem da Evolution API em um Webhook do n8n.
2. Extrai telefone e texto do cliente.
3. Ignora mensagens enviadas por voce, grupos e numeros fora da lista de teste.
4. Consulta `POST /api/bot/search` no catalogo.
5. Prepara uma resposta com codigo, preco, tamanhos e foto.
6. Chama a Evolution API para enviar texto.
7. Chama a Evolution API para enviar a primeira foto.

## Lista de numeros permitidos

No node `Normalizar mensagem`, ajuste:

```js
const allowedNumbers = ['5591983856273'];
```

Enquanto estiver testando, deixe apenas seus numeros. Para liberar mais contatos, adicione:

```js
const allowedNumbers = ['5591983856273', '55OUTRONUMERO'];
```

## Campos para trocar depois de importar

No node `Buscar no catalogo`:

```text
X-Bot-Token = token real do catalogo
```

Nos nodes `Enviar texto Evolution` e `Enviar foto Evolution`:

```text
URL = https://evoapimanager.eliteagents.com.br/message/sendText/NOME_DA_INSTANCIA
URL = https://evoapimanager.eliteagents.com.br/message/sendMedia/NOME_DA_INSTANCIA
apikey = chave real da Evolution API
```

## Webhook

Depois de importar e ativar o workflow, copie a URL de producao do node `Webhook Evolution`.

Essa URL deve ser cadastrada na Evolution API como webhook da instancia do WhatsApp.

## Observacao

Esta e a primeira versao operacional: ela responde consulta de produto. A proxima etapa e guardar contexto da conversa para quando o cliente responder "quero tamanho 39", criar o pedido em `/api/bot/orders`.
