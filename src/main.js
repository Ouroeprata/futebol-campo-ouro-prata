import { createClient } from '@supabase/supabase-js'
import './style.css'
import logoOuroPrata from './logo_ouro_prata.jpg'
import logoCopaNacoes from './logo_copa_das_nacoes_diamante.png'

const SUPABASE_URL = 'https://kfsxzpyzohcvzlsfvtyx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_A0uWsabYDmYB4sbMtUMgdA_3wu_PFTD'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const app = document.querySelector('#app')

const state = {
  tab: 'dashboard', competition: null, competitions: [], matches: [], teams: [], players: [], referees: [], groups: [],
  selectedMatch: null, events: [], allEvents: [], lineups: [], votes: [], sponsors: [], media: [], session: null, profile: null, editingEventId: null,
  reportType: null, reportMatchId: null, siteAccessCount: 0, moderator: null, moderatorRequests: [],
  pendingLineup: {},
  authMode: 'login', loading: false, timerStartedAt: null, timerHalf: null, timerInterval: null, eventClockSeconds: 0, eventType: 'gol', eventTimerStartedAt: null, eventTimerInterval: null, editingSubId: null
}

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
const flag = n => {
  const key = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
  const codes = {
    argentina:'ar', brasil:'br', chile:'cl', colombia:'co', equador:'ec', paraguai:'py', uruguai:'uy', venezuela:'ve',
    'africa do sul':'za', argelia:'dz', camaroes:'cm', egito:'eg', gana:'gh', marrocos:'ma', nigeria:'ng', senegal:'sn'
  }
  const code = codes[key]
  return code
    ? `<img class="team-flag" src="https://flagcdn.com/w40/${code}.png" alt="Bandeira de ${esc(n)}" title="${esc(n)}" loading="eager" decoding="async" onerror="this.style.display='none'">`
    : '⚽'
}
const teamName = id => state.teams.find(t => t.id === id)?.name || '—'
const playerName = id => { const p=state.players.find(x=>x.id===id); return p ? (p.full_name||p.name||'—') : '—' }
const fmtDate = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—'
const ADMIN_EMAIL = 'copadasnacoesouroeprata@gmail.com'
const canOperate = () => !!state.session && ['admin','organizador','arbitro','operador'].includes(state.profile?.role)
const isAdmin = () => !!state.session && String(state.session.user?.email||'').trim().toLowerCase()===ADMIN_EMAIL && state.profile?.role==='admin'
const isModerator = () => !!state.session && !!state.moderator?.approved
const canLiveOperate = () => canOperate() || (isModerator() && state.selectedMatch?.status!=='encerrado')
const roleLabel = r => ({admin:'Administrador',organizador:'Organizador',arbitro:'Árbitro',operador:'Operador',moderador:'Moderador',publico:'Público'})[r] || 'Público'
const cat = v => ({
  ouro: 'Ouro',
  prata: 'Prata',
  diamante: 'Diamante'
}[String(v || '').trim().toLowerCase()] || String(v || '—'))

const age = v => {
  if (!v) return '—'
  const d = new Date(String(v).slice(0,10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return '—'
  const n = new Date()
  let a = n.getFullYear() - d.getFullYear()
  const md = n.getMonth() - d.getMonth()
  if (md < 0 || (md === 0 && n.getDate() < d.getDate())) a--
  return a >= 0 ? String(a) : '—'
}

async function loadProfile(session){
  if(!session) return null
  const profileRes = await supabase.from('profiles').select('id,full_name,role,phone,created_at').eq('id', session.user.id).maybeSingle()
  if(profileRes.data) return profileRes.data
  const rpcRes = await supabase.rpc('get_my_profile')
  if(!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length) return rpcRes.data[0]
  console.warn('Não foi possível carregar o perfil do usuário.', {
    userId: session.user.id,
    profileError: profileRes.error?.message || null,
    rpcError: rpcRes.error?.message || null
  })
  return null
}

async function loadModeratorData(){
  state.moderator=null
  state.moderatorRequests=[]
  if(!state.session)return
  try{
    const own=await supabase.from('moderators').select('id,user_id,username,approved,created_at,approved_at').eq('user_id',state.session.user.id).maybeSingle()
    if(own.data) state.moderator=own.data
    if(isAdmin()){
      const all=await supabase.from('moderators').select('id,user_id,username,approved,created_at,approved_at').order('created_at',{ascending:false})
      if(!all.error) state.moderatorRequests=all.data||[]
    }
  }catch(e){console.warn('Tabela de moderadores ainda não configurada no Supabase.',e)}
}

async function updateSiteAccessCount(){
  try{
    const key='ouro_prata_site_access_registered'
    const alreadyRegistered=sessionStorage.getItem(key)==='1'
    const res=alreadyRegistered
      ? await supabase.rpc('get_site_access_count')
      : await supabase.rpc('increment_site_access')
    if(!res.error && res.data!==null && res.data!==undefined){
      state.siteAccessCount=Number(res.data)||0
      if(!alreadyRegistered) sessionStorage.setItem(key,'1')
    }
  }catch(e){
    console.warn('Não foi possível atualizar o contador de acessos.',e)
  }
}

async function load(){
  state.loading=true
  await updateSiteAccessCount()
  const sessionRes=await supabase.auth.getSession(); state.session=sessionRes.data.session
  if(state.session){
    const userRes=await supabase.auth.getUser()
    if(userRes.error||!userRes.data.user){await supabase.auth.signOut();state.session=null;state.profile=null}
    else{state.session={...state.session,user:userRes.data.user};state.profile=await loadProfile(state.session);await loadModeratorData()}
  } else {state.profile=null;state.moderator=null;state.moderatorRequests=[]}
  const cr=await supabase.from('competitions').select('*').order('season',{ascending:false}).order('created_at',{ascending:false})
  state.competitions=cr.data||[]
  if(!state.competitions.length){state.competition=null;state.matches=[];state.teams=[];state.players=[];state.groups=[];state.sponsors=[];state.media=[];state.allEvents=[];state.loading=false;render();return}
  const saved=localStorage.getItem('ouro_prata_competition_id')
  state.competition=state.competitions.find(x=>x.id===saved)||state.competitions[0]
  await loadCompetitionData(); state.loading=false; render()
}

async function loadCompetitionData(){
  if(!state.competition)return
  localStorage.setItem('ouro_prata_competition_id',state.competition.id)
  state.selectedMatch=null; state.events=[]; state.lineups=[]; state.votes=[]
  const cid=state.competition.id
  const [mr,tr,gr,sr,mdr,rr]=await Promise.all([
    supabase.from('matches').select('*').eq('competition_id',cid),
    supabase.from('teams').select('*').eq('competition_id',cid),
    supabase.from('groups').select('*').eq('competition_id',cid).order('position',{ascending:true}),
    supabase.from('sponsors').select('*').eq('competition_id',cid),
    supabase.from('media_files').select('*').eq('competition_id',cid).order('created_at',{ascending:false}),
    supabase.from('referees').select('*')
  ])
  state.matches=mr.data||[]; state.teams=tr.data||[]; state.groups=gr.data||[]; state.sponsors=sr.data||[]; state.media=mdr.data||[]; state.referees=rr.data||[]
  const tids=state.teams.map(x=>x.id)
  const pr=tids.length?await supabase.from('players').select('*').in('team_id',tids):{data:[]}; state.players=pr.data||[]
  const mids=state.matches.map(x=>x.id)
  const er=mids.length?await supabase.from('match_events').select('*').in('match_id',mids).order('created_at',{ascending:true}):{data:[]}; state.allEvents=er.data||[]
  state.matches.sort((x,y)=>new Date(x.scheduled_at||0)-new Date(y.scheduled_at||0))
  await ensureThirdPlaceMatch();
  await syncKnockoutBracket();
}

async function switchCompetition(id){
  const next=state.competitions.find(x=>x.id===id); if(!next)return
  state.competition=next; state.tab='dashboard'; state.reportType=null
  await loadCompetitionData(); render()
}
async function loadMatchDetails(id, doRender=true){
  if(state.selectedMatch?.id!==id){state.eventClockSeconds=0;state.eventTimerStartedAt=null;stopEventTicker();state.editingSubId=null}
  state.selectedMatch = state.matches.find(m=>String(m.id)===String(id)) || null
  if(!state.selectedMatch){
    const mr = await supabase.from('matches').select('*').eq('id',id).maybeSingle()
    state.selectedMatch = mr.data || null
    if(state.selectedMatch){
      const i=state.matches.findIndex(m=>String(m.id)===String(id))
      if(i>=0) state.matches[i]=state.selectedMatch; else state.matches.push(state.selectedMatch)
    }
  }
  if(!state.selectedMatch){ state.events=[]; state.lineups=[]; state.votes=[]; if(doRender) render(); return }
  const [ev,lu,v] = await Promise.all([
    supabase.from('match_events').select('*').eq('match_id',id).order('created_at',{ascending:true}),
    supabase.from('match_lineups').select('*').eq('match_id',id),
    supabase.from('match_votes').select('*').eq('match_id',id)
  ])
  state.events=ev.data||[]; state.lineups=lu.data||[]; state.votes=v.data||[]
  if(doRender) render()
}

function subscribe(){
  supabase.channel('futebol-campo-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'matches'}, async payload=>{
      const i=state.matches.findIndex(x=>x.id===payload.new?.id)
      if(payload.eventType==='DELETE'){ if(i>=0) state.matches.splice(i,1) }
      else if(i>=0) state.matches[i]=payload.new; else state.matches.push(payload.new)
      if(state.selectedMatch?.id===payload.new?.id) await loadMatchDetails(payload.new.id,false)
      render()
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'match_events'}, async payload=>{
      if(state.selectedMatch?.id===payload.new?.match_id) await loadMatchDetails(state.selectedMatch.id,false)
      render()
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'match_lineups'}, async payload=>{
      if(state.selectedMatch?.id===payload.new?.match_id) await loadMatchDetails(state.selectedMatch.id,false)
      render()
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'match_votes'}, async payload=>{
      if(state.selectedMatch?.id===payload.new?.match_id) await loadMatchDetails(state.selectedMatch.id,false)
      render()
    }).subscribe()
}

function nav(){return `<aside><div class="brand">⚽ <span>OURO & PRATA</span></div><nav>${[['dashboard','Painel','🏠'],['campeonatos','Campeonatos','🏆'],['jogos','Jogos','📅'],['ao_vivo','Ao vivo','📡'],['times','Times','⚽'],['atletas','Atletas','👤'],['arbitragem','Arbitragem','🚩'],['grupos','Grupos','🗂️'],['classificacao','Classificação','📊'],['patrocinadores','Patrocinadores','⭐'],['midia','Fotos / Arquivos','🖼️'],['relatorios','Relatórios','📄'],['moderadores','Moderadores','🛡️']].map(x=>`<button class="${state.tab===x[0]?'active':''}" data-tab="${x[0]}"><i>${x[2]}</i><span>${x[1]}</span></button>`).join('')}</nav><div class="sidefoot">${esc(state.competition?.name||'Nenhum campeonato')}<br><small>${state.competition?.season||''}</small></div></aside>`}
function header(){return `<header class="app-header"><div class="brand"><img class="app-logo" src="${logoOuroPrata}" alt="Seleção Ouro e Prata"><div><div class="eyebrow">GESTÃO ESPORTIVA • ONLINE</div><h1>${title()}</h1><div class="brand-subtitle">${esc(state.competition?.name||'Nenhum campeonato')} ${state.competition?.season?`• ${state.competition.season}`:''}</div></div></div><div class="header-actions"><label class="competition-switch"><span>CAMPEONATO</span><select id="competitionSelector">${state.competitions.map(c=>`<option value="${c.id}" ${c.id===state.competition?.id?'selected':''}>${esc(c.name)}${c.season?` • ${c.season}`:''}</option>`).join('')}</select></label><span class="pill">● ${state.session?'CONECTADO':'MODO PÚBLICO'}</span><button class="userbtn" id="authBtn">${state.session?`👤 ${esc(state.moderator?.username||state.profile?.full_name||state.session.user.email)} · ${state.moderator?'Moderador':roleLabel(state.profile?.role)}`:'🔐 Entrar'}</button></div></header>`}
function title(){return ({dashboard:'Painel geral',campeonatos:'Campeonatos',jogos:'Jogos',ao_vivo:'Central ao vivo',times:'Times',atletas:'Atletas',arbitragem:'Arbitragem',grupos:'Classificação por grupo',classificacao:'Classificação geral',patrocinadores:'Patrocinadores',midia:'Fotos e arquivos',relatorios:'Relatórios',moderadores:'Moderadores'})[state.tab]}
function card(title,value,sub=''){return `<div class="card"><div class="muted">${title}</div><div class="big">${value}</div><div class="muted">${sub}</div></div>`}
function content(){
  if(state.tab==='campeonatos') return competitionsView()
  if(state.tab==='dashboard') return `<section class="public-portal-banner"><div><span class="status ao_vivo">● ACOMPANHAMENTO AO VIVO</span><h2>Resultados e informações dos jogos em tempo real</h2><p class="muted">Qualquer pessoa pode acompanhar placares, tempo de jogo, escalações, arbitragem e ocorrências sem fazer login.</p></div><button class="primary" data-tab-direct="ao_vivo">🔴 Ver jogos ao vivo</button></section><section class="grid4 dashboard-stats">${card('Times',state.teams.length,'seleções cadastradas')}${card('Atletas',state.players.length,'cadastros')}${card('Árbitros',state.referees.length,'cadastros')}${card('Jogos',state.matches.length,'na competição')}${card('Acessos',Number(state.siteAccessCount||0).toLocaleString('pt-BR'),'ao site')}</section><section class="panel hero"><div><span class="status">${state.competition?.status?.toUpperCase()||'ATIVA'}</span><h2>${esc(state.competition?.name||'Nenhum campeonato')}</h2><p class="muted">Central profissional para jogos, súmulas, escalações, arbitragem, classificação e acompanhamento em tempo real.</p></div><div class="hero-score">${state.matches.filter(m=>m.status==='ao_vivo').length}<small>partidas ao vivo</small></div></section><section class="panel"><h2>Seleções</h2><div class="flags">${state.teams.map(t=>`<span>${flag(t.name)} ${esc(t.name)}</span>`).join('')}</div></section><section class="panel"><h2>Próximos jogos</h2>${matchesTable(false,null,'columns')}</section>`
  if(state.tab==='jogos') return gamesView()
  if(state.tab==='ao_vivo') return state.selectedMatch ? liveSheet() : `<section class="panel"><div class="panelhead"><div><h2>Central ao vivo</h2><p class="muted">Selecione uma partida em Jogos para abrir a súmula.</p></div></div>${matchesTable(true,null,'columns')}</section>`
  if(state.tab==='times') return list('Times',state.teams.map(t=>[flag(t.name)+' '+esc(t.name),t.country||'Seleção']), 'team')
  if(state.tab==='atletas') return list('Atletas',state.players.map(p=>[esc(p.full_name||p.name),(esc(teamName(p.team_id)))+' • '+esc(p.category||'')+' • '+esc(p.position||'')]), 'player')
  if(state.tab==='arbitragem') return list('Equipe de arbitragem',state.referees.map(r=>[esc(r.name),esc(r.registration||'Árbitro')]), 'referee')
  if(state.tab==='grupos') return groupStandingsView()
  if(state.tab==='classificacao') return classificationView('geral')
  if(state.tab==='patrocinadores') return sponsorsView()
  if(state.tab==='midia') return mediaView()
  if(state.tab==='relatorios') return reportsView()
  if(state.tab==='moderadores') return moderatorsView()
}
function competitionStatusLabel(s){return ({active:'ATIVO',completed:'REALIZADO',archived:'ARQUIVADO',draft:'EM PREPARAÇÃO'})[s]||String(s||'ATIVO').toUpperCase()}
function competitionsView(){return `<section class="panel"><div class="panelhead"><div><h2>🏆 Campeonatos</h2><p class="muted">Cadastre novos campeonatos sem apagar o histórico das edições anteriores.</p></div>${canOperate()?'<button class="primary" data-new-competition>+ Novo campeonato</button>':''}</div><div class="competition-grid">${state.competitions.map(c=>`<div class="competition-card ${c.id===state.competition?.id?'selected':''}"><div class="competition-card-head"><span class="status">${competitionStatusLabel(c.status)}</span><b>${c.season||''}</b></div><h3>${esc(c.name)}</h3><p class="muted">${Number(c.group_count||0)} grupo(s) • ${Array.isArray(c.phases)?c.phases.length:0} fase(s)</p><div class="competition-actions"><button class="smallbtn primary" data-select-competition="${c.id}">👁️ Abrir</button>${canOperate()?`<button class="smallbtn" data-edit-competition="${c.id}">✏️ Alterar</button>`:''}</div></div>`).join('')}</div></section>`}
function openCompetitionModal(id=''){if(!canOperate())return;const c=id?state.competitions.find(x=>x.id===id):null;document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="competitionModal"><div class="modalbox config-modal"><button class="close" data-close>×</button><div class="eyebrow">CAMPEONATO</div><h2>${id?'Alterar campeonato':'Novo campeonato'}</h2><label>Nome do campeonato<input id="cmpName" value="${esc(c?.name||'')}" placeholder="Ex.: 3ª Copa das Nações Ouro/Prata/Diamante"></label><label>Temporada<input id="cmpSeason" type="number" value="${c?.season||new Date().getFullYear()}"></label><label>Status<select id="cmpStatus"><option value="draft" ${c?.status==='draft'?'selected':''}>Em preparação</option><option value="active" ${!c||c?.status==='active'?'selected':''}>Ativo</option><option value="completed" ${c?.status==='completed'?'selected':''}>Realizado</option><option value="archived" ${c?.status==='archived'?'selected':''}>Arquivado</option></select></label><label>Quantidade inicial de grupos<select id="cmpGroups">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${Number(c?.group_count||2)===n?'selected':''}>${n}</option>`).join('')}</select></label><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-save-competition="${id}">💾 Salvar</button></div></div></div>`)}
async function saveCompetition(id=''){if(!canOperate())return;const name=document.querySelector('#cmpName')?.value.trim();const season=Number(document.querySelector('#cmpSeason')?.value)||new Date().getFullYear();const status=document.querySelector('#cmpStatus')?.value||'draft';const group_count=Number(document.querySelector('#cmpGroups')?.value)||2;if(!name)return toast('Informe o nome do campeonato.','error');if(!await askConfirm(id?'Confirma ALTERAR este campeonato?':'Confirma CRIAR este campeonato?'))return;let res;if(id)res=await supabase.from('competitions').update({name,season,status,group_count}).eq('id',id);else res=await supabase.from('competitions').insert({name,season,status,group_count,max_groups:8,phases:[{name:'Classificatória',type:'classificatoria'}],classification_criteria:['pontos','confronto_direto','saldo','gols_marcados','gols_sofridos']}).select().single();if(res.error)return toast(res.error.message,'error');document.querySelector('#competitionModal')?.remove();state.competitions=(await supabase.from('competitions').select('*').order('season',{ascending:false}).order('created_at',{ascending:false})).data||[];if(!id&&res.data){state.competition=res.data;await supabase.from('groups').insert(Array.from({length:group_count},(_,i)=>({competition_id:res.data.id,name:'Grupo '+String.fromCharCode(65+i),position:i+1})));await loadCompetitionData()}else if(id){state.competition=state.competitions.find(x=>x.id===id)||state.competition;await loadCompetitionData()}render();toast(id?'Campeonato alterado com sucesso.':'Novo campeonato criado com sucesso.')}
function gamesView(){
  const classificatoria=state.matches.filter(m=>!m.phase_type||m.phase_type==='classificatoria');
  const eliminatorias=state.matches.filter(m=>m.phase_type&&m.phase_type!=='classificatoria');
  const phaseOrder={quartas:1,semifinal:2,final:3}; const phaseSubOrder=name=>(name==='3º Lugar'?1:2);
  const phaseKeys=[...new Set(eliminatorias.map(m=>`${m.phase_name||'Fase seguinte'}|${m.phase_type||'mata-mata'}`))].sort((a,b)=>{const ta=a.split('|')[1],tb=b.split('|')[1];return (phaseOrder[ta]||99)-(phaseOrder[tb]||99)||phaseSubOrder(a.split('|')[0])-phaseSubOrder(b.split('|')[0])||a.localeCompare(b,'pt-BR')});
  return `<section class="panel"><div class="panelhead"><div><h2>Calendário e partidas</h2><p class="muted">Os jogos da fase classificatória ficam separados das fases seguintes. Gols das fases seguintes entram na artilharia e nas estatísticas de gols das equipes.</p></div><div class="panel-actions">${canOperate()?'<button class="secondary" data-new-phase>🏆 Criar 2ª fase</button><button class="primary" data-crud="match">+ Novo jogo</button>':''}</div></div><div class="games-section-block"><div class="phase-head"><div><h3>📋 Fase classificatória</h3><p class="muted">Jogos que definem a classificação geral.</p></div><span class="tag">${classificatoria.length} jogo(s)</span></div>${classificatoria.length?matchesTable(true,m=>!m.phase_type||m.phase_type==='classificatoria','columns'):'<div class="empty">Nenhum jogo da fase classificatória.</div>'}</div>${phaseKeys.length?`<div class="games-next-phases"><div class="phase-head"><div><h3>🏆 Fases seguintes</h3><p class="muted">Quartas de Final, Semifinal e Final ficam em blocos separados.</p></div><span class="tag">${eliminatorias.length} jogo(s)</span></div>${phaseKeys.map(key=>{const [name,type]=key.split('|');const phaseMatches=eliminatorias.filter(m=>(m.phase_name||'Fase seguinte')===name&&(m.phase_type||'mata-mata')===type);return `<div class="games-section-block knockout-block"><div class="phase-head"><div><h3>${esc(name==='3º Lugar'?'Disputa de 3º Lugar':roundLabel(type))}</h3></div><span class="tag">${phaseMatches.length} jogo(s)</span></div>${matchesTable(true,m=>(m.phase_name||'Fase seguinte')===name&&(m.phase_type||'mata-mata')===type,'columns')}</div>`}).join('')}</div>`:'<div class="games-section-block"><div class="empty">Nenhuma fase seguinte criada.</div></div>'}</section>`
}
function matchStatusLabel(status){return status==='agendado'?'PARTIDA NÃO INICIADA':status==='ao_vivo'?'AO VIVO':status==='encerrado'?'ENCERRADA':status.toUpperCase()}
function phaseLabel(m){return (!m?.phase_type||m.phase_type==='classificatoria')?'Fase classificatória':roundLabel(m.phase_type)}
function phasesGamesView(){const phaseMap=new Map();state.matches.filter(m=>m.phase_name&&m.phase_type&&m.phase_type!=='classificatoria').forEach(m=>{const key=`${m.phase_name}|${m.phase_type}`;if(!phaseMap.has(key))phaseMap.set(key,{name:m.phase_name,type:m.phase_type,matches:[]});phaseMap.get(key).matches.push(m)});if(!phaseMap.size)return '';const phaseOrder={quartas:1,semifinal:2,final:3}; const phaseSubOrder=name=>(name==='3º Lugar'?1:2);return `<div class="phase-cards">${[...phaseMap.values()].sort((a,b)=>(phaseOrder[a.type]||99)-(phaseOrder[b.type]||99)||phaseSubOrder(a.name)-phaseSubOrder(b.name)||a.name.localeCompare(b.name,'pt-BR')).map(p=>`<div class="phase-card"><div><h3>${esc(p.name==='3º Lugar'?'Disputa de 3º Lugar':roundLabel(p.type))}</h3><p class="muted">${p.matches.length} jogo(s)</p></div><div class="phase-mini-list">${p.matches.sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0)).map((m,i)=>`<div><b>${m.phase_type==='final'&&Number(m.bracket_order||1)===2?'3º Lugar':'Jogo '+String(m.bracket_order||i+1).padStart(2,'0')}</b> · ${esc(m.home_source||teamName(m.home_team_id))} × ${esc(m.away_source||teamName(m.away_team_id))}</div>`).join('')}</div></div>`).join('')}</div>`}
function roundLabel(v){return ({quartas:'Quartas de Final',semifinal:'Semifinal',final:'Final'})[v]||String(v||'').toUpperCase()}
function matchesTable(selectable=false,filterFn=null,layout='table'){const source=(filterFn?state.matches.filter(filterFn):state.matches);if(!source.length)return `<div class="empty">Nenhum jogo cadastrado ainda.</div>`;const rows=source.map(m=>{const h=m.home_team_id?teamName(m.home_team_id):(m.home_source||'A definir'),a=m.away_team_id?teamName(m.away_team_id):(m.away_source||'A definir');const unresolved=!m.home_team_id||!m.away_team_id;const staffActions=canOperate()?`${m.status==='encerrado'?`<button class="smallbtn" data-reopen-match="${m.id}">↩ Reabrir</button>`:`<button class="smallbtn" data-edit-crud="match" data-id="${m.id}">✏️ Alterar</button>`}${m.status!=='ao_vivo'?`<button class="smallbtn" data-not-started="${m.id}">⏳ Não iniciada</button>`:''}`:'';const actions=selectable?`${staffActions}${!unresolved?`<button class="smallbtn primary" data-open-match="${m.id}">${m.status==='ao_vivo'?'🔴 Acompanhar ao vivo':'👁️ Ver partida'}</button>`:`<span class="muted">Aguardando definição</span>`}`:'';return {m,h,a,unresolved,actions};});if(layout==='columns')return `<div class="match-columns">${rows.map(({m,h,a,unresolved,actions})=>`<article class="match-column-card ${m.status==='ao_vivo'?'is-live':''}"><div class="match-col-head"><span class="tag">${esc(phaseLabel(m))}</span><span class="tag ${m.status}">${matchStatusLabel(m.status)}</span></div><div class="match-col-date">📅 ${fmtDate(m.scheduled_at)}</div><div class="match-col-teams"><div>${m.home_team_id?flag(h):'🏆'} <b>${esc(h)}</b></div><strong>${m.home_score||0} × ${m.away_score||0}</strong><div><b>${esc(a)}</b> ${m.away_team_id?flag(a):'🏆'}</div></div>${selectable?`<div class="match-col-actions">${actions}</div>`:''}</article>`).join('')}</div>`;return `<div class="tablewrap"><table><tr><th>Fase</th><th>Data</th><th>Jogo</th><th>Placar</th><th>Status</th>${selectable?'<th>Ações</th>':''}</tr>${rows.map(({m,h,a,actions})=>`<tr><td><span class="tag">${esc(phaseLabel(m))}</span></td><td>${fmtDate(m.scheduled_at)}</td><td>${m.home_team_id?flag(h):'🏆'} <b>${esc(h)}</b> × <b>${esc(a)}</b> ${m.away_team_id?flag(a):'🏆'}</td><td><b>${m.home_score||0} × ${m.away_score||0}</b></td><td><span class="tag ${m.status}">${matchStatusLabel(m.status)}</span></td>${selectable?`<td>${actions}</td>`:''}</tr>`).join('')}</table></div>`}

