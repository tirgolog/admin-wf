const mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host: '13.201.8.48',
        user: 'root',
        password: 'tirgO@01',
        database: 'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
    });

module.exports.connection = connection;
