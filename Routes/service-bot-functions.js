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

//send user services list 
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

module.exports = { sendServicesListToBotUser, sendSubscriptionsListToBotUser };