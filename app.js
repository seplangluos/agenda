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

// Variáveis para a tela de contribuintes
let listaContribuintesGlobal = [];
let ordemNomeAscendente = true;

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
    const telefone = document.getElementById('cad-telefone') ? document.getElementById('cad-telefone').value : '';
    const email = document.getElementById('cad-email').value;
    const senha = document.getElementById('cad-senha').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, senha);
        await dbAgenda.ref('usuarios/' + cred.user.uid).set({ nome, cpf, telefone, email, tipo: 'contribuinte' });
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
    select.innerHTML = "<option value=''>Carregando horários...</option>";
    if (!servicoId || !dataStr) return select.innerHTML = "<option value=''>Preencha serviço e data antes</option>";

    try {
        const snapServico = await dbAgenda.ref('servicos/' + servicoId).once('value');
        const config = snapServico.val().config || { dias: {}, horarios: {} };

        const snapAgend = await dbAgenda.ref('agendamentos').orderByChild('data').equalTo(dataStr).once('value');
        const ocupados = [];
        if (snapAgend.exists()) {
            snapAgend.forEach(child => { if (child.val().servico === servicoId) ocupados.push(child.val().horario); });
        }

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
    } catch (e) { select.innerHTML = "<option value=''>Erro ao carregar horários</option>"; }
}

function obterDataAmanhaString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function obterDataHojeString() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// ==========================================
// 5. PAINEL CONTRIBUINTE
// ==========================================
async function abrirNovoAgendamento() {
    const area = document.getElementById('area-contribuinte-conteudo');
    area.innerHTML = `<h3>Novo Agendamento</h3><p>Carregando...</p>`;
    
    const snap = await dbAgenda.ref('servicos').once('value');
    let selectHTML = `<select id="novo-agend-servico" onchange="aoMudarServicoContribuinte()"><option value="">Selecione um Serviço...</option>`;
    if (snap.exists()) {
        snap.forEach(child => { selectHTML += `<option value="${child.key}">${child.val().nome}</option>`; });
    }
    selectHTML += `</select>`;

    area.innerHTML = `
        <h3>Novo Agendamento</h3>
        <div class="form-group">
            <label>1. Escolha o Serviço:</label>
            ${selectHTML}
            <small id="info-dias-servico" style="color:var(--primary); font-weight:bold; margin-top:5px;"></small>
        </div>
        <div class="form-group">
            <label>2. Escolha a Data Disponível:</label>
            <div id="grid-datas-contribuinte" class="dates-selector-grid">
                <p style="color:#666; font-size:13px;">Selecione um serviço primeiro.</p>
            </div>
            <input type="hidden" id="novo-agend-data">
        </div>
        <div class="form-group">
            <label>3. Horário Disponível:</label>
            <select id="novo-agend-horario"><option value="">Selecione uma data acima</option></select>
        </div>
        <div class="form-group">
            <label>4. Nº do(s) Processo(s) (separados por vírgula):</label>
            <input type="text" id="novo-agend-processos" placeholder="Ex: 5549/2024">
        </div>
        <button onclick="salvarAgendamentoContribuinte()">Confirmar Agendamento</button>
    `;
}

async function aoMudarServicoContribuinte() {
    const sId = document.getElementById('novo-agend-servico').value;
    const info = document.getElementById('info-dias-servico');
    const grid = document.getElementById('grid-datas-contribuinte');
    document.getElementById('novo-agend-data').value = '';
    document.getElementById('novo-agend-horario').innerHTML = "<option value=''>Selecione uma data acima</option>";

    if(!sId) { 
        info.innerText = ""; 
        grid.innerHTML = `<p style="color:#666; font-size:13px;">Selecione um serviço primeiro.</p>`;
        return; 
    }

    const snap = await dbAgenda.ref('servicos/' + sId).once('value');
    const servData = snap.val() || {};
    const configDias = (servData.config && servData.config.dias) || {};
    
    const ativos = Object.keys(configDias).filter(k => configDias[k]).map(k => diasNomes[k]);
    info.innerText = ativos.length ? "Dias de atendimento: " + ativos.join(', ') : "Serviço sem dias configurados.";

    await gerarGridDatasDisponiveis(sId, 'grid-datas-contribuinte', 'novo-agend-data', 'novo-agend-horario');
}

