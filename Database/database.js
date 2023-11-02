const
    mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host:'db4free.net.',
        user:'tirgouser',
        password:'eITYP12mrpc*',
        database:'tirgodatabase',
        port: 3306,
        debug: false,
        multipleStatements: true
});

module.exports.connection = connection;
