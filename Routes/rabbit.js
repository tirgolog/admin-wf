
// (async function init() {
//     const socket = require('../Modules/Socket');
//     const amqp = require('amqplib');
//     const database = require('../Database/database');
//     const connection = await amqp.connect("amqp://13.232.83.179:5672");
//     const channel = await connection.createChannel();
//     await channel.assertQueue('acceptDriverOffer');
//     channel.consume('acceptDriverOffer', async (msg) => {
//         const data = JSON.parse(msg.content)
//         let connect,
//             orderid = data.orderId,
//             clientId = data.clientId,
//             driverId = data.driverId,
//             amount = data.amount,
//             addAmount = data.additionalAmount,
//             isSafe = data.isSafe;
//         console.log(`acceptDriverOffer: driverId ${driverId} orderId ${orderid}`)
//         try {
//             connect = await database.connection.getConnection();
//             await connect.query('DELETE FROM orders_accepted WHERE user_id = ? AND order_id <> ? AND status_order = 0', [driverId, orderid]);
//             await connect.query('DELETE FROM orders_accepted WHERE user_id <> ? AND order_id = ?', [driverId, orderid]);
//             const [rows] = await connect.query('UPDATE orders_accepted SET status_order = 1 WHERE order_id = ? AND user_id = ?', [orderid, driverId]);
//             if (rows.affectedRows) {
//                 if (isSafe) {
//                     connect.query(`INSERT INTO secure_transaction set userid = ?, dirverid = ?, orderid = ?, amount = ?, additional_amount = ?`, [clientId, driverId, orderid, amount, addAmount]);
//                 }
//                 socket.updateAllList('update-all-list', '1')
//             } else {
//             }
//         } catch (err) {
//             console.log(err)
//         } finally {
//             if (connect) {
//                 connect.release()
//             }
//         }
//     }, { noAck: true });
// })()