async function gerarGridDatasDisponiveis(servicoId, gridContainerId, inputDataId, selectHorarioId) {
    const container = document.getElementById(gridContainerId);
    container.innerHTML = "Carregando datas disponíveis...";

    const snapServico = await dbAgenda.ref('servicos/' + servicoId).once('value');
    const servConfig = snapServico.val().config || { dias: {}, horarios: {} };
    const diasPermitidos = servConfig.dias || {};
    const horariosAtivos = Object.keys(servConfig.horarios || {}).filter(h => servConfig.horarios[h]);
    const totalHorariosServico = horariosAtivos.length;

    const snapAgend = await dbAgenda.ref('agendamentos').orderByChild('servico').equalTo(servicoId).once('value');
    const contagemPorData = {};
    if (snapAgend.exists()) {
        snapAgend.forEach(c => {
            const ag = c.val();
            contagemPorData[ag.data] = (contagemPorData[ag.data] || 0) + 1;
        });
    }

    let buttonsHTML = "";
    const hoje = new Date();

    for (let i = 1; i <= 30; i++) {
        const d = new Date();
        d.setDate(hoje.getDate() + i);

        const diaSemana = d.getDay().toString();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dataISO = `${yyyy}-${mm}-${dd}`;
        const dataExibicao = `${dd}/${mm}`;

        const diaSemanaNome = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];

        const ehFimDeSemana = (diaSemana === "0" || diaSemana === "6");
        const atendeNoDia = !ehFimDeSemana && !!diasPermitidos[diaSemana];
        const ocupados = contagemPorData[dataISO] || 0;
        const estaLotado = totalHorariosServico > 0 && ocupados >= totalHorariosServico;

        const desabilitado = !atendeNoDia || estaLotado || totalHorariosServico === 0;
        let motivo = "";
        if (!atendeNoDia) motivo = "Sem atendimento";
        else if (estaLotado) motivo = "Lotado";

        buttonsHTML += `
            <button type="button" class="date-btn date-btn-${gridContainerId}" 
                data-date="${dataISO}" 
                ${desabilitado ? 'disabled title="' + motivo + '"' : `onclick="selecionarDataGrid('${dataISO}', '${gridContainerId}', '${inputDataId}', '${selectHorarioId}', '${servicoId}')"`}>
                <strong>${diaSemanaNome}</strong>
                <span>${dataExibicao}</span>
                ${desabilitado ? `<small style="font-size:9px;">${motivo}</small>` : ''}
            </button>
        `;
    }

    container.innerHTML = buttonsHTML;
}

