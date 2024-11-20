const
    express = require('express'),
    payme = express.Router(),
    database = require('../Database/database'),
    cors = require('cors'),
    push = require('../Modules/Push'),
    rp = require("request-promise"),
    parseIp = (req) => (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',').shift()) || (req.connection && req.connection.remoteAddress) || (req.socket && req.socket.remoteAddress),
    login = 'Paycom',
    password = 'IhUEFPpO%mRU0eZgmQJV42Api7Ee@Zb4RWwr',
    allpha_password='aAw@yrup#VbOh6PRP5TMGWaSkQzVg1ZHFysT'
    btoa = require('btoa');
const socket = require("../Modules/Socket");
const { tirgoBalanceCurrencyCodes } = require('../constants');

payme.use(cors());

payme.get('/testPage', async function(req, res) {
    res.send('<h1>tirgo api glad you!!!</h1>');
})
payme.post('/payMeMerchantApi', async function(req, res) {
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
            {ip: "185.234.113.1"},
            {ip: "185.234.113.2"},
            {ip: "185.234.113.3"},
            {ip: "185.234.113.4"},
            {ip: "185.234.113.5"},
            {ip: "185.234.113.6"},
            {ip: "185.234.113.7"},
            {ip: "185.234.113.8"},
            {ip: "185.234.113.9"},
            {ip: "185.234.113.10"},
            {ip: "185.234.113.11"},
            {ip: "185.234.113.12"},
            {ip: "185.234.113.13"},
            {ip: "185.234.113.14"},
            {ip: "185.234.113.15"},
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
                    const [checkpay] = await connect.query(
                        `SELECT p.*, su.chat_id FROM payment p
                        LEFT JOIN services_bot_users su on su.user_id = p.userid
                        WHERE p.payid = ? LIMIT 1`, [params.id]
                    );
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
                            
                            const [currency] = await connect.query(`
                            SELECT * from tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs} 
                            `);

                            await connect.query(`
                            INSERT INTO tir_balance_exchanges SET user_id = ?, currency_name = ?, rate_uzs = ?, rate_kzt = ?, amount_uzs = ?, amount_kzt = ?, amount_tir = ?, balance_type = 'tirgo', payme_id = ?, created_by_id = ?
                            `, [ +checkpay[0]?.userid, currency[0]?.currency_name, currency[0]?.rate, 0, +checkpay[0].amount, 0, +checkpay[0].amount / currency[0]?.rate, checkpay[0]?.id, +checkpay[0]?.userid]);
                            
                            if(insert.affectedRows > 0){
                                const [token] = await connect.query('SELECT * FROM users_list WHERE id = ?', [+checkpay[0].userid]);
                            
                                socket.emit(14, 'service-status-change', JSON.stringify({ userChatId: checkpay[0].chat_id, text: `Вы пополнили Tirgo баланс на\n${checkpay[0].amount} ${currency[0]?.currency_name}\n${+checkpay[0].amount / currency[0]?.rate} tir` }));

                            
                                if (token.length){
                                    if(token[0].token !== '' && token[0].token !== null){
                                        push.send(token[0].token, "Пополнение баланса","Ваш баланс успешно пополнен на сумму "+checkpay[0].amount,'','');
                                    }
                                    let valueofPayment = 0;
                                    let duration = 0;
                                    const [paymentUser] = await connect.query(
                                        `SELECT 
                                          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_exchanges WHERE user_id = ${+checkpay[0]?.userid} AND balance_type = 'tirgo'), 0) -
                                          COALESCE((SELECT SUM(amount_tir) FROM tir_balance_transaction  WHERE deleted = 0 AND user_id = ${+checkpay[0]?.userid} AND transaction_type = 'subscription'), 0) AS tirgoBalance`
                                      );
                                    const tirCurrency = await connect.query(`SELECT id, currency_name, rate, code FROM tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs}`);
                                    const [subscriptions] = await connect.query("SELECT * FROM subscription");
                                    const payAmount = +checkpay[0].amount + (+paymentUser[0]?.tirgoBalance * +tirCurrency[0]?.rate);
                                    let subscriptionId;

                                    for(let sub of subscriptions) {
                                        const subValue = +sub.value * +tirCurrency[0]?.rate;
                                        if(payAmount >= subValue  && subValue > valueofPayment) {
                                            valueofPayment = subValue;
                                            duration = sub.duration;
                                            subscriptionId = sub.id;
                                        }
                                    }


                                      const [users] = await connect.query(
                                        "SELECT * FROM users_list where id = ?",
                                        [checkpay[0].userid]
                                      );
                                    if (payAmount >= valueofPayment) {
                                        let nextMonth = new Date(
                                          new Date().setMonth(
                                            new Date().getMonth() + subscription[0].duration
                                          )
                                        );
                                        const [userUpdate] = await connect.query(
                                          "UPDATE users_list SET subscription_id = ?, from_subscription = ? , to_subscription=?  WHERE id = ?",
                                          [subscriptionId, new Date(), nextMonth, checkpay[0].userid]
                                        );
                                        if (userUpdate.affectedRows == 1) {

                                            const [subscription_transaction] = await connect.query(`
                                            INSERT INTO tir_balance_transaction SET user_id = ?, subscription_id = ?, created_by_id = ?, transaction_type = ?
                                          `, [checkpay[0].userid, subscriptionId, checkpay[0].userid, 'subscription']);

                                             const [userChat] = await connect.query(`
                                              SELECT chat_id FROM services_bot_users
                                              WHERE user_id = ?
                                              `, [checkpay[0].userid]);
                                              if(userChat.length) {
                                                  await connect.query(`DELETE FROM bot_user_subscription_request WHERE user_chat_id = ${userChat[0]?.chat_id} AND status = 0`)
                                              }
                                          if (subscription_transaction.affectedRows) {
                                                  console.log('subscription_transaction', subscription_transaction);
                                          }
                                        } 
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
                            "detail": {
                                "receipt_type": 0,
                                "items": [
                                    {
                                        "title": "Tirgo Service",
                                        "price": +params.amount,
                                        "count": 1,
                                        "vat_percent": 0,
                                        "package_code": "1495342",
                                        "code": "10716001001000000",
                                        "discount": 0
                                    }
                                ]
                            }
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
            sendSmsPlayMobile('998946437676', parseIp(req), 'UZ')
            res.status(403).json({ data: 'Invalid remote ip' });
        }
    } catch (err) {
        sendSmsPlayMobile('998946437676', err.message, 'UZ')
        console.log(err)
        res.status(400).send();
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

payme.post('/payMeMerchantAlpha', async function(req, res) {
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
            {ip: "185.234.113.1"},
            {ip: "185.234.113.2"},
            {ip: "185.234.113.3"},
            {ip: "185.234.113.4"},
            {ip: "185.234.113.5"},
            {ip: "185.234.113.6"},
            {ip: "185.234.113.7"},
            {ip: "185.234.113.8"},
            {ip: "185.234.113.9"},
            {ip: "185.234.113.10"},
            {ip: "185.234.113.11"},
            {ip: "185.234.113.12"},
            {ip: "185.234.113.13"},
            {ip: "185.234.113.14"},
            {ip: "185.234.113.15"},
        ],
        appData = {};
    try {
        connect = await database.connection.getConnection();
        if (addresses.findIndex(e => e.ip === parseIp(req).replace('::ffff:','')) >= 0){
            console.log('keld')
            if (req.header('authorization') === 'Basic '+btoa(login+':'+allpha_password)){
                if (method === 'CheckTransaction'){
                    const [checkpay] = await connect.query('SELECT * FROM alpha_payment WHERE payid = ? LIMIT 1', [params.id]);
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
                        const [checkpay] = await connect.query('SELECT * FROM alpha_payment WHERE payid = ? LIMIT 1', [params.id]);
                        if (checkpay.length>0){
                            appData.result = {
                                "create_time" : +checkpay[0].date_timestamp,
                                "transaction" : checkpay[0].id.toString(),
                                "state" : 1
                            }
                            res.status(200).json(appData);
                        }else {
                            const [insertpay] = await connect.query('INSERT INTO alpha_payment SET pay_method = ?,userid = ?, date_timestamp = ?,payid = ?,amount = ?,status_pay_me = ?', ['payme_merchant',+params.account.UserID,params.time,params.id,params.amount.toString().slice(0, params.amount.toString().length - 2),1]);
                             if (insertpay.affectedRows > 0){
                                appData.result = {
                                    "create_time" : params.time,
                                    "transaction" : insertpay.insertId.toString(),
                                    "state" : 1
                                }
                                res.status(200).json(appData);
                            }else {
                                appData.error =  {
                                    "code" : -31001,
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
                    const [checkpay] = await connect.query(`
                    SELECT ap.*, su.chat_id FROM alpha_payment ap
                    LEFT JOIN services_bot_users su on su.user_id = ap.userid
                    WHERE ap.payid = ? LIMIT 1
                    `, [params.id]);
                    
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
                            await connect.query('UPDATE alpha_payment SET status_pay_me = 2,status = 1,date_perform_time = ? WHERE payid = ?',[performtime,params.id])
                            appData.result = {
                                "transaction" : checkpay[0].id.toString(),
                                "perform_time" : +performtime,
                                "state" : 2,
                            };
                            appData.id = id;
                            res.status(200).json(appData);
                            const [insert] = await connect.query('UPDATE users_list SET balance = balance + ? WHERE id = ?', [+checkpay[0].amount,+checkpay[0].userid]);
                               
                            const [currency] = await connect.query(`
                            SELECT * from tirgo_balance_currency WHERE code = ${tirgoBalanceCurrencyCodes.uzs} 
                            `);

                            await connect.query(`
                            INSERT INTO tir_balance_exchanges SET user_id = ?, currency_name = ?, rate_uzs = ?, rate_kzt = ?, amount_uzs = ?, amount_kzt = ?, amount_tir = ?, balance_type = 'tirgo_service', payme_id = ?, created_by_id = ?
                            `, [ +checkpay[0]?.userid, currency[0]?.currency_name, currency[0]?.rate, 0, +checkpay[0].amount, 0, +checkpay[0].amount / currency[0]?.rate, checkpay[0]?.id, +checkpay[0]?.userid]);
                            if(insert.affectedRows > 0){

                                socket.emit(14, 'service-status-change', JSON.stringify({ userChatId: checkpay[0].chat_id, text: `Вы пополнили TirgoService баланс на \n${checkpay[0].amount} ${currency[0]?.currency_name}\n${+checkpay[0].amount / currency[0]?.rate} tir` }));

                                const [token] = await connect.query('SELECT * FROM users_list WHERE id = ?', [+checkpay[0].userid]);
                                socket.updateAllMessages("update-alpha-balance", "1");
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
                    const [checkpay] = await connect.query('SELECT * FROM alpha_payment WHERE payid = ? LIMIT 1', [params.id]);
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
                            await connect.query('UPDATE alpha_payment SET status_pay_me = ?,reason = ?,date_cancel_time = ? WHERE payid = ?',[params.reason === 3 ? -1 : -2,params.reason,canceltime,params.id])
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
                            "detail": {
                                "receipt_type": 0,
                                "items": [
                                    {
                                        "title": "Tirgo Service",
                                        "price": +params.amount,
                                        "count": 1,
                                        "vat_percent": 12,
                                        "package_code": "1495342",
                                        "code": "10716001001000000",
                                        "discount": 0
                                    }
                                ]
                            }
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
            sendSmsPlayMobile('998900103690', parseIp(req), 'UZ')
            res.status(403).json({ data: 'Invalid remote ip' });
        }
    } catch (err) {
        sendSmsPlayMobile('998900103690', err.message, 'UZ')
        console.log(err)
        res.status(400).send();
    } finally {
        if (connect) {
            connect.release()
        }
    }
});

async function sendSmsPlayMobile(phone, code, country_code) {
    let options = {
      method: "POST",
      uri: "http://91.204.239.44/broker-api/send",
      json: true,
      body: {
        messages: [
          {
            recipient: "" + phone,
            "message-id": "a" + new Date().getTime().toString(),
            sms: {
              originator: "3700",
              content: {
                text: "Merchant api, invalid ip: " + code,
              },
            },
          },
        ],
      },
      headers: {
        Authorization:
          "Basic " + Buffer.from("tirgo:C63Fs89yuN").toString("base64"),
      },
    };
    try {
      let rp_res = await rp(options);
      if (rp_res === "Request is received") {
        return "waiting";
      } else {
        return false;
      }
    } catch (err) {
      return false;
    } finally {
      console.log("finally");
    }
}

module.exports = payme;
