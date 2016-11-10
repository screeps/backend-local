var common = require('@screeps/common'),
    config = common.configManager.config;

Object.assign(config.cli, {
    greeting: 'Screeps server {build} running on port 21025.\r\nThis CLI interface contains a virtual JavaScript machine which you can use to invoke internal server commands. Any valid JavaScript code is allowed. Type "help()" to learn more about commands.\r\n',
    connectionListener(socket) {

        var connectionDesc = `${socket.remoteAddress}:${socket.remotePort}`;

        console.log(`[${connectionDesc}] Incoming CLI connection`);

        socket.on('error', error => console.log(`[${connectionDesc}] CLI connection reset`));
        socket.on('end', () => console.log(`[${connectionDesc}] CLI connection closed`));

        var runCliCommand = cliSandbox.create((data, isResult) => {
            if(data === 'undefined') {
                if(isResult) {
                    socket.write("< ", 'utf8');
                }
                return;
            }
            socket.write((isResult ? "< " : "") + data + "\r\n", 'utf8');
        });

        var buildString = '';
        try {
            buildString = `v${require('screeps').version} `;
        }
        catch(e) {}

        socket.write(config.cli.greeting.replace('{build} ', buildString) + '< \r\n');

        const rl = readline.createInterface({
            input: socket,
            output: socket
        });

        rl.on('line', line => runCliCommand(line));
    }
});

var cliSandbox = require('./sandbox'),
    q = require('q'),
    _ = require('lodash'),
    net = require('net'),
    readline = require('readline');

function startServer() {

    if (!process.env.CLI_PORT) {
        throw new Error('CLI_PORT environment variable is not set!');
    }
    if (!process.env.CLI_HOST) {
        throw new Error('CLI_HOST environment variable is not set!');
    }

    console.log(`Starting CLI server`);

    var server = net.createServer(config.cli.connectionListener);

    server.on('listening', () => console.log(`CLI listening on ${process.env.CLI_HOST}:${process.env.CLI_PORT}`));

    server.listen(process.env.CLI_PORT, process.env.CLI_HOST);

    return server;
}

exports.startServer = startServer;