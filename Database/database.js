const
    mysql = require('mysql2/promise'),
    connection = mysql.createPool({
        host:'mysql.8f7dbe535c41.hosting.myjino.ru',
        user:'j58101795_tirgo',
        password:'tirgopassword',
        database:'j58101795_tirgodatabase',
        port: 3306,
        debug: false,
        multipleStatements: true,
});

module.exports.connection = connection;