function selecionarDataGrid(dataISO, gridContainerId, inputDataId, selectHorarioId, servicoId) {
    document.querySelectorAll(`.date-btn-${gridContainerId}`).forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.date-btn-${gridContainerId}[data-date="${dataISO}"]`);
    if (btn) btn.classList.add('active');

    document.getElementById(inputDataId).value = dataISO;
    buscarHorariosLivres(servicoId, dataISO, selectHorarioId);
}

async function salvarAgendamentoContribuinte() {
    const servico = document.getElementById('novo-agend-servico').value;
    const data = document.getElementById('novo-agend-data').value;
    const horario = document.getElementById('novo-agend-horario').value;
    const processos = document.getElementById('novo-agend-processos').value;

    if(!servico || !data || !horario) return alert("Preencha todos os campos obrigatórios (Serviço, Data e Horário)!");

    const id = Date.now().toString();
    await dbAgenda.ref('agendamentos/' + id).set({
        id, contribuinteId: usuarioLogado.uid, contribuinteNome: usuarioLogado.nome, contribuinteCpf: usuarioLogado.cpf,
        servico, data, horario, processos
    });
    alert("Agendamento Confirmado com sucesso!");
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
// 6. PAINEL SERVIDOR - LISTA DIÁRIA (COM ABA 'TODOS')
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
    if (snap.exists()) {
        snap.forEach(child => { agendamentos.push(child.val()); });
    }
    
    if(agendamentos.length === 0) {
        document.getElementById('tabela-container').innerHTML = "<p>Sem agendamentos para este dia.</p>";
        document.getElementById('tabs-servicos').innerHTML = "";
        return;
    }

    // Ordenar todos os agendamentos por horário
    agendamentos.sort((a, b) => a.horario.localeCompare(b.horario));

    const porServico = {
        'todos': agendamentos // Aba 'Todos' contendo a lista consolidada
    };

    agendamentos.forEach(a => {
        if(!porServico[a.servico]) porServico[a.servico] = [];
        porServico[a.servico].push(a);
    });

    const tabsContainer = document.getElementById('tabs-servicos');
    tabsContainer.innerHTML = "";

    // Aba 'Todos' inserida como primeira opção
    tabsContainer.innerHTML += `<button class="tab active" onclick="mudarAba(this, 'todos')">Todos</button>`;

    // Cria as abas individuais para cada serviço do dia
    Object.keys(porServico).forEach((srvId) => {
        if (srvId === 'todos') return;
        let nomeServico = mapaServicos[srvId] || "Serviço Removido";
        tabsContainer.innerHTML += `<button class="tab" onclick="mudarAba(this, '${srvId}')">${nomeServico}</button>`;
    });

    window.dadosAtuaisTabela = porServico; 
    window.mapaServicosAtual = mapaServicos;
    renderTabelaAba('todos');
}

function mudarAba(btn, servicoId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderTabelaAba(servicoId);
}

async function renderTabelaAba(servicoId) {
    const dados = window.dadosAtuaisTabela[servicoId] || [];
    const container = document.getElementById('tabela-container');
    const ehAbaTodos = (servicoId === 'todos');
    const mapa = window.mapaServicosAtual || {};
    
    let html = `<table><tr><th class="col-horario">Horário</th><th class="col-contribuinte">Contribuinte</th>`;
    if (ehAbaTodos) {
        html += `<th class="col-contribuinte">Serviço</th>`;
    }
    html += `<th class="col-processos">Nº Processos (Expandido)</th></tr>`;

    for(let a of dados) {
        const textoProcessos = await processarListaProcessos(a.processos);
        html += `<tr><td>${a.horario}</td><td>${a.contribuinteNome}</td>`;
        if (ehAbaTodos) {
            html += `<td><strong>${mapa[a.servico] || '--'}</strong></td>`;
        }
        html += `<td>${textoProcessos}</td></tr>`;
    }
    html += `</table>`;
    container.innerHTML = html;
}

// ==========================================
// 7. PAINEL SERVIDOR - CONTRIBUINTES (PESQUISA, CADASTRO, EDIÇÃO, LISTAGEM)
// ==========================================
async function abrirPesquisa() {
    const area = document.getElementById('area-servidor-conteudo');
    area.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:15px; gap:10px;">
            <h3 style="margin:0;">Gestão de Contribuintes</h3>
            <button onclick="abrirModalCadastroContribuinteServidor()" style="background:#48bb78;">+ Cadastrar Novo Contribuinte</button>
        </div>

        <div style="display:flex; gap:10px; margin-bottom: 20px;">
            <input type="text" id="pesq-termo" placeholder="Pesquisar por Nome ou CPF..." oninput="filtrarListaContribuintes()" style="flex:1;">
        </div>

        <div id="container-tabela-contribuintes">Carregando contribuintes...</div>
    `;

    await carregarTodosContribuintes();
}

