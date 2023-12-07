
(async function init (){
const socket = require('../Modules/Socket');
const amqp = require('amqplib');
const database = require('../Database/database');
const connection = await amqp.connect('amqp://localhost');
const channel = await connection.createChannel();
await channel.assertQueue('acceptDriverOffer');

channel.consume('acceptDriverOffer', async (msg) => {
    const data = JSON.parse(msg.content)
    let connect,
    orderid = data.orderid,
    price_off = data.price_off ? data.price_off:0,
    id = data.id;
    console.log(`acceptDriverOffer: id ${id} orderId ${orderid}`)

try {
    connect = await database.connection.getConnection();
    await connect.query('DELETE FROM orders_accepted WHERE user_id <> ? AND order_id = ?', [id,orderid]);
    const [rows] = await connect.query('UPDATE orders_accepted SET status_order = 1 WHERE order_id = ? AND user_id = ?', [orderid,id]);
    if (rows.affectedRows){
        const [check_secure] = await connect.query('SELECT * FROM secure_transaction WHERE orderid = ? LIMIT 1',[orderid]);
        // if (check_secure.length){
        //     await connect.query('UPDATE secure_transaction SET dirverid = ? WHERE orderid = ?', [id,check_secure[0].id]);
        //     await connect.query('UPDATE users_list SET balance = balance - ? WHERE id = ?', [price_off,userInfo.id]);
        //     await connect.query('UPDATE users_list SET balance_off = balance + ? WHERE id = ?', [price_off,id]);
        // }
        // await connect.query('UPDATE orders SET status = 1,driver_id = ? WHERE id = ? AND user_id = ?', [id,orderid,userInfo.id]);
        socket.updateAllList('update-all-list','1')
    }else {
    }
} catch (err) {
    console.log(err)
} finally {
    if (connect) {
        connect.release()
    }
}
}, { noAck: true });


})()