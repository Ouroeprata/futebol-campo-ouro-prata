import { createClient } from '@supabase/supabase-js'
import './style.css'

const SUPABASE_URL = 'https://kfsxzpyzohcvzlsfvtyx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_A0uWsabYDmYB4sbMtUMgdA_3wu_PFTD'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const app=document.querySelector('#app')
let state={tab:'dashboard', matches:[], teams:[], players:[], referees:[], groups:[], competition:null}

async function load(){
  const q=async(t)=> (await supabase.from(t).select('*')).data||[]
  state.competition=(await supabase.from('competitions').select('*').eq('name','2ª Copa das Nações Ouro/Prata/Diamante').maybeSingle()).data
  ;[state.matches,state.teams,state.players,state.referees,state.groups]=await Promise.all(['matches','teams','players','referees','groups'].map(q))
  render()
}
function nav(){return `<aside><div class="brand">⚽ <span>OURO & PRATA</span></div>
<nav>${[['dashboard','Painel'],['jogos','Jogos'],['ao_vivo','Ao vivo'],['times','Times'],['atletas','Atletas'],['arbitragem','Arbitragem'],['grupos','Grupos'],['classificacao','Classificação']].map(x=>`<button class="${state.tab===x[0]?'active':''}" data-tab="${x[0]}">${x[1]}</button>`).join('')}</nav>
<div class="sidefoot">2ª Copa das Nações<br><small>Ouro • Prata • Diamante</small></div></aside>`}
function card(title,value,sub=''){return `<div class="card"><div class="muted">${title}</div><div class="big">${value}</div><div class="muted">${sub}</div></div>`}
function render(){
 app.innerHTML=`<div class="layout">${nav()}<main><header><div><div class="eyebrow">GESTÃO ESPORTIVA</div><h1>${title()}</h1></div><div class="pill">● ONLINE</div></header>${content()}</main></div>`
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()})
}
function title(){return ({dashboard:'Painel geral',jogos:'Jogos',ao_vivo:'Central ao vivo',times:'Times',atletas:'Atletas',arbitragem:'Arbitragem',grupos:'Grupos',classificacao:'Classificação'})[state.tab]}
function content(){
 if(state.tab==='dashboard') return `<section class="grid4">${card('Times',state.teams.length,'seleções cadastradas')}${card('Atletas',state.players.length,'cadastros')}${card('Árbitros',state.referees.length,'cadastros')}${card('Jogos',state.matches.length,'programados')}</section><section class="panel"><h2>2ª Copa das Nações 2026</h2><p>Central de gestão da competição. Use o menu para administrar equipes, atletas, arbitragem, jogos e classificação.</p><div class="flags">${state.teams.map(t=>`<span>${flag(t.name)} ${t.name}</span>`).join('')}</div></section><section class="panel"><h2>Próximos jogos</h2>${matchesTable()}</section>`
 if(state.tab==='jogos'||state.tab==='ao_vivo') return `<section class="panel livebox"><div><span class="status">AO VIVO</span><h2>Central de partidas</h2><p class="muted">Selecione um jogo para abrir a súmula digital e registrar eventos.</p></div>${matchesTable(true)}</section>`
 if(state.tab==='times') return list('Times',state.teams.map(t=>[flag(t.name)+' '+t.name,t.country||'Seleção']))
 if(state.tab==='atletas') return list('Atletas',state.players.map(p=>[p.name, (state.teams.find(t=>t.id===p.team_id)?.name||'')+' • '+(p.position||'')]))
 if(state.tab==='arbitragem') return list('Equipe de arbitragem',state.referees.map(r=>[r.name,r.registration||'Árbitro']))
 if(state.tab==='grupos') return list('Grupos A–H',state.groups.sort((a,b)=>a.position-b.position).map(g=>[g.name, state.teams.filter(t=>t.group_id===g.id).length+' times']))
 if(state.tab==='classificacao') return `<section class="panel"><h2>Classificação geral</h2><table><tr><th>Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>Pts</th></tr>${state.teams.map(t=>`<tr><td>${flag(t.name)} ${t.name}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td><b>0</b></td></tr>`).join('')}</table></section>`
}
function matchesTable(live=false){if(!state.matches.length)return `<div class="empty">Nenhum jogo cadastrado ainda.</div>`;return `<table><tr><th>Data</th><th>Jogo</th><th>Placar</th><th>Status</th></tr>${state.matches.map(m=>{let h=state.teams.find(t=>t.id===m.home_team_id)?.name||'Casa',a=state.teams.find(t=>t.id===m.away_team_id)?.name||'Visitante';return `<tr><td>${m.scheduled_at?new Date(m.scheduled_at).toLocaleString('pt-BR'): '—'}</td><td>${flag(h)} ${h} × ${a} ${flag(a)}</td><td><b>${m.home_score} × ${m.away_score}</b></td><td><span class="tag">${m.status}</span></td></tr>`}).join('')}</table>`}
function list(title,items){return `<section class="panel"><div class="panelhead"><h2>${title}</h2><button class="primary">+ Cadastrar</button></div>${items.length?`<table><tr><th>Nome</th><th>Detalhes</th></tr>${items.map(x=>`<tr><td><b>${x[0]}</b></td><td>${x[1]}</td></tr>`).join('')}</table>`:`<div class="empty">Nenhum registro cadastrado.</div>`}</section>`}
function flag(n){return ({Argentina:'🇦🇷',Brasil:'🇧🇷',Chile:'🇨🇱',Colômbia:'🇨🇴',Equador:'🇪🇨',Paraguai:'🇵🇾',Uruguai:'🇺🇾',Venezuela:'🇻🇪'})[n]||'⚽'}
load()
