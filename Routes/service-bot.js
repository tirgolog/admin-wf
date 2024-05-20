const { Bot, InlineKeyboard } = require("grammy");
const TelegramBot = require("node-telegram-bot-api");
const database = require("../Database/database");
const socket = require("../Modules/Socket");
const Minio = require("minio");
const axios = require("axios");
const fs = require('fs');
const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const { sendServicesListToBotUser, sendSubscriptionsListToBotUser, checkUserServiceRequests, cancelServiceRequest, createServiceRequest, createSubscriptionRequst, checkUserSubscriptionRequests, onSubscriptionResponseClick } = require("./service-bot-functions");

const minioClient = new Minio.Client({
    endPoint: "13.232.83.179",
    port: 9000,
    useSSL: false,
    accessKey: "2ByR3PpFGckilG4fhSaJ",
    secretKey: "8UH4HtIBc7WCwgCVshcxmQslHFyJB8Y79Bauq5Xd",
});

require('dotenv').config();

// Determine environment (e.g., development or production)
const environment = process.env.NODE_ENV || 'development';
// Set up tokens for different environments
const tokens = {
    development: '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY',
    production: '7058770363:AAHZAcPHrUPMaJBuj6Pcwsdojo4IRHOV38s'
};
const botToken = tokens[environment];

// Create an instance of the Bot class and pass your bot token to it.
const bot = new TelegramBot(botToken, { webHook: true });

router.use(bodyParser.json());

// Set the webhook
const webhookUrl = `https://admin.tirgo.io/api/bot${botToken}`; // Replace with your ngrok URL
bot.openWebHook()
bot.setWebHook(webhookUrl);

