// const { Bot, InlineKeyboard } = require("grammy");
// const database = require("../Database/database");
// const socket = require("../Modules/Socket");
// require('dotenv').config();

// // Determine environment (e.g., development or production)
// const environment = process.env.NODE_ENV || 'development';
// // Set up tokens for different environments
// const tokens = {
//     development: '6999025382:AAGmZC8M6AeBH0vjt4r-azCHzOvvW_4OIVY',
//     production: '7058770363:AAHZAcPHrUPMaJBuj6Pcwsdojo4IRHOV38s'
// };
// const token = tokens[environment];
// // Create an instance of the Bot class and pass your bot token to it.
// const bot = new Bot(token); // <-- put your bot token between the ""


// bot.command("start", onCommandStart);

// // Handle incoming photo messages
// bot.on('message:photo', async (ctx) => {
//   const message = ctx.message;
//   for(let photo of message.photo) {
//     const minioRes = await uploadBotFileToMinio(photo.file_id, 6197);
//     const data = {
//       fileId: file_id, 
//       fileUniqueId: file_unique_id, 
//       fileSize: file_size, 
//       width: width, 
//       height: height,
//       minioFileName: 'minioRes',
//       botMessageId: 'botMessageId',
//       userId: 'userId'
//     }
//     savePhotoMessageDeatilsToDatabase(data);
//   }
//   console.log('Photo message !');

// });

// // Handle incoming contact messages
// bot.on('message:contact', async (ctx) => {
//   console.log('Contact message !');
//     await onContactReceived(ctx)
// });

// // Handle incoming text messages
// bot.on('message:text', async (ctx) => {
//   const connecttion = await database.connection.getConnection();
//   const message = ctx.message;

//   console.log('Text message !', message.text)
//   const [botUser] = await connecttion.query(`
//   SELECT user_id FROM services_bot_users WHERE chat_id = ${message.from?.id}`);
  
//   if(botUser?.length && !message.contact) {
//     let data = {
//       messageId: message.message_id,
//       senderType: 'user',
//       senderUserId: botUser[0]?.user_id,
//       senderBotId: message.from?.id
//     };
  
//     // data.receiverUserId,
//     // data.receiverBotId
  
//     if(message.text) {
//       data.messageType = 'text';
//       data.message = message.text;
//     } else if(data.document) {
//       data.messageType = 'document';
//       data.message = 'document'
  
//     } else if(data.photo) {
//       data.messageType = 'photo';
//       data.message = 'photo'
  
//     }
//     const res = await saveMessageToDatabase(data);
//   }

// });

// bot.on('callback_query', async (ctx) => {
//   const callbackData = ctx.callbackQuery.data;

//   if (callbackData === '#services') {
//       // Handle 'Типы услуг' button click here
//      await onServicesClick(ctx);
//   } else if(callbackData.startsWith('#service_')) {
//     await ctx.reply(`you choosed.` + callbackData );
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
//      // Create an inline keyboard with menu options


//  // Send the message with the menu
//     await ctx.reply(`Thank you, ${chatFirstName}! We've received your contact information.`);


//     const [user] = await connection.query(`
//       SELECT * FROM users_contacts WHERE text = ?
//     `, [phoneNumber]);

//     const [userChat] = await connection.query(`
//       SELECT * FROM services_bot_users WHERE phone_number = ?
//     `, [phoneNumber]);

//     let res;
//     if(!userChat?.length) {
//       res = await connection.query(`
//         INSERT INTO services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ?
//         `, [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id]);

//         let data = {
//           messageId: ctx.message.message_id,
//           senderType: 'user',
//           senderUserId: user[0]?.user_id,
//           senderBotId: ctx.message.from?.id,
//           messageType: 'contact',
//           message: phoneNumber
//         };
//         await saveMessageToDatabase(data)
//     } else {
//       res = await connection.query(
//         "UPDATE services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?, user_id = ? WHERE phone_number = ?",
//         [chatFirstName, chatLastName, phoneNumber, username, chatId, user[0]?.user_id, phoneNumber]
//       );
//     }

    

//     // Send a notification to the user
//     if (res) {
//       if(user[0]) {
//         const keyboard = new InlineKeyboard()
//         .text('Типы услуг', '#services')
//         await ctx.reply(`Дорогой ${chatFirstName}! Вы успешно зарегистрировались.`, { reply_markup: keyboard });
//       } else {
//        await bot.api.sendMessage(
//             ctx.message.chat.id,
//             `Дорогой ${chatFirstName}! Пожалуйста, зарегистрируйтесь в приложении по <a href="YOUR_LINK_HERE">ссылке</a>.`,
//             { parse_mode: "HTML" },
//           );
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
//       const services = await connection.query('SELECT * FROM services');
//       if (services && services.length > 0) {
//           const keyboard = new InlineKeyboard();
//           for (let service of services[0]) {
//             const serviceNameWithLineBreak = service.name.replace(/\\n/g, '\n');
//               keyboard.text(serviceNameWithLineBreak, `#service_${service.id}`);
//               keyboard.row()
//           }

