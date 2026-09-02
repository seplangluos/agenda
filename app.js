// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCnueIIkh8laJeLQk2MFt7_gGr7nnrspDA",
    authDomain: "bolao-dcu.firebaseapp.com",
    databaseURL: "https://bolao-dcu-default-rtdb.firebaseio.com",
    projectId: "bolao-dcu",
    storageBucket: "bolao-dcu.firebasestorage.app",
    messagingSenderId: "197456080385",
    appId: "1:197456080385:web:97157a0dd98e353d985a00"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

let usuarioLogado = null;
let perfilUsuario = null; // 'servidor' | 'contribuinte'

// MAPEAMENTO PADRÃO DE DIAS E HORÁRIOS
const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const HORARIOS_PADRAO = [
    '12:00', '12:20', '12:40',
    '13:00', '13:20', '13:40',
    '14:00', '14:20', '14:40',
    '15:00', '15:20', '15:40',
    '16:00', '16:20', '16:40'
];

// NAVEGAÇÃO
function nav(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
}

function fecharModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function getHojeFormatado() {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(dataIso) {
    if (!dataIso) return '';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

// AUTENTICAÇÃO
function loginServidor() {
    const email = document.getElementById('login-servidor-nome').value;
    const pass = document.getElementById('login-servidor-senha').value;

    if (!pass) {
        alert('Informe a senha.');
        return;
    }

    auth.signInWithEmailAndPassword(email, pass)
        .then(cred => {
            usuarioLogado = cred.user;
            perfilUsuario = 'servidor';
            nav('screen-dash-servidor');
            carregarListaDiaria();
        })
        .catch(err => alert('Erro de autenticação: ' + err.message));
}

function loginContribuinte() {
    const cpf = document.getElementById('login-cpf').value.replace(/\D/g, '');
    const pass = document.getElementById('login-senha').value;

    if (!cpf || !pass) {
        alert('Preencha CPF e Senha.');
        return;
    }

    db.ref('contribuintes').orderByChild('cpf').equalTo(cpf).once('value', snapshot => {
        if (!snapshot.exists()) {
            alert('Contribuinte não encontrado.');
            return;
        }
        let email = '';
        snapshot.forEach(c => { email = c.val().email; });

        auth.signInWithEmailAndPassword(email, pass)
            .then(cred => {
                usuarioLogado = cred.user;
                perfilUsuario = 'contribuinte';
                nav('screen-dash-contribuinte');
            })
            .catch(err => alert('Erro de login: ' + err.message));
    });
}

function cadastrarContribuinte() {
    const nome = document.getElementById('cad-nome').value.trim();
    const cpf = document.getElementById('cad-cpf').value.replace(/\D/g, '');
    const tel = document.getElementById('cad-telefone').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const pass = document.getElementById('cad-senha').value;

    if (!nome || !cpf || !email || !pass) {
        alert('Preencha os campos obrigatórios.');
        return;
    }

    auth.createUserWithEmailAndPassword(email, pass)
        .then(cred => {
            return db.ref('contribuintes/' + cred.user.uid).set({
                nome, cpf, telefone: tel, email
            });
        })
        .then(() => {
            alert('Cadastro efetuado com sucesso!');
            nav('screen-login-contribuinte');
        })
        .catch(err => alert('Erro ao cadastrar: ' + err.message));
}

function logout() {
    auth.signOut().then(() => {
        usuarioLogado = null;
        perfilUsuario = null;
        nav('screen-home');
    });
}

// ROTINA: LISTA DIÁRIA EM ABAS (VISUALIZAÇÃO EM TELA INTACTA)
function carregarListaDiaria() {
    const area = document.getElementById('area-servidor-conteudo');
    const dataHoje = getHojeFormatado();

    area.innerHTML = `<h3>Lista Diária de Atendimentos (${formatarDataBR(dataHoje)})</h3><p>Carregando serviços...</p>`;

    db.ref('servicos').once('value', sSnap => {
        const servicos = sSnap.val() || {};
        const chavesServicos = Object.keys(servicos);

        if (!chavesServicos.length) {
            area.innerHTML = `<p>Nenhum serviço configurado.</p>`;
            return;
        }

        db.ref('agendamentos').orderByChild('data').equalTo(dataHoje).once('value', aSnap => {
            const agendamentos = aSnap.val() || {};

            let tabsHtml = '<div class="tabs">';
            let tabsConteudo = '';

            chavesServicos.forEach((servKey, index) => {
                const serv = servicos[servKey];
                const activeClass = index === 0 ? 'active' : '';

                tabsHtml += `<button class="tab ${activeClass}" onclick="alternarAbaServico(event, 'tab-${servKey}')">${serv.nome}</button>`;

                // Filtrar agendamentos desse serviço
                const agendadosServico = [];
                Object.entries(agendamentos).forEach(([id, ag]) => {
                    if (ag.servicoId === servKey || ag.servicoNome === serv.nome) {
                        agendadosServico.push({ id, ...ag });
                    }
                });

                agendadosServico.sort((a, b) => (a.horario > b.horario) ? 1 : -1);

                tabsConteudo += `
                    <div id="tab-${servKey}" class="tab-content ${index === 0 ? '' : 'hidden'}">
                        <table>
                            <thead>
                                <tr>
                                    <th class="col-horario">Horário</th>
                                    <th class="col-contribuinte">Contribuinte</th>
                                    <th class="col-processos">Processos Analisados</th>
                                    <th class="col-acoes">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${gerarLinhasTabela(agendadosServico, servKey, serv.nome, true)}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            tabsHtml += '</div>';
            area.innerHTML = `<h3>Lista Diária de Atendimentos (${formatarDataBR(dataHoje)})</h3>` + tabsHtml + tabsConteudo;
        });
    });
}

function alternarAbaServico(evt, tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    evt.currentTarget.classList.add('active');
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');
}

// ROTINA: RELATÓRIO GERAL CORRIDO PARA IMPRESSÃO EM PAISAGEM
function gerarRelatorioGeralImpressao() {
    const area = document.getElementById('area-servidor-conteudo');
    const dataHoje = getHojeFormatado();
    const dataHojeFormatada = formatarDataBR(dataHoje);

    area.innerHTML = `<p>Gerando relatório geral para impressão...</p>`;

    db.ref('servicos').once('value', sSnap => {
        const servicos = sSnap.val() || {};
        const chavesServicos = Object.keys(servicos);

        if (!chavesServicos.length) {
            area.innerHTML = `<p>Nenhum serviço disponível.</p>`;
            return;
        }

        db.ref('agendamentos').orderByChild('data').equalTo(dataHoje).once('value', aSnap => {
            const agendamentos = aSnap.val() || {};

            let relatorioHtml = `
                <div style="margin-bottom: 20px;" class="no-print">
                    <button onclick="window.print()" style="background: #38a169; font-weight: bold; padding: 10px 20px;">Confirmar Impressão</button>
                    <button onclick="carregarListaDiaria()" class="btn-secondary" style="margin-left: 10px;">Voltar à Visualização</button>
                </div>
                <div id="print-zone">
            `;

            chavesServicos.forEach(servKey => {
                const serv = servicos[servKey];
                const agendadosServico = [];

                Object.entries(agendamentos).forEach(([id, ag]) => {
                    if (ag.servicoId === servKey || ag.servicoNome === serv.nome) {
                        agendadosServico.push({ id, ...ag });
                    }
                });

                agendadosServico.sort((a, b) => (a.horario > b.horario) ? 1 : -1);

                relatorioHtml += `
                    <div class="print-service-block">
                        <div class="print-header">
                            <h3>${serv.nome}</h3>
                            <span>Data: ${dataHojeFormatada}</span>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 12%;">Horário</th>
                                    <th style="width: 28%;">Contribuinte</th>
                                    <th style="width: 60%;">Processo(s)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${gerarLinhasTabela(agendadosServico, servKey, serv.nome, false)}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            relatorioHtml += `</div>`;
            area.innerHTML = relatorioHtml;

            // Dispara a caixa de diálogo de impressão nativa
            setTimeout(() => {
                window.print();
            }, 300);
        });
    });
}

function gerarLinhasTabela(agendamentos, servKey, servNome, exibirAcoes) {
    if (!agendamentos.length) {
        const colspan = exibirAcoes ? 4 : 3;
        return `<tr><td colspan="${colspan}" style="text-align:center; color:#888;">Nenhum agendamento para hoje neste serviço.</td></tr>`;
    }

    return agendamentos.map(ag => {
        let acoesHtml = '';
        if (exibirAcoes) {
            acoesHtml = `
                <td class="col-acoes">
                    <button class="btn-editar-processo" onclick="abrirEditarProcesso('${ag.id}', '${ag.processos || ''}')">Editar</button>
                </td>
            `;
        }

        return `
            <tr>
                <td class="col-horario"><strong>${ag.horario}</strong></td>
                <td class="col-contribuinte">${ag.contribuinteNome || 'Não informado'}</td>
                <td class="col-processos">${ag.processos || 'Nenhum processo informado'}</td>
                ${acoesHtml}
            </tr>
        `;
    }).join('');
}

// EDIÇÃO DE PROCESSOS PELO SERVIDOR
function abrirEditarProcesso(agendamentoId, processosAtuais) {
    document.getElementById('edit-agend-id').value = agendamentoId;
    document.getElementById('edit-agend-processos').value = processosAtuais;
    document.getElementById('modal-editar-processos-agendamento').classList.remove('hidden');
}

function salvarEdicaoProcessos() {
    const id = document.getElementById('edit-agend-id').value;
    const novosProcessos = document.getElementById('edit-agend-processos').value.trim();

    db.ref('agendamentos/' + id).update({
        processos: novosProcessos
    }).then(() => {
        fecharModal('modal-editar-processos-agendamento');
        carregarListaDiaria();
    }).catch(err => alert('Erro ao salvar: ' + err.message));
}

// GESTÃO DE SERVIÇOS
function abrirCadastroServicos() {
    const area = document.getElementById('area-servidor-conteudo');
    area.innerHTML = `
        <h3>Serviços Cadastrados</h3>
        <ul id="lista-servicos-admin" class="lista-servicos">Carregando...</ul>
    `;

    db.ref('servicos').on('value', snap => {
        const servicos = snap.val() || {};
        const lista = document.getElementById('lista-servicos-admin');
        if (!lista) return;

        if (!Object.keys(servicos).length) {
            // Inicializar com padrões caso o banco esteja vazio
            db.ref('servicos').push({ nome: 'IPTU / Imobiliário', dias: [1, 2, 3, 4, 5], horarios: HORARIOS_PADRAO });
            db.ref('servicos').push({ nome: 'ISSQN / Tributário', dias: [1, 2, 3, 4, 5], horarios: HORARIOS_PADRAO });
            db.ref('servicos').push({ nome: 'Fiscalização / Obras', dias: [1, 2, 3, 4, 5], horarios: HORARIOS_PADRAO });
            return;
        }

        lista.innerHTML = Object.entries(servicos).map(([k, s]) => `
            <li>
                <strong>${s.nome}</strong>
                <button class="btn-editar" onclick="configurarServicoModal('${k}', '${s.nome}')">Configurar Dias e Horas</button>
            </li>
        `).join('');
    });
}

function configurarServicoModal(id, nome) {
    document.getElementById('modal-servico-id').value = id;
    document.getElementById('modal-servico-titulo').innerText = 'Configurar: ' + nome;

    db.ref('servicos/' + id).once('value', snap => {
        const serv = snap.val() || {};
        const diasSelecionados = serv.dias || [];
        const horariosSelecionados = serv.horarios || [];

        const diasContainer = document.getElementById('modal-dias-container');
        diasContainer.innerHTML = DIAS_SEMANA.map((dia, idx) => `
            <label class="checkbox-item">
                <input type="checkbox" class="cfg-dia" value="${idx}" ${diasSelecionados.includes(idx) ? 'checked' : ''}>
                ${dia}
            </label>
        `).join('');

        const horasContainer = document.getElementById('modal-horarios-container');
        horasContainer.innerHTML = HORARIOS_PADRAO.map(h => `
            <label class="checkbox-item">
                <input type="checkbox" class="cfg-hora" value="${h}" ${horariosSelecionados.includes(h) ? 'checked' : ''}>
                ${h}
            </label>
        `).join('');

        document.getElementById('modal-editar-servico').classList.remove('hidden');
    });
}

function salvarConfigServico() {
    const id = document.getElementById('modal-servico-id').value;
    const dias = Array.from(document.querySelectorAll('.cfg-dia:checked')).map(el => parseInt(el.value));
    const horarios = Array.from(document.querySelectorAll('.cfg-hora:checked')).map(el => el.value);

    db.ref('servicos/' + id).update({ dias, horarios })
        .then(() => {
            alert('Configurações do serviço atualizadas.');
            fecharModal('modal-editar-servico');
        })
        .catch(err => alert('Erro: ' + err.message));
}

// PESQUISA E GESTÃO DE CONTRIBUINTES
function abrirPesquisa() {
    const area = document.getElementById('area-servidor-conteudo');
    area.innerHTML = `
        <h3>Pesquisa de Contribuintes</h3>
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <input type="text" id="busca-contribuinte-termo" placeholder="Digite Nome ou CPF...">
            <button onclick="buscarContribuintes()">Buscar</button>
            <button onclick="document.getElementById('modal-cadastrar-contribuinte-servidor').classList.remove('hidden')" style="background:#38a169;">+ Novo Contribuinte</button>
        </div>
        <div id="resultado-busca-contribuintes"></div>
    `;
}

function buscarContribuintes() {
    const termo = document.getElementById('busca-contribuinte-termo').value.toLowerCase().trim();
    const painel = document.getElementById('resultado-busca-contribuintes');

    db.ref('contribuintes').once('value', snap => {
        const dados = snap.val() || {};
        const filtrados = Object.entries(dados).filter(([, c]) => {
            return (c.nome && c.nome.toLowerCase().includes(termo)) || (c.cpf && c.cpf.includes(termo));
        });

        if (!filtrados.length) {
            painel.innerHTML = '<p>Nenhum contribuinte localizado.</p>';
            return;
        }

        painel.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>CPF</th>
                        <th>Telefone</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtrados.map(([uid, c]) => `
                        <tr>
                            <td>${c.nome}</td>
                            <td>${c.cpf}</td>
                            <td>${c.telefone || '-'}</td>
                            <td>
                                <button class="btn-editar-processo" onclick="prepararAgendamentoServidor('${uid}', '${c.nome}', '${c.cpf}')">Agendar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    });
}

function salvarNovoContribuinteServidor() {
    const nome = document.getElementById('serv-cad-nome').value.trim();
    const cpf = document.getElementById('serv-cad-cpf').value.replace(/\D/g, '');
    const tel = document.getElementById('serv-cad-telefone').value.trim();

    if (!nome || !cpf) {
        alert('Nome e CPF são obrigatórios.');
        return;
    }

    const ref = db.ref('contribuintes').push();
    ref.set({ nome, cpf, telefone: tel })
        .then(() => {
            alert('Contribuinte cadastrado com sucesso!');
            fecharModal('modal-cadastrar-contribuinte-servidor');
            abrirPesquisa();
        })
        .catch(err => alert('Erro: ' + err.message));
}

function prepararAgendamentoServidor(uid, nome, cpf) {
    document.getElementById('nas-uid').value = uid;
    document.getElementById('nas-nome').value = nome;
    document.getElementById('nas-cpf').value = cpf;
    document.getElementById('modal-nas-nome-display').innerText = `Agendando para: ${nome} (CPF: ${cpf})`;

    db.ref('servicos').once('value', snap => {
        const servicos = snap.val() || {};
        const container = document.getElementById('nas-servico-container');
        let options = '<option value="">-- Selecione o Serviço --</option>';

        Object.entries(servicos).forEach(([k, s]) => {
            options += `<option value="${k}">${s.nome}</option>`;
        });

        container.innerHTML = `<select id="nas-servico-select" onchange="carregarDatasDisponiveisServidor(this.value)">${options}</select>`;
        document.getElementById('modal-agendar-servidor').classList.remove('hidden');
    });
}

function carregarDatasDisponiveisServidor(servicoId) {
    if (!servicoId) return;

    db.ref('servicos/' + servicoId).once('value', snap => {
        const serv = snap.val() || {};
        const grid = document.getElementById('nas-datas-grid');
        grid.innerHTML = '';

        const hoje = new Date();
        for (let i = 0; i < 15; i++) {
            const dataAtual = new Date();
            dataAtual.setDate(hoje.getDate() + i);

            const diaSemana = dataAtual.getDay();
            const dataIso = dataAtual.toISOString().split('T')[0];

            if (serv.dias && serv.dias.includes(diaSemana)) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'date-btn';
                btn.innerHTML = `<span>${formatarDataBR(dataIso)}</span><small>${DIAS_SEMANA[diaSemana].substring(0, 3)}</small>`;
                btn.onclick = () => {
                    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    document.getElementById('nas-data').value = dataIso;
                    carregarHorariosDisponiveis(servicoId, dataIso);
                };
                grid.appendChild(btn);
            }
        }
    });
}

function carregarHorariosDisponiveis(servicoId, dataIso) {
    const select = document.getElementById('nas-horario');
    select.innerHTML = '<option value="">Carregando horários...</option>';

    db.ref('servicos/' + servicoId).once('value', sSnap => {
        const serv = sSnap.val() || {};
        const horariosConfig = serv.horarios || HORARIOS_PADRAO;

        db.ref('agendamentos').orderByChild('data').equalTo(dataIso).once('value', aSnap => {
            const agendamentos = aSnap.val() || {};
            const horariosOcupados = [];

            Object.values(agendamentos).forEach(ag => {
                if (ag.servicoId === servicoId) horariosOcupados.push(ag.horario);
            });

            select.innerHTML = '<option value="">Selecione um horário</option>';
            horariosConfig.forEach(h => {
                if (!horariosOcupados.includes(h)) {
                    select.innerHTML += `<option value="${h}">${h}</option>`;
                }
            });
        });
    });
}

function salvarAgendamentoNas() {
    const uid = document.getElementById('nas-uid').value;
    const nome = document.getElementById('nas-nome').value;
    const cpf = document.getElementById('nas-cpf').value;
    const servicoSelect = document.getElementById('nas-servico-select');
    const servicoId = servicoSelect.value;
    const servicoNome = servicoSelect.options[servicoSelect.selectedIndex].text;
    const data = document.getElementById('nas-data').value;
    const horario = document.getElementById('nas-horario').value;
    const processos = document.getElementById('nas-processos').value.trim();

    if (!servicoId || !data || !horario) {
        alert('Preencha o serviço, data e horário.');
        return;
    }

    db.ref('agendamentos').push({
        contribuinteUid: uid,
        contribuinteNome: nome,
        contribuinteCpf: cpf,
        servicoId,
        servicoNome,
        data,
        horario,
        processos,
        criadoEm: new Date().toISOString()
    }).then(() => {
        alert('Agendamento registrado com sucesso!');
        fecharModal('modal-agendar-servidor');
        carregarListaDiaria();
    }).catch(err => alert('Erro ao agendar: ' + err.message));
}

// CALENDÁRIO
function abrirCalendario() {
    const area = document.getElementById('area-servidor-conteudo');
    area.innerHTML = `<h3>Calendário Semanal</h3><p>Selecione um serviço para acompanhar a ocupação semanal.</p>`;
}