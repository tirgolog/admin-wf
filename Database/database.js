const
    mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host:'127.0.0.1',
        user:'tirgo',
        password:'tirgO@01',
        database:'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
});


module.exports.connection = connection;
