const net = require('net');
const readline = require('readline');
const usrRl = readline.createInterface(process.stdin, process.stdout);
const appId = new require('uuid/v1')();
const events = require('events');
const chalk = require('chalk');
const log = console.log;


// RegEx pra detectar o padrão de comandos: /comando arg1 arg2 ...
const cmdPattern = /^(?:\/|\?)\w+(?:(?:\s.*)|(?:\s*))$/;
// RegEx para remover espaços extras nos comandos
const cmdArgsPattern = /\s\s+/g;
// RegEx para detectar o padrão do comando PVT: @usuario mensagem
const pvtPattern = /@\w+\s.*/;

// Enum de tipo de mensagens que o cliente envia ao servidor
const clientMessageType = {
    login: 200,
    mensagem: 201
};

// Enum de tipo de mensagens que o servidor envia ao cliente
const serverMessageType = {
    resultado: 100,
    listagem: 101
};

// Objeto responsável por gerenciar a linha de comando
const Cli = function (rStream, wStream) {
    this.rl = readline.createInterface(rStream, wStream);
    this.rl.on('line', line => this.parse(line));
    this.client = null;
}

// Função para fazer o parse dos comandos
Cli.prototype.parse = function (line) {
    if (line.trim() == '') {
        log(chalk.red('Nada foi enviado.'));
    } else if (cmdPattern.test(line)) {
        var cmdParts = line.replace(cmdArgsPattern, ' ').split(' ');
        var cmd = this.commands[cmdParts[0].substring(1)];

        if (cmd && line.startsWith('/'))
            cmd.run(this.client, cmdParts.slice(1));
        else if (cmd && line.startsWith('?'))
            log(chalk.purple(cmd.help));
        else
            log(chalk.red('Comando não encontrado.'));
    } else if (pvtPattern.test(line)) {
        var spaceIndex = line.indexOf(' ');
        var target = line.slice(1, spaceIndex);
        var msg = line.slice(spaceIndex + 1, line.length);
        this.client.send(clientMessageType.mensagem, {
            remetente: this.client.user.name,
            destinatario: target,
            texto: msg
        });
    } else {
        log(chalk.green.bgWhite(`Você: ${line}`));
        this.client.send(clientMessageType.mensagem, {
            remetente: this.client.user.name,
            destinatario: 'todos',
            texto: line
        });
    }
}


// Objeto que mantém o mapeamento dos comandos
Cli.prototype.commands = {
    ls: {
        name: 'lista usuários',
        help: 'Lista os usuários online.\nSintaxe: ls [padrao]',
        run: function (client, args) {
            client.users.sort();
            if (args.length == 0) {
                log(chalk.green((`Usuários online:\n\n${client.users.join('\n')}\n\n\n`)));
            } else if (args.length > 0) {
                args[0].toLowerCase();
                log(chalk.green((`Usuários online:\n\n${client.users.filter(u => u.toLowerCase().includes(args[0])).join('\n')}\n\n\n`)));
            }
        }
    },
    q: {
        name: 'Termina sessão',
        help: 'Termina a sessão atual.',
        run: function (client, args) {
            client.close();
        }
    }
};


// Objeto responsável por gerenciar a conexão do cliente ao servidor
const ChatClient = function (port, host, user) {
    this.user = user;
    this.users = [];
    this.host = host;
    this.port = port;
    this.socket = new net.Socket();
    this.rl = readline.createInterface(this.socket);
    this._eventEmitter = new events.EventEmitter();
}

// Permite registrar-se em eventos do cliente
ChatClient.prototype.on = function (evt, handler) {
    this._eventEmitter.on(evt, handler);
}

ChatClient.prototype.close = function () {
    this.rl.close();
    this.socket.destroy();
}

ChatClient.prototype.login = function (callBack) {
    this.socket.connect(this.port, this.host, () => {

        this.send(clientMessageType.login, {
            remetente: this.user.name
        });
        this.rl.on('line', line => this._eventEmitter.emit('response', JSON.parse(line)));
        callBack();
    });

    this.socket.on('error', () => process.exit());
    this.socket.on('close', () => process.exit());
}

ChatClient.prototype.send = function (tipo, body) {
    this.socket.write(content(new mensagem(tipo, body)));
}

// Objeto que representa uma mensagem
const mensagem = function (tipo, conteudo) {
    this.versao = 1;
    this.hora = Math.floor(new Date().getTime());
    this.tipo = tipo;
    this.origem = appId;
    this.conteudo = conteudo;
}

// Função que prepara um objeto javascript para ser enviado
function content(obj) {
    return Buffer.from(JSON.stringify(obj) + '\n');
}


// Inicia a linha de comando
const cli = new Cli(process.stdin, process.stdout);
log(chalk.bgGreen('Bem vindo ao chat!'));

cli.rl.question('Como deseja ser conhecido?', (line) => {
    var user = {
        name: line
    };

    // Inicia a conexão com o servidor
    var client = new ChatClient(9000, '127.0.0.1', user);

    // Define o que acontece após o login
    client.login(() => {
        cli.client = client; // indica conexao a CLI

        // Trata as respostas do servidor.
        client.on('response', (res) => {
            // Redesign: em vez de response generico cada case pode virar um evento
            switch (res.tipo) {
                case serverMessageType.resultado:
                    log(chalk.blue(res.conteudo.mensagem));
                    break;
                case serverMessageType.listagem:
                    // Considerar mover para dentro do client
                    if (res.conteudo.registrados) {
                        client.users = res.conteudo.registrados;
                    } else if (res.conteudo.entraram) {
                        res.conteudo.entraram.forEach(u => client.users.push(u));
                    } else if (res.conteudo.sairam)
                        res.conteudo.sairam.forEach(u => {
                            var index = client.users.indexOf(u);
                            client.users.splice(index, index + 1);
                        });
                    break;
                case clientMessageType.mensagem:
                    var msg = `${res.conteudo.remetente}: ${res.conteudo.texto}`;

                    if (res.conteudo.destinatario != 'todos')
                        msg = '(PVT) ' + msg;

                    log(chalk.green.gbWhite(msg));
                    break;
            }
        });
    });
});