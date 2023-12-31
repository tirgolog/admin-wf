const
    express = require('express'),
    api = express.Router(),
    database = require('../Database/database'),
    cors = require('cors'),
    push = require('../Modules/Push'),
    parseIp = (req) => (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',').shift()) || (req.connection && req.connection.remoteAddress) || (req.socket && req.socket.remoteAddress),
    login = 'Paycom',
    password = 'IhUEFPpO%mRU0eZgmQJV42Api7Ee@Zb4RWwr';
const socket = require("../Modules/Socket");

api.use(cors());

api.get('/testPage', async function(req, res) {
    res.send('<h1>tirgo api glad you!!!</h1>');
})
api.post('/payMeMerchantApi', async function(req, res) {
    let connect,
        data = [],
        id = req.body.id,
        method = req.body.method,
        params = req.body.params,
        addresses = [
            {ip: "185.178.51.131"},
            {ip: "185.178.51.132"},
            {ip: "195.158.31.134"},
            {ip: "195.158.31.10"},
            {ip: "195.158.28.124"},
            {ip: "195.158.5.82"},
        ],
        appData = {};
    try {
        connect = await database.connection.getConnection();
        if (addresses.findIndex(e => e.ip === parseIp(req).replace('::ffff:','')) >= 0){
            if (req.header('authorization') === 'Basic '+btoa(login+':'+password)){
                if (method === 'CheckTransaction'){
                    const [checkpay] = await connect.query('SELECT * FROM payment WHERE payid = ? LIMIT 1', [params.id]);
                    if (checkpay.length>0){
                        appData.result = {
                            "create_time" : +checkpay[0].date_timestamp,
                            "perform_time" : +checkpay[0].date_perform_time,
                            "cancel_time" : +checkpay[0].date_cancel_time,
                            "transaction" : checkpay[0].id.toString(),
                            "state" : checkpay[0].status_pay_me,
                            "reason" : checkpay[0].reason
                        }
                        res.status(200).json(appData);
                    }else {
                        appData.error =  {
                            "code" : -31003,
                            "message" : "Транзакция не найдена"
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }
                }else if(method === 'CreateTransaction'){
                    const [checkclient] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1', [+params.account.UserID]);
                    if (checkclient.length>0){
                        const [checkpay] = await connect.query('SELECT * FROM payment WHERE payid = ? LIMIT 1', [params.id]);
                        if (checkpay.length>0){
                            appData.result = {
                                "create_time" : +checkpay[0].date_timestamp,
                                "transaction" : checkpay[0].id.toString(),
                                "state" : 1
                            }
                            res.status(200).json(appData);
                        }else {
                            const [insertpay] = await connect.query('INSERT INTO payment SET pay_method = ?,userid = ?,date_timestamp = ?,payid = ?,amount = ?,status_pay_me = ?', ['payme_merchant',+params.account.UserID,params.time,params.id,params.amount.toString().slice(0, params.amount.toString().length - 2),1]);
                            if (insertpay.affectedRows > 0){
                                appData.result = {
                                    "create_time" : params.time,
                                    "transaction" : insertpay.insertId.toString(),
                                    "state" : 1
                                }
                                res.status(200).json(appData);
                            }else {
                                appData.error =  {
                                    "code" : -31050,
                                };
                                appData.id = id;
                                res.status(200).json(appData);
                            }
                        }
                    }else {
                        appData.error =  {
                            "code" : -31050,
                            "message" : "Данный пользователь не найден"
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }

                }else if(method === 'PerformTransaction'){
                    const [checkpay] = await connect.query('SELECT * FROM payment WHERE payid = ? LIMIT 1', [params.id]);
                    if (checkpay.length){
                        let performtime = new Date().getTime().toString();
                        if (checkpay[0].status_pay_me === 2){
                            appData.result = {
                                "transaction" : checkpay[0].id.toString(),
                                "perform_time" : +checkpay[0].date_perform_time,
                                "state" : 2,
                            };
                            appData.id = id;
                            res.status(200).json(appData);
                        }else {
                            await connect.query('UPDATE payment SET status_pay_me = 2,status = 1,date_perform_time = ? WHERE payid = ?',[performtime,params.id])
                            appData.result = {
                                "transaction" : checkpay[0].id.toString(),
                                "perform_time" : +performtime,
                                "state" : 2,
                            };
                            appData.id = id;
                            res.status(200).json(appData);
                            const [insert] = await connect.query('UPDATE users_list SET balance = balance + ? WHERE id = ?', [+checkpay[0].amount,+checkpay[0].userid]);
                            if(insert.affectedRows > 0){
                                const [token] = await connect.query('SELECT * FROM users_list WHERE id = ?', [+checkpay[0].userid]);
                                if (token.length){
                                    if(token[0].token !== '' && token[0].token !== null){
                                        push.send(token[0].token, "Пополнение баланса","Ваш баланс успешно пополнен на сумму "+checkpay[0].amount,'','');
                                    }
                                }
                                data = {
                                    userid: +checkpay[0].userid,
                                    amount: checkpay[0].amount
                                };
                                socket.updatebalance('updatebalanceuser',data);
                            }
                        }
                    }else {
                        appData.error =  {
                            "code" : -31003,
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }
                }else if(method === 'CancelTransaction'){
                    let canceltime = new Date().getTime().toString();
                    const [checkpay] = await connect.query('SELECT * FROM payment WHERE payid = ? LIMIT 1', [params.id]);
                    if (checkpay.length){
                        if (checkpay[0].status_pay_me === -2 || checkpay[0].status_pay_me === -1){
                            appData.result = {
                                "transaction" : checkpay[0].id.toString(),
                                "cancel_time" : +checkpay[0].date_cancel_time,
                                "state" : checkpay[0].status_pay_me,
                            };
                            appData.id = id;
                            res.status(200).json(appData);
                        }else {
                            await connect.query('UPDATE payment SET status_pay_me = ?,reason = ?,date_cancel_time = ? WHERE payid = ?',[params.reason === 3 ? -1 : -2,params.reason,canceltime,params.id])
                            appData.result = {
                                "transaction" : checkpay[0].id.toString(),
                                "cancel_time" : +canceltime,
                                "state" : params.reason === 3 ? -1 : -2,
                            };
                            appData.id = id;
                            res.status(200).json(appData);
                        }
                    }else {
                        appData.error =  {
                            "code" : -31003,
                            "message" : "Транзакция не найдена"
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }
                }else if(method === 'CheckPerformTransaction'){
                    const [checkclient] = await connect.query('SELECT * FROM users_list WHERE id = ? LIMIT 1', [+params.account.UserID]);
                    if (checkclient.length){
                        appData.result = {
                            "allow" : true,
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }else {
                        appData.error =  {
                            "code" : -31050,
                            "message" : "Данный пользователь не найден"
                        };
                        appData.id = id;
                        res.status(200).json(appData);
                    }
                }
            }else {
                appData.error =  {
                    "code" : -32504,
                    "message" : "Неверный заголовок Authorization"
                };
                appData.id = id;
                res.status(200).json(appData);
            }
        }else {
            res.status(403);
        }
    } catch (err) {
        res.status(400);
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

module.exports = api;
