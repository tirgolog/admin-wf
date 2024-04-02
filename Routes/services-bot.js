const { Bot, InlineKeyboard } = require("grammy");
const database = require("../Database/database");

// Create an instance of the Bot class and pass your bot token to it.
const bot = new Bot("7058770363:AAHZAcPHrUPMaJBuj6Pcwsdojo4IRHOV38s"); // <-- put your bot token between the ""
bot.command("start", onCommandStart);


// Handle incoming messages
bot.on('message', async (ctx) => {
  const message = ctx.message;
  // Check if the message contains contact information
  if (message.contact) {
    await onContactReceived(ctx)
  }

});

bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
console.log(callbackData)
  if(callbackData.startsWith('#service_')) {
    await onServiceClick(ctx);
  } else if(callbackData.startsWith('#subscription_')) {
    await onSubscriptionClick(ctx);
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
    const user = await connection.query(`
      SELECT * FROM users_contacts WHERE text = ?
    `, [phoneNumber]);

    const userChat = await connection.query(`
      SELECT * FROM services_bot_users WHERE phone_number = ?
    `, [phoneNumber]);
    let res;
    if(!userChat[0].length) {
      res = await connection.query(`
        INSERT INTO services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?
        `, [chatFirstName, chatLastName, phoneNumber, username, chatId]);
    } else {
      res = await connection.query(
        "UPDATE services_bot_users set first_name = ?, last_name = ?, phone_number = ?, tg_username = ?, chat_id = ?",
        [chatFirstName, chatLastName, phoneNumber, username, chatId]
      );
    }

    // Send a notification to the user
    if (res) {
      if(user[0]) {
        const services = await connection.query('SELECT * FROM services');
        const keyboard = new InlineKeyboard()
        for (let service of services[0]) {
          const serviceNameWithLineBreak = service.name.replace(/\\n/g, '\n');
            keyboard.text(serviceNameWithLineBreak, `#service_${service.id}`);
            keyboard.row()
        }

        
        await ctx.reply(`😊Поздравляем вы прошли регистрацию! Выберете теперь нужную вам услугу`, { reply_markup: keyboard });
      } else {
       await bot.api.sendMessage(
            ctx.message.chat.id,
            `Пожалуйста, зарегистрируйтесь в приложении по <a href="YOUR_LINK_HERE">ссылке</a>.`,
            { parse_mode: "HTML" },
          );
      }
    } else {
      await ctx.reply(`Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
    }
  } catch (err) {
    console.log(err)
    await ctx.reply(`Регистрация не удалась. Пожалуйста, попробуйте позднее.`);
  } finally { 
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
}

async function onServiceClick(ctx) {
  const chatId = ctx.callbackQuery.from.id;
  const connection = await database.connection.getConnection();
    try {
      const [userChat] = await connection.query(
        `SELECT id, phone_number
         FROM services_bot_users
         WHERE chat_id = ?`,
        [chatId]
      );
     const [subscription] = await connection.query(
        `SELECT id, to_subscription, from_subscription
         FROM users_list
         WHERE 
            to_subscription > CURDATE() 
            AND from_subscription IS NOT NULL 
            AND to_subscription IS NOT NULL
            AND phone = ? 
           `,
        [userChat[0].phone_number]
      );
      if(!subscription.length) {
  
        const [subscriptions] = await await connection.query(`SELECT * FROM subscription`);
        const keyboard = new InlineKeyboard()
        for (let subscription of subscriptions) {
          const subscriptionNameWithLineBreak = subscription.name.replace(/\\n/g, '\n');
            keyboard.text(subscriptionNameWithLineBreak, `#subscription_${subscription.id}`);
            keyboard.row()
        }
        await ctx.reply(`Для того чтобы воспользоваться услугами Tirgo, пожалуйста оформите подписку,`, { reply_markup: keyboard });
      }
    } catch(err) { 
      console.log('BOT Error on service click: ', err)
    } finally {
      await connection.close();
    }
}

async function onSubscriptionClick(ctx) {
  const chatId = ctx.callbackQuery.from.id;
  const subscriptionId = Number(ctx.callbackQuery.data.split('_')[1]);
  const connection = await database.connection.getConnection();
    try {
      const [userChat] = await connection.query(
        `SELECT id, phone_number
         FROM services_bot_users
         WHERE chat_id = ?`,
        [chatId]
      );
      
      const [subscription] = await await connection.query(`SELECT * FROM subscription WHERE id = ${subscriptionId}`);
      if(subscription.length) {
        const options = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: 'Payme', url: 'https://payme.uz' },
                { text: 'Click', url: 'https://click.uz' }
              ]
            ]
          })
        };
        await ctx.reply(`Havola orqali pul tolavoring`, options);
      }
    } catch(err) { 
      console.log('BOT Error on subscription click: ', err)
    } finally {
      await connection.close();
    }
}