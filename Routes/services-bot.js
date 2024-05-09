// const { Bot, InlineKeyboard } = require("grammy");
// const database = require("../Database/database");
// const socket = require("../Modules/Socket");
// const Minio = require("minio");
// const axios = require("axios");
// const fs = require('fs');
// const path = require('path');

// const { promisify } = require('util');
// const { pipeline } = require('stream');
// const pipelineAsync = promisify(pipeline);
// const { Readable } = require('stream');
// const minioClient = new Minio.Client({
//   endPoint: "13.232.83.179",
//   port: 9000,
//   useSSL: false,
//   accessKey: "2ByR3PpFGckilG4fhSaJ",
//   secretKey: "8UH4HtIBc7WCwgCVshcxmQslHFyJB8Y79Bauq5Xd",
// });

// // require('dotenv').config();

// // Determine environment (e.g., development or production)
// // const environment = process.env.NODE_ENV || 'development';
// // Set up tokens for different environments
// // const tokens = {
// //     development: '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY',
// //     production: '7058770363:AAHZAcPHrUPMaJBuj6Pcwsdojo4IRHOV38s'
// // };
// // const token = tokens[environment];
// // Create an instance of the Bot class and pass your bot token to it.
// const botToken = '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY';
// const bot = new Bot(botToken); // <-- put your bot token between the ""

// bot.command("start", onCommandStart);

// // Handle incoming photo messages
// bot.on('message:photo', async (ctx) => {
//   try {
//     const connection = await database.connection.getConnection();
//     const message = ctx.message;
//     const userChatBotId = message.from.id;
//     const [userChat] = await connection.query(`
//       SELECT * FROM services_bot_users WHERE chat_id = ?
//     `, [userChatBotId]);
//     if (userChat[0]?.user_id) {
//       message.photo.forEach(async (photo) => {
//         const minioRes = await saveFileToLocalDiskAndMinIO(photo.file_id, 6197);
//         if(minioRes.success) {       
//             const data = {
//               fileId: photo.file_id,
//               fileUniqueId: photo.file_unique_id,
//               fileSize: photo.file_size,
//               width: photo.width,
//               height: photo.height,
//               minioFileName: minioRes.fileName,
//               botMessageId: message.message_id,
//               userId: userChat[0]?.user_id,
//               caption: message.caption
//             }
//             await savePhotoMessageDeatilsToDatabase(data);
//             await deleteFileFromLocalDisk(minioRes.localFilePath)
//         } else {
//             await ctx.reply('Inernal error');
//             return
//         }
//       });

//         let data = {
//           messageId: message.message_id,
//           senderType: 'user',
//           senderUserId: userChat[0]?.user_id,
//           senderBotId: message.from?.id,
//           messageType: 'photo',
//           message: 'photo'
//         };
    
//         const res = await saveMessageToDatabase(data);
//     }

//     console.log('Photo message !');
//   } catch (err) {
//     console.log('Error while handling files from bot', err)
//   }

// });

// // Handle incoming contact messages
// bot.on('message:contact', async (ctx) => {
//   console.log('Contact message !');
//   await onContactReceived(ctx)
// });

// // Handle incoming text messages
// bot.on('message:text', async (ctx) => {
//   const connecttion = await database.connection.getConnection();
//   const message = ctx.message;

//   console.log('Text message !', message.text)
//   const [botUser] = await connecttion.query(`
//   SELECT user_id FROM services_bot_users WHERE chat_id = ${message.from?.id}`);

//   if (botUser?.length && !message.contact) {
//     let data = {
//       messageId: message.message_id,
//       senderType: 'user',
//       senderUserId: botUser[0]?.user_id,
//       senderBotId: message.from?.id
//     };

//     // data.receiverUserId,
//     // data.receiverBotId

//     if (message.text) {
//       data.messageType = 'text';
//       data.message = message.text;
//     } else if (data.document) {
//       data.messageType = 'document';
//       data.message = 'document'

//     } else if (data.photo) {
//       data.messageType = 'photo';
//       data.message = 'photo'

//     }
//     const res = await saveMessageToDatabase(data);
//   }

// });

// bot.on('callback_query', async (ctx) => {
//   const callbackData = ctx.callbackQuery.data;

//   if (callbackData === '#services') {
//     // Handle 'Типы услуг' button click here
//     await onServicesClick(ctx);
//   } else if (callbackData.startsWith('#service_')) {
//     await ctx.reply(`you choosed.` + callbackData);
//   }
// });

// bot.start();

// function onCommandStart(ctx) {
//   const chatFirstName = ctx.message.chat.first_name;
//   const chatLastName = ctx.message.chat.last_name;

