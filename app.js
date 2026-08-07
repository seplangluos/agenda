// ==========================================
// 1. CONFIGURAÇÃO DOS BANCOS DE DADOS
// ==========================================
const firebaseConfigAgenda = {
    apiKey: "AIzaSyDSX3Y0ytNL4f3cH1BGSIhqKEBpL9JaEP8",
    authDomain: "processos-c004f.firebaseapp.com",
    databaseURL: "https://processos-c004f-default-rtdb.firebaseio.com",
    projectId: "processos-c004f"
};
const firebaseConfigProcessos = {
    apiKey: "AIzaSyAWbo9MCRjE4776A_DpjJCWHPZap-goJDg",
    authDomain: "processos-gluos.firebaseapp.com",
    databaseURL: "https://processos-gluos-default-rtdb.firebaseio.com",
    projectId: "processos-gluos"
};

firebase.initializeApp(firebaseConfigAgenda);
const dbAgenda = firebase.database();
const auth = firebase.auth();

const appProcessos = firebase.initializeApp(firebaseConfigProcessos, "AppProcessos");
const dbProcessos = appProcessos.database();

let usuarioLogado = null; 
let roleLogado = null;    
const diasNomes = {1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta'};

// ==========================================
// 2. NAVEGAÇÃO E MODAIS
// ==========================================
function nav(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function fecharModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }

window.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
});

function logout() {
    auth.signOut().then(() => { usuarioLogado = null; roleLogado = null; nav('screen-home'); });
}

// ==========================================
// 3. AUTENTICAÇÃO E CADASTRO
// ==========================================
async function cadastrarContribuinte() {
    const nome = document.getElementById('cad-nome').value;
    const cpf = document.getElementById('cad-cpf').value;
    const email = document.getElementById('cad-email').value;
    const senha = document.getElementById('cad-senha').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, senha);
        await dbAgenda.ref('usuarios/' + cred.user.uid).set({ nome, cpf, email, tipo: 'contribuinte' });
        await dbAgenda.ref('cpf_emails/' + cpf.replace(/\D/g, '')).set({ email });
        alert("Cadastro realizado!");
        nav('screen-login-contribuinte');
    } catch (e) { alert("Erro: " + e.message); }
}

async function loginContribuinte() {
    let cpf = document.getElementById('login-cpf').value.replace(/\D/g, '');
    let senha = document.getElementById('login-senha').value;
    try {
        const snap = await dbAgenda.ref('cpf_emails/' + cpf).once('value');
        if (!snap.exists()) throw new Error("CPF não encontrado.");
        const cred = await auth.signInWithEmailAndPassword(snap.val().email, senha);
        const userSnap = await dbAgenda.ref('usuarios/' + cred.user.uid).once('value');
        
        usuarioLogado = { uid: cred.user.uid, ...userSnap.val() };
        roleLogado = 'contribuinte';
        
        nav('screen-dash-contribuinte');
        listarMeusAgendamentos(); 
    } catch (e) { alert("Erro no login: " + e.message); }
}

async function loginServidor() {
    const email = document.getElementById('login-servidor-nome').value;
    const senha = document.getElementById('login-servidor-senha').value;
    try {
        await auth.signInWithEmailAndPassword(email, senha);
        usuarioLogado = { email, tipo: 'servidor' };
        roleLogado = 'servidor';
        nav('screen-dash-servidor');
        carregarListaDiaria();
    } catch (e) { alert("Erro: " + e.message); }
}

