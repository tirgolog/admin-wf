const
    database = require('../Database/database'),
    socketioJwt = require('socketio-jwt');

let socketIO;


module.exports = {
    init: function (io) {
        socketIO = io;
        socketIO.on('connection', socketioJwt.authorize({
            secret: process.env.SECRET_KEY,
            timeout: 15000
        })).on('authenticated', async (socket) => {
            console.log('пытаемся подключиться');
            socket.userid = socket.decoded_token.id;
            console.log('Пользователь: ' + socket.userid + ' подключился');
            //socketIO.emit('users-changed', {event: 'connected',userid:socket.userid});
            let connectOnTop,
                currentDate = new Date();
            try {
                connectOnTop = await database.connection.getConnection();
                await connectOnTop.query('UPDATE users_list SET status = 1,date_last_login = ? WHERE id = ?', [currentDate,socket.userid]);
            } catch (e) {
                console.log(e)
            } finally {
                if (connectOnTop) {
                    connectOnTop.release()
                }
            }
            socket.join('s'+socket.userid);
            console.log('Пользователь '+socket.userid+' подключился к системной комнате #' + 's'+socket.userid);
            socket.sroomid = 's'+socket.userid;
            socket.on('disconnect',async function(){
                console.log('Пользователь '+socket.userid+' отключился');
                socketIO.emit('users-changed', {event: 'disconnected',userid:socket.userid});
                let connect;
                try {
                    connect = await database.connection.getConnection();
                    await connect.query('UPDATE users_list SET status = 0 WHERE id = ?', [socket.userid]);
                } catch (e) {
                    console.log(e)
                } finally {
                    if (connect) {
                        connect.release()
                    }
                }
            });
        });
    },
    emit: function (room, name, data) {
        socketIO.in(room).emit(name, data)
    },
    updatebalance: function (name, data) {
        socketIO.emit(name, data)
    },
    updateAllList: function (name, data) {
        socketIO.emit(name, data)
    },
    updateAllMessages: function (name, data) {
        socketIO.emit(name, data)
    },
    updateActivity: function (name, data) {
        socketIO.emit(name, data)
    },
    logOutUser: function (name, data) {
        socketIO.emit(name, data)
    },
};

function getClients(roomid) {

    return new Promise((resolve, reject) => {
        socketIO.of('/').in(roomid).clients((error, clients) => {
            if(error)
                return reject(error);

            resolve(clients);
        });
    });

}
