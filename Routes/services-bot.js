const { Bot, InlineKeyboard } = require("grammy");
const { Menu } = require("@grammyjs/menu");
const database = require("../Database/database");
const socket = require("../Modules/Socket");
const Minio = require("minio");
const axios = require("axios");
const fs = require('fs');
const path = require('path');

const minioClient = new Minio.Client({
    endPoint: "13.232.83.179",
    port: 9000,
    useSSL: false,
    accessKey: "2ByR3PpFGckilG4fhSaJ",
    secretKey: "8UH4HtIBc7WCwgCVshcxmQslHFyJB8Y79Bauq5Xd",
});

// require('dotenv').config();

// Determine environment (e.g., development or production)
// const environment = process.env.NODE_ENV || 'development';
// Set up tokens for different environments
// const tokens = {
//     development: '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY',
//     production: '7058770363:AAHZAcPHrUPMaJBuj6Pcwsdojo4IRHOV38s'
// };
// const token = tokens[environment];
// Create an instance of the Bot class and pass your bot token to it.
const botToken = '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY';
const bot = new Bot(botToken); // <-- put your bot token between the ""


bot.use(async (ctx, next) => {
    let connection;
    try {
        connection = await database.connection.getConnection();
        console.log('Middleware1')
        const message = ctx.message;
        if ((message && message.text == '/start' || (message && message.contact)) || (ctx.callbackQuery?.data && ctx.callbackQuery?.data.startsWith('#subscription') || ctx.callbackQuery?.data.startsWith('#response'))) {
            next()
            return
        }
        console.log('Middleware2')
        const chatId = ctx.callbackQuery?.message?.chat?.id || ctx.message?.from?.id
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.to_subscription FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [chatId]);
        if (userChat[0]?.to_subscription) {
            next()
        } else {
            await ctx.reply(`You don't have subscription, please buy subscription in order to use bot`);
            const subscriptions = await connection.query('SELECT * FROM subscription');
            if (subscriptions && subscriptions.length > 0) {
                const keyboard = new InlineKeyboard();
                for (let subscription of subscriptions[0]) {
                    const subscriptionNameWithLineBreak = subscription.name.replace(/\\n/g, '\n');
                    keyboard.text(subscriptionNameWithLineBreak, `#subscription_${subscription.id}`);
                }
                await ctx.reply(`Choose a subscription:`, { reply_markup: keyboard });
            } else {
                await ctx.reply(`No subscription available.`);
            }
        }


    } catch (err) {
        console.log('Error in middleware', err)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }


})

bot.command("start", onCommandStart);

// Handle incoming photo messages
bot.on('message:photo', async (ctx) => {
    try {
        const connection = await database.connection.getConnection();
        const message = ctx.message;
        const userChatBotId = message.from.id;
        const [userChat] = await connection.query(`
      SELECT * FROM services_bot_users WHERE chat_id = ?
    `, [userChatBotId]);
        if (userChat[0]?.user_id) {
            message.photo.forEach(async (photo) => {
                const minioRes = await saveFileToLocalDiskAndMinIO(photo.file_id, 6197);
                if (minioRes.success) {
                    const data = {
                        fileId: photo.file_id,
                        fileUniqueId: photo.file_unique_id,
                        fileSize: photo.file_size,
                        width: photo.width,
                        height: photo.height,
                        minioFileName: minioRes.fileName,
                        botMessageId: message.message_id,
                        userId: userChat[0]?.user_id
                    }
                    await savePhotoMessageDeatilsToDatabase(data);
                    await deleteFileFromLocalDisk(minioRes.localFilePath)
                } else {
                    await ctx.reply('Inernal error');
                    return
                }
            });

            let data = {
                messageId: message.message_id,
                senderType: 'user',
                senderUserId: userChat[0]?.user_id,
                senderBotId: message.from?.id,
                messageType: 'photo',
                message: 'photo',
                caption: message.caption
            };

            const res = await saveMessageToDatabase(data);
        }

        console.log('Photo message !');
    } catch (err) {
        console.log('Error while handling files from bot', err)
    }

});

// Handle incoming contact messages
bot.on('message:contact', async (ctx) => {
    console.log('Contact message !');
    await onContactReceived(ctx)
});