//           await ctx.reply(`Choose a service:`, { reply_markup: keyboard });
//       } else {
//           await ctx.reply(`No services available.`);
//       }
//       let data = {
//         messageId: ctx.callbackQuery.message.message_id,
//         senderType: 'user',
//         senderUserId: 'user[0]?.user_id',
//         senderBotId: ctx.callbackQuery.message.from?.id,
//         messageType: 'contact',
//         message: 'phoneNumber'
//       };
//       console.log('data', data)
//   } catch (err) {
//       console.log('BOT Error while getting services list: ', err);
//       await ctx.reply(`Error while getting services list.`);
//   } finally {
//       // Release the connection back to the pool
//       if (connection) {
//           connection.release();
//       }
//   }
// }

// async function saveMessageToDatabase (data) {
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
//       data.messageType, 
//       data.message, 
//       data.senderType, 
//       data.messageId, 
//       data.senderUserId,
//       data.receiverUserId,
//       data.senderBotId,
//       data.receiverBotId
//     ]);
//     console.log(insertData)
//     if(insertData.affectedRows) {
//       socket.updateAllMessages("update-service-messages", JSON.stringify({ userId: data.receiverUserId, message: data.message, messageType: data.messageType, messageId: data.messageId}));
//     }
// }

// async function savePhotoMessageDeatilsToDatabase (data) {
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
//     user_id = ?
//   `, [
//       data.fileId, 
//       data.fileUniqueId, 
//       data.fileSize, 
//       data.width, 
//       data.height,
//       data.minioFileName,
//       data.botMessageId,
//       data.userId
//     ]);
// }

// async function sendServiceBotMessageToUser(chatId, text) {
//  return await bot.api.sendMessage(chatId, text);
// }

// async function uploadBotFileToMinio(fileId, userId) {
//   return new Promise((resolve, reject) => {
//     const filePath = "bot/" + userId + '_' + Date.now(); // Adjusted the file path creation
//     // Converting the photo data to a buffer
//     const buffer = Buffer.from(fileId, 'base64'); // Assuming file_id is base64 encoded

//     // Uploading the file to MinIO
//     minioClient.putObject("tirgo", filePath, buffer, function (err, etag) {
//       if (err) {
//         console.error("Error uploading file:", err);
//         reject(err);
//       } else {
//         console.log("File uploaded successfully. ETag:", etag);
//         resolve(etag);
//       }
//     });
//   });
// }
  
// module.exports = {sendServiceBotMessageToUser};

// //   `CREATE TABLE service_bot_message (
// //     id SERIAL PRIMARY KEY,
// //     message_type VARCHAR,
// //     message TEXT,
// //     message_sender_type VARCHAR,
// //     bot_message_id int,
// //     sender_user_id int,
// //     receiver_user_id int,
// //     sender_bot_chat_id int,
// //     receiver_bot_chat_id int
// //   );`

// // `{
// //   message_id: 259,
// //   from: {
// //     id: 1689259996,
// //     is_bot: false,
// //     first_name: 'Fazliddin',
// //     last_name: 'Norkhujayev',
// //     username: 'nfaxriddinovich',
// //     language_code: 'en'
// //   },
// //   chat: {
// //     id: 1689259996,
// //     first_name: 'Fazliddin',
// //     last_name: 'Norkhujayev',
// //     username: 'nfaxriddinovich',
// //     type: 'private'
// //   },
// //   date: 1714378398,
// //   document: {
// //     file_name: 'carriers.xlsx',
// //     mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
// //     file_id: 'BQACAgIAAxkBAAIBA2YvVp5Q4TcwelRr77h8lfaXhMn5AAJnTwACYYB5SX5mpWZMY9z0NAQ',
// //     file_unique_id: 'AgADZ08AAmGAeUk',
// //     file_size: 17118
// //   },
// //   photo: [
// //     {
// //       file_id: 'AgACAgIAAxkBAAP-Zi9V-hH_BwO5U4pkkThXmNc2gDsAAiPYMRthgHlJT76ubkOGHUgBAAMCAANzAAM0BA',
// //       file_unique_id: 'AQADI9gxG2GAeUl4',
// //       file_size: 1318,
// //       width: 90,
// //       height: 90
// //     }
// //   ],
// //   text: 'asd'
// // }`