function openPhaseModal(){
  if(!canOperate())return;
  const standings=calcStandings().slice(0,8);
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="phaseModal"><div class="modalbox config-modal"><button class="close" data-close>×</button><div class="eyebrow">2ª FASE</div><h2>Criar fase eliminatória</h2><p class="muted">A configuração abaixo segue o modelo da competição: quartas 1º×8º, 2º×7º, 3º×6º e 4º×5º; depois semifinal e final pelos vencedores.</p><label>Nome da fase<input id="phaseName" value="2ª Fase" placeholder="Ex.: 2ª Fase"></label><label>Definir fase<select id="phaseType"><option value="quartas">Quartas de Final</option><option value="semifinal">Semifinal</option><option value="final">Final</option></select></label><label>Forma de disputa<select id="phaseFormat"><option value="general_1_8">Classificação Geral — 1º × 8º, 2º × 7º, 3º × 6º, 4º × 5º</option><option value="winners_qf">Vencedores das Quartas — Jogo 1 × Jogo 4 e Jogo 2 × Jogo 3</option><option value="winner_semi">Vencedores das Semifinais — Jogo 1 × Jogo 2</option></select></label><label>Data/hora inicial (opcional)<input id="phaseDate" type="datetime-local"></label><div class="notice">Classificação geral disponível agora: <b>${standings.length}/8</b> equipes. Para criar as quartas, são necessárias 8 equipes classificadas.</div><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-phase-create>🏆 Criar jogos da fase</button></div></div></div>`);
}

async function createPhaseGames(){
  if(!canOperate())return;
  const phaseName=document.querySelector('#phaseName')?.value.trim()||'2ª Fase';
  const phaseType=document.querySelector('#phaseType')?.value||'quartas';
  const format=document.querySelector('#phaseFormat')?.value||({quartas:'general_1_8',semifinal:'winners_qf',final:'winner_semi'}[phaseType]||'general_1_8');
  const already=state.matches.some(m=>m.competition_id===state.competition.id&&m.phase_type===phaseType);
  if(already)return toast(`Já existem jogos cadastrados para ${roundLabel(phaseType)} nesta competição.`,`error`);
  const dt=document.querySelector('#phaseDate')?.value||'';
  const scheduled_at=dt?new Date(dt).toISOString():null;
  const standings=calcStandings();
  const base={competition_id:state.competition.id,phase_name:phaseName,phase_type:phaseType,scheduled_at,status:'agendado',home_score:0,away_score:0};
  let pairs=[];
  if(format==='general_1_8'){
    if(standings.length<8)return toast('São necessárias pelo menos 8 equipes classificadas para montar 1º×8º, 2º×7º, 3º×6º e 4º×5º.','error');
    pairs=[
      {h:standings[0].team.id,a:standings[7].team.id,hs:'1º Classificado Geral',as:'8º Classificado Geral'},
      {h:standings[1].team.id,a:standings[6].team.id,hs:'2º Classificado Geral',as:'7º Classificado Geral'},
      {h:standings[2].team.id,a:standings[5].team.id,hs:'3º Classificado Geral',as:'6º Classificado Geral'},
      {h:standings[3].team.id,a:standings[4].team.id,hs:'4º Classificado Geral',as:'5º Classificado Geral'}
    ];
  }else if(format==='winners_qf'){
    const qf=state.matches.filter(m=>m.competition_id===state.competition.id&&m.phase_type==='quartas').sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0));
    if(qf.length<4)return toast('Crie primeiro as 4 partidas das Quartas de Final.','error');
    pairs=[{hm:qf[0].id,am:qf[3].id,hs:'Vencedor Jogo 01',as:'Vencedor Jogo 04'},{hm:qf[1].id,am:qf[2].id,hs:'Vencedor Jogo 02',as:'Vencedor Jogo 03'}];
  }else{
    const semi=state.matches.filter(m=>m.competition_id===state.competition.id&&m.phase_type==='semifinal').sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0));
    if(semi.length<2)return toast('Crie primeiro as 2 partidas da Semifinal.','error');
    pairs=[
      {hm:semi[0].id,am:semi[1].id,hs:'Vencedor Semifinal 1',as:'Vencedor Semifinal 2',kind:'final'},
      {hm:semi[0].id,am:semi[1].id,hs:'Perdedor Semifinal 1',as:'Perdedor Semifinal 2',kind:'terceiro'}
    ];
  }
  const rows=pairs.map((x,i)=>({ ...base, bracket_order:i+1, home_team_id:x.h||null, away_team_id:x.a||null, home_source:x.hs, away_source:x.as, source_home_match_id:x.hm||null, source_away_match_id:x.am||null, phase_name: x.kind==='terceiro' ? '3º Lugar' : base.phase_name }));
  if(!(await askConfirm(`Criar ${rows.length} jogo(s) de ${roundLabel(phaseType)}?`)))return;
  const res=await supabase.from('matches').insert(rows);
  if(res.error)return toast(res.error.message,'error');
  document.querySelector('#phaseModal')?.remove();await load();toast(`${rows.length} jogo(s) de ${roundLabel(phaseType)} criado(s) com sucesso.`);
}

async function ensureThirdPlaceMatch(){
  if(!state.competition)return;
  const matches=state.matches.filter(m=>m.competition_id===state.competition.id);
  const semi=matches.filter(m=>m.phase_type==='semifinal').sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0));
  const final=matches.find(m=>m.phase_type==='final' && Number(m.bracket_order||1)===1);
  const thirdExists=matches.some(m=>m.phase_type==='final' && Number(m.bracket_order||0)===2);
  if(semi.length<2 || !final || thirdExists)return;
  const row={
    competition_id:state.competition.id,
    phase_name:'3º Lugar',
    phase_type:'final',
    bracket_order:2,
    home_team_id:null,
    away_team_id:null,
    home_source:'Perdedor Semifinal 1',
    away_source:'Perdedor Semifinal 2',
    source_home_match_id:semi[0].id,
    source_away_match_id:semi[1].id,
    scheduled_at:final.scheduled_at||null,
    status:'agendado',
    home_score:0,
    away_score:0
  };
  const res=await supabase.from('matches').insert(row).select().single();
  if(res.error){console.error('Não foi possível criar a disputa de 3º lugar:',res.error);return;}
  state.matches.push(res.data);
}

async function syncKnockoutBracket(){
  if(!state.competition||!state.matches.length)return;
  const matches=state.matches;
  const qf=matches.filter(m=>m.phase_type==='quartas').sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0));
  const standings=calcStandings();
  const rankingPairs=[
    [standings[0]?.team?.id||null,standings[7]?.team?.id||null],
    [standings[1]?.team?.id||null,standings[6]?.team?.id||null],
    [standings[2]?.team?.id||null,standings[5]?.team?.id||null],
    [standings[3]?.team?.id||null,standings[4]?.team?.id||null]
  ];
  const updates=[];
  for(const m of qf){
    if(m.status!=='agendado')continue;
    const pair=rankingPairs[Math.max(0,Number(m.bracket_order||1)-1)];
    if(!pair)continue;
    const nextHome=pair[0]||null,nextAway=pair[1]||null;
    if(String(m.home_team_id||'')!==String(nextHome||'')||String(m.away_team_id||'')!==String(nextAway||'')){
      m.home_team_id=nextHome;m.away_team_id=nextAway;
      updates.push({id:m.id,home_team_id:nextHome,away_team_id:nextAway});
    }
  }
  const winnerOf=id=>{
    const m=matches.find(x=>String(x.id)===String(id));
    if(!m||m.status!=='encerrado'||m.home_score===m.away_score)return null;
    return Number(m.home_score)>Number(m.away_score)?m.home_team_id:m.away_team_id;
  };
  const loserOf=id=>{
    const m=matches.find(x=>String(x.id)===String(id));
    if(!m||m.status!=='encerrado'||m.home_score===m.away_score)return null;
    return Number(m.home_score)>Number(m.away_score)?m.away_team_id:m.home_team_id;
  };
  for(const m of matches.filter(x=>x.phase_type==='semifinal'||x.phase_type==='final')){
    if(m.status!=='agendado')continue;
    const isThirdPlace=Number(m.bracket_order||1)===2 && m.phase_type==='final';
    const sourceHome=m.source_home_match_id?matches.find(x=>String(x.id)===String(m.source_home_match_id)):null;
    const sourceAway=m.source_away_match_id?matches.find(x=>String(x.id)===String(m.source_away_match_id)):null;
    const resolve=isThirdPlace?loserOf:winnerOf;
    const nextHome=m.source_home_match_id?resolve(m.source_home_match_id):m.home_team_id||null;
    const nextAway=m.source_away_match_id?resolve(m.source_away_match_id):m.away_team_id||null;
    const homeReady=!m.source_home_match_id||!!nextHome;
    const awayReady=!m.source_away_match_id||!!nextAway;
    const finalHome=homeReady?nextHome:null;
    const finalAway=awayReady?nextAway:null;
    if(String(m.home_team_id||'')!==String(finalHome||'')||String(m.away_team_id||'')!==String(finalAway||'')){
      m.home_team_id=finalHome;m.away_team_id=finalAway;
      updates.push({id:m.id,home_team_id:finalHome,away_team_id:finalAway});
    }
  }
  for(const u of updates){
    const {error}=await supabase.from('matches').update({home_team_id:u.home_team_id,away_team_id:u.away_team_id}).eq('id',u.id);
    if(error)console.warn('Não foi possível atualizar o confronto automaticamente:',error.message);
  }
}

async function resolvePhaseMatches(){
  await syncKnockoutBracket();
}

function calcStandings(teamIds=null){const rows=state.teams.filter(t=>!teamIds||teamIds.includes(t.id)).map(t=>({team:t,j:0,v:0,e:0,d:0,gp:0,gc:0,pts:0}));const map=new Map(rows.map(r=>[r.team.id,r]));state.matches.filter(m=>m.status==='encerrado'&&(!m.phase_type||m.phase_type==='classificatoria')).forEach(m=>{const h=map.get(m.home_team_id),a=map.get(m.away_team_id);if(!h||!a)return;h.j++;a.j++;h.gp+=m.home_score||0;h.gc+=m.away_score||0;a.gp+=m.away_score||0;a.gc+=m.home_score||0;if(m.home_score>m.away_score){h.v++;h.pts+=3;a.d++}else if(m.home_score<m.away_score){a.v++;a.pts+=3;h.d++}else{h.e++;a.e++;h.pts++;a.pts++}});return rows.sort((a,b)=>b.pts-a.pts||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp||a.team.name.localeCompare(b.team.name))}
function standingsTable(rows){return `<div class="tablewrap"><table><tr><th>#</th><th>Equipe</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr>${rows.map((r,i)=>`<tr><td><b>${i+1}</b></td><td>${flag(r.team.name)} ${esc(r.team.name)}</td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gp}</td><td>${r.gc}</td><td>${r.gp-r.gc}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table></div>`}
function classificationTabs(active){return `<div class="class-tabs"><button class="${active==='grupo'?'active':''}" data-classification="grupo">Classificação por grupo</button><button class="${active==='geral'?'active':''}" data-classification="geral">Classificação geral</button></div>`}
function groupStandingsView(){const groups=state.groups.slice().sort((a,b)=>a.position-b.position).filter(g=>g.position <= (state.competition?.group_count||2));return `<section class="panel"><div class="panelhead"><div><h2>Classificação por grupo</h2><p class="muted">Pontuação, confronto direto, saldo, gols marcados e gols sofridos.</p></div>${canOperate()?'<button class="primary" data-configure-competition>⚙️ Configurar grupos e fases</button>':''}</div>${classificationTabs('grupo')}${groups.map(g=>{const teams=state.teams.filter(t=>t.group_id===g.id);return `<div class="panel group-box"><h3>${esc(g.name)}</h3>${teams.length?standingsTable(calcStandings(teams.map(t=>t.id))):'<div class="empty">Nenhuma equipe neste grupo.</div>'}</div>`}).join('')}</section>`}
function classificationView(active='geral'){return active==='grupo'?groupStandingsView():standingsView()}
function openCompetitionConfig(){if(!canOperate())return;const c=state.competition||{}, phases=Array.isArray(c.phases)&&c.phases.length?c.phases:[{name:'Classificatória',type:'classificatoria'}];document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="competitionConfigModal"><div class="modalbox config-modal"><button class="close" data-close>×</button><div class="eyebrow">CAMPEONATO</div><h2>Configurar grupos e fases</h2><label>Quantidade de grupos<select id="cfgGroupCount">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${Number(c.group_count||2)===n?'selected':''}>${n}</option>`).join('')}</select></label><div class="phase-head"><b>Fases</b><button class="secondary" data-phase-add>+ Adicionar fase</button></div><div id="phaseList">${phases.map((p,i)=>phaseRow(p,i)).join('')}</div><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-phase-save>Salvar configuração</button></div></div></div>`)}
function phaseRow(p,i){return `<div class="phase-row" data-phase-row><input data-phase-name value="${esc(p.name||'Fase '+(i+1))}" placeholder="Nome da fase"><select data-phase-type><option value="classificatoria" ${p.type==='classificatoria'?'selected':''}>Classificatória</option><option value="mata-mata" ${p.type==='mata-mata'?'selected':''}>Mata-mata</option></select><button class="smallbtn" data-phase-remove>Excluir</button></div>`}
async function saveCompetitionConfig(){if(!canOperate())return;const rows=[...document.querySelectorAll('[data-phase-row]')];const phases=rows.map((r,i)=>({name:r.querySelector('[data-phase-name]').value.trim()||`Fase ${i+1}`,type:r.querySelector('[data-phase-type]').value}));if(!phases.length)return toast('Inclua pelo menos uma fase.','error');const {error}=await supabase.from('competitions').update({group_count:Number(document.querySelector('#cfgGroupCount').value),phases}).eq('id',state.competition.id);if(error)return toast(error.message,'error');document.querySelector('#competitionConfigModal')?.remove();await load();toast('Configuração do campeonato salva.');}
function sponsorsView(){return `<section class="panel"><div class="panelhead"><div><h2>Patrocinadores</h2><p class="muted">Parceiros oficiais da competição.</p></div>${canOperate()?'<button class="primary" data-sponsor-new>+ Incluir patrocinador</button>':''}</div><div class="flags">${state.sponsors.filter(s=>s.active).sort((a,b)=>a.sort_order-b.sort_order).map(s=>`<div class="sponsor-card">${s.logo_url?`<img src="${esc(s.logo_url)}" alt="${esc(s.name)}">`:''}<b>${esc(s.name)}</b>${s.website?`<a href="${esc(s.website)}" target="_blank">Site</a>`:''}${canOperate()?`<button class="smallbtn" data-sponsor-edit="${s.id}">Alterar</button><button class="smallbtn" data-sponsor-delete="${s.id}">Excluir</button>`:''}</div>`).join('')}</div></section>`}
function mediaView(){const photos=state.media.filter(x=>x.category==='foto'),videos=state.media.filter(x=>x.category==='video'),files=state.media.filter(x=>!['foto','video'].includes(x.category));return `<section class="panel"><div class="panelhead"><div><h2>Fotos / Arquivos / Vídeos</h2><p class="muted">Biblioteca oficial da Copa.</p></div>${canOperate()?'<button class="primary" data-media-new>+ Adicionar foto, vídeo ou arquivo</button>':''}</div><h3>Fotos</h3><div class="media-grid">${photos.length?photos.map(mediaCard).join(''):'<div class="empty">Nenhuma foto cadastrada.</div>'}</div><h3>Vídeos</h3><div class="media-grid video-grid">${videos.length?videos.map(mediaCard).join(''):'<div class="empty">Nenhum vídeo cadastrado.</div>'}</div><h3>Arquivos</h3><div class="media-list">${files.length?files.map(mediaCard).join(''):'<div class="empty">Nenhum arquivo cadastrado.</div>'}</div></section>`}
function mediaCard(x){const isImg=x.mime_type?.startsWith('image/'),isVideo=x.mime_type?.startsWith('video/');return `<div class="media-card">${isImg?`<img class="media-thumb" src="${esc(x.file_url)}" alt="${esc(x.title)}" loading="lazy">`:isVideo?`<video src="${esc(x.file_url)}" controls preload="metadata"></video>`:'📄'}<b>${esc(x.title)}</b>${x.description?`<small>${esc(x.description)}</small>`:''}<a class="smallbtn" href="${esc(x.file_url)}" target="_blank">Abrir</a>${canOperate()?`<button class="smallbtn" data-media-delete="${x.id}">Excluir</button>`:''}</div>`}
function reportBrandHeader(){return `<div class="report-brand"><img src="${logoCopaNacoes}" alt="Copa das Nações"><div><div class="report-brand-kicker">CAMPEONATO</div><h2>${esc(state.competition?.name||'Copa das Nações')}</h2><p>${esc(state.competition?.season||'')} • Ouro / Prata / Diamante</p></div></div>`}
function athleteReportFilters(){return ''}
function athleteReportRow(p){const birth=p.birth_date||'';return `<tr data-athlete-report-row><td data-sort="${esc(String(p.registration_number??''))}"><b>${esc(p.registration_number??'—')}</b></td><td data-sort="${esc(p.full_name||p.name||'')}"><b>${esc(p.full_name||p.name||'—')}</b></td><td data-sort="${esc(p.nickname||'')}">${esc(p.nickname||'—')}</td><td data-sort="${esc(p.position||'')}">${esc(p.position||'—')}</td><td data-sort="${esc(birth)}">${birth?new Date(birth+'T00:00:00').toLocaleDateString('pt-BR'):'—'}</td><td data-sort="${esc(cat(p.category))}">${esc(cat(p.category))}</td><td data-sort="${esc(String(p.shirt_number??''))}"><b>${esc(p.shirt_number??'—')}</b></td><td data-sort="${esc(teamName(p.team_id)||'')}">${flag(teamName(p.team_id))} ${esc(teamName(p.team_id)||'—')}</td></tr>`}
function athleteReportTable(players, caption=''){const cols=['Nº','Nome Completo','Apelido','Posição','Data Nascimento','Categoria','Camisa','Time'];const rows=players.map(athleteReportRow).join('');return `<div class="report-table-block" data-athlete-report-block>${caption?`<h3 class="report-team-title">${caption}</h3>`:''}<div class="tablewrap"><table class="report-athlete-table"><thead><tr>${cols.map((c,i)=>`<th class="report-sortable" data-sort-col="${i}" title="Clique para classificar">${c}<span class="report-sort-indicator"></span></th>`).join('')}</tr><tr class="report-filter-row">${cols.map((c,i)=>`<th><input class="report-col-filter" data-col="${i}" placeholder="Filtrar" aria-label="Filtrar ${c}"></th>`).join('')}</tr></thead><tbody>${rows||'<tr class="report-no-match"><td colspan="8" class="muted">Nenhum atleta encontrado.</td></tr>'}</tbody></table></div></div>`}
function reportsView(){const buttons=['jogos','sumula','atletas','atletas_equipe','artilheiros','equipes','cartoes','classificacao','grupos'];return `<section class="reports-page">${reportBrandHeader()}<div class="report-tabs">${buttons.map(x=>`<button class="${state.reportType===x?'active':''}" data-report="${x}">${({jogos:'Jogos',sumula:'Súmula do jogo',atletas:'Atletas',atletas_equipe:'Atletas por equipe',artilheiros:'Artilheiros',equipes:'Equipes',cartoes:'Cartões',classificacao:'Classificação',grupos:'Classificação por grupos'})[x]}</button>`).join('')}</div>${state.reportType?reportContent(state.reportType):''}</section>`}
async function loadReportMatch(id){if(!id){state.reportMatchId=null;state.selectedMatch=null;state.events=[];state.lineups=[];render();return}const mr=await supabase.from('matches').select('*').eq('id',id).maybeSingle();if(mr.error||!mr.data){toast(mr.error?.message||'Partida não encontrada.','error');return}state.reportMatchId=id;state.selectedMatch=mr.data;const [ev,lu]=await Promise.all([supabase.from('match_events').select('*').eq('match_id',id).order('created_at',{ascending:true}),supabase.from('match_lineups').select('*').eq('match_id',id)]);state.events=ev.data||[];state.lineups=lu.data||[];render()}
function cartoesReport(){const map={};state.allEvents.filter(e=>['cartao_amarelo','cartao_vermelho'].includes(e.type)&&e.player_id).forEach(e=>{const k=e.player_id+'|'+e.type;map[k]=(map[k]||0)+1});const rows=Object.entries(map).map(([k,n])=>{const [id,t]=k.split('|');const tid=state.players.find(p=>p.id===id)?.team_id;const atleta=playerName(id);const equipe=teamName(tid);const tipo=t==='cartao_amarelo'?'Amarelo':'Vermelho';return `<tr data-cartao-row class="${t==='cartao_amarelo'?'cartao-row-amarelo':'cartao-row-vermelho'}"><td data-sort="${esc(atleta)}">${esc(atleta)}</td><td data-sort="${esc(equipe)}">${flag(equipe)} ${esc(equipe)}</td><td data-sort="${tipo}">${tipo}</td><td data-sort="${n}">${n}</td></tr>`}).join('');return `<div class="cartoes-report-block"><div class="cartoes-filter-help no-print">Filtre os cartões por qualquer coluna. Digite para mostrar somente os registros correspondentes. Clique no título da coluna para classificar.</div><div class="tablewrap"><table class="report-compact-table cartoes-report-table"><thead><tr>${['Atleta','Equipe','Tipo','Quantidade'].map((c,i)=>`<th class="cartoes-sortable" data-cartoes-sort="${i}" title="Clique para classificar">${c}<span class="cartoes-sort-indicator"></span></th>`).join('')}</tr><tr class="cartoes-filter-row no-print"><th><input class="cartoes-col-filter" data-cartoes-col="0" placeholder="Filtrar atleta" aria-label="Filtrar atleta"></th><th><input class="cartoes-col-filter" data-cartoes-col="1" placeholder="Filtrar equipe" aria-label="Filtrar equipe"></th><th><select class="cartoes-col-filter" data-cartoes-col="2" aria-label="Filtrar tipo"><option value="">Todos</option><option value="Amarelo">Amarelo</option><option value="Vermelho">Vermelho</option></select></th><th><input class="cartoes-col-filter" data-cartoes-col="3" type="number" min="0" placeholder="Qtd." aria-label="Filtrar quantidade"></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">Nenhum cartão registrado.</td></tr>'}</tbody></table></div></div>`}