// Handle incoming text messages
bot.on('message:text', async (ctx) => {
    const connecttion = await database.connection.getConnection();
    const message = ctx.message;
    console.log('Text message !', message.text)
    const [botUser] = await connecttion.query(`
  SELECT user_id FROM services_bot_users WHERE chat_id = ${message.from?.id}`);

    if (botUser?.length && !message.contact) {
        let data = {
            messageId: message.message_id,
            senderType: 'user',
            senderUserId: botUser[0]?.user_id,
            senderBotId: message.from?.id
        };

        // data.receiverUserId,
        // data.receiverBotId

        if (message.text) {
            data.messageType = 'text';
            data.message = message.text;
        } else if (data.document) {
            data.messageType = 'document';
            data.message = 'document'

        } else if (data.photo) {
            data.messageType = 'photo';
            data.message = 'photo'

        }
        const res = await saveMessageToDatabase(data);
    }

});

bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    console.log(ctx.callbackQuery.data)
    if (callbackData === '#services') {
        // Handle 'Типы услуг' button click here
        await onServicesClick(ctx);
    } else if (callbackData.startsWith('#service_')) {
        const res = await checkForWaitingServiceRequest(ctx.callbackQuery?.from?.id);
        if (res) {
            await ctx.reply(`You have service request that status is waiting. Please complete this first`);
        } else {
            const success = await onServiceRequestClick(ctx.callbackQuery?.from?.id, callbackData.split('_')[1])
            if (success) {
                await ctx.reply(`In proccess.`);
            } else {
                await ctx.reply(`Fail.`);
            }
        }
    } else if (callbackData.startsWith('#subscriptions')) {
    } else if (callbackData.startsWith('#subscription_')) {
        await onSubscriptionRequestClick(ctx)
    } else if (callbackData.startsWith('#response_subscription')) {
        await onSubscriptionResponseClick(ctx);
    }
});

bot.start();

function onCommandStart(ctx) {
    const chatFirstName = ctx.message.chat.first_name;
    const chatLastName = ctx.message.chat.last_name;

    let replyOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            force_reply: true,
            keyboard: [[{ text: "📱Отправить номер", request_contact: true }]],
        },
    };
    const text = `Добро пожаловать, ${chatFirstName ? chatFirstName : '@' + msg.from.username} ${chatLastName ? chatLastName : ''} ! \nПожалуйста отправьте свой номер телефона !`;

    // Reply to the user with the message
    ctx.reply(text, replyOptions);
}

