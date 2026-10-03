# Futebol Campo Online — Ouro & Prata

Aplicativo profissional para gestão da 2ª Copa das Nações Ouro/Prata/Diamante 2026, conectado ao Supabase.

## Recursos
- Painel geral e acompanhamento online
- Cadastro de times, atletas, árbitros e jogos
- Grupos A–H
- Calendário de partidas
- Central ao vivo / súmula digital
- Cronômetro de 1º e 2º tempo com pausa persistente
- Gols, cartões, substituições e incidentes
- Escalação de titulares e reservas
- Votação de melhor jogador
- Classificação automática a partir dos jogos encerrados
- Realtime para partidas, eventos, escalações e votos
- Login Supabase e perfis de acesso
- RLS no banco e auditoria de segurança
- Interface responsiva para celular, tablet e computador

## Banco já configurado
Projeto Supabase: `kfsxzpyzohcvzlsfvtyx`
Região: `sa-east-1`
Competição: `2ª Copa das Nações Ouro/Prata/Diamante`

## Executar
```bash
npm install
npm run dev
```

Para produção:
```bash
npm run build
npm run preview
```

## Publicação
Pode ser publicado em Vercel, Netlify, Cloudflare Pages ou outro serviço estático. O frontend usa apenas a chave publishable do Supabase.

## Acesso operacional
O primeiro cadastro criado pelo aplicativo recebe perfil `publico`. Para operar a súmula e os cadastros, um administrador deve atribuir no banco o perfil `admin`, `organizador`, `arbitro` ou `operador`.

Nunca coloque uma `service_role` ou secret key no frontend.
