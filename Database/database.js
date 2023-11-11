const
    mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host:'185.183.243.223',
        user:'root',
        password:'tirgo_database_user',
        database:'tirgo',
        port: 3306,
        debug: false,
        multipleStatements: true,
});


module.exports.connection = connection;