async function onContactReceived(ctx) {
    const chatId = ctx.message.chat.id;
    const phoneNumber = ctx.message.contact?.phone_number.toString().replace('+', '');
    const chatFirstName = ctx.message.chat.first_name;
    const chatLastName = ctx.message.chat.last_name;
    const username = ctx.message.chat.username;
    const connection = await database.connection.getConnection();
    try {
        console.log(`Received contact information from ${chatFirstName}: ${phoneNumber}`);
        // Create an inline keyboard with menu options


        // Send the message with the menu
        await ctx.reply(`Thank you, ${chatFirstName}! We've received your contact information.`);


        const [user] = await connection.query(`
      SELECT * FROM users_contacts WHERE text = ?
    `, [phoneNumber]);

        const [userChat] = await connection.query(`
      SELECT * FROM services_bot_users WHERE phone_number = ?
    `, [phoneNumber]);

        let res;
        if (!userChat?.length) {
            res = await connection.query(`
        INSERT INTO services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ?
        `, [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id]);

            let data = {
                messageId: ctx.message.message_id,
                senderType: 'user',
                senderUserId: user[0]?.user_id,
                senderBotId: ctx.message.from?.id,
                messageType: 'contact',
                message: phoneNumber
            };
            await saveMessageToDatabase(data)
        } else {
            res = await connection.query(
                "UPDATE services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ? WHERE phone_number = ?",
                [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id, phoneNumber]
            );
        }



        // Send a notification to the user
        if (res) {
            if (user[0]) {
                const keyboard = new InlineKeyboard()
                    .text('Типы услуг', '#services')
                await ctx.reply(`Дорогой ${chatFirstName}! Вы успешно зарегистрировались.`, { reply_markup: keyboard });
                await bot.api.setMyCommands([
                    { command: "subscriptions", description: "Subscriptions list" },
                    { command: "services", description: "Services list" },
                  ]);
            } else {
                await bot.api.sendMessage(
                    ctx.message.chat.id,
                    `Дорогой ${chatFirstName}! Пожалуйста, зарегистрируйтесь в приложении по <a href="YOUR_LINK_HERE">ссылке</a>.`,
                    { parse_mode: "HTML" },
                );
            }
        } else {
            await ctx.reply(`Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
        }
    } catch (err) {
        console.log(err)
        await ctx.reply(`Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
    } finally {
        // Release the connection back to the pool
        if (connection) {
            connection.release();
        }
    }
}

// Function to handle 'Типы услуг' button click
async function onServicesClick(ctx) {
    const connection = await database.connection.getConnection();

    try {
        const services = await connection.query('SELECT * FROM services');
        if (services && services.length > 0) {
            const keyboard = new InlineKeyboard();
            for (let service of services[0]) {
                const serviceNameWithLineBreak = service.name.replace(/\\n/g, '\n');
                keyboard.text(serviceNameWithLineBreak, `#service_${service.id}`);
                keyboard.row()
            }
            await ctx.reply(`Choose a service:`, { reply_markup: keyboard });
        } else {
            await ctx.reply(`No services available.`);
        }

    } catch (err) {
        console.log('BOT Error while getting services list: ', err);
        await ctx.reply(`Error while getting services list.`);
    } finally {
        // Release the connection back to the pool
        if (connection) {
            connection.release();
        }
    }
}

async function onServiceRequestClick(userBotId, serviceId) {
    let connection;
    try {
        connection = await database.connection.getConnection();
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [service] = await connection.query(`
        SELECT * FROM services WHERE id = ?
        `, [serviceId]);

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

async function onSubscriptionRequestClick(ctx) {
    let connection;
    try {
        connection = await database.connection.getConnection();
        const subscriptionId = ctx.callbackQuery?.data.split('_')[1];
        const userBotId = ctx.callbackQuery?.from?.id

        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId, ul.to_subscription FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        if(userChat[0].to_subscription > new Date()) {
            ctx.reply(`You have active subscription`);
            return
        }

        const balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId)

        const [subscriptionRequest] = await connection.query(`
        SELECT * FROM bot_user_subscription_request WHERE user_chat_id = ? AND status = 0
        `, [userBotId]);
        if (subscriptionRequest.length) {
            const [subscription] = await connection.query(`
            SELECT * FROM subscription WHERE id = ?
            `, [subscriptionRequest[0].subscription_id]);
            const keyboard = new InlineKeyboard();
            keyboard.text('Confirm', `#response_subscription_confirm_${subscriptionRequest[0].id}`);
            keyboard.text('Cancel', `#response_subscription_cancel_${subscriptionRequest[0].id}`);
            ctx.reply(`
                You have requested subscription "${subscription[0]?.name}" which is status is "Waiting", please complete or cancel this request first in order to request to another one
            `);

            if (subscription[0]?.value >= balance) {
                ctx.reply(`You have "${subscription[0]?.name}" subscription ! \n 
                Subscription's price is ${subscription[0]?.value} \n
                Your balance is ${balance} \n
                You have to pay ${Number(subscription[0]?.value) - Number(balance)} in order to buy subscription\n
                Can you confirm to complete ?`, { reply_markup: keyboard });
            } else {
                ctx.reply(`You have "${subscription[0]?.name}" subscription ! 
                \nSubscription's price is ${subscription[0]?.value}
                \nYour balance is ${balance}
                \nAfter buying subscription you will have ${Number(balance) - Number(subscription[0]?.value)}
                \nCan you confirm to complete ?`, { reply_markup: keyboard });
            }
            return;
        }

        const [subscription] = await connection.query(`
        SELECT * FROM subscription WHERE id = ?
        `, [subscriptionId]);

        const [insertResult] = await connection.query(`
            INSERT INTO bot_user_subscription_request 
            SET user_chat_id = ?, subscription_id = ?
        `, [userBotId, subscriptionId]);

        if (insertResult.affectedRows) {
            const keyboard = new InlineKeyboard();
            keyboard.text('Confirm', `#response_subscription_confirm_${insertResult.insertId}`);
            keyboard.text('Cancel', `#response_subscription_cancel_${insertResult.insertId}`);
            if (subscription[0]?.value >= balance) {
                ctx.reply(`You chose "${subscription[0]?.name}" subscription ! \n 
                Subscription's price is ${subscription[0]?.value} \n
                Your balance is ${balance} \n
                You have to pay ${Number(subscription[0]?.value) - Number(balance)} in order to buy subscription\n
                Can you confirm to continue ?`, { reply_markup: keyboard });
            } else {
                ctx.reply(`You chose "${subscription[0]?.name}" subscription ! 
                \nSubscription's price is ${subscription[0]?.value}
                \nYour balance is ${balance}
                \nAfter buying subscription you will have ${Number(balance) - Number(subscription[0]?.value)}
                \nCan you confirm to continue ?`, { reply_markup: keyboard });
            }
        } else {
            console.log('Create bot subs trans failed: ', insertResult);
            ctx.reply(`Submission failed, please retry later !`)
        }

    } catch (err) {
        console.log('Error while requesting subscription', err)
        ctx.reply(`Submission failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function onSubscriptionResponseClick(ctx) {
    let connection, balance;
    try {
        connection = await database.connection.getConnection();
        const isConfirmed = ctx.callbackQuery?.data.split('_')[2] == 'confirm';
        const userBotId = ctx.callbackQuery?.from?.id
        const requestId = Number(ctx.callbackQuery?.data.split('_')[3]);

        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [subscriptionRequest] = await connection.query(`
            SELECT busr.status, busr.id, s.id as subscriptionId, s.name as subscriptionName, s.value as subscriptionPrice, s.duration FROM bot_user_subscription_request busr
            LEFT JOIN subscription s on s.id = busr.subscription_id
            WHERE busr.user_chat_id = ? AND busr.id = ?
            `, [userBotId, requestId]);
            if(subscriptionRequest[0].status == 1) {
                ctx.reply(`Request alrerady completed, ${isConfirmed ? `you can't confirm it` : `you can't cancel it`}`);
                return
            } else if (subscriptionRequest[0].status == 2) {
                ctx.reply(`Request alrerady canceleted, ${isConfirmed ? `you can't confirm it` : `you can't cancel it`}`);
                return
            }

            if(isConfirmed) {
                balance = await getUserBalance(connection, userChat[0]?.user_id, userChat[0]?.groupId);
                if(balance < subscriptionRequest[0].subscriptionPrice) {

                    ctx.reply(`You don't have enough amount in your blance 
                    \nYour balance is ${balance} 
                    \nSubscription price is ${subscriptionRequest[0].subscriptionPrice} 
                    \nPlease toup your balance for ${Number(subscriptionRequest[0].subscriptionPrice) - Number(balance)} 
                    \n Link for payment: asdasdasd`);
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
            }

            const [update] = await connection.query(`
            UPDATE bot_user_subscription_request SET status = ${isConfirmed ? 1 : 2} WHERE user_chat_id = ? AND id = ?
            `, [userBotId, requestId]);
            if (update.affectedRows) {
                ctx.reply(`Successfully ${isConfirmed ? 'confirmed' : 'canceled'}!`);
                return
            } else {
                ctx.reply(`Operation failed! please try again`);
                return
            }
    } catch (err) {
        console.log('Error while requesting subscription', err)
        ctx.reply(`Operation failed, please retry later !`)
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function checkForWaitingServiceRequest(userBotId) {
    let connection;
    try {
        connection = await database.connection.getConnection();
        const [userChat] = await connection.query(`
        SELECT sbu.*, ul.driver_group_id groupId FROM services_bot_users sbu
        LEFT JOIN users_list ul on ul.id = sbu.user_id
        WHERE chat_id = ?
        `, [userBotId]);

        const [service] = await connection.query(`
        SELECT 
        id
        FROM services_transaction
        WHERE userid = ? AND status = 0
        `, [userChat[0]?.user_id]);

        if (service.length) {
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

async function saveMessageToDatabase(data) {
    const connection = await database.connection.getConnection();
    const [insertData] = await connection.query(`
  INSERT INTO service_bot_message set 
    message_type = ?,
    message = ?,
    message_sender_type = ?,
    bot_message_id = ?,
    sender_user_id = ?,
    receiver_user_id = ?,
    sender_bot_chat_id = ?,
    receiver_bot_chat_id = ?,
    caption = ?
  `, [
        data.messageType,
        data.message,
        data.senderType,
        data.messageId,
        data.senderUserId,
        data.receiverUserId,
        data.senderBotId,
        data.receiverBotId,
        data.caption
    ]);
    console.log(insertData)
    if (insertData.affectedRows) {
        socket.updateAllMessages("update-service-messages", JSON.stringify({ userId: data.receiverUserId, message: data.message, messageType: data.messageType, messageId: data.messageId }));
    }
}

async function savePhotoMessageDeatilsToDatabase(data) {
    const connection = await database.connection.getConnection();
    const [insertData] = await connection.query(`
  INSERT INTO service_bot_photo_details set 
    file_id = ?,
    file_unique_id = ?,
    file_size = ?,
    width = ?,
    height = ?,
    minio_file_name = ?,
    bot_message_id = ?,
    user_id = ?
  `, [
        data.fileId,
        data.fileUniqueId,
        data.fileSize,
        data.width,
        data.height,
        data.minioFileName,
        data.botMessageId,
        data.userId
    ]);
}

async function sendServiceBotMessageToUser(chatId, text) {
    return await bot.api.sendMessage(chatId, text);
}

async function replyServiceBotMessageToUser(chatId, text, replyMessageId) {
    return await bot.api.sendMessage(chatId, text, { reply_to_message_id: replyMessageId });
}

async function saveFileToLocalDiskAndMinIO(fileId, userId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get file information from Telegram
            const fileInfo = await bot.api.getFile(fileId);

            // Generate a unique file name
            const fileName = `${userId}_${Date.now()}.${fileInfo.file_path.split('.').pop()}`;

            // Download the file from Telegram
            const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
            const response = await axios.get(fileUrl, { responseType: 'stream' });

            // Create a write stream to save the file locally
            const localFilePath = path.join(__dirname, '../uploads', fileName); // Specify the directory where you want to save the file locally
            const localWriter = fs.createWriteStream(localFilePath);

            // Pipe the response stream to the local write stream
            response.data.pipe(localWriter);

            // Handle events for the local write stream
            localWriter.on('finish', async () => {
                console.log('File saved locally:', localFilePath);

                // Upload the file to MinIO
                minioClient.fPutObject('service-bot', fileName, localFilePath, (err, etag) => {
                    if (err) {
                        console.error('Error uploading file to MinIO:', err);
                        reject(err);
                    } else {
                        console.log('File uploaded to MinIO successfully. ETag:', etag);
                        resolve({ success: true, localFilePath, fileName, etag: etag.etag });
                    }
                });
            });
            localWriter.on('error', (err) => {
                console.error('Error saving file locally:', err);
                reject(err);
            });
        } catch (error) {
            console.error('Error fetching or saving file:', error);
            reject(error);
        }
    });
}

async function deleteFileFromLocalDisk(filePath) {
    return new Promise((resolve, reject) => {

        // Check if the file exists
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error('File not found:', filePath);
                return reject('File not found');
            }

            // Delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                    return reject('Error deleting file');
                }
                console.log('File deleted successfully:', filePath);
                resolve('File deleted successfully');
            });
        });
    });
}

async function deleteMessageFromBotChat(chatId, messageId) {
    try {
        await bot.api.deleteMessage(chatId, messageId);
        console.log('Message deleted successfully.');
        return true;
    } catch (error) {
        console.error('Error deleting message:', error.description);
        return false;
    }
}

async function editMessageInBotChat(chatId, messageId, newText) {
    try {
        await bot.api.editMessageText(chatId, messageId, newText);
        console.log('Message edited successfully.');
        return true;
    } catch (error) {
        console.error('Error editing message:', error.description);
        return false;
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
module.exports = { sendServiceBotMessageToUser, replyServiceBotMessageToUser, deleteMessageFromBotChat, editMessageInBotChat };