//   let replyOptions = {
//     reply_markup: {
//       resize_keyboard: true,
//       one_time_keyboard: true,
//       force_reply: true,
//       keyboard: [[{ text: "📱Отправить номер", request_contact: true }]],
//     },
//   };
//   const text = `Добро пожаловать, ${chatFirstName ? chatFirstName : '@' + msg.from.username} ${chatLastName ? chatLastName : ''} ! \nПожалуйста отправьте свой номер телефона !`;

//   // Reply to the user with the message
//   ctx.reply(text, replyOptions);
// }

// async function onContactReceived(ctx) {
//   const chatId = ctx.message.chat.id;
//   const phoneNumber = ctx.message.contact?.phone_number.toString().replace('+', '');
//   const chatFirstName = ctx.message.chat.first_name;
//   const chatLastName = ctx.message.chat.last_name;
//   const username = ctx.message.chat.username;
//   const connection = await database.connection.getConnection();
//   try {
//     console.log(`Received contact information from ${chatFirstName}: ${phoneNumber}`);
//     // Create an inline keyboard with menu options


//     // Send the message with the menu
//     await ctx.reply(`Thank you, ${chatFirstName}! We've received your contact information.`);


//     const [user] = await connection.query(`
//       SELECT * FROM users_contacts WHERE text = ?
//     `, [phoneNumber]);

//     const [userChat] = await connection.query(`
//       SELECT * FROM services_bot_users WHERE phone_number = ?
//     `, [phoneNumber]);

//     let res;
//     if (!userChat?.length) {
//       res = await connection.query(`
//         INSERT INTO services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ?
//         `, [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id]);

//       let data = {
//         messageId: ctx.message.message_id,
//         senderType: 'user',
//         senderUserId: user[0]?.user_id,
//         senderBotId: ctx.message.from?.id,
//         messageType: 'contact',
//         message: phoneNumber
//       };
//       await saveMessageToDatabase(data)
//     } else {
//       res = await connection.query(
//         "UPDATE services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ? WHERE phone_number = ?",
//         [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id, phoneNumber]
//       );
//     }



//     // Send a notification to the user
//     if (res) {
//       if (user[0]) {
//         const keyboard = new InlineKeyboard()
//           .text('Типы услуг', '#services')
//         await ctx.reply(`Дорогой ${chatFirstName}! Вы успешно зарегистрировались.`, { reply_markup: keyboard });
//       } else {
//         await bot.api.sendMessage(
//           ctx.message.chat.id,
//           `Дорогой ${chatFirstName}! Пожалуйста, зарегистрируйтесь в приложении по <a href="YOUR_LINK_HERE">ссылке</a>.`,
//           { parse_mode: "HTML" },
//         );
//       }
//     } else {
//       await ctx.reply(`Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
//     }
//   } catch (err) {
//     console.log(err)
//     await ctx.reply(`Дорогой ${chatFirstName}! Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
//   } finally {
//     // Release the connection back to the pool
//     if (connection) {
//       connection.release();
//     }
//   }
// }

// // Function to handle 'Типы услуг' button click
// async function onServicesClick(ctx) {
//   const connection = await database.connection.getConnection();

//   try {
//     const services = await connection.query('SELECT * FROM services');
//     if (services && services.length > 0) {
//       const keyboard = new InlineKeyboard();
//       for (let service of services[0]) {
//         const serviceNameWithLineBreak = service.name.replace(/\\n/g, '\n');
//         keyboard.text(serviceNameWithLineBreak, `#service_${service.id}`);
//         keyboard.row()
//       }

//       await ctx.reply(`Choose a service:`, { reply_markup: keyboard });
//     } else {
//       await ctx.reply(`No services available.`);
//     }
//     let data = {
//       messageId: ctx.callbackQuery.message.message_id,
//       senderType: 'user',
//       senderUserId: 'user[0]?.user_id',
//       senderBotId: ctx.callbackQuery.message.from?.id,
//       messageType: 'contact',
//       message: 'phoneNumber'
//     };
//     console.log('data', data)
//   } catch (err) {
//     console.log('BOT Error while getting services list: ', err);
//     await ctx.reply(`Error while getting services list.`);
//   } finally {
//     // Release the connection back to the pool
//     if (connection) {
//       connection.release();
//     }
//   }
// }

// async function saveMessageToDatabase(data) {
//   const connection = await database.connection.getConnection();