// ==========================================
// 4. LÓGICA DE PROCESSOS E HORÁRIOS
// ==========================================
function normalizarNumeroProcesso(input) {
    let processado = input.trim().replace(/\//g, "-");
    let partes = processado.split("-");
    if (partes.length >= 2 && partes[partes.length - 1].length === 2) {
        partes[partes.length - 1] = "20" + partes[partes.length - 1];
        processado = partes.join("-");
    }
    return processado;
}

async function processarListaProcessos(stringProcessos) {
    if (!stringProcessos) return "Nenhum informado";
    let inputs = stringProcessos.split(",").map(p => p.trim());
    let resultados = [];
    for (let p of inputs) {
        let numBusca = normalizarNumeroProcesso(p);
        let numExibicao = numBusca.replace(/-/g, "/"); 
        try {
            let snap = await dbProcessos.ref('processos/' + numBusca).once('value');
            if (snap.exists()) {
                let d = snap.val();
                resultados.push(`<strong>${numExibicao}</strong> = ${d.Requerente}, CTM: ${d.CTM}`);
            } else { resultados.push(p); }
        } catch (e) { resultados.push(p); }
    }
    return resultados.join("<br><br>");
}

async function buscarHorariosLivres(servicoId, dataStr, selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = "<option value=''>Carregando...</option>";
    if (!servicoId || !dataStr) return select.innerHTML = "<option value=''>Preencha serviço e data antes</option>";

    try {
        const snapServico = await dbAgenda.ref('servicos/' + servicoId).once('value');
        const config = snapServico.val().config || { dias: {}, horarios: {} };

        const snapAgend = await dbAgenda.ref('agendamentos').orderByChild('data').equalTo(dataStr).once('value');
        const ocupados = [];
        snapAgend.forEach(child => { if (child.val().servico === servicoId) ocupados.push(child.val().horario); });

        select.innerHTML = "<option value=''>Selecione um horário...</option>";
        let temLivre = false;

        if (config.horarios) {
            const ativos = Object.keys(config.horarios).filter(h => config.horarios[h]).sort();
            ativos.forEach(hora => {
                if (!ocupados.includes(hora)) {
                    select.innerHTML += `<option value="${hora}">${hora}</option>`;
                    temLivre = true;
                }
            });
        }
        if (!temLivre) select.innerHTML = "<option value=''>Nenhum horário disponível</option>";
    } catch (e) { select.innerHTML = "<option value=''>Erro</option>"; }
}

function obterDataAmanhaString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function checarDataFutura(dataInputString) {
    if(!dataInputString) return false;
    const partes = dataInputString.split('-');
    const dataSelecionada = new Date(partes[0], partes[1] - 1, partes[2]);
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    return dataSelecionada > hoje; 
}

// ==========================================
// 5. PAINEL CONTRIBUINTE
// ==========================================
let configDiasAtual_Contribuinte = {};

async function abrirNovoAgendamento() {
    const area = document.getElementById('area-contribuinte-conteudo');
    area.innerHTML = `<h3>Novo Agendamento</h3><p>Carregando...</p>`;
    
    const snap = await dbAgenda.ref('servicos').once('value');
    let selectHTML = `<select id="novo-agend-servico" onchange="atualizarDiasContribuinte()"><option value="">Selecione um Serviço...</option>`;
    if (snap.exists()) {
        snap.forEach(child => { selectHTML += `<option value="${child.key}">${child.val().nome}</option>`; });
    }
    selectHTML += `</select>`;

    const dataMinimaStr = obterDataAmanhaString();

    area.innerHTML = `
        <h3>Novo Agendamento</h3>
        <div class="form-group">
            <label>1. Escolha o Serviço:</label>
            ${selectHTML}
            <small id="info-dias-servico" style="color:var(--primary); font-weight:bold; margin-top:5px;"></small>
        </div>
        <div class="form-group">
            <label>2. Data (Apenas a partir de amanhã):</label>
            <input type="date" id="novo-agend-data" min="${dataMinimaStr}" onchange="validarDataContribuinte()">
        </div>
        <div class="form-group">
            <label>3. Horário Disponível:</label>
            <select id="novo-agend-horario"><option>Preencha serviço e data antes</option></select>
        </div>
        <div class="form-group">
            <label>4. Nº do(s) Processo(s) (separados por vírgula):</label>
            <input type="text" id="novo-agend-processos" placeholder="Ex: 5549/2024">
        </div>
        <button onclick="salvarAgendamentoContribuinte()">Confirmar Agendamento</button>
    `;
}

async function atualizarDiasContribuinte() {
    const sId = document.getElementById('novo-agend-servico').value;
    const info = document.getElementById('info-dias-servico');
    if(!sId) { info.innerText = ""; return; }

    const snap = await dbAgenda.ref('servicos/' + sId + '/config/dias').once('value');
    configDiasAtual_Contribuinte = snap.val() || {};
    
    const ativos = Object.keys(configDiasAtual_Contribuinte).filter(k => configDiasAtual_Contribuinte[k]).map(k => diasNomes[k]);
    info.innerText = ativos.length ? "Dias de atendimento: " + ativos.join(', ') : "Serviço sem dias configurados.";
    if(document.getElementById('novo-agend-data').value) validarDataContribuinte();
}

function validarDataContribuinte() {
    const dataInput = document.getElementById('novo-agend-data').value;
    if(!dataInput) return;
    
    if(!checarDataFutura(dataInput)) {
        alert("Não é possível agendar para hoje ou datas passadas. Escolha a partir de amanhã.");
        document.getElementById('novo-agend-data').value = '';
        document.getElementById('novo-agend-horario').innerHTML = "<option value=''>Selecione uma data válida</option>";
        return;
    }

    const partes = dataInput.split('-');
    const diaSemana = new Date(partes[0], partes[1] - 1, partes[2]).getDay().toString();
    
    if(diaSemana === "0" || diaSemana === "6" || !configDiasAtual_Contribuinte[diaSemana]) {
        alert("Serviço não atende na data selecionada. Verifique os dias permitidos indicados em azul.");
        document.getElementById('novo-agend-data').value = '';
        document.getElementById('novo-agend-horario').innerHTML = "<option value=''>Selecione uma data válida</option>";
        return;
    }
    buscarHorariosLivres(document.getElementById('novo-agend-servico').value, dataInput, 'novo-agend-horario');
}

async function salvarAgendamentoContribuinte() {
    const servico = document.getElementById('novo-agend-servico').value;
    const data = document.getElementById('novo-agend-data').value;
    const horario = document.getElementById('novo-agend-horario').value;
    const processos = document.getElementById('novo-agend-processos').value;

    if(!servico || !data || !horario) return alert("Preencha os campos obrigatórios");

    const id = Date.now().toString();
    await dbAgenda.ref('agendamentos/' + id).set({
        id, contribuinteId: usuarioLogado.uid, contribuinteNome: usuarioLogado.nome, contribuinteCpf: usuarioLogado.cpf,
        servico, data, horario, processos
    });
    alert("Agendamento Confirmado!");
    listarMeusAgendamentos();
}

async function listarMeusAgendamentos() {
    const area = document.getElementById('area-contribuinte-conteudo');
    area.innerHTML = `<h3>Meus Agendamentos</h3><p>Buscando histórico completo...</p>`;
    
    try {
        const snap = await dbAgenda.ref('agendamentos').once('value');
        const sSnap = await dbAgenda.ref('servicos').once('value');
        const mapa = {};
        if(sSnap.exists()) sSnap.forEach(c => { mapa[c.key] = c.val().nome; });

        let agends = [];
        if(snap.exists()){
            snap.forEach(c => {
                let a = c.val();
                if (a.contribuinteCpf === usuarioLogado.cpf || a.contribuinteId === usuarioLogado.uid) {
                    agends.push(a);
                }
            });
        }

        agends.sort((a,b) => {
            const dateA = new Date(`${a.data}T${a.horario}`);
            const dateB = new Date(`${b.data}T${b.horario}`);
            return dateB - dateA;
        });

        let html = `<table><tr><th class="col-horario">Data</th><th class="col-horario">Horário</th><th class="col-contribuinte">Serviço</th><th class="col-processos">Processos Informados</th></tr>`;
        if(agends.length > 0){
            agends.forEach(a => {
                let dataPtBr = a.data.split('-').reverse().join('/');
                html += `<tr><td>${dataPtBr}</td><td>${a.horario}</td><td>${mapa[a.servico]||'--'}</td><td>${a.processos}</td></tr>`;
            });
        } else { 
            html += `<tr><td colspan="4">Você ainda não possui nenhum agendamento.</td></tr>`; 
        }
        html += `</table>`;
        area.innerHTML = `<h3>Meus Agendamentos</h3>${html}`;
    } catch (error) {
        area.innerHTML = `<h3>Meus Agendamentos</h3><p>Erro ao carregar: ${error.message}</p>`;
    }
}

// ==========================================
// 6. PAINEL SERVIDOR - LISTA DIÁRIA
// ==========================================
async function carregarListaDiaria() {
    const area = document.getElementById('area-servidor-conteudo');
    const d = new Date();
    const dataAtual = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    
    area.innerHTML = `
        <h3>Agendamentos do Dia <input type="date" id="filtro-data" value="${dataAtual}" onchange="renderListaServidor()"></h3>
        <div id="tabs-servicos" class="tabs"></div>
        <div id="tabela-container">Carregando...</div>
    `;
    renderListaServidor();
}

async function renderListaServidor() {
    const dataAlvo = document.getElementById('filtro-data').value;
    const snapServicos = await dbAgenda.ref('servicos').once('value');
    const mapaServicos = {};
    if(snapServicos.exists()) snapServicos.forEach(child => { mapaServicos[child.key] = child.val().nome; });

    const snap = await dbAgenda.ref('agendamentos').orderByChild('data').equalTo(dataAlvo).once('value');
    const agendamentos = [];
    snap.forEach(child => { agendamentos.push(child.val()); });
    
    if(agendamentos.length === 0) {
        document.getElementById('tabela-container').innerHTML = "<p>Sem agendamentos para este dia.</p>";
        document.getElementById('tabs-servicos').innerHTML = "";
        return;
    }

    const porServico = {};
    agendamentos.forEach(a => {
        if(!porServico[a.servico]) porServico[a.servico] = [];
        porServico[a.servico].push(a);
    });

    const tabsContainer = document.getElementById('tabs-servicos');
    tabsContainer.innerHTML = "";
    Object.keys(porServico).forEach((srvId, index) => {
        let nomeServico = mapaServicos[srvId] || "Serviço Removido";
        tabsContainer.innerHTML += `<button class="tab ${index===0?'active':''}" onclick="mudarAba(this, '${srvId}')">${nomeServico}</button>`;
    });

    window.dadosAtuaisTabela = porServico; 
    renderTabelaAba(Object.keys(porServico)[0]);
}

function mudarAba(btn, servicoId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderTabelaAba(servicoId);
}

async function renderTabelaAba(servicoId) {
    const dados = window.dadosAtuaisTabela[servicoId];
    const container = document.getElementById('tabela-container');
    
    // Sem CPF na tabela, apenas o nome. Colunas ajustadas.
    let html = `<table><tr><th class="col-horario">Horário</th><th class="col-contribuinte">Contribuinte</th><th class="col-processos">Nº Processos (Expandido)</th></tr>`;
    for(let a of dados) {
        const textoProcessos = await processarListaProcessos(a.processos);
        html += `<tr><td>${a.horario}</td><td>${a.contribuinteNome}</td><td>${textoProcessos}</td></tr>`;
    }
    html += `</table>`;
    container.innerHTML = html;
}

// ==========================================
// 7. PAINEL SERVIDOR - PESQUISA
// ==========================================
function abrirPesquisa() {
    document.getElementById('area-servidor-conteudo').innerHTML = `
        <h3>Pesquisa de Agendamentos</h3>
        <div style="display:flex; gap:10px; margin-bottom: 20px;">
            <input type="text" id="pesq-termo" placeholder="Nome ou CPF" style="flex:1;">
            <button onclick="realizarPesquisaServidor()">Pesquisar</button>
        </div>
        <div id="acoes-pesquisa"></div>
        <div id="resultado-pesquisa"></div>
    `;
}

async function realizarPesquisaServidor() {
    const termo = document.getElementById('pesq-termo').value.trim().toLowerCase();
    if(!termo) return;
    
    const resContainer = document.getElementById('resultado-pesquisa');
    resContainer.innerHTML = "Pesquisando...";
    
    const snap = await dbAgenda.ref('agendamentos').once('value');
    let agendamentos = [];
    let usuarioEncontrado = null; 
    
    if(snap.exists()) {
        snap.forEach(child => {
            let a = child.val();
            let cpfNormal = a.contribuinteCpf ? a.contribuinteCpf.replace(/\D/g, '') : '';
            let termoNormal = termo.replace(/\D/g, '');
            if(a.contribuinteNome.toLowerCase().includes(termo) || (termoNormal && cpfNormal.includes(termoNormal))) {
                agendamentos.push(a);
                if(!usuarioEncontrado) usuarioEncontrado = { id: a.contribuinteId, nome: a.contribuinteNome, cpf: a.contribuinteCpf };
            }
        });
    }
    
    agendamentos.sort((a, b) => {
        const dateA = new Date(`${a.data}T${a.horario}`);
        const dateB = new Date(`${b.data}T${b.horario}`);
        return dateB - dateA;
    });
    
    let acoesHtml = "";
    if(usuarioEncontrado) {
        acoesHtml = `<button onclick="abrirNovoAgendamentoServidor('${usuarioEncontrado.id}', '${usuarioEncontrado.nome}', '${usuarioEncontrado.cpf}')" style="margin-bottom:15px; background:#48bb78;">+ Novo Agendamento para ${usuarioEncontrado.nome}</button>`;
    }
    document.getElementById('acoes-pesquisa').innerHTML = acoesHtml;

    if(agendamentos.length === 0) { resContainer.innerHTML = "<p>Nenhum agendamento encontrado.</p>"; return; }
    
    const snapServicos = await dbAgenda.ref('servicos').once('value');
    const mapa = {};
    if(snapServicos.exists()) snapServicos.forEach(c => { mapa[c.key] = c.val().nome; });

    let html = `<table><tr><th class="col-horario">Data</th><th class="col-horario">Horário</th><th class="col-contribuinte">Contribuinte</th><th class="col-contribuinte">Serviço</th><th class="col-processos">Nº Processos</th></tr>`;
    for(let a of agendamentos) {
        let dataPtBr = a.data.split('-').reverse().join('/');
        const textoProcessos = await processarListaProcessos(a.processos); 
        html += `<tr><td>${dataPtBr}</td><td>${a.horario}</td><td>${a.contribuinteNome}</td><td>${mapa[a.servico]||'--'}</td><td>${textoProcessos}</td></tr>`;
    }
    html += `</table>`;
    resContainer.innerHTML = html;
}

let configDiasAtual_Nas = {};

async function abrirNovoAgendamentoServidor(uid, nome, cpf) {
    document.getElementById('modal-agendar-servidor').classList.remove('hidden');
    document.getElementById('modal-nas-nome-display').innerText = `Contribuinte: ${nome} | CPF: ${cpf}`;
    document.getElementById('nas-uid').value = uid;
    document.getElementById('nas-nome').value = nome;
    document.getElementById('nas-cpf').value = cpf;
    
    const snap = await dbAgenda.ref('servicos').once('value');
    let selectHTML = `<select id="nas-servico" onchange="atualizarDiasNas()"><option value="">Selecione um Serviço...</option>`;
    if (snap.exists()) snap.forEach(child => { selectHTML += `<option value="${child.key}">${child.val().nome}</option>`; });
    selectHTML += `</select>`;
    document.getElementById('nas-servico-container').innerHTML = selectHTML;
    
    document.getElementById('nas-data').min = obterDataAmanhaString();
    document.getElementById('nas-data').value = '';
    document.getElementById('nas-horario').innerHTML = "<option>Preencha serviço e data antes</option>";
    document.getElementById('nas-info-dias').innerText = '';
}

async function atualizarDiasNas() {
    const sId = document.getElementById('nas-servico').value;
    const info = document.getElementById('nas-info-dias');
    if(!sId) { info.innerText = ""; return; }

    const snap = await dbAgenda.ref('servicos/' + sId + '/config/dias').once('value');
    configDiasAtual_Nas = snap.val() || {};
    
    const ativos = Object.keys(configDiasAtual_Nas).filter(k => configDiasAtual_Nas[k]).map(k => diasNomes[k]);
    info.innerText = ativos.length ? "Dias de atendimento: " + ativos.join(', ') : "Serviço sem dias configurados.";
    if(document.getElementById('nas-data').value) validarDataNas();
}

function validarDataNas() {
    const dataInput = document.getElementById('nas-data').value;
    if(!dataInput) return;
    
    if(!checarDataFutura(dataInput)) {
        alert("Agendamentos permitidos apenas para datas futuras (a partir de amanhã).");
        document.getElementById('nas-data').value = '';
        document.getElementById('nas-horario').innerHTML = "<option value=''>Selecione uma data válida</option>";
        return;
    }
    
    const partes = dataInput.split('-');
    const diaSemana = new Date(partes[0], partes[1] - 1, partes[2]).getDay().toString();
    if(diaSemana === "0" || diaSemana === "6" || !configDiasAtual_Nas[diaSemana]) {
        alert("Data inválida para este serviço (veja os dias em azul).");
        document.getElementById('nas-data').value = '';
        document.getElementById('nas-horario').innerHTML = "<option value=''>Selecione uma data válida</option>";
        return;
    }
    buscarHorariosLivres(document.getElementById('nas-servico').value, dataInput, 'nas-horario');
}

async function salvarAgendamentoNas() {
    const servico = document.getElementById('nas-servico').value;
    const data = document.getElementById('nas-data').value;
    const horario = document.getElementById('nas-horario').value;
    const processos = document.getElementById('nas-processos').value;

    if(!servico || !data || !horario) return alert("Preencha os campos obrigatórios");

    const id = Date.now().toString();
    await dbAgenda.ref('agendamentos/' + id).set({
        id, contribuinteId: document.getElementById('nas-uid').value,
        contribuinteNome: document.getElementById('nas-nome').value,
        contribuinteCpf: document.getElementById('nas-cpf').value,
        servico, data, horario, processos
    });

    alert("Agendamento Confirmado!");
    fecharModal('modal-agendar-servidor');
    realizarPesquisaServidor(); 
}

// ==========================================
// 8. PAINEL SERVIDOR - CALENDÁRIO SEMANAL
// ==========================================
async function abrirCalendario(dataStr = null) {
    const area = document.getElementById('area-servidor-conteudo');
    
    let baseDate;
    if (dataStr) {
        const [y, m, d] = dataStr.split('-');
        baseDate = new Date(y, m - 1, d);
    } else {
        baseDate = new Date();
        baseDate.setHours(0,0,0,0);
    }

    const diaDaSemana = baseDate.getDay(); 
    const distSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana; 
    const segundaFeira = new Date(baseDate);
    segundaFeira.setDate(baseDate.getDate() + distSegunda);

    const inputDataVal = baseDate.getFullYear() + '-' + String(baseDate.getMonth() + 1).padStart(2, '0') + '-' + String(baseDate.getDate()).padStart(2, '0');

    let htmlCabecalho = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
            <h3 style="margin:0;">Calendário Semanal</h3>
            <div style="background:#f4f7f6; padding:10px; border-radius:5px; border:1px solid #ddd;">
                <label style="font-weight:bold; margin-right:10px;">Ir para a semana do dia:</label>
                <input type="date" value="${inputDataVal}" onchange="abrirCalendario(this.value)" style="padding:5px; border:1px solid #ccc;">
            </div>
        </div>
    `;

    const datasDaSemana = [];
    const labelsDias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    let gridHTML = `<div class="calendario-grid">`;

    for(let i = 0; i < 5; i++) {
        let dataDia = new Date(segundaFeira);
        dataDia.setDate(segundaFeira.getDate() + i);
        
        let dAno = dataDia.getFullYear();
        let dMes = String(dataDia.getMonth()+1).padStart(2,'0');
        let dDia = String(dataDia.getDate()).padStart(2,'0');
        let dataISO = `${dAno}-${dMes}-${dDia}`;
        
        datasDaSemana.push(dataISO);
        let dataPtBr = `${dDia}/${dMes}/${dAno}`;

        gridHTML += `
            <div class="dia-semana">
                <h4>${labelsDias[i]}<br><small>${dataPtBr}</small></h4>
                <div class="slots-container" id="coluna-${dataISO}">Carregando...</div>
            </div>
        `;
    }
    gridHTML += `</div>`;
    area.innerHTML = htmlCabecalho + gridHTML;

    const snapServ = await dbAgenda.ref('servicos').once('value');
    const mapaServicos = {};
    if(snapServ.exists()) snapServ.forEach(c => { mapaServicos[c.key] = c.val().nome; });

    window.agendamentosCalendarioCache = {}; 

    for (let data of datasDaSemana) {
        const snap = await dbAgenda.ref('agendamentos').orderByChild('data').equalTo(data).once('value');
        let agendDia = [];
        
        if (snap.exists()) {
            snap.forEach(child => { 
                agendDia.push(child.val());
                window.agendamentosCalendarioCache[child.key] = child.val();
            });
        }
        agendDia.sort((a, b) => a.horario.localeCompare(b.horario));
        
        const coluna = document.getElementById(`coluna-${data}`);
        if(agendDia.length === 0) {
            coluna.innerHTML = "<p style='font-size:12px; text-align:center; color:#999;'>Sem agendamentos</p>";
        } else {
            coluna.innerHTML = "";
            agendDia.forEach(a => {
                let primeiroNome = a.contribuinteNome.split(' ')[0]; 
                let srvNome = mapaServicos[a.servico] || '--';
                
                coluna.innerHTML += `
                    <div class="horario-slot agendado" onclick="abrirDetalhesCalendario('${a.id}', '${srvNome}')">
                        <strong>${a.horario}</strong> - ${primeiroNome}
                    </div>
                `;
            });
        }
    }
}

async function abrirDetalhesCalendario(id, servicoNome) {
    const agend = window.agendamentosCalendarioCache[id];
    if(!agend) return;
    document.getElementById('det-data').innerText = agend.data.split('-').reverse().join('/');
    document.getElementById('det-hora').innerText = agend.horario;
    document.getElementById('det-serv').innerText = servicoNome;
    document.getElementById('det-nome').innerText = `${agend.contribuinteNome} (CPF: ${agend.contribuinteCpf})`;
    document.getElementById('det-proc').innerHTML = "Buscando dados...";
    document.getElementById('modal-detalhes-agendamento').classList.remove('hidden');

    const procTratados = await processarListaProcessos(agend.processos);
    document.getElementById('det-proc').innerHTML = procTratados;
}

// ==========================================
// 9. PAINEL SERVIDOR - CADASTRO DE SERVIÇOS
// ==========================================
function abrirCadastroServicos() {
    document.getElementById('area-servidor-conteudo').innerHTML = `
        <h3>Cadastro de Serviços</h3>
        <div style="display:flex; gap:10px; margin-bottom: 20px;">
            <input type="text" id="novo-servico-nome" placeholder="Nome do Serviço">
            <button onclick="salvarNovoServico()">Adicionar</button>
        </div>
        <h4>Serviços Cadastrados</h4>
        <ul id="lista-de-servicos" class="lista-servicos"><li>Carregando...</li></ul>
    `;
    carregarListaServicos();
}

async function salvarNovoServico() {
    const nome = document.getElementById('novo-servico-nome').value;
    if(!nome) return;
    const key = dbAgenda.ref('servicos').push().key; 
    await dbAgenda.ref('servicos/' + key).set({ nome });
    document.getElementById('novo-servico-nome').value = '';
    carregarListaServicos();
}

async function excluirServico(id) {
    if(confirm('Tem certeza que deseja excluir este serviço?')) {
        await dbAgenda.ref('servicos/' + id).remove();
        carregarListaServicos();
    }
}

async function carregarListaServicos() {
    const snap = await dbAgenda.ref('servicos').once('value');
    const ul = document.getElementById('lista-de-servicos');
    ul.innerHTML = "";
    if(!snap.exists()) { ul.innerHTML = "<li>Nenhum serviço.</li>"; return; }

    snap.forEach(child => {
        ul.innerHTML += `
            <li>
                <span>${child.val().nome}</span>
                <div>
                    <button class="btn-editar" onclick="abrirModalServico('${child.key}', '${child.val().nome}')">Editar Horários</button>
                    <button class="btn-secundary" onclick="excluirServico('${child.key}')" style="background:#e53e3e; margin-left: 5px;">Excluir</button>
                </div>
            </li>
        `;
    });
}

async function abrirModalServico(id, nome) {
    document.getElementById('modal-servico-titulo').innerText = `Configurar: ${nome}`;
    document.getElementById('modal-servico-id').value = id;
    document.getElementById('modal-editar-servico').classList.remove('hidden');

    const snap = await dbAgenda.ref(`servicos/${id}/config`).once('value');
    const conf = snap.exists() ? snap.val() : { dias: {}, horarios: {} };

    let diasHTML = "";
    for (let i = 1; i <= 5; i++) {
        diasHTML += `<label class="checkbox-item"><input type="checkbox" class="chk-dia" value="${i}" ${conf.dias && conf.dias[i]?'checked':''}> ${diasNomes[i]}</label>`;
    }
    document.getElementById('modal-dias-container').innerHTML = diasHTML;

    let horasHTML = "";
    for (let h = 12; h <= 16; h++) {
        for (let m = 0; m < 60; m += 10) {
            if (h === 16 && m > 40) continue;
            let hStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            horasHTML += `<label class="checkbox-item"><input type="checkbox" class="chk-hora" value="${hStr}" ${conf.horarios && conf.horarios[hStr]?'checked':''}> ${hStr}</label>`;
        }
    }
    document.getElementById('modal-horarios-container').innerHTML = horasHTML;
}

async function salvarConfigServico() {
    const id = document.getElementById('modal-servico-id').value;
    const config = { dias: {}, horarios: {} };
    
    document.querySelectorAll('.chk-dia').forEach(chk => { config.dias[chk.value] = chk.checked; });
    document.querySelectorAll('.chk-hora').forEach(chk => { config.horarios[chk.value] = chk.checked; });

    await dbAgenda.ref(`servicos/${id}/config`).set(config);
    alert("Configurações salvas!");
    fecharModal('modal-editar-servico');
}