const
    mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host:'localhost',
        user:'root',
        password:'mysql12paSs!@',
        database:'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
});


module.exports.connection = connection;