// Define webhook route
router.post(`/`, (req, res) => { // Ensure this route matches the webhook URL
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

bot.onText(/\/start/, onCommandStart);

// Handle incoming photo messages
bot.on('photo', onPhotoReceived);

// Handle incoming contact messages
bot.on('contact', onContactReceived);

// Handle incoming text messages
bot.on('text', onTextReceived);

async function onCommandStart(msg) {
    const chatFirstName = msg.from.first_name;
    const chatLastName = msg.from.last_name;
    const chatId = msg.from.id;

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
    bot.sendMessage(chatId, text, replyOptions);
}

async function onPhotoReceived (msg) {
    try {
        const connection = await database.connection.getConnection();
        const userChatBotId = msg.from.id;
        const [userChat] = await connection.query(`
      SELECT * FROM services_bot_users WHERE chat_id = ?
    `, [userChatBotId]);
        if (userChat[0]?.user_id) {
            msg.photo.forEach(async (photo) => {
                const minioRes = await saveFileToLocalDiskAndMinIO(photo.file_id, 6197);
                if (minioRes.success) {
                    const data = {
                        fileId: photo.file_id,
                        fileUniqueId: photo.file_unique_id,
                        fileSize: photo.file_size,
                        width: photo.width,
                        height: photo.height,
                        minioFileName: minioRes.fileName,
                        botMessageId: msg.message_id,
                        userId: userChat[0]?.user_id
                    }
                    await savePhotoMessageDeatilsToDatabase(data);
                    await deleteFileFromLocalDisk(minioRes.localFilePath)
                } else {
                    await bot.sendMessage(userChatBotId, 'Inernal error');
                    return
                }
            });

            let data = {
                messageId: msg.message_id,
                senderType: 'user',
                senderUserId: userChat[0]?.user_id,
                senderBotId: msg.from?.id,
                messageType: 'photo',
                message: 'photo',
                caption: msg.caption
            };

            const res = await saveMessageToDatabase(data);
        }

        console.log('Photo message !');
    } catch (err) {
        console.log('Error while handling files from bot', err)
    }

}

async function onContactReceived(msg) {
    console.log('Contact message !')
    const chatId = msg.from.id;
    const phoneNumber = msg.contact?.phone_number.toString().replace('+', '');
    const chatFirstName = msg.from.first_name;
    const chatLastName = msg.from.last_name;
    const username = msg.from.username;
    const connection = await database.connection.getConnection();
    try {
        console.log(`Received contact information from ${chatFirstName}: ${phoneNumber}`);
        // Create an inline keyboard with menu options


        // Send the message with the menu
        await bot.sendMessage(chatId, `Thank you, ${chatFirstName}! We've received your contact information.`);


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
                messageId: msg.message_id,
                senderType: 'user',
                senderUserId: user[0]?.user_id,
                senderBotId: msg.from?.id,
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
        if (res[0].affectedRows) {
            if (user[0]) {
                const keyboard = new InlineKeyboard()
                    .text('Типы услуг', '#services')
                await bot.sendMessage(chatId, `Дорогой ${chatFirstName}! Вы успешно зарегистрировались.`, { reply_markup: keyboard });
                await bot.setMyCommands([
                    { command: "subscriptions", description: "Subscriptions list" },
                    { command: "services", description: "Services list" },
                  ]);
                  socket.updateAllMessages("update-service-users-list", JSON.stringify({userId: user[0]?.user_id}));
            } else {
                await bot.sendMessage(
                    chatId,
                    `Дорогой ${chatFirstName}! Пожалуйста, зарегистрируйтесь в приложении по <a href="YOUR_LINK_HERE">ссылке</a>.`,
                    { parse_mode: "HTML" },
                );
            }
        } else {
            await bot.sendMessage(chatId, `Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
        }
    } catch (err) {
        console.log(err)
        await bot.sendMessage(chatId, `Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
    } finally {
        // Release the connection back to the pool
        if (connection) {
            connection.release();
        }
    }
}

async function onTextReceived(msg) {
    if(msg.text == '/start') return;
    console.log('Text message !', msg.text)
    const connection = await database.connection.getConnection();
    
    if(msg.text == '/services') {
        await sendServicesListToBotUser(bot, connection, msg.from?.id);
    } else if(msg.text == '/subscriptions') {
        await sendSubscriptionsListToBotUser(bot, connection, msg.from?.id);
    }

    const [botUser] = await connection.query(`
     SELECT user_id FROM services_bot_users WHERE chat_id = ${msg.from?.id}`);

    if (botUser?.length && !msg.contact) {
        let data = {
            msgId: msg.message_id,
            senderType: 'user',
            senderUserId: botUser[0]?.user_id,
            senderBotId: msg.from?.id,
            messageType: 'text',
            message:  msg.text,
        };

        const res = await saveMessageToDatabase(data);
    }

}

// handle call back functions
bot.on('callback_query', async (msg) => {
    const connection = await database.connection.getConnection();
    const chatId = msg.from?.id;
    const callbackData = msg.data;

    if (callbackData === '#services') {
        await sendServicesListToBotUser(bot, connection, msg.from?.id);
    } else if (callbackData.startsWith('#service_request')) {
        const canRequest = await checkUserServiceRequests(bot, connection, chatId);
        if (canRequest) {
            const success = await createServiceRequest(connection, chatId, callbackData.split('_')[2])
            if (success) {
                await bot.sendMessage(chatId, `In proccess.`);
            } else {
                await bot.sendMessage(chatId, `Fail.`);
            }
        }
    } else if (callbackData.startsWith('#cancel_service_request')) {
        await cancelServiceRequest(bot, connection, chatId, callbackData.split('_')[3])
    } else if (callbackData.startsWith('#subscriptions')) {
    } else if (callbackData.startsWith('#subscription_request')) {
       const canRequest = await checkUserSubscriptionRequests(bot, connection, msg.from.id);
       if(canRequest) {
        await createSubscriptionRequst(bot, connection, chatId, callbackData.split('_')[2])
       }
    } else if (callbackData.startsWith('#response_subscription')) {
        await onSubscriptionResponseClick(bot, connection, msg.from.id, msg.data.split('_')[2] == 'confirm', msg.data.split('_')[3]);
    }
});


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
    const [res] = await connection.query(`SELECT created_at FROM service_bot_message WHERE id = ${insertData.insertId}`);
    console.log(insertData)
    if (insertData.affectedRows) {
        socket.updateAllMessages("update-service-messages", JSON.stringify({ userId: data.receiverUserId, messageSenderType: 'user',
             message: data.message, messageType: data.messageType, messageId: data.messageId, createdAt: res[0]?.created_at }));
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
    return await bot.sendMessage(chatId, text);
}

async function sendServiceBotMessageToUserAfterPrice(chatId, userId, serviceId, price, balance) {
    const base64 = Buffer.from("m=65dc59df3c319dec9d8c3953;ac.UserID=" + userId + ";a=" + Number(price) - Number(balance) + "00").toString('base64');
    const paymePaymentUrl = 'https://checkout.paycom.uz/' + base64;
    const clickUrl = `https://my.click.uz/services/pay?service_id=32406&merchant_id=24561&amount=${Number(price) - Number(balance)}&transaction_param=${userId}`
    const keyboard = {
        inline_keyboard: [
            [{ text: 'Pay with Click', url: clickUrl }],
            [{ text: 'Pay with Payme', url: paymePaymentUrl }],
            [{ text: 'Cancel service', callback_data: `#cancel_service_request_${serviceId}` }] 
        ]
    };
    bot.sendMessage(chatId, `Your service is priced
    Srvice's price is ${price} \n
    Your balance is ${balance} \n
    You have to pay ${price - Number(balance)} in order to buy subscription\n
    Can you confirm to continue ?`, { reply_markup: JSON.stringify({
        inline_keyboard: keyboard.inline_keyboard.map(row => row.map(button => ({
            ...button,
            text: button.text 
        })))
    })});
}

async function sendBotMessageToUser(chatId, text) {
    return await bot.sendMessage(chatId, 'Код для логин: ' + text);
  }

async function replyServiceBotMessageToUser(chatId, text, replyMessageId) {
    return await bot.sendMessage(chatId, text, { reply_to_message_id: replyMessageId });
}

async function saveFileToLocalDiskAndMinIO(fileId, userId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get file information from Telegram
            const fileInfo = await bot.getFile(fileId);

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
        await bot.deleteMessage(chatId, messageId);
        console.log('Message deleted successfully.');
        return true;
    } catch (error) {
        console.error('Error deleting message:', error.description);
        return false;
    }
}

async function editMessageInBotChat(chatId, messageId, newText) {
    try {
        await bot.editMessageText(chatId, messageId, newText);
        console.log('Message edited successfully.');
        return true;
    } catch (error) {
        console.error('Error editing message:', error.description);
        return false;
    }
}

module.exports = { router, botToken, sendServiceBotMessageToUser, replyServiceBotMessageToUser, deleteMessageFromBotChat, editMessageInBotChat, sendBotMessageToUser, sendServiceBotMessageToUserAfterPrice };