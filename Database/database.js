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
        authPlugins: {
          mysql_clear_password: () => () => Buffer.from('mysql12paSs!@') // Use appropriate auth plugin
        }
});


module.exports.connection = connection;
