# Senhas do Equina no iPhone (Password AutoFill)

O app iOS declara `webcredentials:www.equina.ai` e `webcredentials:equina.ai`
(`ios.associatedDomains` no `app.json`). Para o iPhone ligar o app ao site e
preencher a senha salva (com Face ID), o site precisa publicar o arquivo
`apple-app-site-association` desta pasta.

Onde publicar, nos dois domínios:

- `https://www.equina.ai/.well-known/apple-app-site-association`
- `https://equina.ai/.well-known/apple-app-site-association`

Regras da Apple:

- HTTPS com certificado válido, **sem redirecionamento**. Hoje `equina.ai`
  redireciona (308) para `www.equina.ai`: no apex a Apple não segue o
  redirecionamento, então o que vale é o `www`. O apex funciona se o site
  servir o arquivo ali também, sem redirecionar.
- Resposta `200` com `Content-Type: application/json`, sem extensão no nome.
- `3F67G37DN8` é o Team ID da conta Apple que publica o app
  (`com.equina.mobile`). Se o app mudar de conta, o ID muda aqui.

A Apple busca o arquivo pelo CDN dela quando o app é instalado ou atualizado,
e o guarda em cache por até um dia. Depois de publicar, reinstalar o app pelo
TestFlight faz o iPhone buscar de novo.

Para conferir:

```bash
curl -sI https://www.equina.ai/.well-known/apple-app-site-association
curl -s https://app-site-association.cdn-apple.com/a/v1/www.equina.ai
```
