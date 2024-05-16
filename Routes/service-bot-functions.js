async function middleware(msg) {
    let connection;
    try {
        connection = await database.connection.getConnection();
        const chatId = msg.from?.id;
        console.log('middleware', {chatId})
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.to_subscription FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [chatId]);
        if (userChat[0]?.to_subscription) {
            return true;
        } else {
            await bot.sendMessage(chatId, `You don't have subscription, please buy subscription in order to use bot`);
            const subscriptions = await connection.query('SELECT * FROM subscription');
            if (subscriptions && subscriptions.length > 0) {
                const keyboard = new InlineKeyboard();
                for (let subscription of subscriptions[0]) {
                    const subscriptionNameWithLineBreak = subscription.name.replace(/\\n/g, '\n');
                    keyboard.text(subscriptionNameWithLineBreak, `#subscription_${subscription.id}`);
                }
                await bot.sendMessage(chatId, `Choose a subscription:`, { reply_markup: keyboard });
            } else {
                await bot.sendMessage(chatId, `No subscription available.`);
            }
            return false;
        }


    } catch (err) {
        console.log('Error in middleware', err)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }


}

//send user services list;
async function sendServicesListToBotUser(bot, connection, chatId) {
    try {
        const [services] = await connection.query('SELECT * FROM services');
        if (services && services.length) {
            const keyboard = { inline_keyboard: [] };
            for (let service of services) {
                keyboard.inline_keyboard.push(
                    [{ text: service.name, callback_data: `#service_request_${service.id}` }] 
                )
            }
            await bot.sendMessage(chatId, `Choose a service:`, { reply_markup: JSON.stringify({
                inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                    ...button,
                    text: button.text 
                })))
            })});
            return true;
        } else {
            await bot.sendMessage(chatId, `No services available.`);
            return false;
        }

    } catch (err) {
        console.log('BOT Error while getting services list: ', err);
        await bot.sendMessage(chatId, `Error while getting services list.`);
        return false;
    }
}

//send user subscriptions list;
async function sendSubscriptionsListToBotUser(bot, connection, chatId) {
    try {
        const [subscriptions] = await connection.query('SELECT * FROM subscription');
        if (subscriptions && subscriptions.length > 0) {
            const keyboard = { inline_keyboard: [] };
            for (let subscription of subscriptions) {
                keyboard.inline_keyboard.push(
                    [{ text: subscription.name, callback_data: `#subscription_request_${subscription.id}` }] 
                )
            }
            await bot.sendMessage(chatId, `Choose a subscription:`, { reply_markup: JSON.stringify({
                inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                    ...button,
                    text: button.text 
                })))
            })});
            return true;
        } else {
            await bot.sendMessage(chatId, `No subscriptions available.`);
            return false;
        }

    } catch (err) {
        console.log('BOT Error while getting subscriptions list: ', err);
        await bot.sendMessage(chatId, `Error while getting subscriptions list.`);
        return false;
    }
}

