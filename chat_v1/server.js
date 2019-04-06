const net = require('net');
const readline = require('readline');
const events = require('events');

// Objeto que representa um usuário e gerencia sua conexão ao servidor
const User = function (id, name, socket, rl) {
    this.id = id;
    this.name = name;
    this.socket = socket;
    this.rl = rl;
    const eventEmitter = this._eventEmitter = new events.EventEmitter();

    // Lê uma linha recebida e converte para json
    this.rl.on('line', line => eventEmitter.emit('request', JSON.parse(line)));
}

// Eventos do servidor
User.prototype.on = function (evt, handler) {
    this._eventEmitter.on(evt, handler)
}

User.prototype.sendMessage = function (msg) {
    // Todo: Verificar se todos os bytes foram enviados, se necessário.
    return this.socket.write(content(msg));
}

// Envia o resultado do servidor, de acordo com a especificação
User.prototype.sendResult = function (res, msg) {
    this.sendMessage(new mensagem(100, {
        resultado: res,
        mensagem: msg
    }));
}

// Envia um resultado e fecha a conexão com aquele usuário
User.prototype.sendFinalResult = function (msg) {
    this.sendResult(1, msg);
    this.close();
}

User.prototype.close = function () {
    this.socket.destroy();
}


// Objeto que gerencia o servidor de modo geral (poder sobre todos os usuários)
const chatServer = function () {
    var users = this.users = {};
    var eventEmitter = this._eventEmitter = new events.EventEmitter();

    var sockServer = this.sockServer = net.createServer(function (socket) {
        const rl = readline.createInterface(socket);

        // A primeira interação cliente/servidor deve ser o login
        rl.once('line', line => {
            const res = JSON.parse(line);
            const user = new User(res.id, res.conteudo.remetente, socket, rl);

            if (res.tipo != 200) {
                user.sendFinalResult('Você tentou realizar uma operação sem estar logado.');
            }
            if (users[user.name] != undefined) {
                user.sendFinalResult('Já há uma pessoa no chat com este nome. Tente outro.');
            } else {
                socket.on('error', (err) => {
                    delete users[user.name];
                    eventEmitter.emit('disconnect', user);
                });
                socket.on('close', () => {
                    delete users[user.name];
                    eventEmitter.emit('disconnect', user);
                });

                users[user.name] = user;
                eventEmitter.emit('login', user);
            }
        });
    });
}

chatServer.prototype.listen = function (port, address) {
    this.sockServer.listen(port, address);
}

chatServer.prototype.on = function (evt, handler) {
    this._eventEmitter.on(evt, handler)
}

// Envia uma mensagem para todos os usuários
chatServer.prototype.sendAll = function (user, msg) {
    var keys = Object.keys(this.users)

    if (user != null || user != undefined)
        keys = keys.filter(k => k != user.name);

    keys.forEach(k => {
        var usr = this.users[k];

        if (usr)
            usr.sendMessage(msg);
    });
}

// Envia uma mensagem para um usuário
chatServer.prototype.sendTo = function (userName, msg) {
    var usr = this.users[userName];

    if (usr) {
        usr.sendMessage(msg);
        return true;
    }

    return false;
}

// Função que prepara um objeto javascript para ser enviado
function content(obj) {
    return Buffer.from(JSON.stringify(obj) + '\n');
}

// Objeto que representa uma mensagem
const mensagem = function (tipo, conteudo) {
    this.versao = 1;
    this.hora = Math.floor(new Date().getTime());
    this.tipo = tipo;
    this.conteudo = conteudo;
}


// Inicia o servidor
const server = new chatServer();

// Define o que acontece no login
server.on('login', user => {
    console.log("Usuário " + user.name + " logado.");
    user.sendResult(0, 'Login efetuado com sucesso.');
    user.sendMessage(new mensagem(101, {
        registrados: Object.keys(server.users)
    }));
    server.sendAll(user, new mensagem(101, {
        entraram: [user.name]
    }));

    user.on('request', req => {
        switch (req.tipo) {
            case 201:
                if (req.conteudo.destinatario == 'todos')
                    server.sendAll(user, req);
                else
                if (!server.sendTo(req.conteudo.destinatario, req))
                    user.sendResult(1, `Usuário ${req.conteudo.destinatario} não encontrado.`);
                break;
        }
    });
});

server.on('disconnect', user => {
    server.sendAll(user, new mensagem(101, {
        sairam: [user.name]
    }));
});

server.listen(9000, '0.0.0.0');