async function carregarTodosContribuintes() {
    try {
        const snap = await dbAgenda.ref('usuarios').once('value');
        listaContribuintesGlobal = [];

        if (snap.exists()) {
            snap.forEach(child => {
                const u = child.val();
                if (!u.tipo || u.tipo === 'contribuinte') {
                    listaContribuintesGlobal.push({
                        uid: child.key,
                        nome: u.nome || "Sem Nome",
                        cpf: u.cpf || "Sem CPF",
                        telefone: u.telefone || "--"
                    });
                }
            });
        }
        renderTabelaContribuintes(listaContribuintesGlobal);
    } catch (e) {
        document.getElementById('container-tabela-contribuintes').innerHTML = `<p>Erro ao carregar lista: ${e.message}</p>`;
    }
}

function alternarOrdenacaoNome() {
    ordemNomeAscendente = !ordemNomeAscendente;
    filtrarListaContribuintes();
}

function filtrarListaContribuintes() {
    const termo = (document.getElementById('pesq-termo').value || '').trim().toLowerCase();
    const termoNum = termo.replace(/\D/g, '');

    let filtrados = listaContribuintesGlobal.filter(c => {
        const nomeMatch = c.nome.toLowerCase().includes(termo);
        const cpfLimpo = c.cpf ? c.cpf.replace(/\D/g, '') : '';
        const cpfMatch = termoNum ? cpfLimpo.includes(termoNum) : false;
        return nomeMatch || cpfMatch;
    });

    filtrados.sort((a, b) => {
        const comp = a.nome.localeCompare(b.nome);
        return ordemNomeAscendente ? comp : -comp;
    });

    renderTabelaContribuintes(filtrados);
}