function teamTournamentStats(){
  const map=new Map(state.teams.map(t=>[t.id,{team:t,gp:0,gc:0,games:0,phaseGoals:{}}]));
  state.matches.filter(m=>m.status==='encerrado').forEach(m=>{
    const h=map.get(m.home_team_id),a=map.get(m.away_team_id); if(!h||!a)return;
    h.games++;a.games++;h.gp+=Number(m.home_score)||0;h.gc+=Number(m.away_score)||0;a.gp+=Number(m.away_score)||0;a.gc+=Number(m.home_score)||0;
    const ph=m.phase_type&&m.phase_type!=='classificatoria'?roundLabel(m.phase_type):'Classificatória';
    h.phaseGoals[ph]=(h.phaseGoals[ph]||0)+(Number(m.home_score)||0);a.phaseGoals[ph]=(a.phaseGoals[ph]||0)+(Number(m.away_score)||0);
  });
  return [...map.values()].sort((a,b)=>b.gp-a.gp||a.gc-b.gc||a.team.name.localeCompare(b.team.name));
}
function scorersAllPhases(){
  const map={};
  state.allEvents.filter(e=>e.type==='gol'&&e.player_id).forEach(e=>map[e.player_id]=(map[e.player_id]||0)+1);
  return map;
}
function reportContent(type){let title=({jogos:'Relatório de jogos',sumula:'Súmula do jogo',atletas:'Relatório de atletas',atletas_equipe:'Relação de atletas por equipes',artilheiros:'Artilharia',equipes:'Relatório de equipes',cartoes:'Cartões',classificacao:'Classificação geral',grupos:'Classificação por grupos'})[type];let body='';if(type==='sumula'){body=`<div class="sumula-selector no-print"><label>Selecione a partida<select id="reportMatchSelect"><option value="">Selecione...</option>${state.matches.map(x=>`<option value="${x.id}" ${x.id===state.reportMatchId?'selected':''}>${esc(teamName(x.home_team_id))} × ${esc(teamName(x.away_team_id))} • ${fmtDate(x.scheduled_at)}</option>`).join('')}</select></label></div>${sumulaReport(state.reportMatchId?state.selectedMatch:null)}`}if(type==='jogos')body=matchesTable(false);if(type==='atletas'||type==='atletas_equipe'){const players=state.players.slice();body=`<div class="report-filter-help">Digite em qualquer coluna para mostrar <b>somente as linhas correspondentes</b>. Clique no título da coluna para classificar.</div>${type==='atletas_equipe'?state.teams.map(t=>athleteReportTable(players.filter(p=>p.team_id===t.id),`${flag(t.name)} ${esc(t.name)}`)).join(''):athleteReportTable(players)}`}if(type==='equipes'){const stats=teamTournamentStats().slice().sort((a,b)=>a.gc-b.gc||b.gp-a.gp||a.team.name.localeCompare(b.team.name));body=`<div class="report-filter-help">Os números de GP e GC abaixo consideram <b>todas as fases</b> da competição, incluindo Quartas, Semifinais e Final. A classificação por pontos continua sendo calculada somente pela fase classificatória.</div><div class="tablewrap"><table class="report-compact-table"><thead><tr><th>#</th><th>Equipe</th><th>Grupo</th><th>J</th><th>GP</th><th>GC</th><th>Média GC</th><th>SG</th></tr></thead><tbody>${stats.map((r,i)=>`<tr><td>${i+1}</td><td>${flag(r.team.name)} ${esc(r.team.name)}</td><td>${esc(state.groups.find(g=>g.id===r.team.group_id)?.name||'—')}</td><td>${r.games}</td><td><b>${r.gp}</b></td><td><b>${r.gc}</b></td><td><b>${r.games?((r.gc/r.games).toFixed(2)).replace('.',','):'0,00'}</b></td><td>${r.gp-r.gc}</td></tr>`).join('')}</tbody></table></div>`;}if(type==='artilheiros'){const map=scorersAllPhases();body=`<div class="report-filter-help">A artilharia considera os gols registrados em <b>todas as fases</b>, inclusive Quartas de Final, Semifinal e Final. Gol contra não é atribuído ao artilheiro.</div><div class="tablewrap"><table class="report-compact-table"><thead><tr><th>#</th><th>Atleta</th><th>Equipe</th><th>Gols</th></tr></thead><tbody>${Object.entries(map).sort((a,b)=>b[1]-a[1]||playerName(a[0]).localeCompare(playerName(b[0]))).map(([id,n],i)=>`<tr><td>${i+1}</td><td>${esc(playerName(id))}</td><td>${flag(teamName(state.players.find(p=>p.id===id)?.team_id))} ${esc(teamName(state.players.find(p=>p.id===id)?.team_id))}</td><td><b>${n}</b></td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nenhum gol registrado.</td></tr>'}</tbody></table></div>`}if(type==='cartoes')body=cartoesReport();if(type==='classificacao')body=standingsTable(calcStandings());if(type==='grupos')body=state.groups.slice().sort((a,b)=>a.position-b.position).map(g=>`<h3>${esc(g.name)}</h3>${standingsTable(calcStandings(state.teams.filter(t=>t.group_id===g.id).map(t=>t.id)))}`).join('');const printBtn='<button class="primary no-print" data-report-print>🖨️ Imprimir</button>';return `<div class="report-preview"><div class="report-title-row"><h2>${title}</h2>${printBtn}</div>${body}</div>`}
function sumulaReport(m){if(!m)return '<div class="empty">Selecione uma partida para gerar a súmula.</div>';const h=teamName(m.home_team_id),a=teamName(m.away_team_id);const ref=(id)=>state.referees.find(r=>r.id===id)?.name||'—';const status=matchStatusLabel(m.status);const typeLabel=e=>({gol:'⚽ Gol',gol_contra:'🥅 Gol Contra',cartao_amarelo:'🟨 Cartão Amarelo',cartao_vermelho:'🟥 Cartão Vermelho',substituicao:'🔄 Substituição',incidente:'Incidente'})[e.type]||e.type;const eventRows=state.events.slice().sort((x,y)=>((x.minute||0)*60+(x.second||0))-((y.minute||0)*60+(y.second||0))).map(e=>{const team=teamName(e.team_id);const player=e.player_id?playerName(e.player_id):'';let detail=e.description||player||'—';if(e.type==='substituicao'&&e.related_player_id)detail=`Sai: ${playerName(e.player_id)||'—'} • Entra: ${playerName(e.related_player_id)||'—'}`;return `<tr><td><b>${String(e.minute||0).padStart(2,'0')}:${String(e.second||0).padStart(2,'0')}</b></td><td>${typeLabel(e)}</td><td>${esc(team)}</td><td>${esc(detail)}</td></tr>`}).join('');const lineupRows=(teamId)=>state.players.filter(p=>p.team_id===teamId).sort((x,y)=>(Number(x.shirt_number)||999)-(Number(y.shirt_number)||999)).map(p=>`<tr><td><b>${p.shirt_number||'—'}</b></td><td>${esc(p.full_name||p.name)}</td><td>${esc(p.nickname||'—')}</td><td>${esc(cat(p.category))}</td><td>${age(p.birth_date)}</td></tr>`).join('');return `<div class="report-preview sumula-print"><div class="sumula-match"><div><b>${flag(h)} ${esc(h)}</b><strong>${m.home_score||0} × ${m.away_score||0}</strong><b>${esc(a)} ${flag(a)}</b></div><p><b>Status:</b> ${status} &nbsp; <b>Data:</b> ${fmtDate(m.scheduled_at)} &nbsp; <b>Campo:</b> ${esc(m.field_name||'—')}</p></div><div class="sumula-officials"><b>Arbitragem:</b> Árbitro: ${esc(ref(m.referee_id))} • Assistente 1: ${esc(ref(m.assistant_1_id))} • Assistente 2: ${esc(ref(m.assistant_2_id))} • Mesário: ${esc(ref(m.fourth_official_id))}</div><div class="sumula-grid sumula-grid-stacked"><div><h3>${flag(h)} ${esc(h)}</h3><table><tr><th>Nº</th><th>NOME COMPLETO</th><th>APELIDO</th><th>CATEGORIA</th><th>IDADE</th></tr>${lineupRows(m.home_team_id)}</table></div><div><h3>${flag(a)} ${esc(a)}</h3><table><tr><th>Nº</th><th>NOME COMPLETO</th><th>APELIDO</th><th>CATEGORIA</th><th>IDADE</th></tr>${lineupRows(m.away_team_id)}</table></div></div><h3>Eventos da partida</h3><table><tr><th>Tempo</th><th>Evento</th><th>Equipe</th><th>Detalhes</th></tr>${eventRows||'<tr><td colspan="4">Nenhuma ocorrência registrada.</td></tr>'}</table><div class="sumula-signatures"><div>________________________________<br>Árbitro</div><div>________________________________<br>Responsável / Organização</div></div></div>`}
function matchCard(m){const h=teamName(m.home_team_id),a=teamName(m.away_team_id);return `<div class="matchmini"><div>${flag(h)} <b>${esc(h)}</b></div><div class="scoremini">${m.home_score}<span>×</span>${m.away_score}</div><div><b>${esc(a)}</b> ${flag(a)}</div><button class="smallbtn" data-open-match="${m.id}">Súmula</button></div>`}
function liveSheet(){
  const m=state.selectedMatch;
  if(!m)return '';
  const h=teamName(m.home_team_id),a=teamName(m.away_team_id);
  const official=(id,label)=>{const r=state.referees.find(x=>x.id===id);return r?`<span><b>${label}:</b> ${esc(r.name)}</span>`:''};
  const publicMode=!canLiveOperate();
  const publicInfo=publicMode?`<div class="public-match-info"><span>📅 ${fmtDate(m.scheduled_at)}</span><span>📍 ${esc(m.field_name||'Campo não informado')}</span><span>⚽ ${m.status==='ao_vivo'?'Partida em andamento':matchStatusLabel(m.status)}</span></div>`:'';
  return `<div class="live-sheet ${publicMode?'public-live-sheet':''}">
    <div class="sheet-head">
      <div>
        <span class="status">${m.reopened_at&&m.status==='agendado'?'REABERTA':m.status.toUpperCase()}</span>
        <div class="match-goals">
          <div class="goal-team"><div class="goal-buttons">${!publicMode?`<button class="goalbtn" data-score-dec="${m.home_team_id}">−</button>`:''}<strong>${m.home_score||0}</strong>${!publicMode?`<button class="goalbtn" data-score-inc="${m.home_team_id}">+</button>`:''}</div><b>${flag(h)} ${esc(h)}</b></div>
          <div class="goal-x">×</div>
          <div class="goal-team"><div class="goal-buttons">${!publicMode?`<button class="goalbtn" data-score-dec="${m.away_team_id}">−</button>`:''}<strong>${m.away_score||0}</strong>${!publicMode?`<button class="goalbtn" data-score-inc="${m.away_team_id}">+</button>`:''}</div><b>${flag(a)} ${esc(a)}</b></div>
        </div>
        ${publicInfo}
        <div class="officials">${official(m.referee_id,'Árbitro')}${official(m.assistant_1_id,'Assistente 1')}${official(m.assistant_2_id,'Assistente 2')}${official(m.fourth_official_id,'Mesário')}</div>
      </div>
      <div class="clock"><div id="matchClock">${matchClock(m)}</div><small>${state.timerHalf==='2T'?'2º TEMPO':state.timerHalf==='1T'?'1º TEMPO':m.status==='encerrado'?'ENCERRADO':'PARADO'}</small></div>
    </div>
    ${controlBar(m)}
    ${correctionPanel(m)}
    <div class="sheet-content-stack">
      ${publicMode?'':eventPanel(m)}
      ${lineupPanel(m)}
      ${eventTimeline(m)}
    </div>
  </div>`;
}
function matchClock(m){if(state.timerHalf)return fmtSec(elapsedSeconds(m));if(m?.status==='encerrado')return fmtSec((m.second_half_elapsed_seconds||0)+(m.first_half_elapsed_seconds||0));return '00:00'}
function fmtSec(s){const min=Math.floor(s/60),sec=s%60;return String(min).padStart(2,'0')+':'+String(sec).padStart(2,'0')}
function controlBar(m){if(!canLiveOperate())return `<div class="public-live-banner">🔴 <b>Acompanhamento ao vivo</b></div>`;const disabled=m.status==='encerrado';return `<div class="controlbar"><button class="${state.timerHalf==='1T'?'primary half-active':''}" ${disabled?'disabled':''} data-action="start1">▶ Iniciar 1º tempo</button><button class="${state.timerHalf==='2T'?'primary half-active':''}" ${disabled?'disabled':''} data-action="start2">▶ Iniciar 2º tempo</button><button ${disabled?'disabled':''} data-action="pause">⏸ Pausar</button><button ${disabled?'disabled':''} data-minute-adjust="1">+ 1 min</button><button ${disabled?'disabled':''} data-clock-adjust="1">+ 1 seg</button><button ${disabled?'disabled':''} data-minute-adjust="-1">− 1 min</button><button ${disabled?'disabled':''} data-clock-adjust="-1">− 1 seg</button><button ${disabled?'disabled':''} data-action="resetMatchClock">↺ Zerar tempo</button><button class="danger" ${disabled?'disabled':''} data-action="finish">■ Encerrar partida</button></div>`}
function correctionPanel(m){if(!canLiveOperate()||!m.reopened_at||m.status!=='agendado')return '';return `<div class="panel correction"><div class="panelhead"><div><h3>🔧 Correção da partida</h3><p class="muted">Partida reaberta. Você pode corrigir o resultado e os eventos.</p></div></div><div class="eventform"><label>Placar ${esc(teamName(m.home_team_id))}<input id="corrHome" type="number" min="0" value="${m.home_score||0}"></label><label>Placar ${esc(teamName(m.away_team_id))}<input id="corrAway" type="number" min="0" value="${m.away_score||0}"></label><button class="primary" data-action="saveScoreCorrection">💾 Salvar resultado</button></div></div>`}
function eventPanel(m){
  const locked=m.status==='encerrado';
  const disabled=locked||!canLiveOperate();
  const types=[['gol','⚽','Gol'],['gol_contra','🥅','Gol Contra'],['cartao_amarelo','🟨','Cartão Amarelo'],['cartao_vermelho','🟥','Cartão Vermelho'],['substituicao','🔄','Substituição']];
  return `<div class="eventpanel ${locked?'eventpanel-locked':''}">
    <div class="panelhead"><div><h3>Registrar ocorrência</h3><span class="muted">Eventos da partida</span></div><span class="tag">${state.events.length} eventos</span></div>
    ${locked?'<div class="notice event-locked-notice">🔒 <b>Partida encerrada.</b> Não é permitido incluir ou alterar ocorrências. Para correções, utilize <b>Reabrir partida</b>.</div>':''}
    ${!locked&&!canLiveOperate()?'<div class="notice">🔒 Faça login com perfil autorizado para registrar ocorrências.</div>':''}
    <div class="event-section"><label>Tempo da ocorrência</label>
      <div class="event-clock-layout">
        <div class="event-adjust-group"><button type="button" class="smallbtn" data-event-clock-adjust="60" ${disabled?'disabled':''}>+ 1 min</button><button type="button" class="smallbtn" data-event-clock-adjust="1" ${disabled?'disabled':''}>+ 1 seg</button><button type="button" class="smallbtn" data-event-clock-adjust="-60" ${disabled?'disabled':''}>− 1 min</button><button type="button" class="smallbtn" data-event-clock-adjust="-1" ${disabled?'disabled':''}>− 1 seg</button></div>
        <span class="event-clock" id="eventClock">${fmtSec(state.eventClockSeconds)}</span>
        <div class="event-timer-actions"><button type="button" class="smallbtn primary" data-event-timer="toggle" ${disabled?'disabled':''}>${state.eventTimerStartedAt?'⏸ Pausar':'▶ Cronômetro'}</button><button type="button" class="smallbtn" data-event-timer="reset" ${disabled?'disabled':''}>↺ Zerar</button></div>
      </div>
    </div>
    <div class="event-section"><label>Tipo de ocorrência</label><div class="event-type-grid">${types.map(([v,icon,label],i)=>`<button type="button" class="event-type-btn ${(state.eventType||'gol')===v?'selected':''}" data-event-type="${v}" ${disabled?'disabled':''}><span>${icon}</span><b>${label}</b></button>`).join('')}</div><select id="eventType" class="event-type-hidden" aria-hidden="true"><option value="gol" ${(state.eventType||'gol')==='gol'?'selected':''}>Gol</option><option value="gol_contra" ${(state.eventType||'gol')==='gol_contra'?'selected':''}>Gol Contra</option><option value="cartao_amarelo" ${(state.eventType||'gol')==='cartao_amarelo'?'selected':''}>Cartão Amarelo</option><option value="cartao_vermelho" ${(state.eventType||'gol')==='cartao_vermelho'?'selected':''}>Cartão Vermelho</option><option value="substituicao" ${(state.eventType||'gol')==='substituicao'?'selected':''}>Substituição</option></select></div>
    <div class="event-section"><label>Equipe e atleta</label><div class="event-fields-grid">
      <div><small>Equipe</small><select id="eventTeam" ${disabled?'disabled':''}><option value="">Selecione a equipe</option><option value="${m.home_team_id}">${esc(teamName(m.home_team_id))}</option><option value="${m.away_team_id}">${esc(teamName(m.away_team_id))}</option></select></div>
      <div id="normalEventPlayer"><small>Atleta</small><select id="eventPlayer" ${disabled?'disabled':''}><option value="">Selecione o atleta</option></select></div>
      <div id="substitutionPlayers" class="substitution-grid" style="display:none"><div><small>Sai</small><select id="eventSubOut" ${disabled?'disabled':''}><option value="">Selecione o atleta</option></select></div><div><small>Entra</small><select id="eventSubIn" ${disabled?'disabled':''}><option value="">Selecione o atleta</option></select></div></div>
    </div></div>
    <input id="eventMinute" type="hidden" value="${Math.floor(state.eventClockSeconds/60)}"/>
    <div class="event-form-actions"><button class="primary event-save-btn" ${disabled?'disabled':''} data-action="event">💾 Registrar ocorrência</button></div>
  </div>`
}
function elapsedSeconds(m){const half=state.timerHalf;let base=0;if(half==='1T')base=m?.first_half_elapsed_seconds||0;else if(half==='2T')base=m?.second_half_elapsed_seconds||0;else return 0;return base+(state.timerStartedAt?Math.max(0,Math.floor((Date.now()-new Date(state.timerStartedAt).getTime())/1000)):0)}
function currentMinute(){return Math.floor(state.eventClockSeconds/60)}
function currentClock(){return fmtSec(state.eventClockSeconds)}
function adjustEventClock(delta){if(!canLiveOperate()||state.selectedMatch?.status==='encerrado')return;state.eventClockSeconds=Math.max(0,state.eventClockSeconds+delta);updateEventClockDom()}
function updateEventClockDom(){const t=fmtSec(state.eventClockSeconds);document.querySelectorAll('#eventClock,.sub-clock-inline .event-clock').forEach(el=>el.textContent=t);const mi=document.querySelector('#eventMinute');if(mi)mi.value=Math.floor(state.eventClockSeconds/60)}
function toggleEventTimer(){if(!canLiveOperate()||state.selectedMatch?.status==='encerrado')return;if(state.eventTimerStartedAt){state.eventClockSeconds+=Math.max(0,Math.floor((Date.now()-new Date(state.eventTimerStartedAt).getTime())/1000));state.eventTimerStartedAt=null;stopEventTicker()}else{state.eventTimerStartedAt=new Date().toISOString();startEventTicker()}render()}
function resetEventTimer(){if(!canLiveOperate()||state.selectedMatch?.status==='encerrado')return;state.eventTimerStartedAt=null;stopEventTicker();state.eventClockSeconds=0;render()}
function startEventTicker(){stopEventTicker();state.eventTimerInterval=setInterval(()=>{const base=state.eventClockSeconds;const running=state.eventTimerStartedAt?Math.max(0,Math.floor((Date.now()-new Date(state.eventTimerStartedAt).getTime())/1000)):0;const t=fmtSec(base+running);document.querySelectorAll('#eventClock,.sub-clock-inline .event-clock').forEach(el=>el.textContent=t);const mi=document.querySelector('#eventMinute');if(mi)mi.value=Math.floor((base+running)/60)},1000)}
function stopEventTicker(){if(state.eventTimerInterval)clearInterval(state.eventTimerInterval);state.eventTimerInterval=null}
function eventTimeline(m=state.selectedMatch){
  const editable=canLiveOperate() && m?.status!=='encerrado';
  const events=state.events.slice().sort((a,b)=>((a.minute||0)*60+(a.second||0))-((b.minute||0)*60+(b.second||0)));
  const typeOptions=(value)=>['gol','gol_contra','cartao_amarelo','cartao_vermelho','substituicao'].map(t=>`<option value="${t}" ${value===t?'selected':''}>${esc(eventLabel(t))}</option>`).join('');
  const row=(e)=>{
    const editing=state.editingEventId===e.id;
    if(editing){
      const teamPlayers=state.players.filter(p=>p.team_id===e.team_id).sort((a,b)=>(Number(a.shirt_number)||999)-(Number(b.shirt_number)||999));
      const playerOpts=teamPlayers.map(p=>`<option value="${p.id}" ${e.player_id===p.id?'selected':''}>${p.shirt_number?`#${p.shirt_number} - `:''}${esc(p.full_name||p.name)}</option>`).join('');
      const relatedOpts=teamPlayers.map(p=>`<option value="${p.id}" ${e.related_player_id===p.id?'selected':''}>${p.shirt_number?`#${p.shirt_number} - `:''}${esc(p.full_name||p.name)}</option>`).join('');
      return `<div class="eventrow eventrow-editing"><span class="eventicon">${eventIcon(e.type)}</span><div class="event-edit-inline"><select id="evtType-${e.id}">${typeOptions(e.type)}</select><select id="evtTeam-${e.id}"><option value="">Equipe</option><option value="${m.home_team_id}" ${e.team_id===m.home_team_id?'selected':''}>${esc(teamName(m.home_team_id))}</option><option value="${m.away_team_id}" ${e.team_id===m.away_team_id?'selected':''}>${esc(teamName(m.away_team_id))}</option></select>${e.type==='substituicao'?`<select id="evtPlayer-${e.id}"><option value="">Sai</option>${playerOpts}</select><select id="evtRelatedPlayer-${e.id}"><option value="">Entra</option>${relatedOpts}</select>`:`<select id="evtPlayer-${e.id}"><option value="">Atleta</option>${playerOpts}</select>`}<input id="evtMinute-${e.id}" type="number" min="0" max="150" value="${e.minute??0}" placeholder="Min"></div><span class="event-actions"><button type="button" class="smallbtn" data-event-edit-cancel="${e.id}">Cancelar</button><button type="button" class="smallbtn danger" data-event-delete="${e.id}">🗑️ Excluir</button><button type="button" class="smallbtn primary" data-event-save="${e.id}">💾 Salvar</button></span></div>`;
    }
    return `<div class="eventrow"><span class="eventicon">${eventIcon(e.type)}</span><div><b>${esc(eventLabel(e.type))}</b> <span class="muted">${e.minute??'—'}'</span><div>${e.type==='substituicao'?'Sai: ':''}${e.player_id?esc(playerName(e.player_id)):''}${e.related_player_id?` → Entra: ${esc(playerName(e.related_player_id))}`:''}</div></div><span class="event-actions"><span class="muted">${esc(teamName(e.team_id))}</span>${editable?`<button type="button" class="smallbtn" data-event-edit="${e.id}">✏️ Alterar</button><button type="button" class="smallbtn danger" data-event-delete="${e.id}">🗑️ Excluir</button>`:''}</span></div>`;
  };
  const home=events.filter(e=>e.team_id===m?.home_team_id);
  const away=events.filter(e=>e.team_id===m?.away_team_id);
  const other=events.filter(e=>e.team_id!==m?.home_team_id&&e.team_id!==m?.away_team_id);
  const column=(teamId,items)=>`<div class="team-events-column"><div class="team-events-head">${flag(teamName(teamId))} <b>${esc(teamName(teamId))}</b></div>${items.length?items.slice().reverse().map(row).join(''):`<div class="empty team-events-empty">Nenhum evento registrado.</div>`}</div>`;
  return `<div class="timeline match-events-below"><div class="panelhead"><h3>Eventos da partida</h3><span class="tag">${events.length} eventos</span></div><div class="match-events-grid">${column(m.home_team_id,home)}${column(m.away_team_id,away)}${other.length?`<div class="team-events-column"><div class="team-events-head">Outros</div>${other.slice().reverse().map(row).join('')}</div>`:''}</div></div>`;
}
function eventIcon(t){return {gol:'⚽',gol_contra:'🥅',cartao_amarelo:'🟨',cartao_vermelho:'🟥',substituicao:'🔄',incidente:'📝'}[t]||'•'}
function eventLabel(t){return {gol:'Gol',gol_contra:'Gol Contra',cartao_amarelo:'Cartão amarelo',cartao_vermelho:'Cartão vermelho',substituicao:'Substituição',incidente:'Incidente'}[t]||t}
function lineupStatusLabel(st){return st==='titular'?'Titular':st==='suspenso'?'Suspenso':st==='nao_compareceu'?'Ausente':'Reserva'}
function lineupPanel(m){const editable=canLiveOperate()&&m.status!=='encerrado';const teamBlocks=[m.home_team_id,m.away_team_id].map(tid=>{const ps=state.players.filter(p=>p.team_id===tid).sort((a,b)=>(a.shirt_number||999)-(b.shirt_number||999));return `<div class="lineupteam"><div class="lineupteam-head"><h4>${flag(teamName(tid))} ${esc(teamName(tid))}</h4><span class="tag">${ps.length} atletas</span></div><div class="lineup-list">${ps.length?ps.map(p=>{const l=state.lineups.find(x=>x.player_id===p.id);const st=l?.status||'nao_compareceu';const suspended=st==='suspenso';const present=!['nao_compareceu','suspenso'].includes(st);const nm=esc(p.full_name||p.name||'');const category=esc(cat(p.category)||'—');const situationLabel=lineupStatusLabel(st);return `<div class="playerline lineup-player-row ${present?'is-present':'is-absent'} ${suspended?'is-suspended':''}" data-player-row="${p.id}"><label class="presence-control"><input type="checkbox" data-lineup-present="${p.id}" ${present?'checked':''} ${suspended||!editable?'disabled':''}><span class="presence-box"></span><span class="player-name-wrap"><b>${p.shirt_number?`#${esc(p.shirt_number)} `:''}${nm}</b><small>${category}</small></span></label><button type="button" class="statusbtn ${suspended?'status-suspenso':st==='nao_compareceu'?'status-nao_compareceu':st==='titular'?'status-titular':'status-reserva'}" data-lineup-status="${p.id}" data-status="${st}" ${!editable?'disabled':''}>${situationLabel}</button><button type="button" class="smallbtn verify-player-btn" data-player-data="${p.id}" title="Verificar dados do atleta">📋</button></div>`}).join(''):'<div class="muted">Nenhum atleta cadastrado.</div>'}</div></div>`}).join('');return `<div class="lineuppanel ${m.status==='encerrado'?'lineup-locked':''}"><div class="panelhead"><div><h3>Súmula / escalação</h3><p class="muted">${m.status==='encerrado'?'Partida encerrada: escalação bloqueada. Reabra a partida para fazer correções.':'Defina a situação de cada atleta: Titular, Reserva, Ausente ou Suspenso. Atletas suspensos ficam bloqueados para ocorrências ao vivo.'}</p></div><button class="secondary" data-action="saveLineup" ${!editable?'disabled':''}>💾 Salvar situação dos atletas</button></div><div class="lineup-columns">${teamBlocks}</div></div>`}
function lineupStatusModal(id){const btn=document.querySelector(`[data-lineup-status="${id}"]`);if(!btn)return;const current=btn.dataset.status||'nao_compareceu';document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="lineupStatusModal"><div class="modalbox lineup-status-modal"><button class="close" data-close>×</button><div class="eyebrow">ESCALAÇÃO</div><h2>Escolha a situação</h2><div class="status-options"><button class="status-option ${current==='titular'?'selected':''}" data-lineup-choice="${id}" data-status="titular">🟢 Titular</button><button class="status-option ${current==='reserva'?'selected':''}" data-lineup-choice="${id}" data-status="reserva">⚪ Reserva</button><button class="status-option ${current==='nao_compareceu'?'selected':''}" data-lineup-choice="${id}" data-status="nao_compareceu">🔴 Ausente</button><button class="status-option ${current==='suspenso'?'selected':''} status-option-suspenso" data-lineup-choice="${id}" data-status="suspenso">⛔ Suspenso</button></div></div></div>`)}
function playerDataModal(id){const p=state.players.find(x=>String(x.id)===String(id));if(!p)return;const birth=p.birth_date?new Date(p.birth_date+'T00:00:00').toLocaleDateString('pt-BR'):'—';document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="playerDataModal"><div class="modalbox player-data-modal"><button class="close" data-close>×</button><div class="eyebrow">VERIFICAÇÃO DO ATLETA</div><h2>${esc(p.full_name||p.name||'Atleta')}</h2><div class="player-data-grid"><div><small>Nº cadastro</small><b>${esc(p.registration_number??'—')}</b></div><div><small>Camisa</small><b>${esc(p.shirt_number??'—')}</b></div><div><small>Apelido</small><b>${esc(p.nickname||'—')}</b></div><div><small>Posição</small><b>${esc(p.position||'—')}</b></div><div><small>Data nascimento</small><b>${birth}</b></div><div><small>Categoria</small><b>${esc(cat(p.category)||'—')}</b></div><div><small>Equipe</small><b>${flag(teamName(p.team_id))} ${esc(teamName(p.team_id)||'—')}</b></div></div>${p.photo_url?`<img class="player-data-photo" src="${esc(p.photo_url)}" alt="">`:''}<div class="modal-actions"><button class="secondary" data-close>Fechar</button></div></div></div>`)}
function votePanel(m){const candidates=state.players.filter(p=>state.lineups.some(l=>l.match_id===m.id&&l.player_id===p.id&&l.status==='titular'));const counts=state.votes.reduce((a,v)=>(a[v.player_id]=(a[v.player_id]||0)+1,a),{});return `<div class="votepanel"><h3>Melhor jogador da partida</h3>${candidates.length?candidates.sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)).map(p=>`<button class="vote" data-vote="${p.id}" ${!state.session?'disabled':''}>⭐ ${esc(p.name)} <b>${counts[p.id]||0}</b></button>`).join(''):'<div class="muted">Defina a escalação titular para liberar os candidatos.</div>'}</div>`}
function standingsView(){const rows=state.teams.map(t=>({team:t,j:0,v:0,e:0,d:0,gp:0,gc:0,pts:0}));const map=new Map(rows.map(r=>[r.team.id,r]));state.matches.filter(m=>m.status==='encerrado').forEach(m=>{const h=map.get(m.home_team_id),a=map.get(m.away_team_id);if(!h||!a)return;h.j++;a.j++;h.gp+=m.home_score||0;h.gc+=m.away_score||0;a.gp+=m.away_score||0;a.gc+=m.home_score||0;if(m.home_score>m.away_score){h.v++;h.pts+=3;a.d++}else if(m.home_score<m.away_score){a.v++;a.pts+=3;h.d++}else{h.e++;a.e++;h.pts++;a.pts++}});rows.sort((a,b)=>b.pts-a.pts||(b.gp-b.gc)-(a.gp-a.gc)||b.gp-a.gp||a.team.name.localeCompare(b.team.name));return `<section class="panel"><div class="panelhead"><div><h2>Classificação geral</h2><p class="muted">Calculada automaticamente com as partidas encerradas.</p></div><span class="tag">${state.matches.filter(m=>m.status==='encerrado').length} jogos concluídos</span></div>${classificationTabs('geral')}<div class="tablewrap"><table><tr><th>#</th><th>Time</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr>${rows.map((r,i)=>`<tr><td><b>${i+1}</b></td><td>${flag(r.team.name)} ${esc(r.team.name)}</td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gp}</td><td>${r.gc}</td><td>${r.gp-r.gc}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table></div></section>`}
function list(title,items,type){
  const data = type==='team' ? state.teams : type==='player' ? state.players : type==='referee' ? state.referees : [];
  if(type==='player'){
    const rows=data.slice().sort((a,b)=>(Number(a.registration_number)||999999)-(Number(b.registration_number)||999999)).map(r=>`<tr><td><b>${esc(r.registration_number??'—')}</b></td><td><b>${r.photo_url?`<img class="avatar-sm" src="${esc(r.photo_url)}" alt="">`:''}${esc(r.full_name||r.name)}</b></td><td>${esc(r.nickname||'—')}</td><td>${esc(r.position||'—')}</td><td>${r.birth_date?new Date(r.birth_date+'T00:00:00').toLocaleDateString('pt-BR'):'—'}</td><td>${esc(cat(r.category))}</td><td><b>${esc(r.shirt_number??'—')}</b></td><td>${esc(teamName(r.team_id)||'—')}</td>${canLiveOperate()?`<td class="actions"><button class="smallbtn" data-edit-crud="player" data-id="${r.id}">✏️ Alterar</button><button class="danger smallbtn" data-delete-crud="player" data-id="${r.id}">🗑️ Excluir</button></td>`:''}</tr>`).join('');
    return `<section class="panel"><div class="panelhead"><h2>${title}</h2><div class="panelhead"><span class="tag">${items.length} registros</span><button class="secondary" data-player-export>📋 Transferir atletas</button>${canLiveOperate()?'<button class="primary" data-crud="player">➕ Incluir</button>':''}</div></div>${data.length?`<div class="tablewrap"><table><tr><th>Nº</th><th>Nome Completo</th><th>Apelido</th><th>Posição</th><th>Data Nascimento</th><th>Categoria</th><th>Camisa</th><th>Time</th>${canLiveOperate()?'<th>Ações</th>':''}</tr>${rows}</table></div>`:`<div class="empty">Nenhum registro cadastrado.</div>`}</section>`;
  }
  const rows = data.map(r=>{
    const label = type==='team' ? flag(r.name)+' '+esc(r.name) : esc(r.name);
    const detail = type==='team' ? esc(r.country||'Seleção') : esc(r.registration||'Árbitro');
    return `<tr><td><b>${label}</b></td><td>${detail}</td>${canLiveOperate()?`<td class="actions"><button class="smallbtn" data-edit-crud="${type}" data-id="${r.id}">✏️ Alterar</button><button class="danger smallbtn" data-delete-crud="${type}" data-id="${r.id}">🗑️ Excluir</button></td>`:''}</tr>`
  }).join('');
  return `<section class="panel"><div class="panelhead"><h2>${title}</h2><div class="panelhead"><span class="tag">${items.length} registros</span>${canLiveOperate()&&type?`<button class="primary" data-crud="${type}">➕ Incluir</button>`:''}</div></div>${data.length?`<div class="tablewrap"><table><tr><th>Nome</th><th>Detalhes</th>${canLiveOperate()?'<th>Ações</th>':''}</tr>${rows}</table></div>`:`<div class="empty">Nenhum registro cadastrado.</div>`}</section>`
}

async function openPlayerExportModal(){
  if(!canLiveOperate()) return toast('Acesso operacional necessário.','error');

  const competitions=state.competitions||[];
  if(competitions.length<2){
    return toast('Cadastre pelo menos dois campeonatos para transferir atletas.','error');
  }

  document.querySelector('#playerExportModal')?.remove();

  const counts=await Promise.all(
    competitions.map(async c=>{
      const tr=await supabase
        .from('teams')
        .select('id')
        .eq('competition_id',c.id);

      if(tr.error) return {c,n:0};

      const ids=(tr.data||[]).map(x=>x.id);
      if(!ids.length) return {c,n:0};

      const pr=await supabase
        .from('players')
        .select('id',{count:'exact',head:true})
        .in('team_id',ids);

      return {c,n:pr.error?0:(pr.count||0)};
    })
  );

  const current=state.competition?.id||'';
  const currentCount=counts.find(x=>x.c.id===current)?.n||0;

  const sourceDefault=
    currentCount>0
      ? current
      : (counts.find(x=>x.n>0)?.c.id||current);

  const destDefault=
    sourceDefault===current
      ? (competitions.find(c=>c.id!==sourceDefault)?.id||'')
      : current;

  const sourceOptions=competitions.map(c=>`
    <option value="${c.id}" ${c.id===sourceDefault?'selected':''}>
      ${esc(c.name)}${c.season?` • ${esc(c.season)}`:''}
    </option>
  `).join('');

  const destOptions=competitions
    .filter(c=>c.id!==sourceDefault)
    .map(c=>`
      <option value="${c.id}" ${c.id===destDefault?'selected':''}>
        ${esc(c.name)}${c.season?` • ${esc(c.season)}`:''}
      </option>
    `).join('');

  document.body.insertAdjacentHTML('beforeend',`
    <style id="playerExportStyles">
      #playerExportModal{
        z-index:9999;
        padding:12px;
        overflow:auto;
      }

      #playerExportModal .modalbox.wide{
        width:min(1400px,98vw);
        max-width:98vw;
        max-height:94vh;
        overflow:hidden;
        display:flex;
        flex-direction:column;
      }

      #playerExportRows{
        width:100%;
        max-width:100%;
        overflow-x:auto;
        overflow-y:auto;
        max-height:58vh;
        border:1px solid #ddd;
        border-radius:8px;
      }

      #playerExportRows table{
        width:max-content;
        min-width:1200px;
        border-collapse:collapse;
      }

      #playerExportRows th,
      #playerExportRows td{
        white-space:nowrap;
        padding:8px;
      }

      #playerExportRows select{
        min-width:210px;
      }

      @media(max-width:800px){
        #playerExportModal .modalbox.wide{
          width:98vw;
          max-width:98vw;
        }

        #playerExportRows{
          max-height:55vh;
        }

        #playerExportRows table{
          min-width:1050px;
        }

        #playerExportRows select{
          min-width:180px;
        }
      }
    </style>

    <div class="modal" id="playerExportModal">
      <div class="modalbox wide">

        <button class="close" data-close>×</button>

        <div class="eyebrow">
          TRANSFERÊNCIA DE ATLETAS ENTRE CAMPEONATOS
        </div>

        <h2>📋 Transferir atletas</h2>

        <p class="muted">
          O atleta será <b>copiado</b> para o campeonato de destino
          e permanecerá no campeonato de origem.
        </p>

        <div class="formgrid">

          <div>
            <label>Campeonato de origem</label>
            <select id="playerExportSource" data-player-export-source>
              ${sourceOptions}
            </select>
          </div>

          <div>
            <label>Campeonato de destino</label>
            <select id="playerExportCompetition" data-player-export-competition>
              <option value="">Selecione o campeonato</option>
              ${destOptions}
            </select>
          </div>

        </div>

        <div class="modal-actions">
          <button class="secondary" type="button" data-export-check-all>
            ☑️ Marcar todos
          </button>

          <button class="secondary" type="button" data-export-uncheck-all>
            ⬜ Desmarcar todos
          </button>
        </div>

        <div id="playerExportRows" class="tablewrap">
          <div class="empty">Carregando atletas...</div>
        </div>

        <div class="modal-actions">
          <button class="secondary" type="button" data-close>
            ❌ Cancelar
          </button>

          <button class="primary" type="button" data-export-players>
            📤 Transferir atletas marcados
          </button>
        </div>

      </div>
    </div>
  `);

  await loadPlayerExportTeams();
}

async function loadPlayerExportTeams(){
  const sourceId=document.querySelector('#playerExportSource')?.value||'';
  const destId=document.querySelector('#playerExportCompetition')?.value||'';
  const box=document.querySelector('#playerExportRows');
  if(!box)return;
  if(!sourceId){box.innerHTML='<div class="empty">Selecione o campeonato de origem.</div>';return}
  if(!destId){box.innerHTML='<div class="empty">Selecione o campeonato de destino.</div>';return}
  if(sourceId===destId){box.innerHTML='<div class="empty">Origem e destino devem ser campeonatos diferentes.</div>';return}

  const [src,dst]=await Promise.all([
    supabase.from('teams').select('id,name,country').eq('competition_id',sourceId).order('name'),
    supabase.from('teams').select('id,name,country').eq('competition_id',destId).order('name')
  ]);
  if(src.error)return toast('Erro ao carregar times da origem: '+src.error.message,'error');
  if(dst.error)return toast('Erro ao carregar times do destino: '+dst.error.message,'error');
  const sourceTeams=src.data||[],destTeams=dst.data||[];
  if(!sourceTeams.length){box.innerHTML='<div class="empty">O campeonato de origem não possui times cadastrados.</div>';return}
  if(!destTeams.length){box.innerHTML='<div class="empty">O campeonato de destino não possui times cadastrados. Cadastre pelo menos um time antes de copiar atletas.</div>';return}

  const sourceIds=sourceTeams.map(t=>t.id);
  const pr=await supabase.from('players').select('*').in('team_id',sourceIds);
  if(pr.error)return toast('Erro ao carregar atletas da origem: '+pr.error.message,'error');
  const players=pr.data||[];
  if(!players.length){box.innerHTML='<div class="empty">Nenhum atleta cadastrado no campeonato de origem.</div>';return}

  const teamMap=new Map(sourceTeams.map(t=>[t.id,t.name]));
  const options=destTeams.map(t=>`<option value="${t.id}">${flag(t.name)} ${esc(t.name)}</option>`).join('');
  const rows=players.slice().sort((a,b)=>(teamMap.get(a.team_id)||'').localeCompare(teamMap.get(b.team_id)||'','pt-BR')||(Number(a.registration_number)||999999)-(Number(b.registration_number)||999999)||(a.full_name||a.name||'').localeCompare(b.full_name||b.name||'','pt-BR')).map(p=>`<tr>
    <td><input type="checkbox" data-export-player="${p.id}"></td>
    <td><b>${esc(p.registration_number??'—')}</b></td>
    <td>${esc(p.full_name||p.name)}</td>
    <td>${esc(p.nickname||'—')}</td>
    <td>${esc(cat(p.category))}</td>
    <td><b>${esc(p.shirt_number??'—')}</b></td>
    <td>${esc(teamMap.get(p.team_id)||'—')}</td>
    <td><select data-export-dest-player="${p.id}"><option value="">Selecione o time</option>${options}</select></td>
  </tr>`).join('');
  box.innerHTML=`<table><tr><th>Marcar</th><th>Nº Cadastro</th><th>Nome completo</th><th>Apelido</th><th>Categoria</th><th>Camisa</th><th>Equipe atual</th><th>Copiar para</th></tr>${rows}</table>`;
}

async function exportSelectedPlayers(){
  if(!canLiveOperate())return toast('Acesso operacional necessário.','error');
  const sourceId=document.querySelector('#playerExportSource')?.value||'';
  const destCompetitionId=document.querySelector('#playerExportCompetition')?.value||'';
  if(!sourceId)return toast('Selecione o campeonato de origem.','error');
  if(!destCompetitionId)return toast('Selecione o campeonato de destino.','error');
  if(sourceId===destCompetitionId)return toast('Origem e destino devem ser diferentes.','error');

  const checked=[...document.querySelectorAll('[data-export-player]:checked')];
  if(!checked.length)return toast('Marque pelo menos um atleta.','error');

  const sourceTeamsRes=await supabase.from('teams').select('id').eq('competition_id',sourceId);
  if(sourceTeamsRes.error)return toast('Erro ao confirmar a origem: '+sourceTeamsRes.error.message,'error');
  const sourceTeamIds=(sourceTeamsRes.data||[]).map(t=>t.id);
  if(!sourceTeamIds.length)return toast('O campeonato de origem não possui times cadastrados.','error');

  const playerIds=checked.map(cb=>cb.dataset.exportPlayer);
  const playersRes=await supabase.from('players').select('*').in('id',playerIds).in('team_id',sourceTeamIds);
  if(playersRes.error)return toast('Erro ao localizar os atletas: '+playersRes.error.message,'error');
  const byId=new Map((playersRes.data||[]).map(p=>[String(p.id),p]));

  const selected=checked.map(cb=>({
    p:byId.get(String(cb.dataset.exportPlayer)),
    dest:document.querySelector(`[data-export-dest-player="${cb.dataset.exportPlayer}"]`)?.value||''
  })).filter(x=>x.p);
  if(selected.length!==checked.length)return toast('Alguns atletas selecionados não foram encontrados na origem. Recarregue a lista e tente novamente.','error');
  if(selected.some(x=>!x.dest))return toast('Escolha o time de destino de todos os atletas marcados.','error');

  // Confirma que os times escolhidos realmente pertencem ao campeonato de destino.
  const destTeamIds=[...new Set(selected.map(x=>x.dest))];
  const destTeamsRes=await supabase.from('teams').select('id').eq('competition_id',destCompetitionId).in('id',destTeamIds);
  if(destTeamsRes.error)return toast('Erro ao validar os times de destino: '+destTeamsRes.error.message,'error');
  const validDest=new Set((destTeamsRes.data||[]).map(t=>String(t.id)));
  if(destTeamIds.some(id=>!validDest.has(String(id))))return toast('Há um time selecionado que não pertence ao campeonato de destino. Selecione novamente os times.','error');

  const existingRes=await supabase.from('players').select('team_id,full_name,name').in('team_id',destTeamIds);
  if(existingRes.error)return toast('Erro ao verificar atletas já cadastrados: '+existingRes.error.message,'error');
  const existing=new Set((existingRes.data||[]).map(x=>`${x.team_id}|${String(x.full_name||x.name||'').trim().toLowerCase()}`));
  const rows=[],duplicates=[];

  for(const x of selected){
    const fullName=String(x.p.full_name||x.p.name||'').trim();
    if(!fullName)continue;
    const key=`${x.dest}|${fullName.toLowerCase()}`;
    if(existing.has(key)){duplicates.push(fullName);continue}
    rows.push({
      team_id:x.dest,
      name:String(x.p.name||fullName).trim(),
      full_name:String(x.p.full_name||fullName).trim(),
      nickname:x.p.nickname??null,
      birth_date:x.p.birth_date??null,
      category:x.p.category??null,
      shirt_number:Number.isFinite(Number(x.p.shirt_number))?Number(x.p.shirt_number):null,
      position:x.p.position??null,
      active:x.p.active!==false,
      photo_url:x.p.photo_url??null,
      photo_path:x.p.photo_path??null
    });
    existing.add(key);
  }

  if(!rows.length)return toast('Todos os atletas selecionados já existem nos times de destino.','error');
  const msg=`Copiar ${rows.length} atleta(s) para o campeonato de destino?${duplicates.length?` ${duplicates.length} já existente(s) serão ignorado(s).`:''}`;
  if(!(await askConfirm(msg)))return;

  // Insere um por vez para identificar exatamente qual atleta falhou.
  const ok=[],failed=[];
  for(const row of rows){
    const result=await supabase.from('players').insert(row);
    if(result.error)failed.push(`${row.full_name||row.name}: ${result.error.message}`);
    else ok.push(row.full_name||row.name);
  }

  if(!ok.length){
    return toast('Nenhum atleta foi copiado. '+(failed[0]||'Verifique as permissões do cadastro de atletas.'),'error');
  }
  document.querySelector('#playerExportModal')?.remove();
  const detail=failed.length?` ${failed.length} atleta(s) não foram copiados.`:'';
  toast(`${ok.length} atleta(s) copiado(s) com sucesso.${detail}`,'ok');
  await load();
}

async function adjustScore(teamId,delta){if(!canLiveOperate()||!state.selectedMatch)return;const m=state.selectedMatch;if(m.status==='encerrado')return;const field=teamId===m.home_team_id?'home_score':'away_score';const value=Math.max(0,Number(m[field]||0)+delta);await updateMatch({[field]:value});}
async function adjustClock(deltaSeconds){if(!canLiveOperate()||!state.selectedMatch)return;const m=state.selectedMatch;if(m.status==='encerrado')return;const half=state.timerHalf||'1T';const field=half==='2T'?'second_half_elapsed_seconds':'first_half_elapsed_seconds';const current=elapsedSeconds(m);const value=Math.max(0,current+deltaSeconds);const running=!!state.timerStartedAt;state.timerStartedAt=running?new Date().toISOString():null;await updateMatch({[field]:value});if(running)startTicker();}
async function adjustMinute(delta){return adjustClock(delta*60)}
async function adjustSecond(delta){return adjustClock(delta)}

async function updateMatch(values){if(!canLiveOperate()||!state.selectedMatch)return toast('Acesso operacional necessário.','error');const id=state.selectedMatch.id;const {data,error}=await supabase.from('matches').update(values).eq('id',id).select('*').single();if(error)return toast(error.message,'error');state.selectedMatch=data;const idx=state.matches.findIndex(x=>x.id===id);if(idx>=0)state.matches[idx]=data;else state.matches.push(data);render();return data;}
async function startHalf(half){if(!canLiveOperate())return toast('Entre com perfil autorizado.','error');const m=state.selectedMatch;if(!m||m.status==='encerrado')return;if(state.timerHalf===half&&state.timerStartedAt){toast(half==='1T'?'1º tempo já está em andamento.':'2º tempo já está em andamento.');return}const now=new Date().toISOString();let values={status:'ao_vivo'};if(state.timerStartedAt&&state.timerHalf&&state.timerHalf!==half){const elapsed=Math.max(0,Math.floor((Date.now()-new Date(state.timerStartedAt).getTime())/1000));const oldField=state.timerHalf==='2T'?'second_half_elapsed_seconds':'first_half_elapsed_seconds';values[oldField]=(m[oldField]||0)+elapsed}if(half==='1T')values.first_half_started_at=now;else values.second_half_started_at=now;state.timerHalf=half;state.timerStartedAt=now;await updateMatch(values);stopTicker();startTicker()}
async function pause(){if(!canLiveOperate()||!state.selectedMatch)return;const m=state.selectedMatch;if(!state.timerStartedAt){stopTicker();return}const elapsed=Math.max(0,Math.floor((Date.now()-new Date(state.timerStartedAt).getTime())/1000));const field=state.timerHalf==='2T'?'second_half_elapsed_seconds':'first_half_elapsed_seconds';const values={[field]:(m[field]||0)+elapsed};state.timerStartedAt=null;stopTicker();await updateMatch(values);state.timerHalf=state.timerHalf||'1T';render();toast('Cronômetro pausado e tempo salvo.');}
async function resetMatchClock(){if(!canLiveOperate()||!state.selectedMatch)return;const m=state.selectedMatch;if(m.status==='encerrado')return toast('Partida encerrada. Reabra para corrigir o tempo.','error');const half=state.timerHalf||'1T';if(!(await askConfirm('Zerar o tempo do '+(half==='2T'?'2º':'1º')+' tempo?')))return;stopTicker();state.timerStartedAt=null;state.timerHalf=half;const field=half==='2T'?'second_half_elapsed_seconds':'first_half_elapsed_seconds';await updateMatch({[field]:0});render();toast('Tempo zerado.');}
async function finishMatch(){if(!canLiveOperate())return toast('Entre com perfil autorizado.','error');if(!confirm('Encerrar esta partida e confirmar o placar?'))return;if(state.timerStartedAt)await pause();await updateMatch({status:'encerrado',finished_at:new Date().toISOString()});state.timerStartedAt=null;stopTicker();state.timerHalf=null;await loadMatchDetails(state.selectedMatch.id,false);await loadCompetitionData();await resolvePhaseMatches();await loadCompetitionData();render()}
async function addEvent(){
  if(!canLiveOperate())return toast('Acesso operacional necessário.','error');
  const m=state.selectedMatch;if(!m)return;if(m.status==='encerrado')return toast('Partida encerrada: não é permitido registrar ocorrências.','error');
  const type=document.querySelector('#eventType')?.value;
  const team_id=document.querySelector('#eventTeam')?.value||null;
  const player_id=type==='substituicao'?document.querySelector('#eventSubOut')?.value||null:document.querySelector('#eventPlayer')?.value||null;
  const related_player_id=type==='substituicao'?document.querySelector('#eventSubIn')?.value||null:null;
  const suspendedIds=new Set((state.lineups||[]).filter(l=>l.match_id===m.id&&l.status==='suspenso').map(l=>String(l.player_id)));
  const minute=Math.floor((state.eventClockSeconds+(state.eventTimerStartedAt?Math.max(0,Math.floor((Date.now()-new Date(state.eventTimerStartedAt).getTime())/1000)):0))/60);
  if(!team_id)return toast('Selecione a equipe.','error');
  if(type==='substituicao'){if(!player_id||!related_player_id)return toast('Informe quem sai e quem entra.','error');if(player_id===related_player_id)return toast('O atleta que sai não pode ser o mesmo que entra.','error');if(suspendedIds.has(String(player_id))||suspendedIds.has(String(related_player_id)))return toast('Atleta suspenso não pode participar de ocorrências ou substituições nesta partida.','error');}
  else if(!player_id)return toast('Selecione o atleta.','error');
  if(player_id&&suspendedIds.has(String(player_id)))return toast('Atleta suspenso: ocorrência bloqueada.','error');
  if(!(await askConfirm(type==='substituicao'?'Salvar esta substituição?':'Salvar esta ocorrência?')))return;
  const payload={match_id:m.id,team_id,player_id,related_player_id,minute,added_minute:null,description:type==='substituicao'?`Substituição: ${playerName(player_id)} por ${playerName(related_player_id)}`:null,type,created_by:state.session.user.id};
  const {error}=await supabase.from('match_events').insert(payload);if(error)return toast(error.message,'error');
  if(type==='gol'||type==='gol_contra'){const scoringTeam=type==='gol_contra'?(team_id===m.home_team_id?m.away_team_id:m.home_team_id):team_id;const field=scoringTeam===m.home_team_id?'home_score':'away_score';await supabase.from('matches').update({[field]:(m[field]||0)+1}).eq('id',m.id)}
  await loadMatchDetails(m.id,false);const fresh=await supabase.from('matches').select('*').eq('id',m.id).maybeSingle();if(fresh.data){state.selectedMatch=fresh.data;const idx=state.matches.findIndex(x=>x.id===m.id);if(idx>=0)state.matches[idx]=fresh.data;}state.eventClockSeconds=0;state.eventType='gol';state.eventTimerStartedAt=null;stopEventTicker();render();toast(type==='substituicao'?'Substituição salva.':'Ocorrência salva.');
}

async function saveLineup(){if(!canLiveOperate())return toast('Acesso operacional necessário.','error');const m=state.selectedMatch;if(!m)return;if(m.status==='encerrado')return toast('Partida encerrada: a súmula/escalação está bloqueada. Reabra a partida para alterar.','error');const rows=[...document.querySelectorAll('[data-lineup-status]')].map((b,i)=>{const id=b.dataset.lineupStatus;const status=b.dataset.status||'nao_compareceu';return {match_id:m.id,player_id:id,status,starter_position:status==='titular'?i+1:null}});const del=await supabase.from('match_lineups').delete().eq('match_id',m.id);if(del.error)return toast(del.error.message,'error');const {error}=rows.length?await supabase.from('match_lineups').insert(rows):{error:null};if(error)return toast(error.message,'error');await loadMatchDetails(m.id);toast('Situação dos atletas salva.');}
async function vote(player_id){if(!state.session)return openAuth();const {error}=await supabase.from('match_votes').insert({match_id:state.selectedMatch.id,player_id,voter_id:state.session.user.id,vote_type:'melhor_jogador'});if(error)return toast(error.message,'error');toast('Voto registrado.','ok');}
async function reopenMatch(id){if(!canOperate())return;const ok=await askConfirm('Reabrir esta partida para correção? O placar e os eventos serão preservados.');if(!ok)return;const {error}=await supabase.from('matches').update({status:'agendado',finished_at:null,reopened_at:new Date().toISOString(),reopened_by:state.session.user.id}).eq('id',id);if(error)return toast(error.message,'error');toast('Partida reaberta. Agora você pode alterar resultado e eventos.');await load();}
async function saveScoreCorrection(){if(!canOperate())return;const m=state.selectedMatch;if(!m?.reopened_at)return toast('Reabra a partida antes de corrigir o resultado.','error');const home=Math.max(0,Number(document.querySelector('#corrHome')?.value)||0),away=Math.max(0,Number(document.querySelector('#corrAway')?.value)||0);const {error}=await supabase.from('matches').update({home_score:home,away_score:away}).eq('id',m.id);if(error)return toast(error.message,'error');await loadMatchDetails(m.id,false);await load();toast('Resultado corrigido.');}
function eventEditModal(id){const e=state.events.find(x=>x.id===id),m=state.selectedMatch;if(!e||!m)return;const players=state.players.filter(p=>p.team_id===m.home_team_id||p.team_id===m.away_team_id);document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="eventEditModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">CORRIGIR EVENTO</div><h2>${esc(eventLabel(e.type))}</h2><select id="eeType"><option value="gol" ${e.type==='gol'?'selected':''}>⚽ Gol</option><option value="gol_contra" ${e.type==='gol_contra'?'selected':''}>🥅 Gol Contra</option><option value="substituicao" ${e.type==='substituicao'?'selected':''}>🔄 Substituição</option><option value="cartao_amarelo" ${e.type==='cartao_amarelo'?'selected':''}>🟨 Cartão amarelo</option><option value="cartao_vermelho" ${e.type==='cartao_vermelho'?'selected':''}>🟥 Cartão vermelho</option></select><select id="eeTeam"><option value="">Equipe</option><option value="${m.home_team_id}" ${e.team_id===m.home_team_id?'selected':''}>${esc(teamName(m.home_team_id))}</option><option value="${m.away_team_id}" ${e.team_id===m.away_team_id?'selected':''}>${esc(teamName(m.away_team_id))}</option></select><select id="eePlayer"><option value="">Atleta</option>${players.map(p=>`<option value="${p.id}" ${e.player_id===p.id?'selected':''}>${p.shirt_number?`#${p.shirt_number} - `:''}${esc(p.full_name||p.name)} - ${esc(teamName(p.team_id))}</option>`).join('')}</select>${e.type==='substituicao'?`<select id="eeRelatedPlayer"><option value="">Entra</option>${players.map(p=>`<option value="${p.id}" ${e.related_player_id===p.id?'selected':''}>${p.shirt_number?`#${p.shirt_number} - `:''}${esc(p.full_name||p.name)} - ${esc(teamName(p.team_id))}</option>`).join('')}</select>`:''}<input id="eeMinute" type="number" min="0" max="150" value="${e.minute??0}"><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-event-update="${id}">💾 Salvar</button></div></div></div>`)}
async function saveEventInline(id){
  if(!canLiveOperate())return toast('Acesso operacional necessário.','error');
  const m=state.selectedMatch,e=state.events.find(x=>x.id===id);
  if(m?.status==='encerrado')return toast('Partida encerrada: reabra a partida antes de alterar ocorrências.','error');
  if(!m||!e)return;
  if(e.type==='substituicao'){
    const out=document.querySelector('#evtPlayer-'+id)?.value||'';
    const team_id=document.querySelector('#evtTeam-'+id)?.value||null;
    const minute=Math.max(0,Number(document.querySelector('#evtMinute-'+id)?.value)||0);
    const related=document.querySelector('#evtRelatedPlayer-'+id)?.value||e.related_player_id||null;
    if(!team_id)return toast('Selecione a equipe.','error');
    if(!out||!related)return toast('Informe quem sai e quem entra.','error');
    if(out===related)return toast('O atleta que sai não pode ser o mesmo que entra.','error');
    if(!(await askConfirm('Salvar esta substituição?')))return;
    const {error}=await supabase.from('match_events').update({team_id,player_id:out,related_player_id:related,minute,type:'substituicao',description:`Substituição: ${playerName(out)} por ${playerName(related)}`}).eq('id',id);
    if(error)return toast(error.message,'error');
    state.editingEventId=null;state.editingSubId=null;
    await loadMatchDetails(m.id,false);render();toast('Substituição salva com sucesso.');return;
  }
  const type=document.querySelector(`#evtType-${id}`)?.value||e.type;
  const team_id=document.querySelector(`#evtTeam-${id}`)?.value||null;
  const player_id=document.querySelector(`#evtPlayer-${id}`)?.value||null;
  const minute=Math.max(0,Number(document.querySelector(`#evtMinute-${id}`)?.value)||0);
  if(!team_id)return toast('Selecione a equipe.','error');
  if(!player_id)return toast('Selecione o atleta.','error');
  if(!(await askConfirm('Salvar as alterações deste evento?')))return;
  const {error}=await supabase.from('match_events').update({type,team_id,player_id,minute}).eq('id',id);
  if(error)return toast(error.message,'error');
  state.editingEventId=null;
  await loadMatchDetails(m.id,false);
  render();
  toast('Evento salvo com sucesso.');
}
async function updateEvent(id){return saveEventInline(id)}
async function deleteEvent(id){if(!canLiveOperate())return;const m=state.selectedMatch;if(!m)return;if(m.status==='encerrado')return toast('Partida encerrada: reabra a partida antes de excluir ocorrências.','error');const ok=await askConfirm('Excluir este evento?');if(!ok)return;const e=state.events.find(x=>x.id===id);const {error}=await supabase.from('match_events').delete().eq('id',id);if(error)return toast(error.message,'error');if(e?.type==='gol'||e?.type==='gol_contra'){const {data}=await supabase.from('match_events').select('team_id,type').eq('match_id',m.id).in('type',['gol','gol_contra']);let home=0,away=0;(data||[]).forEach(x=>{const scoring=x.type==='gol_contra'?(x.team_id===m.home_team_id?m.away_team_id:m.home_team_id):x.team_id;if(scoring===m.home_team_id)home++;if(scoring===m.away_team_id)away++;});await supabase.from('matches').update({home_score:home,away_score:away}).eq('id',m.id)}await loadMatchDetails(m.id,false);const fresh=await supabase.from('matches').select('*').eq('id',m.id).maybeSingle();if(fresh.data){state.selectedMatch=fresh.data;const idx=state.matches.findIndex(x=>x.id===m.id);if(idx>=0)state.matches[idx]=fresh.data;}render();toast('Evento excluído.');}
async function markNotStarted(id){if(!canOperate())return;const {error}=await supabase.from('matches').update({status:'agendado'}).eq('id',id);if(error)return toast(error.message,'error');toast('Partida marcada como não iniciada.');await load();}
function sponsorModal(id=null){const c=id?state.sponsors.find(x=>x.id===id):null;document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="sponsorModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">PATROCINADOR</div><h2>${c?'Alterar':'Novo'} patrocinador</h2><input id="spName" value="${esc(c?.name||'')}" placeholder="Nome"><div class="file-field"><label>Logo do patrocinador</label><input id="spLogoFile" type="file" accept="image/*"><small class="muted">Selecione a imagem da logo. Não é necessário informar URL.</small>${c?.logo_url?`<img class="sponsor-logo-preview" src="${esc(c.logo_url)}" alt="Logo atual">`:''}</div><input id="spSite" value="${esc(c?.website||'')}" placeholder="Site"><input id="spContact" value="${esc(c?.contact||'')}" placeholder="Contato"><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-sponsor-save="${id||''}">Salvar</button></div></div></div>`)}
async function saveSponsor(id=''){if(!canOperate())return;const current=id?state.sponsors.find(x=>x.id===id):null;const name=document.querySelector('#spName').value.trim();if(!name)return toast('Informe o nome.','error');const file=document.querySelector('#spLogoFile')?.files?.[0];let logo_url=current?.logo_url||null,logo_path=current?.logo_path||null;if(file){const target=id||crypto.randomUUID();const path=`${state.competition.id}/sponsors/${target}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from('ouro-prata-arquivos').upload(path,file,{upsert:true});if(up.error)return toast(up.error.message,'error');logo_path=path;logo_url=supabase.storage.from('ouro-prata-arquivos').getPublicUrl(path).data.publicUrl;}const row={competition_id:state.competition.id,name,logo_url,logo_path,website:document.querySelector('#spSite').value.trim()||null,contact:document.querySelector('#spContact').value.trim()||null};const answer=await askConfirm(id?'Confirma ALTERAR este patrocinador?':'Confirma SALVAR este patrocinador?');if(!answer)return;const res=id?await supabase.from('sponsors').update(row).eq('id',id):await supabase.from('sponsors').insert(row);if(res.error)return toast(res.error.message,'error');document.querySelector('#sponsorModal')?.remove();await load();toast(id?'Patrocinador alterado com sucesso.':'Patrocinador salvo com sucesso.');}
async function deleteSponsor(id){if(!(await askConfirm('Excluir este patrocinador?')))return;const {error}=await supabase.from('sponsors').delete().eq('id',id);if(error)return toast(error.message,'error');await load();}
function mediaModal(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="mediaModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">BIBLIOTECA</div><h2>Adicionar foto ou arquivo</h2><input id="mdTitle" placeholder="Título"><select id="mdCategory"><option value="foto">Foto</option><option value="video">Vídeo</option><option value="arquivo">Arquivo</option><option value="documento">Documento</option></select><input id="mdFile" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><input id="mdDesc" placeholder="Descrição"><div class="modal-actions"><button class="secondary" data-close>Cancelar</button><button class="primary" data-media-save>Enviar</button></div></div></div>`)}
async function saveMedia(){const file=document.querySelector('#mdFile')?.files?.[0];const title=document.querySelector('#mdTitle').value.trim()||file?.name;if(!file||!title)return toast('Escolha um arquivo e informe o título.','error');const path=`${state.competition.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from('ouro-prata-arquivos').upload(path,file,{upsert:false});if(up.error)return toast(up.error.message,'error');const pub=supabase.storage.from('ouro-prata-arquivos').getPublicUrl(path).data.publicUrl;const ins=await supabase.from('media_files').insert({competition_id:state.competition.id,title,category:document.querySelector('#mdCategory').value,file_url:pub,storage_path:path,mime_type:file.type||null,description:document.querySelector('#mdDesc').value.trim()||null});if(ins.error)return toast(ins.error.message,'error');document.querySelector('#mediaModal')?.remove();await load();toast('Arquivo enviado.');}
async function deleteMedia(id){const x=state.media.find(m=>m.id===id);if(!(await askConfirm('Excluir este arquivo?')))return;if(x?.storage_path)await supabase.storage.from('ouro-prata-arquivos').remove([x.storage_path]);const {error}=await supabase.from('media_files').delete().eq('id',id);if(error)return toast(error.message,'error');await load();}
function crudModal(type,id=null){
  if(!canOperate()) return;
  const current = id ? (type==='team'?state.teams:type==='player'?state.players:type==='referee'?state.referees:state.matches).find(x=>x.id===id) : null;
  const common=`<button class="close" data-close>×</button><div class="eyebrow">${current?'ALTERAR':'INCLUIR'} CADASTRO</div>`;
  const val=(key='')=>esc(current?.[key]??'');
  let body='';
  if(type==='team') body=`${common}<h2>${current?'Alterar time':'Novo time'}</h2><input id="fName" value="${val('name')}" placeholder="Nome do time" required><input id="fCountry" value="${val('country')}" placeholder="País / seleção"><select id="fGroup"><option value="">Sem grupo</option>${state.groups.slice().sort((a,b)=>a.position-b.position).map(g=>`<option value="${g.id}" ${current?.group_id===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><div class="modal-actions"><button class="secondary" data-close>❌ Cancelar</button><button class="primary" data-save-crud="team" data-id="${id||''}">💾 Salvar</button></div>`;
  if(type==='player') body=`${common}<h2>${current?'Alterar atleta':'Novo atleta'}</h2>${current?`<input value="Nº de cadastro: ${esc(current.registration_number??'—')}" readonly title="Número gerado automaticamente e não pode ser alterado.">`:'<input value="Nº de cadastro: automático" readonly title="O número será gerado automaticamente ao salvar.">'}<input id="fFullName" value="${val('full_name')||val('name')}" placeholder="Nome completo" required><input id="fNickname" value="${val('nickname')}" placeholder="Apelido"><input id="fBirthDate" type="date" value="${val('birth_date')}"><select id="fTeam">${state.teams.map(t=>`<option value="${t.id}" ${current?.team_id===t.id?'selected':''}>${flag(t.name)} ${esc(t.name)}</option>`).join('')}</select><select id="fCategory"><option value="">Categoria</option><option value="ouro" ${current?.category==='ouro'?'selected':''}>Ouro</option><option value="prata" ${current?.category==='prata'?'selected':''}>Prata</option><option value="diamante" ${current?.category==='diamante'?'selected':''}>Diamante</option></select><select id="fPosition"><option value="">Posição</option>${['Goleiro','Lateral Direito','Lateral Esquerdo','Zagueiro','Meio-Campo','Atacante'].map(x=>`<option ${current?.position===x?'selected':''}>${x}</option>`).join('')}</select><input id="fNumber" type="number" min="1" max="99" value="${current?.shirt_number??''}" placeholder="Número"><div class="file-field"><label>Foto do atleta</label><input id="fPhotoFile" type="file" accept="image/*"><small class="muted">Selecione um arquivo de foto. Não é necessário informar URL.</small>${current?.photo_url?`<img class="player-photo-preview" src="${esc(current.photo_url)}" alt="Foto atual">`:''}</div><div class="modal-actions"><button class="secondary" data-close>❌ Cancelar</button><button class="primary" data-save-crud="player" data-id="${id||''}">💾 Salvar</button></div>`;
  if(type==='referee') body=`${common}<h2>${current?'Alterar árbitro':'Novo árbitro'}</h2><input id="fName" value="${val('name')}" placeholder="Nome do árbitro" required><input id="fReg" value="${val('registration')}" placeholder="Registro"><input id="fPhone" value="${val('phone')}" placeholder="Telefone"><div class="modal-actions"><button class="secondary" data-close>❌ Cancelar</button><button class="primary" data-save-crud="referee" data-id="${id||''}">💾 Salvar</button></div>`;
  if(type==='match') { const isKnockout=!!current?.phase_type&&current.phase_type!=='classificatoria'; const home=current?.home_team_id?teamName(current.home_team_id):(current?.home_source||'A definir'); const away=current?.away_team_id?teamName(current.away_team_id):(current?.away_source||'A definir'); body=isKnockout?`${common}<h2>Alterar data e horário</h2><div class="notice"><b>${esc(home)} × ${esc(away)}</b><br><small class="muted">Nas fases seguintes, somente a data e o horário da partida podem ser alterados.</small></div><label>Data e horário<input id="fDate" type="datetime-local" value="${current?.scheduled_at?new Date(current.scheduled_at).toISOString().slice(0,16):''}"></label><div class="modal-actions"><button class="secondary" data-close>❌ Cancelar</button><button class="primary" data-save-crud="match" data-id="${id||''}">💾 Salvar</button></div>`:`${common}<h2>${current?'Alterar jogo':'Novo jogo'}</h2><select id="fHome">${state.teams.map(t=>`<option value="${t.id}" ${current?.home_team_id===t.id?'selected':''}>${flag(t.name)} ${esc(t.name)}</option>`).join('')}</select><select id="fAway">${state.teams.map(t=>`<option value="${t.id}" ${current?.away_team_id===t.id?'selected':''}>${flag(t.name)} ${esc(t.name)}</option>`).join('')}</select><select id="fMatchGroup"><option value="">Sem grupo</option>${state.groups.slice().sort((a,b)=>a.position-b.position).map(g=>`<option value="${g.id}" ${current?.group_id===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select><select id="fRef"><option value="">Árbitro</option>${state.referees.map(r=>`<option value="${r.id}" ${current?.referee_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><select id="fAssistant1"><option value="">Assistente 1</option>${state.referees.map(r=>`<option value="${r.id}" ${current?.assistant_1_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><select id="fAssistant2"><option value="">Assistente 2</option>${state.referees.map(r=>`<option value="${r.id}" ${current?.assistant_2_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><select id="fFourth"><option value="">Mesário</option>${state.referees.map(r=>`<option value="${r.id}" ${current?.fourth_official_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><input id="fDate" type="datetime-local" value="${current?.scheduled_at?new Date(current.scheduled_at).toISOString().slice(0,16):''}"><input id="fField" value="${val('field_name')}" placeholder="Campo"><div class="modal-actions"><button class="secondary" data-close>❌ Cancelar</button><button class="primary" data-save-crud="match" data-id="${id||''}">💾 Salvar</button></div>`; }
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="crudModal"><div class="modalbox">${body}</div></div>`);
  const modal=document.querySelector('#crudModal');
  modal?.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>modal.remove()));
  const saveBtn=modal?.querySelector('[data-save-crud]');
  if(saveBtn) saveBtn.addEventListener('click',()=>saveCrud(saveBtn.dataset.saveCrud,saveBtn.dataset.id||''));
}
async function saveCrud(type,id=''){
  if(!canOperate())return;
  let row={};
  if(type==='team') row={competition_id:state.competition.id,name:document.querySelector('#fName').value.trim(),country:document.querySelector('#fCountry').value.trim()||null,group_id:document.querySelector('#fGroup').value||null};
  if(type==='player'){const existing=id?state.players.find(x=>x.id===id):null;const full=document.querySelector('#fFullName').value.trim();row={team_id:document.querySelector('#fTeam').value,name:full,full_name:full,nickname:document.querySelector('#fNickname').value.trim()||null,birth_date:document.querySelector('#fBirthDate').value||null,category:document.querySelector('#fCategory').value||null,shirt_number:Number(document.querySelector('#fNumber').value)||null,position:document.querySelector('#fPosition').value||null};const photo=document.querySelector('#fPhotoFile')?.files?.[0];if(photo){const target=id||crypto.randomUUID();const path=`${state.competition.id}/players/${target}-${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from('ouro-prata-arquivos').upload(path,photo,{upsert:true});if(up.error)return toast(up.error.message,'error');row.photo_path=path;row.photo_url=supabase.storage.from('ouro-prata-arquivos').getPublicUrl(path).data.publicUrl;}else if(existing){row.photo_url=existing.photo_url||null;row.photo_path=existing.photo_path||null;}}
  if(type==='referee') row={name:document.querySelector('#fName').value.trim(),registration:document.querySelector('#fReg').value.trim()||null,phone:document.querySelector('#fPhone').value.trim()||null};
  if(type==='match'){const existing=id?state.matches.find(x=>x.id===id):null;const dt=document.querySelector('#fDate')?.value||'';if(existing?.phase_type&&existing.phase_type!=='classificatoria'){row={scheduled_at:dt?new Date(dt).toISOString():null};}else{const h=document.querySelector('#fHome').value,a=document.querySelector('#fAway').value;if(h===a)return toast('O mandante e o visitante devem ser diferentes.','error');row={competition_id:state.competition.id,group_id:document.querySelector('#fMatchGroup').value||null,home_team_id:h,away_team_id:a,referee_id:document.querySelector('#fRef').value||null,assistant_1_id:document.querySelector('#fAssistant1').value||null,assistant_2_id:document.querySelector('#fAssistant2').value||null,fourth_official_id:document.querySelector('#fFourth').value||null,scheduled_at:dt?new Date(dt).toISOString():null,field_name:document.querySelector('#fField').value.trim()||null};}}
  if(!row.name && ['team','player','referee'].includes(type))return toast('Informe o nome.','error');
  const table={team:'teams',player:'players',referee:'referees',match:'matches'}[type];
  const answer=await askConfirm(id?'Confirma ALTERAR este cadastro?':'Confirma SALVAR este cadastro?'); if(!answer)return;
  const result=id?await supabase.from(table).update(row).eq('id',id):await supabase.from(table).insert(row);
  if(result.error)return toast(result.error.message,'error');
  document.querySelector('#crudModal')?.remove();toast(id?'Cadastro alterado com sucesso.':'Cadastro salvo com sucesso.');await load();
}
async function deleteCrud(type,id){
  if(!canOperate())return;
  const table={team:'teams',player:'players',referee:'referees',match:'matches'}[type];
  const label=type==='team'?teamName(id):type==='player'?playerName(id):type==='referee'?(state.referees.find(x=>x.id===id)?.name||'este árbitro'):'este jogo';
  const ok=await askConfirm(`Deseja EXCLUIR ${label}? Esta ação não pode ser desfeita.`); if(!ok)return;
  const {error}=await supabase.from(table).delete().eq('id',id);if(error)return toast(error.message,'error');toast('Cadastro excluído com sucesso.');await load();
}
function askConfirm(message){return new Promise(resolve=>{const old=document.querySelector('#confirmModal');if(old)old.remove();document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="confirmModal"><div class="modalbox"><div class="eyebrow">CONFIRMAÇÃO</div><h2>Confirmação</h2><p>${esc(message)}</p><div class="modal-actions"><button class="secondary" id="confirmNo">NÃO</button><button class="danger" id="confirmYes">SIM</button></div></div></div>`);document.querySelector('#confirmNo').onclick=()=>{document.querySelector('#confirmModal')?.remove();resolve(false)};document.querySelector('#confirmYes').onclick=()=>{document.querySelector('#confirmModal')?.remove();resolve(true)}})}

async function authSubmit(){const email=document.querySelector('#authEmail')?.value.trim(),password=document.querySelector('#authPassword')?.value;if(!email||!password)return toast('Informe e-mail e senha.','error');let res;if(state.authMode==='signup')res=await supabase.auth.signUp({email,password});else res=await supabase.auth.signInWithPassword({email,password});if(res.error)return toast(res.error.message,'error');if(state.authMode==='signup')toast('Usuário criado. Se a confirmação de e-mail estiver ativa, confirme o e-mail antes de entrar.','ok');else toast('Login realizado.','ok');await load();}
async function logout(){await supabase.auth.signOut();state.session=null;state.profile=null;state.moderator=null;state.moderatorRequests=[];render()}
function openAuth(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="authModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">ACESSO AO SISTEMA</div><h2>${state.authMode==='signup'?'Criar usuário':'Entrar'}</h2><p class="muted">Para operar a súmula, use um usuário com perfil autorizado no Supabase.</p><input id="authEmail" type="email" placeholder="E-mail"><input id="authPassword" type="password" placeholder="Senha"><button class="primary wide" data-auth-submit>${state.authMode==='signup'?'Criar usuário':'Entrar'}</button><button class="linkbtn" data-toggle-auth>${state.authMode==='signup'?'Já tenho cadastro':'Criar novo usuário'}</button></div></div>`)}
function toast(msg,type='ok'){document.querySelectorAll('.toast').forEach(x=>x.remove());document.body.insertAdjacentHTML('beforeend',`<div class="toast ${type}">${esc(msg)}</div>`);setTimeout(()=>document.querySelector('.toast')?.remove(),3500)}
function startTicker(){stopTicker();state.timerInterval=setInterval(()=>{const el=document.querySelector('#matchClock');if(el)el.textContent=matchClock(state.selectedMatch);const ev=document.querySelector('#eventClock');if(ev)ev.textContent=currentClock();const mi=document.querySelector('#eventMinute');if(mi)mi.value=currentMinute()},1000)}
function stopTicker(){if(state.timerInterval)clearInterval(state.timerInterval);state.timerInterval=null}

function ensureSumulaStyles(){if(document.getElementById('sumulaStyles'))return;const s=document.createElement('style');s.id='sumulaStyles';s.textContent=`
.sumula-header{display:flex;align-items:center;gap:18px;border-bottom:3px solid #08643f;padding:12px 0 16px;margin-bottom:16px}.sumula-header img{width:82px;height:82px;object-fit:contain}.sumula-header h2,.sumula-header h3{margin:2px 0}.sumula-match{text-align:center;padding:14px;border:1px solid #ddd;border-radius:12px}.sumula-match>div{display:flex;justify-content:center;align-items:center;gap:28px;font-size:20px}.sumula-match strong{font-size:28px}.sumula-officials{margin:14px 0;padding:10px;border:1px solid #ddd;border-radius:10px}.sumula-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.sumula-grid table,.sumula-print>table{width:100%;border-collapse:collapse}.sumula-grid th,.sumula-grid td,.sumula-print>table th,.sumula-print>table td{border:1px solid #ddd;padding:6px;text-align:left}.sumula-signatures{display:flex;justify-content:space-around;text-align:center;margin-top:38px;gap:40px}.sumula-selector{margin-bottom:16px}.sumula-selector select{display:block;width:100%;max-width:700px;padding:10px;border:1px solid #bbb;border-radius:8px}.no-print{margin-top:22px}@media print{.sumula-print .no-print,.sumula-selector,.report-buttons,.app-header,.sidebar{display:none!important}.sumula-print{box-shadow:none!important;border:0!important}.sumula-grid{grid-template-columns:1fr 1fr}}
`;document.head.appendChild(s)}
function ensureCustomStyles(){if(document.querySelector('#ouroCustomStyles'))return;document.head.insertAdjacentHTML('beforeend',`<style id="ouroCustomStyles">.match-goals{display:flex;align-items:center;justify-content:center;gap:18px;margin:12px 0 8px}.goal-team{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:120px}.goal-buttons{display:flex;align-items:center;gap:5px}.goalbtn{width:34px;height:34px;border:1px solid #cbd5d1;border-radius:7px;background:#f5f8f6;font-size:20px;font-weight:700;cursor:pointer}.half-active{background:#087443!important;color:#fff!important;border-color:#087443!important}.goal-buttons strong{min-width:38px;text-align:center;font-size:25px}.goal-x{font-size:22px;font-weight:700}.officials{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.officials span{padding:5px 9px;border-radius:8px;background:#f1f5f3;font-size:12px}.compact-playerline{display:flex;align-items:center;justify-content:space-between;gap:6px}.statusbtn{width:108px;min-width:108px;border:0;border-radius:8px;padding:7px 5px;font-size:12px;cursor:pointer}.status-titular{background:#dff3e7;color:#17633e}.status-reserva{background:#edf1ef;color:#376052}.status-nao_compareceu{background:#fde4e4;color:#8b3030}.status-suspenso{background:#e53935!important;color:#fff!important;border-color:#c62828!important}.status-option-suspenso{background:#fde4e4;color:#b71c1c;border-color:#e0a0a0}.lineup-player-row.is-suspended{background:#ffdddd!important;border:1px solid #e53935;border-radius:9px}.lineup-player-row.is-suspended .player-name-wrap b{color:#b71c1c}.status-options{display:grid;gap:10px;margin-top:15px}.status-option{padding:13px;border:1px solid #d5ded9;border-radius:10px;background:#f7faf8;text-align:left;font-size:15px;cursor:pointer}.status-option.selected{border-color:#168458;background:#e5f4ed}.phase-row{display:grid;grid-template-columns:1fr 170px auto;gap:8px;margin:8px 0}.panel-actions{display:flex;gap:8px;flex-wrap:wrap}.phase-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin:12px 0}.games-section-block{margin:16px 0;padding:12px;border:1px solid #dfe9e4;border-radius:14px;background:#fff}.games-section-block> .phase-head{margin:0 0 8px}.games-next-phases{margin-top:18px;padding-top:6px;border-top:3px solid #0b6b49}.knockout-block{background:#f8fbf9}.knockout-block+.knockout-block{margin-top:12px}.phase-card{border:1px solid #dfe9e4;border-radius:12px;padding:12px;background:#f8fbf9}.phase-card h3{margin:7px 0 3px}.phase-mini-list{margin-top:9px;display:grid;gap:5px;font-size:12px;color:#46675b}.phase-head{display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px}.event-clock{display:inline-flex;align-items:center;justify-content:center;min-width:70px;height:42px;padding:0 9px;border-radius:8px;background:#0b4d37;color:white;font-weight:700;font-variant-numeric:tabular-nums}.group-box{margin-top:12px}.dashboard-stats{grid-template-columns:repeat(5,minmax(0,1fr))!important}.dashboard-stats .card{min-width:0}@media(max-width:1100px){.dashboard-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:700px){.dashboard-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:480px){.dashboard-stats{grid-template-columns:1fr!important}}.config-modal{max-width:650px}.class-tabs{display:flex;gap:8px;margin:12px 0}.class-tabs button{border:1px solid #d4ded9;background:#f4f8f6;border-radius:9px;padding:9px 14px;cursor:pointer}.class-tabs button.active{background:#0b6b49;color:#fff;border-color:#0b6b49}.avatar-sm{width:34px;height:34px;object-fit:cover;border-radius:50%;vertical-align:middle;margin-right:8px}.player-photo-preview{display:block;width:80px;height:80px;object-fit:cover;border-radius:10px;margin-top:8px}.file-field{display:flex;flex-direction:column;gap:5px}.video-grid video{width:100%;max-height:220px;border-radius:10px}.eventform{grid-template-columns:repeat(3,minmax(0,1fr))}.subform{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center}.event-clock-box{grid-column:1/-1;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.eventform>.primary{grid-column:1/-1}.controlbar{flex-wrap:wrap}.controlbar button{white-space:nowrap}.eventform{gap:6px}.event-clock-box{padding:5px 0}.subform{grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto auto;min-height:48px}.sub-clock-inline{display:flex;align-items:center;gap:5px}.sub-clock-inline .event-clock{min-width:62px;height:34px;font-size:12px}.subform .smallbtn{white-space:nowrap}.app-logo{width:54px!important;height:54px!important;object-fit:contain!important}.eventpanel{border-radius:16px!important;overflow:hidden}.eventpanel .panelhead{background:linear-gradient(90deg,#075d3e,#0b754d);color:#fff;padding:14px 16px;margin:-1px -1px 14px}.eventpanel .panelhead .muted{color:#d8eee5}.eventpanel .panelhead .tag{background:#fff;color:#075d3e}.event-section{background:#f7faf8;border:1px solid #e0e9e4;border-radius:12px;padding:12px;margin:10px 0}.event-section>label{display:block;font-weight:800;color:#24483b;margin-bottom:8px}.event-clock-layout{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.event-adjust-group,.event-timer-actions{display:flex;gap:6px;flex-wrap:wrap}.event-adjust-group .smallbtn,.event-timer-actions .smallbtn{min-height:38px}.event-clock{min-width:86px!important;height:46px!important;font-size:21px!important}.event-type-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.event-type-btn{min-height:78px;border:1px solid #d5e0da;border-radius:10px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;font-size:12px}.event-type-btn span{font-size:25px}.event-type-btn.selected{background:#087447;color:#fff;border-color:#087447;box-shadow:0 2px 8px #075d3e2b}.event-type-hidden{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}.event-fields-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.event-fields-grid>div>small,.substitution-grid small{display:block;font-weight:700;color:#557268;margin:0 0 4px}.substitution-grid{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px}.event-form-actions{display:flex;gap:8px;margin-top:12px}.event-save-btn{flex:1}.eventpanel-locked{opacity:.96}.event-locked-notice{border-color:#e8c7c7;background:#fff3f3;color:#8b3030}.timeline{border-radius:16px;overflow:hidden}.timeline>h3{background:linear-gradient(90deg,#075d3e,#0b754d);color:#fff;padding:14px 16px;margin:0}.sheet-content-stack{display:flex;flex-direction:column;gap:16px;width:100%;min-width:0}.match-events-below{width:100%;min-width:0;border:1px solid #dfe9e4;background:#fff}.match-events-below .panelhead{padding:12px 16px;margin:0;background:linear-gradient(90deg,#075d3e,#0b754d);color:#fff}.match-events-below .panelhead .tag{background:#fff;color:#075d3e}.match-events-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:12px}.team-events-column{min-width:0;border:1px solid #dfe9e4;border-radius:12px;overflow:hidden;background:#fff}.team-events-head{padding:10px 12px;background:#f0f7f3;color:#14583f;font-size:15px;border-bottom:1px solid #dfe9e4}.team-events-empty{padding:20px!important;text-align:center}.team-events-column .eventrow{border-bottom:1px solid #edf2ef}.team-events-column .eventrow:last-child{border-bottom:0}.team-events-column .event-actions{flex-wrap:wrap}.team-events-column .event-actions>.muted{white-space:nowrap}.lineuppanel{width:100%;min-width:0}.lineuppanel .lineupteam{min-width:0}.lineuppanel .playerline{min-width:0}.lineuppanel .playerline>span{min-width:0;overflow-wrap:anywhere}.eventrow{padding:12px 14px!important}.event-actions{gap:5px!important}.event-actions .smallbtn{min-height:34px}@media(max-width:1000px){.match-columns{grid-template-columns:repeat(2,minmax(0,1fr))}.live-sheet .sheet-head{grid-template-columns:1fr}.hero{grid-template-columns:1fr!important}.hero-score{min-height:80px!important}.lineup-columns{grid-template-columns:1fr}}@media(max-width:600px){.match-columns{grid-template-columns:1fr}.match-col-teams{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}.match-col-actions .smallbtn{min-width:0}.media-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.media-card .media-thumb,.media-card video{height:90px!important}.hero{padding:14px!important}}@media(max-width:900px){.event-type-grid{grid-template-columns:repeat(3,1fr)}.event-clock-layout{grid-template-columns:1fr}.event-fields-grid{grid-template-columns:1fr}.substitution-grid{grid-column:auto;grid-template-columns:1fr}.event-timer-actions{justify-content:center}}@media(max-width:560px){.event-type-grid{grid-template-columns:repeat(2,1fr)}.app-logo{width:46px!important;height:46px!important}}.reports-page{background:transparent;border:0;border-radius:0;padding:0;box-shadow:none;width:100%;max-width:none}.report-preview{width:100%;max-width:none}.match-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.match-column-card{border:1px solid #dce8e2;border-radius:14px;background:#fff;padding:13px;box-shadow:0 3px 12px rgba(10,72,48,.06);min-width:0}.match-column-card.is-live{border-color:#1b8d62;box-shadow:0 0 0 2px rgba(27,141,98,.08)}.match-col-head{display:flex;justify-content:space-between;align-items:center;gap:7px;margin-bottom:10px}.match-col-date{font-size:12px;color:#61776e;margin-bottom:12px}.match-col-teams{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px;text-align:center}.match-col-teams>div{min-width:0;overflow-wrap:anywhere}.match-col-teams>strong{font-size:20px;white-space:nowrap}.match-col-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.match-col-actions .smallbtn{flex:1;min-width:110px}.live-sheet .sheet-head{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:18px;align-items:center}.lineup-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.media-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important;gap:10px!important}.media-card{padding:9px!important;border-radius:12px!important}.media-card .media-thumb{width:100%!important;height:105px!important;object-fit:cover!important;border-radius:8px!important;display:block!important;margin-bottom:8px!important}.media-card video{width:100%!important;height:105px!important;object-fit:cover!important;border-radius:8px!important}.media-card b,.media-card small{display:block;overflow-wrap:anywhere}.dashboard-stats .card{border-radius:14px!important;padding:14px!important}.dashboard-stats{gap:10px!important}.hero{display:grid!important;grid-template-columns:minmax(0,1fr) 180px!important;gap:18px!important;align-items:center!important}.hero-score{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;min-height:100px!important;border:1px solid #dce8e2!important;border-radius:14px!important;background:#f7fbf9!important}.hero-score small{margin-top:4px}.panelhead{gap:14px}.games-section-block{box-shadow:0 3px 12px rgba(10,72,48,.04)}.sponsor-card img{max-width:120px!important;max-height:80px!important;width:auto!important;height:auto!important;object-fit:contain!important;display:block;margin:0 auto 8px}.report-brand{display:flex;align-items:center;gap:16px;padding:6px 4px 14px;border-bottom:3px solid #0b6b49}.report-brand img{width:92px;height:92px;object-fit:contain}.report-brand-kicker{font-size:11px;font-weight:900;letter-spacing:.12em;color:#6b7d75}.report-brand h2{margin:4px 0;font-size:24px;color:#124c39}.report-brand p{margin:0;color:#6b7d75}.report-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0 18px}.report-tabs button{border:1px solid #d3e0da;background:#f6faf8;color:#194d3b;border-radius:9px;padding:9px 13px;font-weight:700;cursor:pointer}.report-tabs button.active{background:#0b6b49;color:#fff;border-color:#0b6b49}.report-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.report-title-row h2{margin:0;color:#173f32}.report-filter-help{margin:0 0 10px;padding:8px 10px;border:1px solid #dfe9e4;border-radius:9px;background:#f7faf8;color:#557268;font-size:11px}.athlete-report-tools{display:none!important}.athlete-report-filters,.athlete-report-sort{display:none!important}.report-team-title{margin:14px 0 7px;color:#15553f}.report-athlete-table,.report-compact-table{width:100%;border-collapse:collapse}.report-athlete-table th,.report-athlete-table td,.report-compact-table th,.report-compact-table td{padding:5px 7px;border-bottom:1px solid #e4ece8;text-align:left;line-height:1.15}.report-athlete-table .report-sortable{cursor:pointer;user-select:none;white-space:nowrap}.report-athlete-table .report-sortable:hover{background:#dfeee7}.report-sort-indicator{font-size:10px}.report-filter-row th{padding:3px 4px;background:#f7faf8}.report-col-filter{width:100%;box-sizing:border-box;border:1px solid #cad9d2;border-radius:6px;background:#fff;padding:5px 5px;font-size:10px;min-width:55px}.report-athlete-table th,.report-compact-table th{background:#edf5f1;color:#285747;font-size:11px}.report-athlete-table td,.report-compact-table td{font-size:12px}.report-athlete-table tbody tr:nth-child(even),.report-compact-table tbody tr:nth-child(even){background:#fafcfb}.report-table-block{margin-bottom:12px}.cartoes-filter-help{margin:0 0 8px;padding:8px 10px;border:1px solid #dfe9e4;border-radius:9px;background:#f7faf8;color:#557268;font-size:11px}.cartoes-report-table .cartoes-sortable{cursor:pointer;user-select:none;white-space:nowrap}.cartoes-report-table .cartoes-sortable:hover{background:#dfeee7}.cartoes-sort-indicator{font-size:10px}.cartoes-filter-row th{padding:3px 4px;background:#f7faf8}.cartoes-col-filter{width:100%;box-sizing:border-box;border:1px solid #cad9d2;border-radius:6px;background:#fff;padding:5px 5px;font-size:10px;min-width:55px}.cartoes-report-table th,.cartoes-report-table td{font-size:12px}.cartoes-filter-empty td{text-align:center}.report-preview{min-width:0}.report-preview .tablewrap{overflow-x:auto}.sumula-print .report-brand{margin-bottom:10px}@media(max-width:900px){.reports-page{padding:12px}}@media(max-width:560px){.report-brand{gap:9px}.report-brand img{width:56px;height:56px}.report-brand h2{font-size:16px}.report-brand p{font-size:11px}.report-tabs{gap:5px}.report-tabs button{padding:7px 9px;font-size:11px}.report-athlete-table th,.report-athlete-table td{padding:4px 5px;font-size:10px}.report-athlete-table{min-width:760px}.report-col-filter{font-size:9px;padding:4px 3px}}@media print{@page{size:A4 portrait;margin:4mm 4mm 5mm 4mm}html,body,#app,.layout{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important}.layout{display:block!important;grid-template-columns:none!important}.layout>main,main{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;grid-column:1/-1!important}aside,.app-header,.report-tabs,.athlete-report-tools,.no-print{display:none!important}.reports-page{border:0;box-shadow:none;padding:0;width:100%;max-width:none}.report-brand img{width:70px;height:70px}.report-preview{width:100%;max-width:none}.report-athlete-table th,.report-athlete-table td,.report-compact-table th,.report-compact-table td{padding:2px 3px;font-size:7.5px;line-height:1.05}.report-athlete-table,.report-compact-table{width:100%;table-layout:auto}.report-athlete-table th:first-child,.report-athlete-table td:first-child{width:5%;white-space:nowrap}.report-athlete-table th:nth-child(2),.report-athlete-table td:nth-child(2){width:24%}.report-athlete-table th:nth-child(3),.report-athlete-table td:nth-child(3){width:13%}.report-athlete-table th:nth-child(4),.report-athlete-table td:nth-child(4){width:12%}.report-athlete-table th:nth-child(5),.report-athlete-table td:nth-child(5){width:13%}.report-athlete-table th:nth-child(6),.report-athlete-table td:nth-child(6){width:11%}.report-athlete-table th:nth-child(7),.report-athlete-table td:nth-child(7){width:7%}.report-athlete-table th:nth-child(8),.report-athlete-table td:nth-child(8){width:15%}.report-athlete-table .report-col-filter{font-size:7px;padding:2px;min-width:0}.report-preview{margin:0!important;padding:0!important}.reports-page{margin:0!important;padding:0!important;position:relative;left:0!important;right:0!important}.report-preview{margin-left:0!important;margin-right:0!important}.report-brand{padding:2px 0 7px;margin:0 0 6px}.report-brand img{width:52px;height:52px}.report-brand h2{font-size:15px}.report-brand p{font-size:8px}.report-title-row{margin-bottom:5px}.report-title-row h2{font-size:13px}.report-team-title{font-size:11px;margin:6px 0 3px}.report-filter-help{font-size:7px;padding:4px 5px;margin-bottom:5px}.report-tabs{display:none}.tablewrap{overflow:visible!important}.sumula-print .sumula-match{padding:7px}.sumula-print .sumula-match>div{font-size:13px;gap:12px}.sumula-print .sumula-match strong{font-size:18px}.sumula-print .sumula-officials{margin:6px 0;padding:5px;font-size:8px}.sumula-print .sumula-grid{gap:7px}.sumula-print .sumula-grid th,.sumula-print .sumula-grid td,.sumula-print>table th,.sumula-print>table td{padding:2px 3px;font-size:7.5px}.sumula-signatures{margin-top:18px;gap:15px;font-size:8px}}
.lineup-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;width:100%;min-width:0}.lineupteam{border:1px solid #dfe9e4;border-radius:14px;overflow:hidden;background:#fff;min-width:0}.lineupteam-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 13px;background:#f0f7f3;border-bottom:1px solid #dfe9e4}.lineupteam-head h4{margin:0;color:#15553f;font-size:17px}.lineup-list{width:100%;min-width:0}.lineup-player-row{display:grid;grid-template-columns:minmax(0,1fr) 108px 38px;align-items:center;gap:7px;padding:8px 9px;border-bottom:1px solid #edf2ef;min-width:0}.lineup-player-row:last-child{border-bottom:0}.presence-control{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer}.presence-control input{position:absolute;opacity:0;pointer-events:none}.presence-box{width:22px;height:22px;min-width:22px;border:2px solid #687b73;border-radius:4px;background:#fff;position:relative}.presence-control input:checked+.presence-box{background:#1594df;border-color:#1594df}.presence-control input:checked+.presence-box:after{content:'✓';position:absolute;color:#fff;font-size:17px;font-weight:900;left:2px;top:-2px}.player-name-wrap{min-width:0;display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}.player-name-wrap b{font-size:14px;color:#173f32;overflow-wrap:anywhere}.player-name-wrap small{font-size:10px;font-weight:800;text-transform:lowercase;color:#277255;white-space:nowrap}.is-absent .player-name-wrap b{color:#8b6f6f;text-decoration:none}.starter-toggle{width:108px;min-width:108px;border:1px solid #cbd9d2;border-radius:9px;padding:8px 7px;background:#f4f7f5;color:#41685a;font-weight:800;cursor:pointer}.starter-toggle.active{background:#5ac06a;color:#fff;border-color:#4aad59}.starter-toggle:disabled{opacity:.48;cursor:not-allowed}.verify-player-btn{width:38px!important;min-width:38px;padding:7px 4px!important}.player-data-modal{max-width:650px}.player-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:15px 0}.player-data-grid>div{padding:10px;border:1px solid #dfe9e4;border-radius:9px;background:#f7faf8}.player-data-grid small{display:block;color:#688077;font-size:10px;margin-bottom:3px}.player-data-photo{width:110px;height:110px;object-fit:cover;border-radius:12px;display:block;margin:10px auto}.sumula-print .report-title-row{border-bottom:0}.sumula-print .report-title-row h2{font-size:22px}.sumula-grid-stacked{grid-template-columns:1fr!important}.lineup-locked{opacity:.96}.starter-toggle.absent{background:#f1eeee;color:#8b6f6f;border-color:#dfcccc}.lineup-locked .verify-player-btn{opacity:1}
/* V14 - ajuste responsivo para celulares */
@media(max-width:700px){
  html,body,#app{width:100%!important;max-width:100%!important;min-width:0!important;overflow-x:hidden!important}
  .layout{display:grid!important;grid-template-columns:58px minmax(0,1fr)!important;width:100%!important;max-width:100%!important;min-width:0!important}
  .layout>aside{width:58px!important;min-width:58px!important;box-sizing:border-box!important;padding:10px 4px!important;overflow:hidden!important}
  .layout>aside .brand span,.layout>aside .sidefoot,.layout>aside nav button span{display:none!important}
  .layout>aside .brand{justify-content:center!important;padding:4px 0 12px!important;font-size:20px!important}
  .layout>aside nav{width:100%!important;gap:3px!important}
  .layout>aside nav button{width:100%!important;min-height:42px!important;height:42px!important;padding:7px 3px!important;justify-content:center!important;border-radius:9px!important}
  .layout>aside nav button i{font-size:20px!important;margin:0!important}
  .layout>main{width:100%!important;min-width:0!important;max-width:none!important;overflow-x:hidden!important;padding:8px!important;box-sizing:border-box!important}
  .app-header{min-width:0!important;flex-wrap:wrap!important;gap:8px!important;padding:8px!important}
  .app-header .brand{min-width:0!important;max-width:100%!important}
  .app-header .brand>div{min-width:0!important}
  .app-header .brand h1{font-size:16px!important;line-height:1.15!important;overflow-wrap:anywhere!important}
  .app-header .brand-subtitle{font-size:10px!important;overflow-wrap:anywhere!important}
  .header-actions{width:100%!important;max-width:100%!important;flex-wrap:wrap!important;gap:6px!important}
  .competition-switch{max-width:100%!important;flex:1 1 100%!important}
  .competition-switch select{width:100%!important;max-width:100%!important}
  .panel,.games-section-block,.public-portal-banner,.hero{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
  .panelhead,.phase-head{flex-wrap:wrap!important}
  .panel-actions{width:100%!important}
  .panel-actions>*{flex:1 1 auto!important;min-width:120px!important}
  .match-columns{grid-template-columns:1fr!important;width:100%!important;min-width:0!important;gap:9px!important}
  .match-column-card{width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:10px!important}
  .match-col-head{flex-wrap:wrap!important}
  .match-col-teams{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important;gap:5px!important}
  .match-col-teams>div{display:flex!important;align-items:center!important;justify-content:center!important;gap:4px!important;min-width:0!important;font-size:13px!important;line-height:1.15!important;word-break:normal!important;overflow-wrap:anywhere!important}
  .match-col-teams>div b{font-size:13px!important;line-height:1.15!important;word-break:break-word!important}
  .match-col-teams>strong{font-size:18px!important}
  .match-col-actions{width:100%!important}
  .match-col-actions .smallbtn{min-width:0!important;flex:1 1 100%!important}
  .team-flag{width:28px!important;height:auto!important;flex:0 0 auto!important}
  .hero{grid-template-columns:1fr!important}
  .hero-score{min-height:70px!important}
  .lineup-columns{grid-template-columns:1fr!important;gap:10px!important}
  .media-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .media-card{min-width:0!important}
  .media-card .media-thumb,.media-card video{height:90px!important}
  .tablewrap{width:100%!important;max-width:100%!important;overflow-x:auto!important}
  table{max-width:100%!important}
}
@media(max-width:430px){
  .layout{grid-template-columns:52px minmax(0,1fr)!important}
  .layout>aside{width:52px!important;min-width:52px!important}
  .layout>aside nav button{min-height:39px!important;height:39px!important}
  .layout>aside nav button i{font-size:18px!important}
  .layout>main{padding:6px!important}
  .match-col-teams>div,.match-col-teams>div b{font-size:12px!important}
  .match-col-teams>strong{font-size:17px!important}
  .media-grid{gap:7px!important}
}
@media(max-width:760px){.lineup-columns{grid-template-columns:1fr 1fr;gap:8px}.lineupteam-head{padding:8px}.lineupteam-head h4{font-size:13px}.lineup-player-row{grid-template-columns:minmax(0,1fr) 78px 32px;gap:4px;padding:7px 5px}.player-name-wrap{gap:3px}.player-name-wrap b{font-size:11px}.player-name-wrap small{font-size:8px}.starter-toggle{width:78px;min-width:78px;padding:7px 3px;font-size:10px}.verify-player-btn{width:32px!important;min-width:32px!important;font-size:11px!important}.presence-box{width:18px;height:18px;min-width:18px}.presence-control{gap:5px}.player-data-grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.lineup-columns{grid-template-columns:1fr 1fr}.lineup-player-row{grid-template-columns:minmax(0,1fr) 66px 28px}.starter-toggle{width:66px;min-width:66px;font-size:9px}.verify-player-btn{width:28px!important;min-width:28px!important;padding:5px 2px!important}.player-name-wrap b{font-size:10px}.player-name-wrap small{font-size:7px}.lineupteam-head h4{font-size:11px}.lineupteam-head .tag{font-size:8px}}.competition-switch{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800;color:#71847b}.competition-switch select{border:1px solid #d7e2dc;border-radius:9px;padding:8px 10px;background:#fff;max-width:300px}.competition-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.competition-card{border:1px solid #dfe9e4;border-radius:14px;padding:16px;background:#fff;box-shadow:0 5px 18px #0b5d3b0d}.competition-card.selected{border-color:#0b6542;box-shadow:0 0 0 2px #0b65421c}.competition-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.competition-card h3{margin:7px 0 8px}.competition-actions{display:flex;gap:7px;margin-top:13px}.competition-actions .smallbtn{flex:1}@media(max-width:700px){.competition-switch{max-width:180px}.competition-switch select{max-width:160px}}

aside nav button{min-height:36px!important;height:36px!important;padding:7px 10px!important;margin:0!important;line-height:1.05!important}
aside nav{gap:2px!important}
.moderator-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.moderator-card{border:1px solid #dfe9e4;border-radius:14px;padding:16px;background:#fff}
.moderator-card h3{margin-top:0}
.moderator-card input{width:100%;box-sizing:border-box;margin:6px 0}
.moderator-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-radius:12px;padding:12px 14px;margin-bottom:14px;border:1px solid #dfe9e4;background:#fff}
.moderator-status span{font-weight:800;font-size:12px}
.moderator-status.approved span{color:#0b6542}
.moderator-status.pending span{color:#9a6500}
</style>`)}
function ensureMobileFixV15(){
  if(document.querySelector('#ouroMobileFixV15'))return;
  document.head.insertAdjacentHTML('beforeend',`<style id="ouroMobileFixV15">
/* V15 - correção forte de layout para celular/portrait */
@media (max-width:900px), (orientation:portrait){
  html,body,#app{width:100%!important;min-width:0!important;max-width:100%!important;overflow-x:hidden!important}
  .layout{display:grid!important;grid-template-columns:56px minmax(0,1fr)!important;width:100vw!important;min-width:0!important;max-width:100vw!important}
  .layout>aside{width:56px!important;min-width:56px!important;max-width:56px!important;box-sizing:border-box!important;overflow:hidden!important}
  .layout>main{width:calc(100vw - 56px)!important;min-width:0!important;max-width:calc(100vw - 56px)!important;box-sizing:border-box!important;overflow-x:hidden!important;padding:8px!important}
  .app-header,.panel,.games-section-block,.games-next-phases,.public-portal-banner,.hero,.sheet-content-stack,.match-events-below,.lineuppanel,.reports-page,.report-preview{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  .match-columns{display:grid!important;grid-template-columns:1fr!important;width:100%!important;min-width:0!important;max-width:100%!important;gap:10px!important}
  .match-column-card{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;padding:12px!important;overflow:hidden!important}
  .match-col-head,.match-col-date,.match-col-teams,.match-col-actions{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  .match-col-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;flex-wrap:wrap!important}
  .match-col-teams{display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important;align-items:center!important;gap:8px!important;text-align:center!important}
  .match-col-teams>div{display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-width:0!important;width:100%!important;font-size:14px!important;line-height:1.25!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important}
  .match-col-teams>div b{display:inline!important;min-width:0!important;font-size:14px!important;line-height:1.25!important;white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important}
  .match-col-teams>strong{font-size:20px!important;white-space:nowrap!important}
  .team-flag{width:30px!important;height:auto!important;flex:0 0 auto!important}
  .match-col-actions{display:flex!important;flex-wrap:wrap!important;gap:6px!important;margin-top:10px!important}
  .match-col-actions .smallbtn{flex:1 1 100%!important;min-width:0!important}
  .phase-head{width:100%!important;min-width:0!important;flex-wrap:wrap!important}
  .phase-head>div{min-width:0!important;max-width:100%!important}
  .phase-head h3,.phase-head p{white-space:normal!important;overflow-wrap:break-word!important}
  .games-section-block{overflow:hidden!important}
  .games-section-block .tablewrap{width:100%!important;max-width:100%!important;overflow-x:auto!important}
  .lineup-columns{grid-template-columns:1fr!important;width:100%!important}
  .media-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important}
  .media-card{min-width:0!important;max-width:100%!important;overflow:hidden!important}
  .media-card b,.media-card small{white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
  .header-actions,.panel-actions{width:100%!important;min-width:0!important;max-width:100%!important;flex-wrap:wrap!important}
}
@media (max-width:480px){
  .layout{grid-template-columns:50px minmax(0,1fr)!important}
  .layout>aside{width:50px!important;min-width:50px!important;max-width:50px!important}
  .layout>main{width:calc(100vw - 50px)!important;max-width:calc(100vw - 50px)!important;padding:6px!important}
  .match-column-card{padding:10px!important}
  .match-col-teams{gap:5px!important}
  .match-col-teams>div,.match-col-teams>div b{font-size:13px!important}
  .match-col-teams>strong{font-size:18px!important}
  .team-flag{width:26px!important}
}
</style>`);
}

function ensureMobileFixV16(){
  if(document.querySelector('#ouroMobileFixV16'))return;
  document.head.insertAdjacentHTML('beforeend',`<style id="ouroMobileFixV16">
/* V16 - Ver partida / Central ao vivo otimizado para celular */
@media (max-width:700px), (orientation:portrait){
  .live-sheet,.public-live-sheet{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;overflow:hidden!important}
  .live-sheet .sheet-head{display:grid!important;grid-template-columns:1fr!important;width:100%!important;min-width:0!important;max-width:100%!important;gap:10px!important;box-sizing:border-box!important}
  .live-sheet .sheet-head>div:first-child{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  .live-sheet .match-goals{display:grid!important;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)!important;align-items:center!important;justify-items:stretch!important;width:100%!important;min-width:0!important;max-width:100%!important;gap:5px!important;margin:10px 0!important;box-sizing:border-box!important}
  .live-sheet .goal-team{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;width:100%!important;min-width:0!important;max-width:100%!important;gap:6px!important;box-sizing:border-box!important}
  .live-sheet .goal-team>b{display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;width:100%!important;min-width:0!important;max-width:100%!important;text-align:center!important;font-size:14px!important;line-height:1.2!important;white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important}
  .live-sheet .goal-team .team-flag{width:30px!important;height:auto!important;flex:0 0 auto!important}
  .live-sheet .goal-buttons{display:flex!important;align-items:center!important;justify-content:center!important;gap:4px!important;width:100%!important;min-width:0!important}
  .live-sheet .goal-buttons strong{font-size:28px!important;min-width:30px!important;line-height:1!important}
  .live-sheet .goalbtn{width:32px!important;height:32px!important;padding:0!important}
  .live-sheet .goal-x{font-size:22px!important;text-align:center!important}
  .live-sheet .clock{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important}
  .live-sheet .clock>div{width:100%!important;box-sizing:border-box!important;font-size:34px!important}
  .live-sheet .officials{width:100%!important;min-width:0!important;box-sizing:border-box!important;justify-content:center!important}
  .live-sheet .public-match-info{display:grid!important;grid-template-columns:1fr!important;gap:5px!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;text-align:center!important}
  .live-sheet .controlbar{display:grid!important;grid-template-columns:1fr 1fr!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;gap:6px!important}
  .live-sheet .controlbar button{width:100%!important;min-width:0!important;white-space:normal!important}
  .live-sheet .sheet-content-stack{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  .live-sheet .lineuppanel,.live-sheet .eventpanel,.live-sheet .timeline,.live-sheet .match-events-below{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;overflow:hidden!important}
}
@media (max-width:430px){
  .live-sheet .match-goals{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)!important;gap:3px!important}
  .live-sheet .goal-team>b{font-size:12px!important}
  .live-sheet .goal-team .team-flag{width:26px!important}
  .live-sheet .goal-buttons strong{font-size:25px!important}
  .live-sheet .goalbtn{width:29px!important;height:29px!important;font-size:17px!important}
  .live-sheet .clock>div{font-size:30px!important}
}
</style>`);
}

function ensureMediaCompactV17(){
  if(document.querySelector('#ouroMediaCompactV17'))return;
  document.head.insertAdjacentHTML('beforeend',`<style id="ouroMediaCompactV17">
/* V17 - Fotos/Arquivos compactos: miniaturas menores; abertura preserva a imagem original */
.media-grid{
  grid-template-columns:repeat(auto-fill,minmax(125px,1fr))!important;
  gap:10px!important;
  align-items:start!important;
}
.media-grid:not(.video-grid) .media-card{
  width:100%!important;
  max-width:160px!important;
  justify-self:start!important;
  box-sizing:border-box!important;
}
.media-card .media-thumb{
  width:100%!important;
  height:88px!important;
  object-fit:cover!important;
  display:block!important;
  border-radius:8px!important;
}
.media-card video{
  width:100%!important;
  height:88px!important;
  object-fit:cover!important;
  border-radius:8px!important;
}
.media-card b,.media-card small{
  display:block!important;
  overflow-wrap:anywhere!important;
}
@media(max-width:700px),(orientation:portrait){
  /* No celular, mantém o layout que já foi aprovado na V15/V16. */
  .media-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
  .media-grid:not(.video-grid) .media-card{max-width:100%!important}
  .media-card .media-thumb,.media-card video{height:90px!important}
}
@media(min-width:1200px){
  .media-grid:not(.video-grid){grid-template-columns:repeat(auto-fill,minmax(125px,150px))!important}
}
</style>`);
}

function render(){ensureCustomStyles();ensureSumulaStyles();ensureMediaCompactV17();ensureMobileFixV15();ensureMobileFixV16();app.innerHTML=`<div class="layout">${nav()}<main>${header()}${state.loading?'<section class="panel"><div class="empty">Carregando dados...</div></section>':content()}</main></div>`;bind();if(state.timerStartedAt)startTicker();if(state.eventTimerStartedAt)startEventTicker()}

async function openMatchFromButton(id){
  try{
    if(!id){
      toast('ID da partida não encontrado.','error');
      return;
    }

    state.tab='ao_vivo';

    const cached=state.matches.find(m=>String(m.id)===String(id));

    const mr=cached
      ? {data:cached,error:null}
      : await supabase
          .from('matches')
          .select('*')
          .eq('id',id)
          .maybeSingle();

    if(mr.error) throw mr.error;

    if(!mr.data){
      toast('Partida não encontrada.','error');
      return;
    }
    if(!mr.data.home_team_id||!mr.data.away_team_id){
      toast('Esta partida ainda aguarda a definição dos vencedores da fase anterior.','error');
      return;
    }

    state.selectedMatch=mr.data;

    const [ev,lu,v]=await Promise.all([
      supabase
        .from('match_events')
        .select('*')
        .eq('match_id',id)
        .order('created_at',{ascending:true}),

      supabase
        .from('match_lineups')
        .select('*')
        .eq('match_id',id),

      supabase
        .from('match_votes')
        .select('*')
        .eq('match_id',id)
    ]);

    state.events=ev.data||[];
    state.lineups=lu.data||[];
    state.votes=v.data||[];

    if(ev.error){
      console.warn(
        'Não foi possível carregar eventos da partida:',
        ev.error.message
      );
    }

    if(lu.error){
      console.warn(
        'Não foi possível carregar a escalação da partida:',
        lu.error.message
      );
    }

    if(v.error){
      console.warn(
        'Não foi possível carregar os votos da partida:',
        v.error.message
      );
    }

    const i=state.matches.findIndex(
      m=>String(m.id)===String(id)
    );

    if(i>=0){
      state.matches[i]=mr.data;
    }else{
      state.matches.push(mr.data);
    }

    render();

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });

  }catch(err){

    console.error(
      'Erro ao abrir partida:',
      err
    );

    toast(
      'Não foi possível abrir a partida: '+
      (err?.message||'erro desconhecido'),
      'error'
    );
  }
}








function bindCartoesReportFilters(){if(!document.querySelector('#cartoesReportRowColors')){const st=document.createElement('style');st.id='cartoesReportRowColors';st.textContent='.cartoes-report-table tbody tr.cartao-row-amarelo > td{background:#fff2a8!important;color:#4a3b00}.cartoes-report-table tbody tr.cartao-row-vermelho > td{background:#f4b0b0!important;color:#650000}.cartoes-report-table tbody tr.cartao-row-amarelo:hover > td{background:#ffe77a!important}.cartoes-report-table tbody tr.cartao-row-vermelho:hover > td{background:#ef8f8f!important}@media print{.cartoes-report-table tbody tr.cartao-row-amarelo > td{background:#fff2a8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.cartoes-report-table tbody tr.cartao-row-vermelho > td{background:#f4b0b0!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';document.head.appendChild(st)}const table=document.querySelector('.cartoes-report-table');if(!table)return;const norm=v=>String(v||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');const inputs=[...table.querySelectorAll('.cartoes-col-filter')];const rows=[...table.querySelectorAll('tbody tr[data-cartao-row]')];const apply=()=>{const filters=inputs.map(i=>norm(i.value.trim()));rows.forEach(r=>{const cells=[...r.children];const ok=filters.every((f,i)=>!f||norm(cells[i]?.textContent||'').includes(f));r.style.display=ok?'':'none'});const empty=table.querySelector('.cartoes-filter-empty');if(empty)empty.remove();if(rows.length&&!rows.some(r=>r.style.display!== 'none'))table.querySelector('tbody').insertAdjacentHTML('beforeend','<tr class="cartoes-filter-empty"><td colspan="4" class="muted">Nenhum cartão corresponde aos filtros.</td></tr>')};inputs.forEach(i=>i.addEventListener('input',apply));table.querySelectorAll('.cartoes-sortable').forEach(th=>th.addEventListener('click',()=>{const idx=Number(th.dataset.cartoesSort);const dir=th.dataset.dir==='asc'?'desc':'asc';table.querySelectorAll('.cartoes-sortable').forEach(x=>{x.dataset.dir='';x.querySelector('.cartoes-sort-indicator').textContent=''});th.dataset.dir=dir;th.querySelector('.cartoes-sort-indicator').textContent=dir==='asc'?' ↑':' ↓';rows.sort((a,b)=>{const av=a.children[idx]?.dataset.sort||a.children[idx]?.textContent||'';const bv=b.children[idx]?.dataset.sort||b.children[idx]?.textContent||'';if(idx===3)return (Number(av)-Number(bv))*(dir==='asc'?1:-1);return String(av).localeCompare(String(bv),'pt-BR',{numeric:true,sensitivity:'base'})*(dir==='asc'?1:-1)});const tbody=table.querySelector('tbody');rows.forEach(r=>tbody.appendChild(r));apply()}));apply()}

function bindAthleteReportFilters(){const blocks=[...document.querySelectorAll('[data-athlete-report-block]')];const norm=v=>String(v||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');const applyBlock=block=>{const inputs=[...block.querySelectorAll('.report-col-filter')];const tbody=block.querySelector('tbody');if(!tbody)return;const rows=[...tbody.querySelectorAll('tr[data-athlete-report-row]')];const filters=inputs.map(i=>norm(i.value.trim()));rows.forEach(r=>{const cells=[...r.children];const ok=filters.every((f,i)=>!f||norm(cells[i]?.textContent||'').includes(f));r.style.display=ok?'':'none'});const activeRows=rows.slice().sort((a,b)=>{const av=a.children[Number(block.dataset.sortCol||0)]?.dataset.sort||a.children[Number(block.dataset.sortCol||0)]?.textContent||'';const bv=b.children[Number(block.dataset.sortCol||0)]?.dataset.sort||b.children[Number(block.dataset.sortCol||0)]?.textContent||'';const ai=Number(av),bi=Number(bv);if(av!==''&&bv!==''&&Number.isFinite(ai)&&Number.isFinite(bi))return (ai-bi)*(block.dataset.sortDir==='desc'?-1:1);return String(av).localeCompare(String(bv),'pt-BR',{numeric:true,sensitivity:'base'})*(block.dataset.sortDir==='desc'?-1:1)});activeRows.forEach(r=>tbody.appendChild(r));const empty=block.querySelector('.report-filter-empty');if(empty)empty.remove();if(rows.length&&!rows.some(r=>r.style.display!=='none')){tbody.insertAdjacentHTML('beforeend','<tr class="report-filter-empty"><td colspan="8" class="muted">Nenhuma linha corresponde aos filtros.</td></tr>')}};blocks.forEach(block=>{block.dataset.sortCol='0';block.dataset.sortDir='asc';block.querySelectorAll('.report-col-filter').forEach(i=>i.addEventListener('input',()=>applyBlock(block)));block.querySelectorAll('.report-sortable').forEach(th=>th.addEventListener('click',()=>{const idx=Number(th.dataset.sortCol);if(Number(block.dataset.sortCol)===idx)block.dataset.sortDir=block.dataset.sortDir==='asc'?'desc':'asc';else{block.dataset.sortCol=String(idx);block.dataset.sortDir='asc'}block.querySelectorAll('.report-sort-indicator').forEach(x=>x.textContent='');th.querySelector('.report-sort-indicator').textContent=block.dataset.sortDir==='asc'?' ↑':' ↓';applyBlock(block)}));applyBlock(block)})}
function bind(){document.querySelectorAll('[data-open-match]').forEach(b=>{b.type='button';b.onclick=async e=>{e.preventDefault();e.stopImmediatePropagation();await openMatchFromButton(b.dataset.openMatch)}});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.reportType=null;render()});document.querySelectorAll('[data-tab-direct]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tabDirect;state.reportType=null;render()});document.querySelector('#competitionSelector')?.addEventListener('change',e=>switchCompetition(e.target.value));document.querySelector('[data-new-competition]')?.addEventListener('click',()=>openCompetitionModal());document.querySelectorAll('[data-edit-competition]').forEach(b=>b.onclick=()=>openCompetitionModal(b.dataset.editCompetition));document.querySelectorAll('[data-select-competition]').forEach(b=>b.onclick=()=>switchCompetition(b.dataset.selectCompetition));document.querySelectorAll('[data-crud]').forEach(b=>b.onclick=()=>crudModal(b.dataset.crud));document.querySelectorAll('[data-edit-crud]').forEach(b=>b.onclick=()=>crudModal(b.dataset.editCrud,b.dataset.id));document.querySelectorAll('[data-delete-crud]').forEach(b=>b.onclick=()=>deleteCrud(b.dataset.deleteCrud,b.dataset.id));document.querySelectorAll('[data-save-crud]').forEach(b=>b.onclick=()=>saveCrud(b.dataset.saveCrud,b.dataset.id));document.querySelector('#authBtn')?.addEventListener('click',()=>state.session?openUserMenu():openAuth());document.querySelectorAll('[data-event-clock-adjust]').forEach(b=>b.onclick=()=>{adjustEventClock(Number(b.dataset.eventClockAdjust));render()});document.querySelectorAll('[data-event-timer]').forEach(b=>b.onclick=()=>{b.dataset.eventTimer==='reset'?resetEventTimer():toggleEventTimer()});
  const fillEventPlayers=()=>{const team=document.querySelector('#eventTeam')?.value||'';const suspendedIds=new Set((state.lineups||[]).filter(l=>l.match_id===state.selectedMatch?.id&&l.status==='suspenso').map(l=>String(l.player_id)));const ps=state.players.filter(p=>p.team_id===team&&!suspendedIds.has(String(p.id))).sort((a,b)=>(Number(a.shirt_number)||999)-(Number(b.shirt_number)||999));const opts='<option value="">Selecione o atleta</option>'+ps.map(p=>`<option value="${p.id}">${p.shirt_number?`Nº ${p.shirt_number} - `:''}${esc(p.full_name||p.name)} - ${esc(teamName(p.team_id))}</option>`).join('');['#eventPlayer','#eventSubOut','#eventSubIn'].forEach(sel=>{const el=document.querySelector(sel);if(el)el.innerHTML=opts})};
  document.querySelector('#eventTeam')?.addEventListener('change',fillEventPlayers);fillEventPlayers();
  document.querySelectorAll('[data-event-type]').forEach(btn=>btn.onclick=()=>{if(btn.disabled)return;const type=btn.dataset.eventType;state.eventType=type;const sel=document.querySelector('#eventType');if(sel)sel.value=type;document.querySelectorAll('[data-event-type]').forEach(x=>x.classList.toggle('selected',x.dataset.eventType===type));const sub=document.querySelector('#substitutionPlayers'),normal=document.querySelector('#normalEventPlayer');const isSub=type==='substituicao';if(sub)sub.style.display=isSub?'grid':'none';if(normal)normal.style.display=isSub?'none':'block';fillEventPlayers()});
const eventButtons=[...document.querySelectorAll('[data-action="event"]')];eventButtons.slice(1).forEach(b=>b.remove());
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const a=b.dataset.action;if(a==='start1')await startHalf('1T');if(a==='start2')await startHalf('2T');if(a==='pause')await pause();if(a==='resetMatchClock')await resetMatchClock();if(a==='finish')await finishMatch();if(a==='event')await addEvent();if(a==='sub')await addSub();if(a==='saveLineup')await saveLineup();if(a==='saveScoreCorrection')await saveScoreCorrection()});document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>vote(b.dataset.vote));document.querySelectorAll('[data-reopen-match]').forEach(b=>b.onclick=()=>reopenMatch(b.dataset.reopenMatch));document.querySelectorAll('[data-not-started]').forEach(b=>b.onclick=()=>markNotStarted(b.dataset.notStarted));document.querySelectorAll('[data-sponsor-new]').forEach(b=>b.onclick=()=>sponsorModal());document.querySelectorAll('[data-sponsor-edit]').forEach(b=>b.onclick=()=>sponsorModal(b.dataset.sponsorEdit));document.querySelectorAll('[data-sponsor-delete]').forEach(b=>b.onclick=()=>deleteSponsor(b.dataset.sponsorDelete));document.querySelectorAll('[data-media-new]').forEach(b=>b.onclick=()=>mediaModal());document.querySelectorAll('[data-media-delete]').forEach(b=>b.onclick=()=>deleteMedia(b.dataset.mediaDelete));document.querySelectorAll('[data-event-edit]').forEach(b=>b.onclick=()=>{state.editingEventId=b.dataset.eventEdit;render()});document.querySelectorAll('[data-event-delete]').forEach(b=>b.onclick=()=>deleteEvent(b.dataset.eventDelete));document.querySelectorAll('[data-event-save]').forEach(b=>b.onclick=()=>saveEventInline(b.dataset.eventSave));document.querySelectorAll('[data-event-update]').forEach(b=>b.onclick=()=>updateEvent(b.dataset.eventUpdate));document.querySelectorAll('[data-event-edit-cancel]').forEach(b=>b.onclick=()=>{state.editingEventId=null;render()});document.querySelectorAll('[data-report]').forEach(b=>b.onclick=async()=>{state.reportType=b.dataset.report;state.reportMatchId=null;render();if(b.dataset.report==='sumula'&&state.matches.length){await loadReportMatch(state.matches[0].id)}});document.querySelector('#reportMatchSelect')?.addEventListener('change',e=>loadReportMatch(e.target.value));bindAthleteReportFilters();bindCartoesReportFilters();document.querySelector('[data-sponsor-save]')?.addEventListener('click',e=>saveSponsor(e.target.dataset.sponsorSave||''));document.querySelector('[data-media-save]')?.addEventListener('click',saveMedia);document.querySelector('[data-configure-competition]')?.addEventListener('click',openCompetitionConfig);document.querySelector('[data-report-print]')?.addEventListener('click',()=>window.print());document.querySelectorAll('[data-player-data]').forEach(b=>b.onclick=()=>playerDataModal(b.dataset.playerData));document.querySelectorAll('[data-lineup-present]').forEach(cb=>cb.onchange=()=>{const row=cb.closest('[data-player-row]');const btn=row?.querySelector('[data-lineup-status]');if(btn&&!cb.checked){btn.dataset.status='nao_compareceu';btn.textContent='Ausente';btn.className='statusbtn status-nao_compareceu';}else if(btn&&cb.checked&&btn.dataset.status==='nao_compareceu'){btn.dataset.status='reserva';btn.textContent='Reserva';btn.className='statusbtn status-reserva';}row?.classList.toggle('is-present',cb.checked);row?.classList.toggle('is-absent',!cb.checked)});document.querySelectorAll('[data-lineup-status]').forEach(b=>b.onclick=()=>{if(b.disabled)return;lineupStatusModal(b.dataset.lineupStatus)});}

function moderatorEmail(username){return `${String(username||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@moderadores.ouroprata.local`}
async function moderatorSignup(){
  const username=document.querySelector('#moderatorUsername')?.value.trim()
  const password=document.querySelector('#moderatorPassword')?.value||''
  const confirm=document.querySelector('#moderatorPasswordConfirm')?.value||''
  if(!username||username.length<3)return toast('Informe um usuário com pelo menos 3 caracteres.','error')
  if(!/^[a-zA-Z0-9._-]+$/.test(username))return toast('O usuário deve conter apenas letras, números, ponto, hífen ou sublinhado.','error')
  if(password.length<6)return toast('A senha deve ter pelo menos 6 caracteres.','error')
  if(password!==confirm)return toast('As senhas não conferem.','error')
  const email=moderatorEmail(username)
  const auth=await supabase.auth.signUp({email,password})
  if(auth.error)return toast(auth.error.message,'error')
  const uid=auth.data.user?.id
  if(!uid)return toast('O cadastro foi iniciado, mas o usuário não foi retornado pelo Supabase.','error')
  const ins=await supabase.from('moderators').insert({user_id:uid,username,approved:false})
  if(ins.error)return toast(`Usuário criado, mas não foi possível registrar a solicitação: ${ins.error.message}`,'error')
  toast('Cadastro enviado. Aguarde a aprovação do administrador.','ok')
  if(auth.data.session)await load()
  render()
}
async function moderatorLogin(){
  const username=document.querySelector('#moderatorLoginUsername')?.value.trim()
  const password=document.querySelector('#moderatorLoginPassword')?.value||''
  if(!username||!password)return toast('Informe usuário e senha.','error')
  const res=await supabase.auth.signInWithPassword({email:moderatorEmail(username),password})
  if(res.error)return toast(res.error.message,'error')
  await load()
  if(!state.moderator)return toast('Usuário de moderador não encontrado.','error')
  if(!state.moderator.approved)return toast('Cadastro ainda não aprovado pelo administrador.','error')
  toast('Login de moderador realizado.','ok')
}
async function approveModerator(id){
  if(!isAdmin())return toast('Somente o administrador pode aprovar moderadores.','error')
  const res=await supabase.from('moderators').update({approved:true,approved_at:new Date().toISOString(),approved_by:state.session.user.id}).eq('id',id)
  if(res.error)return toast(res.error.message,'error')
  await loadModeratorData();render();toast('Moderador aprovado.','ok')
}
async function changeModeratorPassword(){
  if(!isModerator())return toast('Entre como moderador para alterar a senha.','error')
  const p=document.querySelector('#moderatorNewPassword')?.value||''
  const c=document.querySelector('#moderatorNewPasswordConfirm')?.value||''
  if(p.length<6)return toast('A nova senha deve ter pelo menos 6 caracteres.','error')
  if(p!==c)return toast('As senhas não conferem.','error')
  const res=await supabase.auth.updateUser({password:p})
  if(res.error)return toast(res.error.message,'error')
  document.querySelector('#moderatorPasswordModal')?.remove()
  toast('Senha alterada com sucesso.','ok')
}
function openModeratorPasswordModal(){
  if(!isModerator())return
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="moderatorPasswordModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">SEGURANÇA</div><h2>Alterar senha</h2><input id="moderatorNewPassword" type="password" placeholder="Nova senha"><input id="moderatorNewPasswordConfirm" type="password" placeholder="Confirmar nova senha"><button class="primary wide" data-moderator-save-password>💾 Alterar / Salvar senha</button></div></div>`)
}
function moderatorsView(){
  const logged=!!state.session
  const own=state.moderator
  const admin=isAdmin()
  const status=own?(own.approved?'APROVADO':'AGUARDANDO APROVAÇÃO'):''
  const pending=state.moderatorRequests.filter(x=>!x.approved)
  return `<section class="panel moderator-panel">
    <div class="panelhead"><div><h2>🛡️ Moderadores</h2><p class="muted">Cadastro e controle de acesso dos moderadores da Central ao vivo.</p></div></div>
    ${own?`<div class="moderator-status ${own.approved?'approved':'pending'}"><b>${esc(own.username)}</b><span>${status}</span>${own.approved?`<button class="secondary" data-moderator-password>🔑 Alterar / Salvar senha</button>`:''}</div>`:''}
    ${!own&&!admin?`<div class="moderator-grid">
      <div class="moderator-card"><h3>Cadastro de moderador</h3><p class="muted">Informe somente usuário e senha. O acesso dependerá da aprovação do administrador.</p><input id="moderatorUsername" placeholder="Usuário"><input id="moderatorPassword" type="password" placeholder="Senha"><input id="moderatorPasswordConfirm" type="password" placeholder="Confirmar senha"><button class="primary wide" data-moderator-signup>Solicitar cadastro</button></div>
      <div class="moderator-card"><h3>Entrar como moderador</h3><p class="muted">Use o usuário e a senha já aprovados.</p><input id="moderatorLoginUsername" placeholder="Usuário"><input id="moderatorLoginPassword" type="password" placeholder="Senha"><button class="secondary wide" data-moderator-login>Entrar</button></div>
    </div>`:''}
    ${admin?`<div class="panel"><div class="panelhead"><div><h3>Aprovação de moderadores</h3><span class="muted">${pending.length} pendente(s)</span></div></div>
      ${state.moderatorRequests.length?`<div class="tablewrap"><table><tr><th>Usuário</th><th>Cadastro</th><th>Status</th><th>Ação</th></tr>${state.moderatorRequests.map(x=>`<tr><td><b>${esc(x.username)}</b></td><td>${fmtDate(x.created_at)}</td><td>${x.approved?'APROVADO':'PENDENTE'}</td><td>${x.approved?'—':`<button class="smallbtn primary" data-moderator-approve="${x.id}">✅ Aprovar</button>`}</td></tr>`).join('')}</table></div>`:'<div class="empty">Nenhum cadastro de moderador.</div>'}
    </div>`:''}
    ${logged&&own?.approved?`<div class="notice">🔒 <b>Permissão do moderador:</b> pode alterar somente os dados da aba <b>Ao vivo</b>. As demais abas permanecem somente para consulta. Após o encerramento da partida, as alterações ficam bloqueadas.</div>`:''}
    ${!logged?'<div class="notice">Faça o cadastro ou entre como moderador nesta tela.</div>':''}
  </section>`
}

function openUserMenu(){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="userModal"><div class="modalbox"><button class="close" data-close>×</button><div class="eyebrow">USUÁRIO</div><h2>${esc(state.profile?.full_name||state.session.user.email)}</h2><p>Perfil: <b>${roleLabel(state.profile?.role)}</b></p><button class="danger wide" id="logoutBtn">Sair</button></div></div>`);document.querySelector('#logoutBtn').onclick=logout}
document.addEventListener('click',async e=>{
  const t=e.target.closest('button,a');
  if(!t)return;
  if(t.matches('[data-player-export]')){await openPlayerExportModal();return}
  if(t.matches('[data-export-check-all]')){document.querySelectorAll('[data-export-player]').forEach(x=>x.checked=true);return}
  if(t.matches('[data-export-uncheck-all]')){document.querySelectorAll('[data-export-player]').forEach(x=>x.checked=false);return}
  if(t.matches('[data-export-players]')){await exportSelectedPlayers();return}
  if(t.matches('[data-close]')){t.closest('.modal')?.remove();return}
  if(t.matches('[data-auth-submit]')){await authSubmit();return}
  if(t.matches('[data-moderator-signup]')){await moderatorSignup();return}
  if(t.matches('[data-moderator-login]')){await moderatorLogin();return}
  if(t.matches('[data-moderator-approve]')){await approveModerator(t.dataset.moderatorApprove);return}
  if(t.matches('[data-moderator-password]')){openModeratorPasswordModal();return}
  if(t.matches('[data-moderator-save-password]')){await changeModeratorPassword();return}
  if(t.matches('[data-save-competition]')){await saveCompetition(t.dataset.saveCompetition||'');return}
  if(t.matches('[data-sponsor-save]')){await saveSponsor(t.dataset.sponsorSave||'');return}
  if(t.matches('[data-media-save]')){await saveMedia();return}
  if(t.matches('[data-open-match]')){e.preventDefault();e.stopPropagation();await openMatchFromButton(t.dataset.openMatch);return}
  if(t.matches('[data-clock-adjust]')){await adjustClock(Number(t.dataset.clockAdjust)||0);return}
  if(t.matches('[data-phase-add]')){const list=document.querySelector('#phaseList');if(list)list.insertAdjacentHTML('beforeend',phaseRow({name:'',type:'classificatoria'},document.querySelectorAll('[data-phase-row]').length));return}
  if(t.matches('[data-phase-remove]')){t.closest('[data-phase-row]')?.remove();return}
  if(t.matches('[data-phase-save]')){await saveCompetitionConfig();return}
  if(t.matches('[data-new-phase]')){openPhaseModal();return}
  if(t.matches('[data-phase-create]')){await createPhaseGames();return}
  if(t.matches('[data-lineup-status]')){lineupStatusModal(t.dataset.lineupStatus);return}
  if(t.matches('[data-lineup-choice]')){const id=t.dataset.lineupChoice,st=t.dataset.status,btn=document.querySelector(`[data-lineup-status="${id}"]`);if(btn){btn.dataset.status=st;btn.textContent=lineupStatusLabel(st);btn.className=`statusbtn ${st==='suspenso'?'status-suspenso':st==='titular'?'status-titular':st==='nao_compareceu'?'status-nao_compareceu':'status-reserva'}`;const row=btn.closest('[data-player-row]');row?.classList.toggle('is-suspended',st==='suspenso');row?.classList.toggle('is-absent',st==='nao_compareceu'||st==='suspenso');row?.classList.toggle('is-present',st==='titular'||st==='reserva');const cb=row?.querySelector('[data-lineup-present]');if(cb){cb.checked=st==='titular'||st==='reserva';cb.disabled=st==='suspenso'||!canLiveOperate()||state.selectedMatch?.status==='encerrado';}}document.querySelector('#lineupStatusModal')?.remove();return}
  if(t.matches('[data-score-inc]')){await adjustScore(t.dataset.scoreInc,1);return}
  if(t.matches('[data-score-dec]')){await adjustScore(t.dataset.scoreDec,-1);return}
  if(t.matches('[data-minute-adjust]')){await adjustMinute(Number(t.dataset.minuteAdjust));return}
  if(t.matches('[data-classification]')){state.tab=t.dataset.classification==='grupo'?'grupos':'classificacao';render();return}
  if(t.matches('[data-toggle-auth]')){state.authMode=state.authMode==='login'?'signup':'login';document.querySelector('#authModal')?.remove();openAuth();return}
});

document.addEventListener('change',async e=>{
  if(e.target?.matches('#phaseType')){
    const format=document.querySelector('#phaseFormat');
    const type=e.target.value;
    const wanted={quartas:'general_1_8',semifinal:'winners_qf',final:'winner_semi'}[type];
    if(format&&wanted)format.value=wanted;
  }
  const t=e.target;
  if(t.matches('[data-player-export-source]') || t.matches('[data-player-export-competition]')) await loadPlayerExportTeams();
});

supabase.auth.onAuthStateChange(async()=>{setTimeout(load,0)})
subscribe()
load()
