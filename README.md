# 🔥 Akiline

Um chat estilo "Discord" feito para grupos de amigos — servidores com categorias,
canais de texto e voz, cargos, sistema de amigos e mensagens diretas.

## Rodando localmente

Não precisa de build nem de instalar nada — é HTML/CSS/JS puro.

```bash
# Qualquer servidor estático funciona, por exemplo:
npx serve .
# ou
python3 -m http.server 8080
```

Depois abra `http://localhost:8080` (ou a porta que o comando indicar).

> **Importante:** o Akiline usa `window.storage`, uma API de persistência
> disponível no ambiente de artefatos do Claude. Rodar este código fora
> desse ambiente (ex. num servidor estático comum) exige substituir
> `js/store.js` por uma implementação própria de backend/banco de dados,
> já que `window.storage` não existe fora dali.

## Estrutura do projeto

```
akiline/
├── index.html              # Estrutura de todas as telas (login, home, DM, servidor)
├── css/
│   └── style.css            # Todo o visual do app
├── js/
│   ├── store.js             # Camada de persistência + estado global
│   ├── auth.js              # Login por usuário / simulação de login Google
│   ├── profile.js           # Modal de perfil (apelido, cor, status, cargo, mic)
│   ├── friends.js           # Sistema de amigos (pedidos, pendentes, online)
│   ├── servers.js           # Criar/entrar em servidores + configurações
│   ├── channels.js          # Sidebar de categorias/canais de um servidor
│   ├── chat.js               # Mensagens de texto (canais e DMs)
│   ├── voice.js              # Canal de voz (presença, mic, compartilhar tela)
│   └── app.js                # Orquestra login e navegação entre telas
└── .github/workflows/
    └── deploy.yml            # CI (valida o código) + deploy no GitHub Pages
```

## Funcionalidades

- **Contas**: criar conta por nome de usuário, ou um botão "Entrar com Google"
  que é **uma simulação visual** (veja a seção de limitações abaixo).
- **Servidores**: criar o seu, ou entrar em um existente com um código de convite.
- **Configurações do servidor**: categorias, canais (texto e voz), cargos
  (nome + cor), e a tela de convite com o código para compartilhar.
- **Perfil**: apelido de exibição, nome de usuário, cor do avatar, frase de
  status, cargo, e o indicador de microfone ligado/desligado.
- **Amigos**: abas *Todos*, *Disponível* (online agora), *Pendente* (pedidos
  recebidos e enviados) e *Adicionar amigo* (busca por nome de usuário).
- **Mensagens diretas**: conversa 1:1 com qualquer amigo aceito.
- **Canal de voz**: lista de quem entrou, quem está mutado e quem está
  compartilhando tela — sincronizado de verdade entre os participantes.

## ⚠️ Limitações importantes (leia antes de usar com seus amigos)

1. **Login com Google não é real.** Autenticação OAuth de verdade exige um
   backend com client ID registrado no Google Cloud Console. O botão aqui
   apenas cria uma conta local do Akiline — está sinalizado na própria tela
   de login.
2. **Áudio e vídeo não trafegam entre dispositivos.** Este projeto não tem
   um servidor de mídia (SFU/TURN). O canal de voz sincroniza *quem está lá,
   quem está mudo e quem está compartilhando tela*, mas o som do microfone e
   a imagem da tela compartilhada só aparecem localmente, no seu próprio
   navegador. Para voz/vídeo real entre pessoas, plugue um provedor como
   LiveKit, Agora ou Daily.
3. **Sem servidor próprio de dados.** Tudo é salvo através de `window.storage`,
   a API de persistência do ambiente de artefatos. Fora desse ambiente, você
   precisaria de um banco de dados e uma API real.

## Publicando no GitHub Pages

O workflow em `.github/workflows/deploy.yml` já faz isso sozinho:

1. Crie um repositório no GitHub e suba este projeto.
2. Em **Settings → Pages**, em "Build and deployment", escolha a opção
   **GitHub Actions** como fonte.
3. Faça um push na branch `main` — o workflow valida o HTML/JS e publica
   o site automaticamente.

Lembre-se: como o app depende de `window.storage`, o site publicado no
GitHub Pages vai carregar visualmente, mas as funções de salvar/carregar
dados só funcionam de verdade dentro do ambiente de artefatos do Claude,
a menos que você substitua essa camada por um backend próprio.