//   const [insertData] = await connection.query(`
//   INSERT INTO service_bot_message set 
//     message_type = ?,
//     message = ?,
//     message_sender_type = ?,
//     bot_message_id = ?,
//     sender_user_id = ?,
//     receiver_user_id = ?,
//     sender_bot_chat_id = ?,
//     receiver_bot_chat_id = ?
//   `, [
//     data.messageType,
//     data.message,
//     data.senderType,
//     data.messageId,
//     data.senderUserId,
//     data.receiverUserId,
//     data.senderBotId,
//     data.receiverBotId
//   ]);
//   console.log(insertData)
//   if (insertData.affectedRows) {
//     socket.updateAllMessages("update-service-messages", JSON.stringify({ userId: data.receiverUserId, message: data.message, messageType: data.messageType, messageId: data.messageId }));
//   }
// }

// async function savePhotoMessageDeatilsToDatabase(data) {
//   const connection = await database.connection.getConnection();
//   const [insertData] = await connection.query(`
//   INSERT INTO service_bot_photo_details set 
//     file_id = ?,
//     file_unique_id = ?,
//     file_size = ?,
//     width = ?,
//     height = ?,
//     minio_file_name = ?,
//     bot_message_id = ?,
//     user_id = ?,
//     caption = ?
//   `, [
//     data.fileId,
//     data.fileUniqueId,
//     data.fileSize,
//     data.width,
//     data.height,
//     data.minioFileName,
//     data.botMessageId,
//     data.userId,
//     data.caption
//   ]);
// }

// async function sendServiceBotMessageToUser(chatId, text) {
//   return await bot.api.sendMessage(chatId, text);
// }

// async function replyServiceBotMessageToUser(chatId, text, replyMessageId) {
//   return await bot.api.sendMessage(chatId, text, { reply_to_message_id: replyMessageId });
// }

// async function saveFileToLocalDiskAndMinIO(fileId, userId) {
//     return new Promise(async (resolve, reject) => {
//         try {
//             // Get file information from Telegram
//             const fileInfo = await bot.api.getFile(fileId);

//             // Generate a unique file name
//             const fileName = `${userId}_${Date.now()}.${fileInfo.file_path.split('.').pop()}`;

//             // Download the file from Telegram
//             const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
//             const response = await axios.get(fileUrl, { responseType: 'stream' });

//             // Create a write stream to save the file locally
//             const localFilePath = path.join(__dirname, '../uploads', fileName); // Specify the directory where you want to save the file locally
//             const localWriter = fs.createWriteStream(localFilePath);

//             // Pipe the response stream to the local write stream
//             response.data.pipe(localWriter);

//             // Handle events for the local write stream
//             localWriter.on('finish', async () => {
//                 console.log('File saved locally:', localFilePath);

//                 // Upload the file to MinIO
//                 minioClient.fPutObject('service-bot', fileName, localFilePath, (err, etag) => {
//                     if (err) {
//                         console.error('Error uploading file to MinIO:', err);
//                         reject(err);
//                     } else {
//                         console.log('File uploaded to MinIO successfully. ETag:', etag);
//                         resolve({ success: true, localFilePath, fileName, etag: etag.etag });
//                     }
//                 });
//             });
//             localWriter.on('error', (err) => {
//                 console.error('Error saving file locally:', err);
//                 reject(err);
//             });
//         } catch (error) {
//             console.error('Error fetching or saving file:', error);
//             reject(error);
//         }
//     });
// }

// async function deleteFileFromLocalDisk(filePath) {
//     return new Promise((resolve, reject) => {

//         // Check if the file exists
//         fs.access(filePath, fs.constants.F_OK, (err) => {
//             if (err) {
//                 console.error('File not found:', filePath);
//                 return reject('File not found');
//             }

//             // Delete the file
//             fs.unlink(filePath, (err) => {
//                 if (err) {
//                     console.error('Error deleting file:', err);
//                     return reject('Error deleting file');
//                 }
//                 console.log('File deleted successfully:', filePath);
//                 resolve('File deleted successfully');
//             });
//         });
//     });
// }

// async function deleteMessageFromBotChat(chatId, messageId) {
//     try {
//         await bot.api.deleteMessage(chatId, messageId);
//         console.log('Message deleted successfully.');
//         return true;
//     } catch (error) {
//         console.error('Error deleting message:', error.description);
//         return false;
//     }
// }

// async function editMessageInBotChat(chatId, messageId, newText) {
//     try {
//         await bot.api.editMessageText(chatId, messageId, newText);
//         console.log('Message edited successfully.');
//         return true;
//     } catch (error) {
//         console.error('Error editing message:', error.description);
//         return false;
//     }
// }
// module.exports = { sendServiceBotMessageToUser, replyServiceBotMessageToUser, deleteMessageFromBotChat, editMessageInBotChat };