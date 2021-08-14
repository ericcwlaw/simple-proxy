const Shell = require('child_process');
const DateFormat = require('moment');
const Net = require('net');
const Crypto = require('crypto');
const Path = require('path');
const Fs = require('fs');
const NumberFormat = new Intl.NumberFormat();

const APP_NAME = 'Simple Proxy v1.0.0';
const TIMESTAMP = 'YYYY-MM-DD HH:mm:ss.SSS';
const ZEROES = '000000';
const instanceId = (ZEROES + Crypto.randomBytes(4).readUIntBE(0, 4) % 10000).slice(-4);

const consoleLog = (message) => {
    console.log(DateFormat().format(TIMESTAMP)+' ['+instanceId+'] '+message);
};

async function portReady(host, port) {
    return new Promise((resolve, reject) => {
        const client = Net.createConnection({ port: port, host: host }, () => {
            client.end();
            resolve(true);
        });
        client.on('error', function(err) {
            client.end();
            resolve(false);
        });
    });
};

async function getVmIpAddress(command, key, index) {
    return new Promise((resolve, reject) => {
        Shell.exec(command, (error, stdout, stderr) => {
            if (error) {
                consoleLog(error.message.split('\n')[0]);
            } 
            if (stdout) {
                var ip = stdout.split('\n').filter(v => v.toString().trim().startsWith(key+' '))[0].trim().split(' ').filter(v => v.length > 0)[index];
                resolve([true, ip]);
            } else {
                resolve([false, stderr.split('\n')[0]]);
            }
        });
    });
}

const isAuthorized = (remoteIp, authorized) => {
    if (authorized.includes(remoteIp)) {
        return true;
    }
    for (i in authorized) {
        const s = authorized[i];
        if (s.endsWith('.*')) {
            const prefix = s.substring(0, s.lastIndexOf('.'));
            if (remoteIp.startsWith(prefix+'.')) {
                return true;
            }
        }
    }
    return false;
}

const forwardPort = (sourcePort, ip, targetPort, authorized) => {
    const connections = new Map();
    // Setup TCP socket server
    const server = new Net.Server();
    server.listen(sourcePort, '0.0.0.0', () => {
        consoleLog('Forwarding port-'+sourcePort+' to '+ip+':'+targetPort);
    });
    // Graceful shutdown
    const gracefulShutdown = () => {
        for (const k of connections.keys()) {
            consoleLog('Stopping '+k);
            connections.get(k).end();
        }
        server.close(() => {
            consoleLog('Proxy service stopped');
        });
    };
    process.on('SIGTERM', () => {
        consoleLog('Kill signal detected');
        gracefulShutdown();
    });
    process.on('SIGINT', () => {
        consoleLog('Control-C detected');
        gracefulShutdown();
    });
    // Start TCP socket server
    server.on('connection', (socket) => {
        // check remote address
        const remoteIp = socket.remoteAddress;
        if (!isAuthorized(remoteIp, authorized)) {
            consoleLog("Unknown caller "+remoteIp+" connection to "+targetPort+" rejected");
            socket.end();
            return;
        }
        var normal = true;
        const sessionId = (ZEROES + Crypto.randomBytes(4).readUIntBE(0, 4) % 1000000).slice(-6);
        const client = Net.createConnection({ port: targetPort, host: ip }, () => {
            connections.set(sessionId, client);
            consoleLog( 'Session ' + sessionId + ', port-' + targetPort + ' connected to ' + socket.remoteAddress + 
                        ' sessions=' + connections.size );
        });
        socket.on('data', (data) => {
            if (normal) client.write(data);
        });
        socket.once('end', () => {
            consoleLog('Session '+sessionId+' closed by '+socket.remoteAddress);
            client.end();
        });
        client.on('data', (data) => {
            if (normal) socket.write(data);
        });
        client.once('end', () => {
            socket.end();
            connections.delete(sessionId);
            consoleLog( 'Session '+sessionId+ ', port-' + targetPort + ' disconnected from ' + socket.remoteAddress +
                        ' rx=' + NumberFormat.format(socket.bytesRead) +
                        ' tx=' + NumberFormat.format(socket.bytesWritten) + ' sessions='+connections.size );
        });
        // Socket exceptions - most likely to be read timeout or connection reset
        socket.on('error', (err) => {
            normal = false;
            client.end();
            socket.end();
            if ('ECONNRESET' == err.code) {
                // normal case when user is using Windows
                consoleLog('Session '+sessionId+' closed by '+socket.remoteAddress);
            } else {
                consoleLog('Exception ('+socket.remoteAddress+') - '+err.code);
            }
        });
        client.on('error', (err) => {
            normal = false;
            socket.end();
            client.end();
            // Caution: the error message may depend on locale and language
            if (err.message.startsWith('connect ETIMEDOUT')) {
                // Let process manager to restart this app
                consoleLog('Stopping application because target does not respond');
                process.exit(1);
            } else {
                consoleLog('Exception ('+ip+') - '+err);
            }
        });
    });
}

async function main() {
    var fileName = Path.resolve(__dirname, 'proxy-config.json');
    consoleLog(APP_NAME);
    consoleLog('Loading config from '+fileName);
    if (Fs.existsSync(fileName)) {
        const fd = Fs.openSync(fileName);
        const text = Fs.readFileSync(fd, 'utf-8');
        Fs.closeSync(fd);
        const json = JSON.parse(text);
        const command = json['discovery']['command'];
        const tag = json['discovery']['tag'];
        const index = json['discovery']['index'];
        const authorized = json['authorized'];
        consoleLog("Authorized users "+JSON.stringify(authorized));
        const source_ports = json['source_ports'];
        const target_ports = json['target_ports'];
        if (command && tag && index && source_ports && target_ports) {
            if (source_ports.length != target_ports.length) {
                consoleLog('Invalid proxy-config.json');
            } else {
                // Obtain dynamic IP address - this assumes we are using multipass and the VM is called "main"
                const [valid, result] = await getVmIpAddress(command, tag, index);
                if (!valid) {
                    consoleLog('Unable to obtain target IP address - '+result);
                } else {
                    for (i in source_ports) {
                        forwardPort(source_ports[i], result, target_ports[i], authorized);
                    }
                }
            }
        } else {
            consoleLog('Invalid proxy-config.json');
        }
    } else {
        consoleLog('Missing proxy-config.json');
    }
}

// start main application
main();