function renderTabelaContribuintes(lista) {
    const container = document.getElementById('container-tabela-contribuintes');
    if (!container) return;

    if (lista.length === 0) {
        container.innerHTML = "<p>Nenhum contribuinte encontrado.</p>";
        return;
    }

    const iconeOrdem = ordemNomeAscendente ? "▲ (A-Z)" : "▼ (Z-A)";

    let html = `
        <table>
            <thead>
                <tr>
                    <th style="cursor:pointer;" onclick="alternarOrdenacaoNome()" title="Clique para ordenar">
                        Nome Completo <span style="font-size:12px; color:var(--primary); font-weight:bold;">${iconeOrdem}</span>
                    </th>
                    <th>CPF</th>
                    <th class="col-acoes">Ações</th>
                </tr>
            </thead>
            <tbody>
    `;

    lista.forEach(c => {
        const cNomeEscapado = c.nome.replace(/'/g, "\\'");
        const cCpfEscapado = c.cpf.replace(/'/g, "\\'");
        const cTelEscapado = (c.telefone || '').replace(/'/g, "\\'");

        html += `
            <tr>
                <td><strong>${c.nome}</strong></td>
                <td>${c.cpf}</td>
                <td class="col-acoes">
                    <div class="btn-acoes-contribuinte">
                        <button class="btn-add-agendamento" title="Novo Agendamento" onclick="abrirNovoAgendamentoServidor('${c.uid}', '${cNomeEscapado}', '${cCpfEscapado}')">+</button>
                        <button class="btn-del-agendamento" title="Ver / Excluir Agendamentos" onclick="abrirGerenciarAgendamentosContribuinte('${c.uid}', '${cNomeEscapado}', '${cCpfEscapado}')">-</button>
                        <button class="btn-edit-contribuinte" title="Editar Contribuinte" onclick="abrirModalEditarContribuinte('${c.uid}', '${cNomeEscapado}', '${cCpfEscapado}', '${cTelEscapado}')">✏️</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// ==========================================
// EDIÇÃO DE CONTRIBUINTE
// ==========================================
function abrirModalEditarContribuinte(uid, nome, cpf, telefone) {
    document.getElementById('edit-contrib-uid').value = uid;
    document.getElementById('edit-contrib-cpf-antigo').value = cpf;
    document.getElementById('edit-contrib-nome').value = nome || '';
    document.getElementById('edit-contrib-cpf').value = cpf || '';
    document.getElementById('edit-contrib-telefone').value = telefone === '--' ? '' : telefone;
    document.getElementById('modal-editar-contribuinte').classList.remove('hidden');
}

async function salvarEdicaoContribuinte() {
    const uid = document.getElementById('edit-contrib-uid').value;
    const cpfAntigo = document.getElementById('edit-contrib-cpf-antigo').value.replace(/\D/g, '');
    const nome = document.getElementById('edit-contrib-nome').value.trim();
    const cpf = document.getElementById('edit-contrib-cpf').value.trim();
    const telefone = document.getElementById('edit-contrib-telefone').value.trim();

    if (!nome || !cpf) return alert("Preencha Nome e CPF!");

    const novoCpfLimpo = cpf.replace(/\D/g, '');

    try {
        await dbAgenda.ref('usuarios/' + uid).update({
            nome,
            cpf,
            telefone
        });

        if (cpfAntigo && cpfAntigo !== novoCpfLimpo) {
            const snapCpf = await dbAgenda.ref('cpf_emails/' + cpfAntigo).once('value');
            if (snapCpf.exists()) {
                const emailVinculado = snapCpf.val().email;
                await dbAgenda.ref('cpf_emails/' + novoCpfLimpo).set({ email: emailVinculado });
                await dbAgenda.ref('cpf_emails/' + cpfAntigo).remove();
            }
        }

        const snapAgends = await dbAgenda.ref('agendamentos').orderByChild('contribuinteId').equalTo(uid).once('value');
        if (snapAgends.exists()) {
            const updates = {};
            snapAgends.forEach(child => {
                updates[`agendamentos/${child.key}/contribuinteNome`] = nome;
                updates[`agendamentos/${child.key}/contribuinteCpf`] = cpf;
            });
            await dbAgenda.ref().update(updates);
        }

        alert("Dados do contribuinte atualizados!");
        fecharModal('modal-editar-contribuinte');
        await carregarTodosContribuintes();
    } catch (e) {
        alert("Erro ao atualizar contribuinte: " + e.message);
    }
}

// ==========================================
// GERENCIAMENTO E EDIÇÃO DE AGENDAMENTOS
// ==========================================
async function abrirGerenciarAgendamentosContribuinte(uid, nome, cpf) {
    document.getElementById('modal-gerenciar-agendamentos-contribuinte').classList.remove('hidden');
    document.getElementById('modal-gerenc-nome-display').innerText = `Contribuinte: ${nome} | CPF: ${cpf}`;
    const container = document.getElementById('conteudo-gerenciar-agendamentos');
    container.innerHTML = "Carregando agendamentos...";

    try {
        const hojeISO = obterDataHojeString();
        const snap = await dbAgenda.ref('agendamentos').once('value');
        const snapServicos = await dbAgenda.ref('servicos').once('value');
        const mapaServicos = {};
        if (snapServicos.exists()) snapServicos.forEach(s => { mapaServicos[s.key] = s.val().nome; });

        let agendamentos = [];
        if (snap.exists()) {
            snap.forEach(c => {
                const a = c.val();
                const pertenceAoUsuario = (a.contribuinteCpf && cpf && a.contribuinteCpf.replace(/\D/g,'') === cpf.replace(/\D/g,'')) || a.contribuinteId === uid;
                if (pertenceAoUsuario) {
                    agendamentos.push(a);
                }
            });
        }

        agendamentos.sort((a, b) => {
            const dateA = new Date(`${a.data}T${a.horario}`);
            const dateB = new Date(`${b.data}T${b.horario}`);
            return dateA - dateB;
        });

        if (agendamentos.length === 0) {
            container.innerHTML = "<p>Nenhum agendamento encontrado para este contribuinte.</p>";
            return;
        }

        let html = `
            <table style="margin-top:10px;">
                <thead>
                    <tr>
                        <th>Serviço</th>
                        <th>Data</th>
                        <th>Horário</th>
                        <th>Processos</th>
                        <th style="text-align:center; min-width: 140px;">Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        agendamentos.forEach(a => {
            const dataPtBr = a.data.split('-').reverse().join('/');
            const servNome = mapaServicos[a.servico] || "Serviço Removido";
            const ehFuturoOuHoje = a.data >= hojeISO;
            const procEscapado = (a.processos || '').replace(/'/g, "\\'");
            const nomeEscapado = nome.replace(/'/g, "\\'");
            const cpfEscapado = cpf.replace(/'/g, "\\'");

            html += `
                <tr>
                    <td>${servNome}</td>
                    <td>${dataPtBr}</td>
                    <td>${a.horario}</td>
                    <td><small>${a.processos || 'Nenhum'}</small></td>
                    <td style="text-align:center;">
                        ${ehFuturoOuHoje 
                            ? `<button class="btn-editar-processo" title="Editar Processos" onclick="abrirModalEditarProcessos('${a.id}', '${procEscapado}', '${uid}', '${nomeEscapado}', '${cpfEscapado}')">✏️</button>
                               <button class="btn-excluir-item" title="Excluir" onclick="excluirAgendamentoServidor('${a.id}', '${uid}', '${nomeEscapado}', '${cpfEscapado}')">Excluir</button>` 
                            : `<span style="color:#a0aec0; font-size:12px;">Finalizado</span>`
                        }
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<p>Erro ao carregar agendamentos: ${e.message}</p>`;
    }
}

function abrirModalEditarProcessos(agendamentoId, processosAtuais, uid, nome, cpf) {
    document.getElementById('edit-agend-id').value = agendamentoId;
    document.getElementById('edit-agend-uid').value = uid;
    document.getElementById('edit-agend-nome').value = nome;
    document.getElementById('edit-agend-cpf').value = cpf;
    document.getElementById('edit-agend-processos').value = processosAtuais || '';
    document.getElementById('modal-editar-processos-agendamento').classList.remove('hidden');
}

async function salvarEdicaoProcessos() {
    const agendamentoId = document.getElementById('edit-agend-id').value;
    const uid = document.getElementById('edit-agend-uid').value;
    const nome = document.getElementById('edit-agend-nome').value;
    const cpf = document.getElementById('edit-agend-cpf').value;
    const novosProcessos = document.getElementById('edit-agend-processos').value.trim();

    try {
        await dbAgenda.ref('agendamentos/' + agendamentoId).update({
            processos: novosProcessos
        });
        alert("Processos atualizados com sucesso!");
        fecharModal('modal-editar-processos-agendamento');
        abrirGerenciarAgendamentosContribuinte(uid, nome, cpf);
    } catch (e) {
        alert("Erro ao atualizar processos: " + e.message);
    }
}

async function excluirAgendamentoServidor(agendamentoId, uid, nome, cpf) {
    if (confirm("Tem certeza que deseja excluir este agendamento?")) {
        try {
            await dbAgenda.ref('agendamentos/' + agendamentoId).remove();
            alert("Agendamento excluído com sucesso!");
            abrirGerenciarAgendamentosContribuinte(uid, nome, cpf);
        } catch (e) {
            alert("Erro ao excluir agendamento: " + e.message);
        }
    }
}

function abrirModalCadastroContribuinteServidor() {
    document.getElementById('serv-cad-nome').value = '';
    document.getElementById('serv-cad-cpf').value = '';
    document.getElementById('serv-cad-telefone').value = '';
    document.getElementById('modal-cadastrar-contribuinte-servidor').classList.remove('hidden');
}

async function salvarNovoContribuinteServidor() {
    const nome = document.getElementById('serv-cad-nome').value.trim();
    const cpf = document.getElementById('serv-cad-cpf').value.trim();
    const telefone = document.getElementById('serv-cad-telefone').value.trim();

    if (!nome || !cpf) {
        return alert("Preencha pelo menos o Nome e o CPF!");
    }

    const cpfNumeros = cpf.replace(/\D/g, '');
    const emailGerado = `${cpfNumeros}@agendamento.local`;

    try {
        const uid = "contribuinte_" + Date.now();
        await dbAgenda.ref('usuarios/' + uid).set({
            nome,
            cpf,
            telefone,
            email: emailGerado,
            tipo: 'contribuinte'
        });
        await dbAgenda.ref('cpf_emails/' + cpfNumeros).set({ email: emailGerado });

        alert("Contribuinte cadastrado com sucesso!");
        fecharModal('modal-cadastrar-contribuinte-servidor');
        await carregarTodosContribuintes();
    } catch (e) {
        alert("Erro ao cadastrar contribuinte: " + e.message);
    }
}

async function abrirNovoAgendamentoServidor(uid, nome, cpf) {
    document.getElementById('modal-agendar-servidor').classList.remove('hidden');
    document.getElementById('modal-nas-nome-display').innerText = `Contribuinte: ${nome} | CPF: ${cpf}`;
    document.getElementById('nas-uid').value = uid;
    document.getElementById('nas-nome').value = nome;
    document.getElementById('nas-cpf').value = cpf;
    document.getElementById('nas-processos').value = '';
    document.getElementById('nas-data').value = '';
    document.getElementById('nas-horario').innerHTML = "<option value=''>Selecione uma data acima</option>";
    document.getElementById('nas-info-dias').innerText = '';

    const snap = await dbAgenda.ref('servicos').once('value');
    let selectHTML = `<select id="nas-servico" onchange="atualizarDiasNas()"><option value="">Selecione um Serviço...</option>`;
    if (snap.exists()) snap.forEach(child => { selectHTML += `<option value="${child.key}">${child.val().nome}</option>`; });
    selectHTML += `</select>`;
    document.getElementById('nas-servico-container').innerHTML = selectHTML;

    document.getElementById('nas-datas-grid').innerHTML = `<p style="color:#666; font-size:13px;">Selecione um serviço primeiro.</p>`;
}

async function atualizarDiasNas() {
    const sId = document.getElementById('nas-servico').value;
    const info = document.getElementById('nas-info-dias');
    const grid = document.getElementById('nas-datas-grid');
    document.getElementById('nas-data').value = '';
    document.getElementById('nas-horario').innerHTML = "<option value=''>Selecione uma data acima</option>";

    if(!sId) { 
        info.innerText = ""; 
        grid.innerHTML = `<p style="color:#666; font-size:13px;">Selecione um serviço primeiro.</p>`;
        return; 
    }

    const snap = await dbAgenda.ref('servicos/' + sId + '/config/dias').once('value');
    const configDias = snap.val() || {};
    
    const ativos = Object.keys(configDias).filter(k => configDias[k]).map(k => diasNomes[k]);
    info.innerText = ativos.length ? "Dias de atendimento: " + ativos.join(', ') : "Serviço sem dias configurados.";

    await gerarGridDatasDisponiveis(sId, 'nas-datas-grid', 'nas-data', 'nas-horario');
}

async function salvarAgendamentoNas() {
    const servico = document.getElementById('nas-servico').value;
    const data = document.getElementById('nas-data').value;
    const horario = document.getElementById('nas-horario').value;
    const processos = document.getElementById('nas-processos').value;

    if(!servico || !data || !horario) return alert("Preencha todos os campos obrigatórios (Serviço, Data e Horário)!");

    const id = Date.now().toString();
    await dbAgenda.ref('agendamentos/' + id).set({
        id, 
        contribuinteId: document.getElementById('nas-uid').value,
        contribuinteNome: document.getElementById('nas-nome').value,
        contribuinteCpf: document.getElementById('nas-cpf').value,
        servico, 
        data, 
        horario, 
        processos
    });

    alert("Agendamento Confirmado com sucesso!");
    fecharModal('modal-agendar-servidor');
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
                
                // Exibe: Horário - Contribuinte (Serviço)
                coluna.innerHTML += `
                    <div class="horario-slot agendado" onclick="abrirDetalhesCalendario('${a.id}', '${srvNome}')">
                        <strong>${a.horario}</strong> - ${primeiroNome} <span style="font-size:11px; opacity:0.85;">(${srvNome})</span>
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