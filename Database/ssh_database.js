const mysql = require('mysql2');
const { Client } = require('ssh2');
const sshClient = new Client();
const dbServer = {
        connectionLimit: 100,
        host:'127.0.0.1',
        user:'tirgo',
        password:'tirgo2020password',
        database:'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
        charset : 'utf8mb4',
}
const tunnelConfig = {
        host: '185.183.242.149',
        port: 22,
        username: 'root',
        password: '5gdcD2jxhfvK'
}
const forwardConfig = {
    srcHost: '127.0.0.1',
    srcPort: 3306,
    dstHost: dbServer.host,
    dstPort: dbServer.port
};

const SSHConnection = new Promise((resolve, reject) => {
    sshClient.on('ready', () => {
        sshClient.forwardOut(
            forwardConfig.srcHost,
            forwardConfig.srcPort,
            forwardConfig.dstHost,
            forwardConfig.dstPort,
            (err, stream) => {
                if (err) reject(err);
                const updatedDbServer = {
                    ...dbServer,
                    stream
                };
                const connection =  mysql.createConnection(updatedDbServer);
                connection.connect((error) => {
                    if (error) {
                        reject(error);
                    }
                    resolve(connection.promise())
                });
            });
    }).connect(tunnelConfig);
});
module.exports.connection = SSHConnection;

/*const tunnelConfig = {
        host: '185.183.242.149',
        port: 22,
        username: 'root',
        password: '5gdcD2jxhfvK'
}

const mysql = require('mysql2/promise'),
      connection = mysql.createPool({
        connectionLimit: 100,
        host:'127.0.0.1',
        user:'tirgo',
        password:'tirgo2020password',
        database:'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
        charset : 'utf8mb4',
});*/