async function createSubscriptionRequst(bot, connection, userBotId, subscriptionId) {
    try {
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId, ul.to_subscription FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        if(userChat[0].to_subscription > new Date()) {
            bot.sendMessage(userBotId, `You have active subscription Till ${new Date(userChat[0].to_subscription)}`);
            return
        }

        const balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId)

       
        const [subscription] = await connection.query(`
        SELECT * FROM subscription WHERE id = ?
        `, [subscriptionId]);

        const [insertResult] = await connection.query(`
            INSERT INTO bot_user_subscription_request 
            SET user_chat_id = ?, subscription_id = ?
        `, [userBotId, subscriptionId]);

        if (insertResult.affectedRows) {
            const keyboard = {
                inline_keyboard: [
                    [{ text: 'Confirm', callback_data: `#response_subscription_confirm_${insertResult.insertId}` }],
                    [{ text: 'Cancel', callback_data: `#response_subscription_cancel_${insertResult.insertId}` }] 
                ]
            };
            if (subscription[0]?.value >= balance) {
                bot.sendMessage(userBotId, `You chose "${subscription[0]?.name}" subscription ! \n 
                Subscription's price is ${subscription[0]?.value} \n
                Your balance is ${balance} \n
                You have to pay ${Number(subscription[0]?.value) - Number(balance)} in order to buy subscription\n
                Can you confirm to continue ?`, { reply_markup: JSON.stringify({
                    inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                        ...button,
                        text: button.text 
                    })))
                })});
            } else {
                bot.sendMessage(userBotId, `You chose "${subscription[0]?.name}" subscription ! 
                \nSubscription's price is ${subscription[0]?.value}
                \nYour balance is ${balance}
                \nAfter buying subscription you will have ${Number(balance) - Number(subscription[0]?.value)}
                \nCan you confirm to continue ?`, { reply_markup: JSON.stringify({
                    inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                        ...button,
                        text: button.text 
                    })))
                })});
            }
        } else {
            console.log('Create bot subs trans failed: ', insertResult);
            bot.sendMessage(userBotId, `Submission failed, please retry later !`)
        }

    } catch (err) {
        console.log('Error while requesting subscription', err)
        bot.sendMessage(userBotId, `Submission failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function checkUserSubscriptionRequests(bot, connection, userBotId) {
    try {
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [subscriptionRequest] = await connection.query(`
        SELECT * FROM bot_user_subscription_request WHERE user_chat_id = ? AND status = 0
        `, [userBotId]);
        if (subscriptionRequest.length) {

            const [subscription] = await connection.query(`
            SELECT * FROM subscription WHERE id = ?
            `, [subscriptionRequest[0].subscription_id]);

            // const keyboard = new InlineKeyboard();
            // keyboard.text('Confirm', `#response_subscription_confirm_${subscriptionRequest[0].id}`);
            // keyboard.text('Cancel', `#response_subscription_cancel_${subscriptionRequest[0].id}`);

            const keyboard = {
                inline_keyboard: [
                    [{ text: 'Confirm', callback_data: `#response_subscription_confirm_${subscriptionRequest[0]?.id}` }],
                    [{ text: 'Cancel', callback_data: `#response_subscription_cancel_${subscriptionRequest[0]?.id}` }] 
                ]
            };
            bot.sendMessage(userBotId, `
                You have requested subscription "${subscription[0]?.name}" which is status is "Waiting", please complete or cancel this request first in order to request to another one
            `);
            const balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId)
            if (subscription[0]?.value > balance) {
                bot.sendMessage(userBotId, `You have "${subscription[0]?.name}" subscription ! \n 
                Subscription's price is ${subscription[0]?.value} \n
                Your balance is ${balance} \n
                You have to pay ${Number(subscription[0]?.value) - Number(balance)} in order to buy subscription\n
                Can you confirm to complete ?`, { reply_markup: JSON.stringify({
                    inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                        ...button,
                        text: button.text 
                    })))
                })});
            } else {
                bot.sendMessage(userBotId, `You have "${subscription[0]?.name}" subscription ! 
                \nSubscription's price is ${subscription[0]?.value}
                \nYour balance is ${balance}
                \nAfter buying subscription you will have ${Number(balance) - Number(subscription[0]?.value)}
                \nCan you confirm to complete ?`, { reply_markup: JSON.stringify({
                    inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                        ...button,
                        text: button.text 
                    })))
                })});
            }
            return false;
        } else {
            return true;
        }
    } catch (err) {
        console.log('Error while requesting subscription', err)
        bot.sendMessage(userBotId, `Operation failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function onSubscriptionResponseClick(bot, connection, userBotId, isConfirmed, requestId) {
    try {
        // start sql transaction
        await connection.beginTransaction();

        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId, ul.phone FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [subscriptionRequest] = await connection.query(`
            SELECT busr.status, busr.id, s.id as subscriptionId, s.name as subscriptionName, s.value as subscriptionPrice, s.duration FROM bot_user_subscription_request busr
            LEFT JOIN subscription s on s.id = busr.subscription_id
            WHERE busr.user_chat_id = ? AND busr.id = ?
            `, [userBotId, requestId]);
            if(subscriptionRequest[0].status == 1) {
                bot.sendMessage(userBotId, `Request alrerady completed, ${isConfirmed ? `you can't confirm it` : `you can't cancel it`}`);
                return
            } else if (subscriptionRequest[0].status == 2) {
                bot.sendMessage(userBotId, `Request alrerady canceleted, ${isConfirmed ? `you can't confirm it` : `you can't cancel it`}`);
                return
            }
            console.log(isConfirmed)
            if(isConfirmed) {
                balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId);
                if(balance < subscriptionRequest[0].subscriptionPrice) {
                    const base64 = Buffer.from("m=636ca5172cfb25761a99e6af;ac.UserID=" + userChat[0]?.user_id + ";a=" + Number(subscriptionRequest[0].subscriptionPrice) - Number(balance) + "00").toString('base64');
                    const paymePaymentUrl = 'https://checkout.paycom.uz/' + base64;
                    const clickUrl = `https://my.click.uz/services/pay?service_id=24721&merchant_id=17235&amount=${Number(subscriptionRequest[0].subscriptionPrice) - Number(balance)}&transaction_param=${userChat[0]?.user_id}`
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: 'Pay with Click', url: clickUrl }],
                            [{ text: 'Pay with Payme', url: paymePaymentUrl }]
                        ]
                    };
                    bot.sendMessage(userBotId, `You don't have enough amount in your blance 
                    \nYour balance is ${balance} 
                    \nSubscription price is ${subscriptionRequest[0].subscriptionPrice} 
                    \nPlease toup your balance for ${Number(subscriptionRequest[0].subscriptionPrice) - Number(balance)} 
                    \n Link for payment: asdasdasd`, { reply_markup: JSON.stringify({
                        inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                            ...button,
                            text: button.text 
                        })))
                    })});
                    return;
                }
                let nextMonth = new Date(
                    new Date().setMonth(
                      new Date().getMonth() + subscriptionRequest[0].duration
                    )
                  );
                  const [userUpdate] = await connection.query(
                    "UPDATE users_list SET subscription_id = ?, from_subscription = ? , to_subscription=?  WHERE id = ?",
                    [subscriptionRequest[0]?.id, new Date(), nextMonth, userChat[0]?.user_id]
                  );
                  if(userUpdate.affectedRows) {
                    if(userChat[0]?.groupId) {
                        const [subscription_transaction] = await connection.query(
                          "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?, group_id = ?, is_group = ?",
                          [userChat[0]?.user_id, subscriptionRequest[0]?.subscriptionId, userChat[0]?.phone, subscriptionRequest[0].subscriptionPrice, userChat[0]?.groupId, true]
                        );
                        if(!subscription_transaction.affectedRows) {
                            throw new Error();
                        }
                      } else {
                        const [subscription_transaction] = await connection.query(
                          "INSERT INTO subscription_transaction SET userid = ?, subscription_id = ?, phone = ?, amount = ?",
                          [userChat[0]?.user_id, subscriptionRequest[0]?.subscriptionId, userChat[0]?.phone, subscriptionRequest[0].subscriptionPrice]
                        );
                        if(!subscription_transaction.affectedRows) {
                            throw new Error();
                        }
                      }
                  } else {
                    console.log(userUpdate)
                    throw new Error();
                  }
            }

            const [update] = await connection.query(`
            UPDATE bot_user_subscription_request SET status = ${isConfirmed ? 1 : 2} WHERE user_chat_id = ? AND id = ?
            `, [userBotId, requestId]);

            if (update.affectedRows) {
                // Commit the transaction
                await connection.commit();
                bot.sendMessage(userBotId, `Successfully ${isConfirmed ? 'confirmed' : 'canceled'}!`);
                return
            } else {
                throw new Error();
            }

    } catch (err) {
        if (connection) {
            await connection.rollback();
          }
        console.log('Error while requesting subscription', err)
        bot.sendMessage(userBotId, `Operation failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function createServiceRequest(connection, userBotId, serviceId) {
    try {
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [service] = await connection.query(`
        SELECT * FROM services WHERE id = ?
        `, [serviceId]);
        if(!service.length) {
            return false;
        }
        const [insertResult] = await connection.query(`INSERT INTO services_transaction SET userid = ?, service_id = ?, service_name = ?, price_uzs = ?, price_kzs = ?, rate = ?, status = ?, without_subscription = ?`,
            [
                userChat[0]?.user_id,
                service[0]?.id,
                service[0].name,
                service[0]?.price_uzs,
                service[0]?.price_kzs,
                service[0]?.rate,
                0,
                service[0]?.without_subscription ? service[0]?.without_subscription : 0
            ]
        );
        if (insertResult.affectedRows) {
            return true;
        } else {
            return false;
        }
    } catch (err) {
        console.log('Error while requesting service', err)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function checkUserServiceRequests(bot, connection, userBotId) {
    try {
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [service] = await connection.query(`
        SELECT 
        id,
        service_name,
        status,
        amount
        FROM services_transaction
        WHERE userid = ? AND status = 0 OR status = 1
        `, [userChat[0]?.user_id]);

        if (service.length) {
            if(service[0]?.status  == 0) {
                const keyboard = {
                    inline_keyboard: [
                        [{ text: 'Cancel service', callback_data: `#cancel_service_request_${service[0]?.id}` }] 
                    ]
                };
                bot.sendMessage(userBotId, `You have "${service[0]?.service_name}" service in proccess! 
                    \nPlease share required documents
                    \nIf you haven't got documents list yet or shared required documents, wait admin's response`, { reply_markup: JSON.stringify({
                        inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                            ...button,
                            text: button.text 
                        })))
                    })});
            } else if(service[0]?.status  == 1) {
                const balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId)
                if(service[0]?.amount > balance) {
                    const base64 = Buffer.from("m=636ca5172cfb25761a99e6af;ac.UserID=" + userChat[0]?.user_id + ";a=" + Number(service[0]?.amount) - Number(balance) + "00").toString('base64');
                    const paymePaymentUrl = 'https://checkout.paycom.uz/' + base64;
                    const clickUrl = `https://my.click.uz/services/pay?service_id=24721&merchant_id=17235&amount=${Number(service[0]?.amount) - Number(balance)}&transaction_param=${userChat[0]?.user_id}`
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: 'Pay with Click', url: clickUrl }],
                            [{ text: 'Pay with Payme', url: paymePaymentUrl }],
                            [{ text: 'Cancel service', callback_data: `#cancel_service_request_${service[0]?.id}` }] 
                        ]
                    };
                    bot.sendMessage(userBotId, `You have "${service[0]?.service_name}" service priced! 
                    \nYou don't have enough amount in your blance 
                    \nYour balance is ${balance} 
                    \nService price is ${service[0]?.amount} 
                    \nPlease toup your balance for ${Number(service[0]?.amount) - Number(balance)} 
                    `, { reply_markup: JSON.stringify({
                        inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                            ...button,
                            text: button.text 
                        })))
                    })});

                } else {
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: 'Cancel service', callback_data: `#cancel_service_request_${service[0]?.id}` }] 
                        ]
                    };
                    bot.sendMessage(userBotId, `You have "${service[0]?.service_name}" service priced! 
                    \nPlease topup your balance
                    \nIf you have already topuped your balance, wait admin's response`, { reply_markup: JSON.stringify({
                        inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
                            ...button,
                            text: button.text 
                        })))
                    })});
                }

            }
            return false;
        } else {
            return true;
        }
    } catch (err) {
        console.log('Error while requesting service', err)
        bot.sendMessage(userBotId, `Operation failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function cancelServiceRequest(bot, connection, userBotId, serviceId) {
    try {
        const [service] = await connection.query(`
        SELECT 
        id,
        service_name,
        status,
        amount
        FROM services_transaction
        WHERE id = ?
        `, [serviceId]);

        if(service[0]?.status == 0 || service[0]?.status == 1) {
            const [update] = await connection.query(`
            UPDATE services_transaction SET status = 4 WHERE id = ?
            `, [serviceId]);
            if(update.affectedRows) {
                bot.sendMessage(userBotId, `The request successfully canceled`);
            } else {
                bot.sendMessage(userBotId, `Cancel request failed, please try later`);
            }
        } else if(service[0]?.status == 4) {
            bot.sendMessage(userBotId, `The request has already been canceled`);
        } else if(service[0]?.status > 1) {
            bot.sendMessage(userBotId, `The request has already been done, You can't cancel it !`);
        }
    } catch (err) {
        console.log('Error while requesting service', err)
        bot.sendMessage(userBotId, `Operation failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function getUserBalance(connection, userId, groupId) {
    try {
        if (groupId) {
            const [result] = await connection.query(`
            SELECT 
                (COALESCE(
                  (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${groupId} AND type = 'Пополнение'), 0) -
                COALESCE(
                  (SELECT SUM(amount) FROM driver_group_transaction WHERE driver_group_id = ${groupId} AND type = 'Вывод'), 0)) -
        
                (COALESCE(
                  (SELECT SUM(amount) FROM subscription_transaction WHERE deleted = 0 AND group_id = ${groupId}), 0) +
                COALESCE(
                  (SELECT SUM(amount) FROM services_transaction WHERE group_id = ${groupId} AND status In(2, 3)), 0)) as balance;
            `);
            return result[0]?.balance;
        } else {
            const [result] = await connection.query(`
            SELECT 
                COALESCE(
                  (SELECT SUM(amount) from secure_transaction where dirverid = ${userId} and status = 2), 0) +
  
                COALESCE(
                  (SELECT SUM(amount) FROM payment WHERE userid = ${userId} and status = 1 and date_cancel_time IS NULL), 0) -
  
                COALESCE(
                  (SELECT SUM(amount) FROM subscription_transaction WHERE deleted = 0 AND userid = ${userId} AND agent_id = 0 AND (admin_id <> 0 OR admin_id IS NULL)), 0) -
  
                COALESCE(
                  (SELECT SUM(amount) from driver_withdrawal where driver_id = ${userId}) , 
                  0) as balance;
            `);
            return result[0]?.balance;
        }
    } catch (error) {
        console.log('Error while getting use balance', error)
    }
}

module.exports = { 
    sendServicesListToBotUser, 
    sendSubscriptionsListToBotUser, 
    checkUserServiceRequests, 
    createServiceRequest, 
    cancelServiceRequest, 
    createSubscriptionRequst,
    checkUserSubscriptionRequests,
    onSubscriptionResponseClick
 };